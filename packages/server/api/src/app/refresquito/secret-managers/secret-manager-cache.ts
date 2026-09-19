import { apDayjsDuration } from '@activepieces/server-utils'
import { redisHelper } from '../../database/redis'
import { distributedStore, redisConnections } from '../../database/redis-connections'
import { EncryptedObject, encryptUtils } from '../../helper/encryption'

// Kept brief on purpose: every resolve/health-check is a real call to the
// cluster's Kubernetes API server, so a short cache absorbs the bursts a
// flow run or a repeated OAuth2 refresh can generate, while still picking
// up a rotated Secret or a revoked RBAC grant within minutes.
const SECRET_VALUE_CACHE_TTL_SECONDS = apDayjsDuration(5, 'minute').asSeconds()
const CONNECTIVITY_CACHE_TTL_SECONDS = apDayjsDuration(2, 'minute').asSeconds()
const CACHE_KEY_PREFIX = 'refresquito-secret-manager'

export const refresquitoSecretManagerCache = {
    async getSecretValue({ connectionId, key }: { connectionId: string, key: string }): Promise<string | undefined> {
        const encrypted = await distributedStore.get<EncryptedObject>(secretValueCacheKey({ connectionId, key }))
        if (!encrypted) {
            return undefined
        }
        return encryptUtils.decryptString(encrypted)
    },

    async setSecretValue({ connectionId, key, value }: { connectionId: string, key: string, value: string }): Promise<void> {
        const encrypted = await encryptUtils.encryptString(value)
        await distributedStore.put(secretValueCacheKey({ connectionId, key }), encrypted, SECRET_VALUE_CACHE_TTL_SECONDS)
    },

    async getConnectivity({ connectionId }: { connectionId: string }): Promise<boolean | undefined> {
        const cached = await distributedStore.get<boolean>(connectivityCacheKey({ connectionId }))
        return cached ?? undefined
    },

    async setConnectivity({ connectionId, connected }: { connectionId: string, connected: boolean }): Promise<void> {
        await distributedStore.put(connectivityCacheKey({ connectionId }), connected, CONNECTIVITY_CACHE_TTL_SECONDS)
    },

    async invalidate({ connectionId }: { connectionId: string }): Promise<void> {
        const redis = await redisConnections.useExisting()
        const keys = await redisHelper.scanAll(redis, `${CACHE_KEY_PREFIX}:*:${connectionId}:*`)
        if (keys.length > 0) {
            await redis.del(...keys)
        }
    },
}

function secretValueCacheKey({ connectionId, key }: { connectionId: string, key: string }): string {
    return `${CACHE_KEY_PREFIX}:secret-value:${connectionId}:${key}`
}

function connectivityCacheKey({ connectionId }: { connectionId: string }): string {
    return `${CACHE_KEY_PREFIX}:connectivity:${connectionId}:-`
}
