import { RefresquitoProjectMember } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

// Refresquito fork: maps to the SAME already-migrated `project_member`
// table -- see project-role.entity.ts for why. No relations declared here;
// this service always resolves user/project/role via their own services
// (matching how the original upstream service actually reads this data),
// not TypeORM relation traversal.
export const RefresquitoProjectMemberEntity = new EntitySchema<RefresquitoProjectMember>({
    name: 'refresquito_project_member',
    tableName: 'project_member',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: {
            type: String,
        },
        platformId: {
            type: String,
        },
        userId: {
            type: String,
        },
        projectRoleId: {
            type: String,
        },
    },
})
