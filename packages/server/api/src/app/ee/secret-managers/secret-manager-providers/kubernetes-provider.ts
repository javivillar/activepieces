import { readFileSync } from 'fs'
import { safeHttp } from '@activepieces/server-utils'
import { KubernetesProviderConfig, SecretManagerProviderId } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { SecretManagerProvider, throwConnectionError, throwGetSecretError } from './secret-manager-providers'

const SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount'

// Deliberately scoped to a single named Secret (namespace + secretName,
// fixed at connection time) rather than a whole namespace: Kubernetes RBAC's
// `list`/`watch` verbs cannot be restricted by `resourceNames` -- only `get`
// can -- so the chart grants `get` on exactly this one Secret object and the
// provider never needs (or has) permission to enumerate anything else in
// that namespace. `path` at reference time is just the key inside it.
export const kubernetesProvider = (log: FastifyBaseLogger): SecretManagerProvider<SecretManagerProviderId.KUBERNETES> => ({
    checkConnection: async (config) => {
        await fetchSecret(config, log)
        return true
    },
    connect: async (config) => {
        await kubernetesProvider(log).checkConnection(config)
    },
    disconnect: async () => {
        return Promise.resolve()
    },
    getSecret: async (request, config: KubernetesProviderConfig) => {
        const secret = await fetchSecret(config, log, request.path)
        const encoded = secret.data?.[request.path]
        if (!encoded) {
            throwGetSecretError({ error: `Key "${request.path}" not found in Secret "${config.secretName}"`, path: request.path, provider: SecretManagerProviderId.KUBERNETES, request, log })
        }
        return Buffer.from(encoded, 'base64').toString('utf8')
    },
})

async function fetchSecret(config: KubernetesProviderConfig, log: FastifyBaseLogger, path?: string): Promise<{ data?: Record<string, string> }> {
    const client = buildClient()
    const response = await client.get(`/api/v1/namespaces/${config.namespace}/secrets/${config.secretName}`).catch((error) => {
        if (path) {
            throwGetSecretError({ error, path, provider: SecretManagerProviderId.KUBERNETES, request: { path }, log })
        }
        throwConnectionError({ error, provider: SecretManagerProviderId.KUBERNETES, log })
    })
    return response.data
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
