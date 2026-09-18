import { RefresquitoGitRepo } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart } from '../../database/database-common'

export const RefresquitoGitRepoEntity = new EntitySchema<RefresquitoGitRepo>({
    name: 'refresquito_git_repo',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: {
            type: String,
        },
        remoteUrl: {
            type: String,
        },
        branch: {
            type: String,
        },
        branchType: {
            type: String,
            default: 'DEVELOPMENT',
        },
        sshPrivateKey: {
            type: String,
            nullable: true,
        },
        slug: {
            type: String,
        },
    },
    indices: [
        {
            name: 'idx_refresquito_git_repo_project_id',
            columns: ['projectId'],
            unique: true,
        },
    ],
})
