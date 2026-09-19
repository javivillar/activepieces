import { RefresquitoProjectMember } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

// Refresquito fork: independent RBAC engine (see rbac.service.ts). Points
// at the already-existing `project_member` table -- no migration here.
// User/project/role are looked up through their own services rather than
// TypeORM relations, so this schema declares no `relations` block; the
// unique index below only documents the constraint the live table already
// enforces (projectId, userId, platformId).
export const RefresquitoProjectMemberEntity = new EntitySchema<RefresquitoProjectMember>({
    name: 'refresquito_project_member',
    tableName: 'project_member',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: {
            type: String,
            length: 21,
        },
        platformId: {
            type: String,
            length: 21,
        },
        userId: {
            type: String,
            length: 21,
        },
        projectRoleId: {
            type: String,
            length: 21,
        },
    },
    indices: [
        {
            name: 'idx_refresquito_project_member_project_user_platform',
            columns: ['projectId', 'userId', 'platformId'],
            unique: true,
        },
    ],
})
