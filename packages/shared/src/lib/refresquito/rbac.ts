import { z } from 'zod'
import { BaseModelSchema } from '../core/common/base-model'
import { ApId } from '../core/common/id-generator'
import { Permission, RoleType } from '../core/common/security/permission'
import { UserWithMetaInformation } from '../core/user/user'
import { formErrors } from '../form-errors'
import { ProjectMetaData } from '../management/project/project'
import { DefaultProjectRole } from '../management/project/project-member'
import { ProjectRole } from '../management/project-role/project-role'

// Refresquito fork: own permission-enforcement engine, replacing the
// upstream Enterprise one (ee/authentication/project-role/rbac-service.ts +
// ee/projects/project-role/ + ee/projects/project-members/) entirely --
// see [[activepieces-keycloak-sso-fork]] memory. Reuses the same already-
// migrated project_role/project_member tables (created for Community by
// upstream's own UnifyCommunityWithEnterprise migration) and the same
// generic, non-Enterprise shared types (Permission, RoleType,
// DefaultProjectRole, ProjectRole -- all under lib/core/ or lib/management/,
// not lib/ee/), just a fresh entity/service/module implementation.
export const refresquitoRolePermissions: Record<DefaultProjectRole, Permission[]> = {
    [DefaultProjectRole.ADMIN]: [
        Permission.READ_APP_CONNECTION,
        Permission.WRITE_APP_CONNECTION,
        Permission.READ_FLOW,
        Permission.WRITE_FLOW,
        Permission.UPDATE_FLOW_STATUS,
        Permission.READ_PROJECT_MEMBER,
        Permission.WRITE_PROJECT_MEMBER,
        Permission.WRITE_INVITATION,
        Permission.READ_INVITATION,
        Permission.WRITE_PROJECT_RELEASE,
        Permission.READ_PROJECT_RELEASE,
        Permission.READ_RUN,
        Permission.WRITE_RUN,
        Permission.WRITE_ALERT,
        Permission.READ_ALERT,
        Permission.WRITE_PROJECT,
        Permission.READ_PROJECT,
        Permission.WRITE_FOLDER,
        Permission.READ_FOLDER,
        Permission.READ_TABLE,
        Permission.WRITE_TABLE,
        Permission.READ_MCP,
        Permission.WRITE_MCP,
        Permission.READ_KNOWLEDGE_BASE,
        Permission.WRITE_KNOWLEDGE_BASE,
        Permission.READ_VARIABLE,
        Permission.WRITE_VARIABLE,
    ],
    [DefaultProjectRole.EDITOR]: [
        Permission.READ_APP_CONNECTION,
        Permission.WRITE_APP_CONNECTION,
        Permission.READ_FLOW,
        Permission.WRITE_FLOW,
        Permission.UPDATE_FLOW_STATUS,
        Permission.READ_PROJECT_MEMBER,
        Permission.READ_INVITATION,
        Permission.WRITE_PROJECT_RELEASE,
        Permission.READ_PROJECT_RELEASE,
        Permission.READ_RUN,
        Permission.WRITE_RUN,
        Permission.READ_PROJECT,
        Permission.WRITE_FOLDER,
        Permission.READ_FOLDER,
        Permission.READ_TABLE,
        Permission.WRITE_TABLE,
        Permission.READ_MCP,
        Permission.WRITE_MCP,
        Permission.READ_KNOWLEDGE_BASE,
        Permission.WRITE_KNOWLEDGE_BASE,
        Permission.READ_VARIABLE,
        Permission.WRITE_VARIABLE,
    ],
    [DefaultProjectRole.VIEWER]: [
        Permission.READ_APP_CONNECTION,
        Permission.READ_FLOW,
        Permission.READ_PROJECT_MEMBER,
        Permission.READ_INVITATION,
        Permission.READ_PROJECT,
        Permission.READ_RUN,
        Permission.READ_FOLDER,
        Permission.READ_TABLE,
        Permission.READ_MCP,
        Permission.READ_KNOWLEDGE_BASE,
        Permission.READ_VARIABLE,
    ],
}

export const RefresquitoProjectMember = z.object({
    ...BaseModelSchema,
    platformId: ApId,
    userId: ApId,
    projectId: z.string(),
    projectRoleId: ApId,
})
export type RefresquitoProjectMember = z.infer<typeof RefresquitoProjectMember>

export const RefresquitoProjectMemberWithUser = RefresquitoProjectMember.extend({
    user: UserWithMetaInformation,
    projectRole: ProjectRole,
    project: ProjectMetaData,
})
export type RefresquitoProjectMemberWithUser = z.infer<typeof RefresquitoProjectMemberWithUser>

export const CreateRefresquitoProjectRoleRequestBody = z.object({
    name: z.string().min(1, formErrors.required),
    permissions: z.array(z.enum(Permission)),
    type: z.enum(RoleType).default(RoleType.CUSTOM),
})
export type CreateRefresquitoProjectRoleRequestBody = z.infer<typeof CreateRefresquitoProjectRoleRequestBody>

export const UpdateRefresquitoProjectRoleRequestBody = z.object({
    name: z.string().min(1, formErrors.required).optional(),
    permissions: z.array(z.enum(Permission)).optional(),
})
export type UpdateRefresquitoProjectRoleRequestBody = z.infer<typeof UpdateRefresquitoProjectRoleRequestBody>

export const UpdateRefresquitoProjectMemberRoleRequestBody = z.object({
    role: z.string().min(1, formErrors.required),
})
export type UpdateRefresquitoProjectMemberRoleRequestBody = z.infer<typeof UpdateRefresquitoProjectMemberRoleRequestBody>

export const ListRefresquitoProjectMembersRequestQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().optional(),
    projectRoleId: z.string().optional(),
})
export type ListRefresquitoProjectMembersRequestQuery = z.infer<typeof ListRefresquitoProjectMembersRequestQuery>

export const GetCurrentRefresquitoProjectMemberRoleQuery = z.object({
    projectId: z.string(),
})
export type GetCurrentRefresquitoProjectMemberRoleQuery = z.infer<typeof GetCurrentRefresquitoProjectMemberRoleQuery>

export const ListRefresquitoProjectMembersForProjectRoleRequestQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().optional(),
})
export type ListRefresquitoProjectMembersForProjectRoleRequestQuery = z.infer<typeof ListRefresquitoProjectMembersForProjectRoleRequestQuery>
