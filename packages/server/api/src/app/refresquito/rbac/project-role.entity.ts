import { ProjectRole } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

// Refresquito fork: maps to the SAME already-migrated `project_role` table
// (created for Community by upstream's own UnifyCommunityWithEnterprise
// migration) under a distinct entity name -- no new migration needed, and
// this entity has zero relation/import ties to app/ee/.
export const RefresquitoProjectRoleEntity = new EntitySchema<ProjectRole>({
    name: 'refresquito_project_role',
    tableName: 'project_role',
    columns: {
        ...BaseColumnSchemaPart,
        name: {
            type: String,
        },
        permissions: {
            type: String,
            array: true,
        },
        platformId: {
            type: String,
            nullable: true,
        },
        type: {
            type: String,
        },
    },
})
