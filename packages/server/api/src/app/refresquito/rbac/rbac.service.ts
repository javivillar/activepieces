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
    UserPrincipal,
} from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { projectService } from '../../project/project-service'
import { refresquitoProjectMemberService } from './project-member.service'

// Refresquito fork: own RBAC enforcement engine. Called from
// core/security/v2/authz/authorize.ts (the ONE, edition-agnostic entry
// point every protected route already goes through) -- replaces the
// upstream ee/authentication/project-role/rbac-service.ts entirely, same
// contract: read whichever ProjectRole.permissions array applies to the
// current user/project (default OR custom role, no distinction), deny if
// the required permission isn't in it.
export const refresquitoRbacService = (log: FastifyBaseLogger) => ({
    async assertPrinicpalAccessToProject({ principal, permission, projectId }: { principal: Principal, permission: Permission | undefined, projectId: ProjectId }): Promise<void> {
        switch (principal.type) {
            case PrincipalType.UNKNOWN:
            case PrincipalType.WORKER:
            case PrincipalType.ONBOARDING:
                throw new ActivepiecesError({
                    code: ErrorCode.AUTHORIZATION,
                    params: { message: 'Principal is not allowed to access this project', projectId },
                })
            case PrincipalType.USER: {
                const role = await getPrincipalRoleOrThrow(principal.id, projectId, log)
                if (!isNil(permission) && !hasPermission(role, permission)) {
                    throwPermissionDenied(principal, projectId, role, permission)
                }
                break
            }
            case PrincipalType.ENGINE:
                if (principal.projectId !== projectId) {
                    throw new ActivepiecesError({
                        code: ErrorCode.AUTHORIZATION,
                        params: { message: 'Engine is not allowed to access this project', projectId, engineProjectId: principal.projectId },
                    })
                }
                break
            case PrincipalType.SERVICE: {
                const project = await projectService(log).getOneOrThrow(projectId)
                if (project.platformId !== principal.platform.id) {
                    throw new ActivepiecesError({
                        code: ErrorCode.AUTHORIZATION,
                        params: { message: 'Service is not allowed to access this project', projectId, platformId: principal.platform.id },
                    })
                }
                break
            }
        }
    },
})

function hasPermission(role: ProjectRole, permission: Permission): boolean {
    return role.permissions?.includes(permission) ?? false
}

export async function refresquitoGetPrincipalRoleOrThrow(userId: ApId, projectId: ProjectId, log: FastifyBaseLogger): Promise<ProjectRole> {
    return getPrincipalRoleOrThrow(userId, projectId, log)
}

async function getPrincipalRoleOrThrow(userId: ApId, projectId: ProjectId, log: FastifyBaseLogger): Promise<ProjectRole> {
    const role = await refresquitoProjectMemberService(log).getRole({ projectId, userId })
    if (isNil(role)) {
        throw new ActivepiecesError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'No role found for the user', userId, projectId },
        })
    }
    return role
}

function throwPermissionDenied(principal: UserPrincipal, projectId: ProjectId, projectRole: ProjectRole, permission: Permission): never {
    throw new ActivepiecesError({
        code: ErrorCode.PERMISSION_DENIED,
        params: { userId: principal.id, projectId, projectRole, permission },
    })
}
