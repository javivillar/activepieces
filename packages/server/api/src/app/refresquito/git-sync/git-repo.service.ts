import {
    ActivepiecesError,
    apId,
    ErrorCode,
    FlowState,
    FlowVersionState,
    isNil,
    PopulatedTable,
    RefresquitoConfigureRepoRequest,
    RefresquitoGitBranchType,
    RefresquitoGitPushOperationType,
    RefresquitoGitRepo,
    RefresquitoPushFlowsGitRepoRequest,
    RefresquitoPushTablesGitRepoRequest,
} from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { flowService } from '../../flows/flow/flow.service'
import { fieldService } from '../../tables/field/field.service'
import { tableService } from '../../tables/table/table.service'
import { refresquitoGitHelper } from './git-helper'
import { RefresquitoGitRepoEntity } from './git-repo.entity'
import { refresquitoGitSyncHelper } from './git-sync-helper'

const repo = repoFactory<RefresquitoGitRepo>(RefresquitoGitRepoEntity)

export const refresquitoGitRepoService = (log: FastifyBaseLogger) => ({
    async upsert(request: RefresquitoConfigureRepoRequest): Promise<RefresquitoGitRepo> {
        await refresquitoGitHelper.validateConnection(request)
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

    async list({ projectId }: { projectId: string }): Promise<{ data: RefresquitoGitRepo[], next: null, previous: null }> {
        return { data: await repo().findBy({ projectId }), next: null, previous: null }
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

    async onDeleted({ type, externalId, userId, projectId }: { type: typeof RefresquitoGitPushOperationType.DELETE_FLOW | typeof RefresquitoGitPushOperationType.DELETE_TABLE, externalId: string, userId: string, projectId: string }): Promise<void> {
        const gitRepo = await repo().findOneBy({ projectId })
        if (isNil(gitRepo) || gitRepo.branchType === RefresquitoGitBranchType.PRODUCTION) {
            return
        }
        if (type === RefresquitoGitPushOperationType.DELETE_FLOW) {
            await this.deleteFlows({ id: gitRepo.id, userId, request: { type, commitMessage: `chore: deleted flow ${externalId}`, externalFlowIds: [externalId] } })
        }
        else {
            await this.deleteTables({ id: gitRepo.id, userId, request: { type, commitMessage: `chore: deleted table ${externalId}`, externalTableIds: [externalId] } })
        }
    },

    async pushFlows({ id, userId, request }: { id: string, userId: string, request: RefresquitoPushFlowsGitRepoRequest }): Promise<void> {
        const gitRepo = await this.getOrThrow({ id })
        const { git, flowFolderPath } = await refresquitoGitHelper.createGitRepoAndReturnPaths(log, gitRepo, userId)
        const flows = await listFlowsByExternalIds(log, gitRepo.projectId, request.externalFlowIds)
        for (const flow of flows) {
            await refresquitoGitSyncHelper.upsertFlowToGit({ fileName: flow.externalId, flow, flowFolderPath })
        }
        await refresquitoGitHelper.commitAndPush(git, gitRepo, request.commitMessage)
    },

    async deleteFlows({ id, userId, request }: { id: string, userId: string, request: RefresquitoPushFlowsGitRepoRequest }): Promise<void> {
        const gitRepo = await this.getOrThrow({ id })
        const { git, flowFolderPath } = await refresquitoGitHelper.createGitRepoAndReturnPaths(log, gitRepo, userId)
        for (const fileName of request.externalFlowIds) {
            await refresquitoGitSyncHelper.deleteFromGit({ fileName, folderPath: flowFolderPath })
        }
        await refresquitoGitHelper.commitAndPush(git, gitRepo, request.commitMessage)
    },

    async pushTables({ id, userId, request }: { id: string, userId: string, request: RefresquitoPushTablesGitRepoRequest }): Promise<void> {
        const gitRepo = await this.getOrThrow({ id })
        const { git, tablesFolderPath } = await refresquitoGitHelper.createGitRepoAndReturnPaths(log, gitRepo, userId)
        const tables = await listTablesByExternalIds(gitRepo.projectId, request.externalTableIds)
        for (const table of tables) {
            await refresquitoGitSyncHelper.upsertTableToGit({ fileName: table.externalId ?? table.id, table, tablesFolderPath })
        }
        await refresquitoGitHelper.commitAndPush(git, gitRepo, request.commitMessage)
    },

    async deleteTables({ id, userId, request }: { id: string, userId: string, request: RefresquitoPushTablesGitRepoRequest }): Promise<void> {
        const gitRepo = await this.getOrThrow({ id })
        const { git, tablesFolderPath } = await refresquitoGitHelper.createGitRepoAndReturnPaths(log, gitRepo, userId)
        for (const fileName of request.externalTableIds) {
            await refresquitoGitSyncHelper.deleteFromGit({ fileName, folderPath: tablesFolderPath })
        }
        await refresquitoGitHelper.commitAndPush(git, gitRepo, request.commitMessage)
    },

    async pushEverything({ id, userId, commitMessage }: { id: string, userId: string, commitMessage: string }): Promise<void> {
        const gitRepo = await this.getOrThrow({ id })
        const allFlows = await flowService(log).list({
            projectIds: [gitRepo.projectId],
            limit: 10000,
            cursorRequest: null,
            folderId: undefined,
            status: undefined,
            name: undefined,
            connectionExternalIds: undefined,
            versionState: FlowVersionState.LOCKED,
        })
        const allTables = await tableService.list({
            folderId: undefined,
            projectId: gitRepo.projectId,
            limit: 10000,
            cursor: undefined,
            name: undefined,
            externalIds: undefined,
        })
        if (allFlows.data.length > 0) {
            await this.pushFlows({ id, userId, request: { type: RefresquitoGitPushOperationType.PUSH_FLOW, commitMessage, externalFlowIds: allFlows.data.map((f) => f.externalId) } })
        }
        if (allTables.data.length > 0) {
            await this.pushTables({ id, userId, request: { type: RefresquitoGitPushOperationType.PUSH_TABLE, commitMessage, externalTableIds: allTables.data.map((t) => t.externalId ?? t.id) } })
        }
    },
})

async function listFlowsByExternalIds(log: FastifyBaseLogger, projectId: string, externalIds: string[]): Promise<FlowState[]> {
    const page = await flowService(log).list({
        projectIds: [projectId],
        limit: 10000,
        cursorRequest: null,
        folderId: undefined,
        status: undefined,
        name: undefined,
        connectionExternalIds: undefined,
        versionState: FlowVersionState.LOCKED,
    })
    return page.data.filter((flow) => externalIds.includes(flow.externalId))
}

async function listTablesByExternalIds(projectId: string, externalIds: string[]): Promise<PopulatedTable[]> {
    const tables = await tableService.list({
        folderId: undefined,
        projectId,
        limit: 10000,
        cursor: undefined,
        name: undefined,
        externalIds,
    })
    const tableIds = tables.data.map((t) => t.id)
    const fieldsMap = await fieldService.getAllByTableIds({ projectId, tableIds })
    return tables.data.map((table) => ({ ...table, fields: fieldsMap.get(table.id) ?? [] }))
}
