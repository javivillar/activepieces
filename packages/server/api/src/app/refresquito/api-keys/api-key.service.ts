import { cryptoUtils } from '@activepieces/server-utils'
import {
    ActivepiecesError,
    apId,
    ErrorCode,
    isNil,
    RefresquitoApiKey,
    RefresquitoApiKeyResponseWithValue,
    secureApId,
    SeekPage,
} from '@activepieces/shared'
import { repoFactory } from '../../core/db/repo-factory'
import { RefresquitoApiKeyEntity } from './api-key.entity'

const API_KEY_TOKEN_LENGTH = 64
const repo = repoFactory<RefresquitoApiKey>(RefresquitoApiKeyEntity)

export const refresquitoApiKeyService = {
    async create({ platformId, displayName }: CreateParams): Promise<RefresquitoApiKeyResponseWithValue> {
        const generated = generateApiKey()
        const saved = await repo().save({
            id: apId(),
            platformId,
            displayName,
            hashedValue: generated.hashed,
            truncatedValue: generated.truncated,
            lastUsedAt: null,
        })
        return {
            ...saved,
            value: generated.value,
        }
    },
    async getByValue(value: string): Promise<RefresquitoApiKey | null> {
        const apiKey = await repo().findOneBy({
            hashedValue: cryptoUtils.hashSHA256(value),
        })
        if (!isNil(apiKey)) {
            await repo().update(apiKey.id, {
                lastUsedAt: new Date().toISOString(),
            })
        }
        return apiKey
    },
    async list({ platformId }: ListParams): Promise<SeekPage<RefresquitoApiKey>> {
        const data = await repo().findBy({ platformId })
        return { data, next: null, previous: null }
    },
    async delete({ platformId, id }: DeleteParams): Promise<void> {
        const apiKey = await repo().findOneBy({ platformId, id })
        if (isNil(apiKey)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { message: `api key ${id} not found` },
            })
        }
        await repo().delete({ platformId, id })
    },
}

function generateApiKey(): { value: string, hashed: string, truncated: string } {
    const value = `sk-${secureApId(API_KEY_TOKEN_LENGTH - 3)}`
    return {
        value,
        hashed: cryptoUtils.hashSHA256(value),
        truncated: value.slice(-4),
    }
}

type CreateParams = {
    platformId: string
    displayName: string
}

type ListParams = {
    platformId: string
}

type DeleteParams = {
    platformId: string
    id: string
}
