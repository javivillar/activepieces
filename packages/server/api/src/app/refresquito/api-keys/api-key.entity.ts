import { RefresquitoApiKey } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

export const RefresquitoApiKeyEntity = new EntitySchema<RefresquitoApiKey>({
    name: 'refresquito_api_key',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            type: String,
        },
        displayName: {
            type: String,
        },
        hashedValue: {
            type: String,
        },
        truncatedValue: {
            type: String,
        },
        lastUsedAt: {
            type: String,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_refresquito_api_key_hashed_value',
            columns: ['hashedValue'],
            unique: true,
        },
        {
            name: 'idx_refresquito_api_key_platform_id',
            columns: ['platformId'],
        },
    ],
})
