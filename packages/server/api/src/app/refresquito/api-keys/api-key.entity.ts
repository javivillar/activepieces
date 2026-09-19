import { RefresquitoApiKey } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

// Column set mirrors the already-applied migration
// (1795000000000-AddRefresquitoApiKey.ts) exactly -- this table's physical
// schema cannot be changed here without a new migration.
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
