import { readFileSync } from 'fs'
import { safeHttp } from '@activepieces/server-utils'
import {
    ActivepiecesError,
    apId,
    ErrorCode,
    isNil,
    isObject,
    isString,
    REFRESQUITO_SECRET_MANAGER_FIELDS_SEPARATOR,
    RefresquitoSecretManagerConnection,
    RefresquitoSecretManagerConnectionWithStatus,
    SeekPage,
    UpsertRefresquitoSecretManagerConnectionRequest,
} from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { refresquitoSecretManagerCache } from './secret-manager-cache'
import { RefresquitoSecretManagerEntity } from './secret-manager.entity'

const SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount'
const repo = repoFactory<RefresquitoSecretManagerConnection>(RefresquitoSecretManagerEntity)

export const refresquitoSecretManagerService = (log: FastifyBaseLogger) => ({
    async list({ platformId, projectId }: { platformId: string, projectId?: string }): Promise<SeekPage<RefresquitoSecretManagerConnectionWithStatus>> {
        const connections = await repo().findBy({ platformId })
        const filtered = isNil(projectId)
            ? connections
            : connections.filter((c) => c.scope === 'PLATFORM' || (c.projectIds ?? []).includes(projectId))
        const data = await Promise.all(filtered.map(async (connection) => ({
            ...connection,
            connected: await checkConnectionCached(connection, log),
        })))
        return { data, next: null, previous: null }
    },

    async create(platformId: string, request: UpsertRefresquitoSecretManagerConnectionRequest): Promise<RefresquitoSecretManagerConnectionWithStatus> {
        const connected = await checkConnection({ namespace: request.namespace, secretName: request.secretName }, log)
        const saved = await repo().save({
            id: apId(),
            platformId,
            name: request.name,
            namespace: request.namespace,
            secretName: request.secretName,
            scope: request.scope,
            projectIds: request.scope === 'PROJECT' ? request.projectIds ?? [] : null,
        })
        return { ...saved, connected }
    },

    async update({ id, platformId, request }: { id: string, platformId: string, request: UpsertRefresquitoSecretManagerConnectionRequest }): Promise<RefresquitoSecretManagerConnectionWithStatus> {
        await repo().findOneByOrFail({ id, platformId })
        const connected = await checkConnection({ namespace: request.namespace, secretName: request.secretName }, log)
        await repo().update({ id, platformId }, {
            name: request.name,
            namespace: request.namespace,
            secretName: request.secretName,
            scope: request.scope,
            projectIds: request.scope === 'PROJECT' ? request.projectIds ?? [] : null,
        })
        await refresquitoSecretManagerCache.invalidate({ connectionId: id })
        const updated = await repo().findOneByOrFail({ id, platformId })
        return { ...updated, connected }
    },

    async delete({ id, platformId }: { id: string, platformId: string }): Promise<void> {
        await repo().delete({ id, platformId })
        await refresquitoSecretManagerCache.invalidate({ connectionId: id })
    },

    async getSecret({ connectionId, key, platformId, projectIds }: { connectionId: string, key: string, platformId: string, projectIds?: string[] }): Promise<string> {
        const connection = await repo().findOneBy({ id: connectionId, platformId })
        if (isNil(connection) || (connection.scope === 'PROJECT' && !(connection.projectIds ?? []).some((p) => (projectIds ?? []).includes(p)))) {
            throw new ActivepiecesError({
                code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
                params: { message: 'Connection is not accessible', provider: 'kubernetes', request: { connectionId, key } },
            })
        }
        const cached = await refresquitoSecretManagerCache.getSecretValue({ connectionId, key })
        if (!isNil(cached)) {
            return cached
        }
        const value = await fetchSecretKey({ namespace: connection.namespace, secretName: connection.secretName }, key, log)
        await refresquitoSecretManagerCache.setSecretValue({ connectionId, key, value })
        return value
    },

    async resolveString({ key, platformId, projectIds, throwOnFailure = true }: { key: string, platformId: string, projectIds?: string[], throwOnFailure?: boolean }): Promise<string> {
        try {
            const { connectionId, path } = extractReference(key)
            return await this.getSecret({ connectionId, key: path, platformId, projectIds })
        }
        catch (error) {
            return handleResolveError({ error, throwOnFailure, originalValue: key })
        }
    },

    async resolveObject<T extends Record<string, unknown>>({ value, platformId, projectIds, throwOnFailure = true }: { value: T, platformId: string, projectIds?: string[], throwOnFailure?: boolean }): Promise<T> {
        const entries = await Promise.all(
            Object.entries(value).map(async ([field, fieldValue]) => [
                field,
                await this.resolveUnknownValue({ value: fieldValue, platformId, projectIds, throwOnFailure }),
            ]),
        )
        return Object.fromEntries(entries) as T
    },

    async resolveUnknownValue({ value, platformId, projectIds, throwOnFailure }: { value: unknown, platformId: string, projectIds?: string[], throwOnFailure: boolean }): Promise<unknown> {
        if (isObject(value)) {
            return this.resolveObject({ value, platformId, projectIds, throwOnFailure })
        }
        if (isString(value)) {
            try {
                return await this.resolveString({ key: value, platformId, projectIds, throwOnFailure })
            }
            catch (error) {
                return handleResolveError({ error, throwOnFailure, originalValue: value })
            }
        }
        return value
    },
})

