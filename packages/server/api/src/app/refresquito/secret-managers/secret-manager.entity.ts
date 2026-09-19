import { RefresquitoSecretManagerConnection } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

// Physical schema is frozen by migration 1795000000001-AddRefresquitoSecretManager
// (already applied to production) -- column names/types here must match it exactly.
export const RefresquitoSecretManagerEntity = new EntitySchema<RefresquitoSecretManagerConnection>({
    name: 'refresquito_secret_manager',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            type: String,
        },
        name: {
            type: String,
        },
        namespace: {
            type: String,
        },
        secretName: {
            type: String,
        },
        scope: {
            type: String,
        },
        projectIds: {
            type: 'jsonb',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_refresquito_secret_manager_platform_id',
            columns: ['platformId'],
        },
    ],
})
