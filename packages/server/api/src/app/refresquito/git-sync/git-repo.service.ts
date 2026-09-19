import {
    ActivepiecesError,
    apId,
    ErrorCode,
    FlowVersionState,
    isNil,
    PopulatedFlow,
    PopulatedTable,
    RefresquitoConfigureRepoRequest,
    RefresquitoGitBranchType,
    RefresquitoGitPushOperationType,
    RefresquitoGitRepo,
    RefresquitoPushFlowsGitRepoRequest,
    RefresquitoPushTablesGitRepoRequest,
    SeekPage,
} from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { userIdentityService } from '../../authentication/user-identity/user-identity-service'
import { repoFactory } from '../../core/db/repo-factory'
import { flowService } from '../../flows/flow/flow.service'
import { fieldService } from '../../tables/field/field.service'
import { tableService } from '../../tables/table/table.service'
import { userService } from '../../user/user-service'
import { RefresquitoGitRepoEntity } from './git-repo.entity'
import { refresquitoGitState } from './git-state'
import { refresquitoGitSyncHelper } from './git-sync-helper'
import { GitWorkingCopy, gitWorkspace } from './git-workspace'

const repo = repoFactory<RefresquitoGitRepo>(RefresquitoGitRepoEntity)

export const refresquitoGitRepoService = (log: FastifyBaseLogger) => ({
    async upsert(request: RefresquitoConfigureRepoRequest): Promise<RefresquitoGitRepo> {
        await gitWorkspace.verifyRemoteIsReachable({
            remoteUrl: request.remoteUrl,
            branch: request.branch,
            sshPrivateKey: request.sshPrivateKey,
        })
        const existing = await repo().findOneBy({ projectId: request.projectId })
        const id = existing?.id ?? apId()
        await repo().upsert({
            id,
            projectId: request.projectId,
            remoteUrl: request.remoteUrl,
            branch: request.branch,
            branchType: request.branchType,
            sshPrivateKey: request.sshPrivateKey,
            slug: request.slug,
        }, ['projectId'])
        return repo().findOneByOrFail({ id })
    },

    async list({ projectId }: { projectId: string }): Promise<SeekPage<RefresquitoGitRepo>> {
        const data = await repo().findBy({ projectId })
        return { data, next: null, previous: null }
    },

    async getOrThrow({ id }: { id: string }): Promise<RefresquitoGitRepo> {
        const gitRepo = await repo().findOneBy({ id })
        if (isNil(gitRepo)) {
            throw new ActivepiecesError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType: 'refresquito_git_repo' } })
        }
        return gitRepo
    },

    async delete({ id, projectId }: { id: string, projectId: string }): Promise<void> {
        await repo().delete({ id, projectId })
    },

    // Called right after a flow/table is deleted from the app's own database, so the repo doesn't
    // keep a stale file around. Unconditionally active for this fork -- no edition/license gate.
    async onDeleted({ type, externalId, userId, projectId }: {
        type: typeof RefresquitoGitPushOperationType.DELETE_FLOW | typeof RefresquitoGitPushOperationType.DELETE_TABLE
        externalId: string
        userId: string
        projectId: string
    }): Promise<void> {
        const gitRepo = await repo().findOneBy({ projectId })
        if (isNil(gitRepo) || gitRepo.branchType === RefresquitoGitBranchType.PRODUCTION) {
            return
        }
        if (type === RefresquitoGitPushOperationType.DELETE_FLOW) {
            await this.deleteFlows({
                id: gitRepo.id,
                userId,
                request: { type, commitMessage: `chore: remove flow ${externalId} from git (deleted in app)`, externalFlowIds: [externalId] },
            })
        }
        else {
            await this.deleteTables({
                id: gitRepo.id,
                userId,
                request: { type, commitMessage: `chore: remove table ${externalId} from git (deleted in app)`, externalTableIds: [externalId] },
            })
        }
    },

    async pushFlows({ id, userId, request }: { id: string, userId: string, request: RefresquitoPushFlowsGitRepoRequest }): Promise<void> {
        const gitRepo = await this.getOrThrow({ id })
        await withWorkingCopy({ log, gitRepo, userId, commitMessage: request.commitMessage }, async (workingCopy) => {
            const flows = await findFlows({ log, projectId: gitRepo.projectId, externalIds: request.externalFlowIds })
            await writeFlowsToWorkingCopy({ workingCopy, flows })
        })
    },

    async deleteFlows({ id, userId, request }: { id: string, userId: string, request: RefresquitoPushFlowsGitRepoRequest }): Promise<void> {
        const gitRepo = await this.getOrThrow({ id })
        await withWorkingCopy({ log, gitRepo, userId, commitMessage: request.commitMessage }, async (workingCopy) => {
            for (const externalId of request.externalFlowIds) {
                await refresquitoGitSyncHelper.deleteJsonFile({ dir: workingCopy.flowsDir, fileName: externalId })
            }
        })
    },

    async pushTables({ id, userId, request }: { id: string, userId: string, request: RefresquitoPushTablesGitRepoRequest }): Promise<void> {
        const gitRepo = await this.getOrThrow({ id })
        await withWorkingCopy({ log, gitRepo, userId, commitMessage: request.commitMessage }, async (workingCopy) => {
            const tables = await findTables({ projectId: gitRepo.projectId, externalIds: request.externalTableIds })
            await writeTablesToWorkingCopy({ workingCopy, tables })
        })
    },

    async deleteTables({ id, userId, request }: { id: string, userId: string, request: RefresquitoPushTablesGitRepoRequest }): Promise<void> {
        const gitRepo = await this.getOrThrow({ id })
        await withWorkingCopy({ log, gitRepo, userId, commitMessage: request.commitMessage }, async (workingCopy) => {
            for (const externalId of request.externalTableIds) {
                await refresquitoGitSyncHelper.deleteJsonFile({ dir: workingCopy.tablesDir, fileName: externalId })
            }
        })
    },

    // Convenience operation: every locked/published flow and every table, in a single commit.
    async pushEverything({ id, userId, commitMessage }: { id: string, userId: string, commitMessage: string }): Promise<void> {
        const gitRepo = await this.getOrThrow({ id })
        await withWorkingCopy({ log, gitRepo, userId, commitMessage }, async (workingCopy) => {
            const [flows, tables] = await Promise.all([
                findFlows({ log, projectId: gitRepo.projectId, externalIds: undefined }),
                findTables({ projectId: gitRepo.projectId, externalIds: undefined }),
            ])
            await writeFlowsToWorkingCopy({ workingCopy, flows })
            await writeTablesToWorkingCopy({ workingCopy, tables })
        })
    },
})

