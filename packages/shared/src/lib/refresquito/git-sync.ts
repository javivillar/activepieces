import { z } from 'zod'
import { BaseModelSchema, Nullable } from '../core/common/base-model'
import { formErrors } from '../form-errors'

const SAFE_SLUG_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,128}$/
const SAFE_BRANCH_PATTERN = /^(?!-)[A-Za-z0-9._/-]{1,255}$/
const SAFE_REMOTE_URL_PATTERN = /^git@[A-Za-z0-9.-]+:[A-Za-z0-9._/-]+(\.git)?$/

export enum RefresquitoGitBranchType {
    PRODUCTION = 'PRODUCTION',
    DEVELOPMENT = 'DEVELOPMENT',
}

export const RefresquitoGitRepo = z.object({
    ...BaseModelSchema,
    remoteUrl: z.string(),
    branch: z.string(),
    branchType: z.enum(RefresquitoGitBranchType),
    projectId: z.string(),
    sshPrivateKey: Nullable(z.string()),
    slug: z.string(),
})
export type RefresquitoGitRepo = z.infer<typeof RefresquitoGitRepo>

export const RefresquitoGitRepoWithoutSensitiveData = RefresquitoGitRepo.omit({ sshPrivateKey: true })
export type RefresquitoGitRepoWithoutSensitiveData = z.infer<typeof RefresquitoGitRepoWithoutSensitiveData>

export enum RefresquitoGitPushOperationType {
    PUSH_FLOW = 'PUSH_FLOW',
    DELETE_FLOW = 'DELETE_FLOW',
    PUSH_TABLE = 'PUSH_TABLE',
    DELETE_TABLE = 'DELETE_TABLE',
    PUSH_EVERYTHING = 'PUSH_EVERYTHING',
}

export const RefresquitoPushFlowsGitRepoRequest = z.object({
    type: z.union([z.literal(RefresquitoGitPushOperationType.PUSH_FLOW), z.literal(RefresquitoGitPushOperationType.DELETE_FLOW)]),
    commitMessage: z.string().min(1, formErrors.required),
    externalFlowIds: z.array(z.string()),
})
export type RefresquitoPushFlowsGitRepoRequest = z.infer<typeof RefresquitoPushFlowsGitRepoRequest>

export const RefresquitoPushTablesGitRepoRequest = z.object({
    type: z.union([z.literal(RefresquitoGitPushOperationType.PUSH_TABLE), z.literal(RefresquitoGitPushOperationType.DELETE_TABLE)]),
    commitMessage: z.string().min(1, formErrors.required),
    externalTableIds: z.array(z.string()),
})
export type RefresquitoPushTablesGitRepoRequest = z.infer<typeof RefresquitoPushTablesGitRepoRequest>

export const RefresquitoPushEverythingGitRepoRequest = z.object({
    type: z.literal(RefresquitoGitPushOperationType.PUSH_EVERYTHING),
    commitMessage: z.string().min(1, formErrors.required),
})
export type RefresquitoPushEverythingGitRepoRequest = z.infer<typeof RefresquitoPushEverythingGitRepoRequest>

export const RefresquitoPushGitRepoRequest = z.union([RefresquitoPushFlowsGitRepoRequest, RefresquitoPushTablesGitRepoRequest, RefresquitoPushEverythingGitRepoRequest])
export type RefresquitoPushGitRepoRequest = z.infer<typeof RefresquitoPushGitRepoRequest>

export const RefresquitoConfigureRepoRequest = z.object({
    projectId: z.string().min(1, formErrors.required),
    remoteUrl: z.string().regex(SAFE_REMOTE_URL_PATTERN, formErrors.invalidGitRepoRemoteUrl),
    branch: z.string().regex(SAFE_BRANCH_PATTERN, formErrors.invalidGitRepoBranch),
    branchType: z.enum(RefresquitoGitBranchType),
    sshPrivateKey: z.string().min(1, formErrors.required),
    slug: z.string().regex(SAFE_SLUG_PATTERN, formErrors.invalidGitRepoSlug),
})
export type RefresquitoConfigureRepoRequest = z.infer<typeof RefresquitoConfigureRepoRequest>
