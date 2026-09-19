import { readFileSync } from 'fs'
import { safeHttp } from '@activepieces/server-utils'
import {
    ActivepiecesError,
    apId,
    applyFunctionToValues,
    ErrorCode,
    isNil,
    isObject,
    isString,
    RefresquitoSecretManagerConnection,
    RefresquitoSecretManagerConnectionWithStatus,
    refresquitoSecretManagerReferenceUtils,
    RefresquitoSecretManagerScope,
    SeekPage,
    tryCatch,
    UpsertRefresquitoSecretManagerConnectionRequest,
} from '@activepieces/shared'
import { AxiosInstance } from 'axios'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { refresquitoSecretManagerCache } from './secret-manager-cache'
import { RefresquitoSecretManagerEntity } from './secret-manager.entity'

// In-cluster ServiceAccount conventions: every pod gets these files mounted
// automatically, and the API server is always reachable at this in-cluster
// DNS name -- no env vars or discovery needed. Reaching it through
// safeHttp still requires the cluster's Kubernetes API service IP/CIDR to
// be present in AP_SSRF_ALLOW_LIST (it's a private/ClusterIP address, and
// the SSRF filter blocks those by default) -- that's an operator-side
// deployment concern, not something this code should try to bypass.
const SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount'
const KUBERNETES_API_BASE_URL = 'https://kubernetes.default.svc'

const repo = repoFactory<RefresquitoSecretManagerConnection>(RefresquitoSecretManagerEntity)

export const refresquitoSecretManagerService = (log: FastifyBaseLogger) => ({
    async list({ platformId, projectId }: { platformId: string, projectId?: string }): Promise<SeekPage<RefresquitoSecretManagerConnectionWithStatus>> {
        const connections = await repo().findBy({ platformId })
        const visibleConnections = isNil(projectId)
            ? connections
            : connections.filter((connection) => isVisibleToProject({ connection, projectIds: [projectId] }))
        const data = await Promise.all(visibleConnections.map((connection) => attachCachedConnectivity({ connection, log })))
        return { data, next: null, previous: null }
    },

    async create({ platformId, request }: { platformId: string, request: UpsertRefresquitoSecretManagerConnectionRequest }): Promise<RefresquitoSecretManagerConnectionWithStatus> {
        await assertReachable({ namespace: request.namespace, secretName: request.secretName, log })
        const connection = await repo().save({
            id: apId(),
            platformId,
            name: request.name,
            namespace: request.namespace,
            secretName: request.secretName,
            scope: request.scope,
            projectIds: toStoredProjectIds(request),
        })
        await refresquitoSecretManagerCache.setConnectivity({ connectionId: connection.id, connected: true })
        return { ...connection, connected: true }
    },

    // Namespace/secretName ARE allowed to change here, on purpose: the admin
    // form re-submits the whole record, and re-validating connectivity on
    // every update (below) means a broken edit is rejected before it's
    // persisted, same as create. The RBAC-scoping rationale for fixing them
    // still holds -- it's the cluster operator's Role/RoleBinding that must
    // be updated to match whenever they're changed here, exactly as it must
    // be created to match on a brand new connection.
    async update({ id, platformId, request }: { id: string, platformId: string, request: UpsertRefresquitoSecretManagerConnectionRequest }): Promise<RefresquitoSecretManagerConnectionWithStatus> {
        await repo().findOneByOrFail({ id, platformId })
        await assertReachable({ namespace: request.namespace, secretName: request.secretName, log })
        await repo().update({ id, platformId }, {
            name: request.name,
            namespace: request.namespace,
            secretName: request.secretName,
            scope: request.scope,
            projectIds: toStoredProjectIds(request),
        })
        await refresquitoSecretManagerCache.invalidate({ connectionId: id })
        await refresquitoSecretManagerCache.setConnectivity({ connectionId: id, connected: true })
        const updated = await repo().findOneByOrFail({ id, platformId })
        return { ...updated, connected: true }
    },

    async delete({ id, platformId }: { id: string, platformId: string }): Promise<void> {
        await repo().delete({ id, platformId })
        await refresquitoSecretManagerCache.invalidate({ connectionId: id })
    },

    async resolveString({ key, platformId, projectIds, throwOnFailure = true }: { key: string, platformId: string, projectIds?: string[], throwOnFailure?: boolean }): Promise<string> {
        const reference = refresquitoSecretManagerReferenceUtils.parse(key)
        if (isNil(reference)) {
            return key
        }
        const { data: resolved, error } = await tryCatch(() => resolveReference({ reference, platformId, projectIds, log }))
        if (error) {
            if (!throwOnFailure) {
                return key
            }
            if (error instanceof ActivepiecesError) {
                throw error
            }
            throw new ActivepiecesError({
                code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
                params: {
                    message: error instanceof Error ? error.message : 'Failed to resolve secret',
                    provider: 'kubernetes',
                    request: { connectionId: reference.connectionId, key: reference.key },
                },
            })
        }
        return resolved
    },

    async resolveObject<T extends Record<string, unknown>>({ value, platformId, projectIds, throwOnFailure = true }: { value: T, platformId: string, projectIds?: string[], throwOnFailure?: boolean }): Promise<T> {
        return applyFunctionToValues<T>(value, (candidate) => this.resolveString({ key: candidate, platformId, projectIds, throwOnFailure }))
    },
})

function toStoredProjectIds(request: UpsertRefresquitoSecretManagerConnectionRequest): string[] | null {
    return request.scope === RefresquitoSecretManagerScope.PROJECT ? request.projectIds ?? [] : null
}