async function checkConnectionCached(connection: RefresquitoSecretManagerConnection, log: FastifyBaseLogger): Promise<boolean> {
    const cached = await refresquitoSecretManagerCache.getConnectionStatus({ connectionId: connection.id })
    if (!isNil(cached)) {
        return cached
    }
    const connected = await checkConnection({ namespace: connection.namespace, secretName: connection.secretName }, log)
    if (connected) {
        await refresquitoSecretManagerCache.setConnectionStatus({ connectionId: connection.id, value: true })
    }
    return connected
}

async function checkConnection({ namespace, secretName }: { namespace: string, secretName: string }, log: FastifyBaseLogger): Promise<boolean> {
    try {
        await buildClient().get(`/api/v1/namespaces/${namespace}/secrets/${secretName}`)
        return true
    }
    catch (error) {
        log.error({ err: error, namespace, secretName }, '[refresquitoSecretManagerService#checkConnection] failed')
        return false
    }
}

async function fetchSecretKey({ namespace, secretName }: { namespace: string, secretName: string }, key: string, log: FastifyBaseLogger): Promise<string> {
    const response = await buildClient().get(`/api/v1/namespaces/${namespace}/secrets/${secretName}`).catch((error) => {
        log.error({ err: error, namespace, secretName }, '[refresquitoSecretManagerService#fetchSecretKey] failed')
        throw new ActivepiecesError({
            code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
            params: { message: `Failed to read Secret "${secretName}" in namespace "${namespace}"`, provider: 'kubernetes', request: { namespace, secretName, key } },
        })
    })
    const encoded = response.data?.data?.[key]
    if (!encoded) {
        throw new ActivepiecesError({
            code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
            params: { message: `Key "${key}" not found in Secret "${secretName}"`, provider: 'kubernetes', request: { namespace, secretName, key } },
        })
    }
    return Buffer.from(encoded, 'base64').toString('utf8')
}

function buildClient() {
    const host = process.env['KUBERNETES_SERVICE_HOST']
    const port = process.env['KUBERNETES_SERVICE_PORT'] ?? '443'
    const token = readFileSync(`${SERVICE_ACCOUNT_DIR}/token`, 'utf8').trim()
    const ca = readFileSync(`${SERVICE_ACCOUNT_DIR}/ca.crt`, 'utf8')
    return safeHttp.createAxios(
        {
            baseURL: `https://${host}:${port}`,
            headers: { Authorization: `Bearer ${token}` },
        },
        { httpsAgentOptions: { ca } },
    )
}

function extractReference(key: string): { connectionId: string, path: string } {
    const trimmed = key.trim()
    if (!(trimmed.startsWith('{{') && trimmed.endsWith('}}'))) {
        throw new ActivepiecesError({
            code: ErrorCode.SECRET_MANAGER_KEY_NOT_SECRET,
            params: { message: 'Key is not a secret' },
        })
    }
    const inner = trimmed.substring(2, trimmed.length - 2)
    const sepIdx = inner.indexOf(REFRESQUITO_SECRET_MANAGER_FIELDS_SEPARATOR)
    if (sepIdx === -1) {
        throw new ActivepiecesError({
            code: ErrorCode.SECRET_MANAGER_KEY_NOT_SECRET,
            params: { message: 'Key is not in the expected secret format' },
        })
    }
    const connectionId = inner.substring(0, sepIdx)
    const path = inner.substring(sepIdx + REFRESQUITO_SECRET_MANAGER_FIELDS_SEPARATOR.length)
    if (!connectionId || !path) {
        throw new ActivepiecesError({
            code: ErrorCode.SECRET_MANAGER_KEY_NOT_SECRET,
            params: { message: 'Invalid secret key: missing connectionId or path' },
        })
    }
    return { connectionId, path }
}

function handleResolveError<T>({ error, throwOnFailure, originalValue }: { error: unknown, throwOnFailure: boolean, originalValue: T }): T {
    if (!throwOnFailure) {
        return originalValue
    }
    if (error instanceof ActivepiecesError) {
        if (error.error.code === ErrorCode.SECRET_MANAGER_KEY_NOT_SECRET) {
            return originalValue
        }
        throw error
    }
    const message = error instanceof Error ? error.message : 'Failed to resolve secret'
    throw new ActivepiecesError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

export function refresquitoContainsSecretManagerReference(value: unknown): boolean {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed.startsWith('{{') && trimmed.includes(REFRESQUITO_SECRET_MANAGER_FIELDS_SEPARATOR) && trimmed.endsWith('}}')
    }
    if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(refresquitoContainsSecretManagerReference)
    }
    return false
}
