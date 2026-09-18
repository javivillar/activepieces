import { z } from 'zod'
import { BaseModelSchema, Nullable } from '../core/common/base-model'
import { ApId } from '../core/common/id-generator'

export const RefresquitoApiKey = z.object({
    ...BaseModelSchema,
    platformId: ApId,
    displayName: z.string(),
    hashedValue: z.string(),
    truncatedValue: z.string(),
    lastUsedAt: Nullable(z.string()),
})
export type RefresquitoApiKey = z.infer<typeof RefresquitoApiKey>

export const RefresquitoApiKeyResponseWithValue = RefresquitoApiKey.omit({ hashedValue: true }).extend({
    value: z.string(),
})
export type RefresquitoApiKeyResponseWithValue = z.infer<typeof RefresquitoApiKeyResponseWithValue>

export const RefresquitoApiKeyResponseWithoutValue = RefresquitoApiKey.omit({ hashedValue: true })
export type RefresquitoApiKeyResponseWithoutValue = z.infer<typeof RefresquitoApiKeyResponseWithoutValue>

export const CreateRefresquitoApiKeyRequest = z.object({
    displayName: z.string().min(1),
})
export type CreateRefresquitoApiKeyRequest = z.infer<typeof CreateRefresquitoApiKeyRequest>
