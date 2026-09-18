import { RefresquitoSecretManagerConnection } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

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
