import { z } from 'zod'
import { BaseModelSchema } from '../core/common/base-model'
import { ApId } from '../core/common/id-generator'
import { Permission, RoleType } from '../core/common/security/permission'
import { unique } from '../core/common/utils/utils'
import { UserWithMetaInformation } from '../core/user/user'
import { formErrors } from '../form-errors'
import { ProjectMetaData } from '../management/project/project'
import { DefaultProjectRole } from '../management/project/project-member'
import { ProjectRole } from '../management/project-role/project-role'

// Refresquito fork: independent, from-scratch replacement for the
// Enterprise-licensed project-role/project-member RBAC feature. Built only
// from the fork's own functional spec (which default roles must be able to
// do) plus the generic, edition-agnostic Permission/DefaultProjectRole/
// ProjectRole types already living under lib/core/ and lib/management/ --
// this file (and its server-side counterparts under
// server/api/src/app/refresquito/rbac/) never opens, reads or reuses
// anything under lib/ee/ or app/ee/.
//
// The three tiers are derived as a chain of additions rather than three
// independent lists, so the "viewer set is a subset of editor, editor is a
// subset of admin" relationship the spec calls for is structural, not just
// a coincidence of three hand-typed arrays that happen to agree.

// A "can see it" permission for every resource a project member might ever
// look at. Nothing here lets you change anything.
const VIEWER_PERMISSIONS: Permission[] = [
    Permission.READ_APP_CONNECTION,
    Permission.READ_FLOW,
    Permission.READ_PROJECT,
    Permission.READ_PROJECT_MEMBER,
    Permission.READ_INVITATION,
    Permission.READ_RUN,
    Permission.READ_FOLDER,
    Permission.READ_TABLE,
    Permission.READ_MCP,
    Permission.READ_KNOWLEDGE_BASE,
    Permission.READ_VARIABLE,
]

// What a builder/operator needs on top of read access: create and change
// the things that make a project actually run (connections, flows, their
// enabled/disabled status, releases, runs, and the supporting resources
// flows depend on). Deliberately excludes anything administrative --
// membership, invitations, alerting, and the project record itself stay
// out of this tier.
const EDITOR_ADDED_PERMISSIONS: Permission[] = [
    Permission.WRITE_APP_CONNECTION,
    Permission.WRITE_FLOW,
    Permission.UPDATE_FLOW_STATUS,
    Permission.READ_PROJECT_RELEASE,
    Permission.WRITE_PROJECT_RELEASE,
    Permission.WRITE_RUN,
    Permission.WRITE_FOLDER,
    Permission.WRITE_TABLE,
    Permission.WRITE_MCP,
    Permission.WRITE_KNOWLEDGE_BASE,
    Permission.WRITE_VARIABLE,
]

// Everything that's administrative rather than operational: who's on the
// project, who's been invited, whether alerting is configured, and the
// project's own settings.
const ADMIN_ADDED_PERMISSIONS: Permission[] = [
    Permission.WRITE_PROJECT_MEMBER,
    Permission.WRITE_INVITATION,
    Permission.READ_ALERT,
    Permission.WRITE_ALERT,
    Permission.WRITE_PROJECT,
]

const EDITOR_PERMISSIONS = unique([...VIEWER_PERMISSIONS, ...EDITOR_ADDED_PERMISSIONS])
const ADMIN_PERMISSIONS = unique([...EDITOR_PERMISSIONS, ...ADMIN_ADDED_PERMISSIONS])

export const refresquitoRolePermissions: Record<DefaultProjectRole, Permission[]> = {
    [DefaultProjectRole.VIEWER]: VIEWER_PERMISSIONS,
    [DefaultProjectRole.EDITOR]: EDITOR_PERMISSIONS,
    [DefaultProjectRole.ADMIN]: ADMIN_PERMISSIONS,
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
    // Required by the route's project-scoped security check, which reads it from the query string.
    projectId: z.string(),
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