function isVisibleToProject({ connection, projectIds }: { connection: RefresquitoSecretManagerConnection, projectIds?: string[] }): boolean {
    if (connection.scope === RefresquitoSecretManagerScope.PLATFORM) {
        return true
    }
    return (connection.projectIds ?? []).some((allowedProjectId) => (projectIds ?? []).includes(allowedProjectId))
}

async function attachCachedConnectivity({ connection, log }: { connection: RefresquitoSecretManagerConnection, log: FastifyBaseLogger }): Promise<RefresquitoSecretManagerConnectionWithStatus> {
    const cached = await refresquitoSecretManagerCache.getConnectivity({ connectionId: connection.id })
    if (!isNil(cached)) {
        return { ...connection, connected: cached }
    }
    const connected = await checkConnectivity({ namespace: connection.namespace, secretName: connection.secretName, log })
    await refresquitoSecretManagerCache.setConnectivity({ connectionId: connection.id, connected })
    return { ...connection, connected }
}

async function assertReachable({ namespace, secretName, log }: { namespace: string, secretName: string, log: FastifyBaseLogger }): Promise<void> {
    const connected = await checkConnectivity({ namespace, secretName, log })
    if (!connected) {
        throw new ActivepiecesError({
            code: ErrorCode.SECRET_MANAGER_CONNECTION_FAILED,
            params: {
                message: `Could not read Secret "${secretName}" in namespace "${namespace}" using this pod's ServiceAccount. Check that the namespace/name are correct and that RBAC grants "get" on this Secret.`,
                provider: 'kubernetes',
            },
        })
    }
}

async function checkConnectivity({ namespace, secretName, log }: { namespace: string, secretName: string, log: FastifyBaseLogger }): Promise<boolean> {
    const { error } = await tryCatch(() => getSecretResource({ namespace, secretName }))
    if (error) {
        log.warn({ err: error, namespace, secretName }, '[refresquitoSecretManagerService] Kubernetes Secret is not reachable')
        return false
    }
    return true
}

async function resolveReference({ reference, platformId, projectIds, log }: { reference: { connectionId: string, key: string }, platformId: string, projectIds: string[] | undefined, log: FastifyBaseLogger }): Promise<string> {
    const connection = await repo().findOneBy({ id: reference.connectionId, platformId })
    if (isNil(connection) || !isVisibleToProject({ connection, projectIds })) {
        throw new ActivepiecesError({
            code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
            params: {
                message: 'Secret Manager connection is not accessible',
                provider: 'kubernetes',
                request: { connectionId: reference.connectionId, key: reference.key },
            },
        })
    }
    const cachedValue = await refresquitoSecretManagerCache.getSecretValue({ connectionId: connection.id, key: reference.key })
    if (!isNil(cachedValue)) {
        return cachedValue
    }
    const value = await fetchSecretValue({ namespace: connection.namespace, secretName: connection.secretName, key: reference.key, log })
    await refresquitoSecretManagerCache.setSecretValue({ connectionId: connection.id, key: reference.key, value })
    return value
}

async function fetchSecretValue({ namespace, secretName, key, log }: { namespace: string, secretName: string, key: string, log: FastifyBaseLogger }): Promise<string> {
    const { data: secret, error } = await tryCatch(() => getSecretResource({ namespace, secretName }))
    if (error) {
        log.warn({ err: error, namespace, secretName, key }, '[refresquitoSecretManagerService] failed to read Kubernetes Secret')
        throw new ActivepiecesError({
            code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
            params: {
                message: `Could not read Secret "${secretName}" in namespace "${namespace}"`,
                provider: 'kubernetes',
                request: { namespace, secretName, key },
            },
        })
    }
    const encodedValue = secret.data?.[key]
    if (isNil(encodedValue)) {
        throw new ActivepiecesError({
            code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
            params: {
                message: `Key "${key}" was not found in Secret "${secretName}" (namespace "${namespace}")`,
                provider: 'kubernetes',
                request: { namespace, secretName, key },
            },
        })
    }
    return Buffer.from(encodedValue, 'base64').toString('utf8')
}

async function getSecretResource({ namespace, secretName }: { namespace: string, secretName: string }): Promise<KubernetesSecretResource> {
    const client = buildKubernetesClient()
    const response = await client.get<KubernetesSecretResource>(`/api/v1/namespaces/${namespace}/secrets/${secretName}`)
    return response.data
}

function buildKubernetesClient(): AxiosInstance {
    const token = readFileSync(`${SERVICE_ACCOUNT_DIR}/token`, 'utf8').trim()
    const ca = readFileSync(`${SERVICE_ACCOUNT_DIR}/ca.crt`, 'utf8')
    return safeHttp.createAxios(
        {
            baseURL: KUBERNETES_API_BASE_URL,
            headers: { Authorization: `Bearer ${token}` },
        },
        { httpsAgentOptions: { ca } },
    )
}

export function refresquitoContainsSecretManagerReference(value: unknown): boolean {
    if (isString(value)) {
        return !isNil(refresquitoSecretManagerReferenceUtils.parse(value))
    }
    if (Array.isArray(value)) {
        return value.some(refresquitoContainsSecretManagerReference)
    }
    if (isObject(value)) {
        return Object.values(value).some(refresquitoContainsSecretManagerReference)
    }
    return false
}

type KubernetesSecretResource = {
    data?: Record<string, string>
}
