import {
    ActivepiecesError,
    ApId,
    ErrorCode,
    isNil,
    Permission,
    Principal,
    PrincipalType,
    ProjectId,
    ProjectRole,
} from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { projectService } from '../../project/project-service'
import { refresquitoProjectMemberService } from './project-member.service'

// Refresquito fork: independent RBAC enforcement engine, called from
// core/security/v2/authz/authorize.ts -- the one edition-agnostic entry
// point every protected route already goes through. Each principal type
// has its own, deliberately separate access rule; USER is the only one
// that actually consults a ProjectRole.
export const refresquitoRbacService = (log: FastifyBaseLogger) => ({
    async assertPrinicpalAccessToProject({ principal, permission, projectId }: { principal: Principal, permission: Permission | undefined, projectId: ProjectId }): Promise<void> {
        if (principal.type === PrincipalType.USER) {
            const role = await resolveUserRoleOrThrow(principal.id, projectId, log)
            if (!isNil(permission) && !roleGrants(role, permission)) {
                throw new ActivepiecesError({
                    code: ErrorCode.PERMISSION_DENIED,
                    params: { userId: principal.id, projectId, projectRole: role, permission },
                })
            }
            return
        }

        if (principal.type === PrincipalType.ENGINE) {
            if (principal.projectId === projectId) {
                return
            }
            throw unauthorized(`Engine principal is scoped to project ${principal.projectId}, not ${projectId}`, projectId)
        }

        if (principal.type === PrincipalType.SERVICE) {
            const project = await projectService(log).getOneOrThrow(projectId)
            if (project.platformId === principal.platform.id) {
                return
            }
            throw unauthorized('Service principal belongs to a different platform than the project', projectId)
        }

        // WORKER / ONBOARDING / UNKNOWN never carry project-level identity.
        throw unauthorized(`Principal of type ${principal.type} cannot access a project directly`, projectId)
    },
})

export async function refresquitoGetPrincipalRoleOrThrow(userId: ApId, projectId: ProjectId, log: FastifyBaseLogger): Promise<ProjectRole> {
    return resolveUserRoleOrThrow(userId, projectId, log)
}

async function resolveUserRoleOrThrow(userId: ApId, projectId: ProjectId, log: FastifyBaseLogger): Promise<ProjectRole> {
    const role = await refresquitoProjectMemberService(log).getRole({ projectId, userId })
    if (isNil(role)) {
        throw unauthorized('User has no role on this project', projectId)
    }
    return role
}

function roleGrants(role: ProjectRole, permission: Permission): boolean {
    return role.permissions.includes(permission)
}

function unauthorized(message: string, projectId: ProjectId): ActivepiecesError {
    return new ActivepiecesError({
        code: ErrorCode.AUTHORIZATION,
        params: { message, projectId },
    })
}
