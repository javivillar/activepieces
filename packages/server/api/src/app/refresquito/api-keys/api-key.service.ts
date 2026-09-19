import { timingSafeEqual } from 'node:crypto'
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

// Secret shape: "sk-<21-char record id>.<40-char random secret>".
// The id half is not sensitive -- it only exists so a presented key can be
// resolved to its row with a primary-key lookup instead of a lookup keyed on
// a hash. Only the secret half is hashed and persisted (as hashedValue); the
// two are compared with a constant-time digest comparison so verification
// time doesn't leak how much of the secret was guessed correctly.
const SECRET_PART_LENGTH = 40
const ID_SECRET_SEPARATOR = '.'
const VALUE_PREFIX = 'sk-'
const TRUNCATED_LENGTH = 4

const repo = repoFactory<RefresquitoApiKey>(RefresquitoApiKeyEntity)

export const refresquitoApiKeyService = {
    async create({ platformId, displayName }: CreateParams): Promise<RefresquitoApiKeyResponseWithValue> {
        const id = apId()
        const secret = secureApId(SECRET_PART_LENGTH)
        const value = formatKeyValue({ id, secret })
        const saved = await repo().save({
            id,
            platformId,
            displayName,
            hashedValue: cryptoUtils.hashSHA256(secret),
            truncatedValue: value.slice(-TRUNCATED_LENGTH),
            lastUsedAt: null,
        })
        return {
            ...saved,
            value,
        }
    },

    async getByValue(value: string): Promise<RefresquitoApiKey | null> {
        const parsedValue = parseKeyValue(value)
        if (isNil(parsedValue)) {
            return null
        }
        const apiKey = await repo().findOneBy({ id: parsedValue.id })
        if (isNil(apiKey) || !secretMatchesHash({ secret: parsedValue.secret, hashedValue: apiKey.hashedValue })) {
            return null
        }
        await repo().update(apiKey.id, {
            lastUsedAt: new Date().toISOString(),
        })
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
                params: {
                    entityType: 'RefresquitoApiKey',
                    entityId: id,
                },
            })
        }
        await repo().delete({ platformId, id })
    },
}

function formatKeyValue({ id, secret }: { id: string, secret: string }): string {
    return `${VALUE_PREFIX}${id}${ID_SECRET_SEPARATOR}${secret}`
}

function parseKeyValue(value: string): { id: string, secret: string } | null {
    if (!value.startsWith(VALUE_PREFIX)) {
        return null
    }
    const remainder = value.slice(VALUE_PREFIX.length)
    const separatorIndex = remainder.indexOf(ID_SECRET_SEPARATOR)
    const hasIdAndSecret = separatorIndex > 0 && separatorIndex < remainder.length - 1
    if (!hasIdAndSecret) {
        return null
    }
    return {
        id: remainder.slice(0, separatorIndex),
        secret: remainder.slice(separatorIndex + 1),
    }
}

function secretMatchesHash({ secret, hashedValue }: { secret: string, hashedValue: string }): boolean {
    const candidateDigest = Buffer.from(cryptoUtils.hashSHA256(secret), 'hex')
    const storedDigest = Buffer.from(hashedValue, 'hex')
    if (candidateDigest.length !== storedDigest.length) {
        return false
    }
    return timingSafeEqual(candidateDigest, storedDigest)
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
