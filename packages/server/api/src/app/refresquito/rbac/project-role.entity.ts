import { ProjectRole } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

// Refresquito fork: independent RBAC engine (see rbac.service.ts for the
// full rationale). This EntitySchema points at the `project_role` table
// that already exists in the live database with the columns declared
// below -- it is NOT created by this fork, so no migration accompanies
// this file. `name` is only the TypeORM identifier used to register/look
// up this schema in-process; `tableName` is what actually gets queried.
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
