import { apDayjsDuration } from '@activepieces/server-utils'
import { redisHelper } from '../../database/redis'
import { distributedStore, redisConnections } from '../../database/redis-connections'
import { EncryptedObject, encryptUtils } from '../../helper/encryption'

const ONE_HOUR_SECONDS = apDayjsDuration(1, 'hour').asSeconds()
const KEY_PREFIX = 'refresquito-secret-manager'

export const refresquitoSecretManagerCache = {
    async getConnectionStatus({ connectionId }: { connectionId: string }): Promise<boolean | undefined> {
        const result = await distributedStore.get<boolean>(checkKey(connectionId))
        return result ?? undefined
    },
    async setConnectionStatus({ connectionId, value }: { connectionId: string, value: boolean }): Promise<void> {
        await distributedStore.put(checkKey(connectionId), value, ONE_HOUR_SECONDS)
    },
    async getSecretValue({ connectionId, key }: { connectionId: string, key: string }): Promise<string | undefined> {
        const result = await distributedStore.get<EncryptedObject>(secretKey(connectionId, key))
        return result ? encryptUtils.decryptString(result) : undefined
    },
    async setSecretValue({ connectionId, key, value }: { connectionId: string, key: string, value: string }): Promise<void> {
        const encrypted = await encryptUtils.encryptString(value)
        await distributedStore.put(secretKey(connectionId, key), encrypted, ONE_HOUR_SECONDS)
    },
    async invalidate({ connectionId }: { connectionId: string }): Promise<void> {
        const redis = await redisConnections.useExisting()
        const keys = await redisHelper.scanAll(redis, `${KEY_PREFIX}:*:${connectionId}*`)
        if (keys.length > 0) {
            await redis.del(keys)
        }
    },
}

function checkKey(connectionId: string): string {
    return `${KEY_PREFIX}:check:${connectionId}`
}

function secretKey(connectionId: string, key: string): string {
    return `${KEY_PREFIX}:secret:${connectionId}:${key}`
}