async function withWorkingCopy(
    { log, gitRepo, userId, commitMessage }: { log: FastifyBaseLogger, gitRepo: RefresquitoGitRepo, userId: string, commitMessage: string },
    populate: (workingCopy: GitWorkingCopy) => Promise<void>,
): Promise<void> {
    const user = await userService(log).getOneOrFail({ id: userId })
    const identity = await userIdentityService(log).getBasicInformation(user.identityId)
    const workingCopy = await gitWorkspace.openWorkingCopy({
        gitRepo,
        authorEmail: identity.email,
        authorName: `${identity.firstName} ${identity.lastName}`,
    })
    try {
        await populate(workingCopy)
        await gitWorkspace.commitAndPush({ git: workingCopy.git, branch: gitRepo.branch, commitMessage })
    }
    finally {
        await workingCopy.dispose()
    }
}

async function writeFlowsToWorkingCopy({ workingCopy, flows }: { workingCopy: GitWorkingCopy, flows: PopulatedFlow[] }): Promise<void> {
    for (const flow of flows) {
        const exportState = await refresquitoGitState.buildFlowExportState(flow)
        await refresquitoGitSyncHelper.writeJsonFile({ dir: workingCopy.flowsDir, fileName: flow.externalId, contents: exportState })
    }
}

async function writeTablesToWorkingCopy({ workingCopy, tables }: { workingCopy: GitWorkingCopy, tables: PopulatedTable[] }): Promise<void> {
    for (const table of tables) {
        const exportState = refresquitoGitState.buildTableExportState(table)
        await refresquitoGitSyncHelper.writeJsonFile({ dir: workingCopy.tablesDir, fileName: table.externalId ?? table.id, contents: exportState })
    }
}

async function findFlows({ log, projectId, externalIds }: { log: FastifyBaseLogger, projectId: string, externalIds: string[] | undefined }): Promise<PopulatedFlow[]> {
    const page = await flowService(log).list({
        projectIds: [projectId],
        limit: 10000,
        cursorRequest: null,
        folderId: undefined,
        status: undefined,
        name: undefined,
        connectionExternalIds: undefined,
        versionState: FlowVersionState.LOCKED,
        externalIds,
    })
    return page.data
}

async function findTables({ projectId, externalIds }: { projectId: string, externalIds: string[] | undefined }): Promise<PopulatedTable[]> {
    const tables = await tableService.list({
        folderId: undefined,
        projectId,
        limit: 10000,
        cursor: undefined,
        name: undefined,
        externalIds,
    })
    const tableIds = tables.data.map((table) => table.id)
    const fieldsMap = await fieldService.getAllByTableIds({ projectId, tableIds })
    return tables.data.map((table) => ({ ...table, fields: fieldsMap.get(table.id) ?? [] }))
}
