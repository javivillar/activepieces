import {
    ActivepiecesError,
    ApId,
    apId,
    ErrorCode,
    isNil,
    Permission,
    PlatformId,
    ProjectRole,
    RoleType,
    SeekPage,
    spreadIfDefined,
    UpdateRefresquitoProjectRoleRequestBody,
} from '@activepieces/shared'
import { repoFactory } from '../../core/db/repo-factory'
import { RefresquitoProjectMemberEntity } from './project-member.entity'
import { RefresquitoProjectRoleEntity } from './project-role.entity'

// Refresquito fork: independent RBAC engine, CRUD for project roles. Both
// repos live here (rather than split across project-role/project-member
// files) because `user/user-service.ts` reaches into
// `refresquitoProjectMemberRepo` from this exact module path -- keeping
// that contract stable was more important than tidy file boundaries.
export const refresquitoProjectRoleRepo = repoFactory(RefresquitoProjectRoleEntity)
export const refresquitoProjectMemberRepo = repoFactory(RefresquitoProjectMemberEntity)

export const refresquitoProjectRoleService = {
    async getOneOrThrowById({ id }: { id: ApId }): Promise<ProjectRole> {
        const role = await refresquitoProjectRoleRepo().findOneBy({ id })
        return assertFound(role, id)
    },

    async getOne({ name, platformId }: { name: string, platformId: PlatformId }): Promise<ProjectRole | null> {
        return findRoleByNameForPlatform({ name, platformId })
    },

    async getOneOrThrow({ name, platformId }: { name: string, platformId: PlatformId }): Promise<ProjectRole> {
        const role = await findRoleByNameForPlatform({ name, platformId })
        return assertFound(role, name)
    },

    async list({ platformId }: { platformId: PlatformId }): Promise<SeekPage<ProjectRole>> {
        const roles = await refresquitoProjectRoleRepo().find({
            where: [
                { type: RoleType.DEFAULT },
                { platformId },
            ],
            order: { created: 'ASC' },
        })
        const memberCountByRoleId = await countMembersPerRole(roles.map((role) => role.id))
        return {
            data: roles.map((role) => ({ ...role, userCount: memberCountByRoleId.get(role.id) ?? 0 })),
            next: null,
            previous: null,
        }
    },

    async create({ platformId, name, permissions }: { platformId: PlatformId, name: string, permissions: Permission[] }): Promise<ProjectRole> {
        const existing = await findRoleByNameForPlatform({ name, platformId })
        if (!isNil(existing)) {
            throw new ActivepiecesError({
                code: ErrorCode.VALIDATION,
                params: { message: `A project role named "${name}" already exists on this platform` },
            })
        }
        return refresquitoProjectRoleRepo().save({
            id: apId(),
            platformId,
            name,
            permissions,
            type: RoleType.CUSTOM,
        })
    },

    async update({ id, platformId, params }: { id: ApId, platformId: PlatformId, params: UpdateRefresquitoProjectRoleRequestBody }): Promise<ProjectRole> {
        const role = await this.getOneOrThrowById({ id })
        assertMutableCustomRoleOwnedByPlatform(role, platformId)
        await refresquitoProjectRoleRepo().update({ id }, {
            ...spreadIfDefined('name', params.name),
            ...spreadIfDefined('permissions', params.permissions),
        })
        return this.getOneOrThrowById({ id })
    },

    async delete({ name, platformId }: { name: string, platformId: PlatformId }): Promise<void> {
        const role = await this.getOneOrThrow({ name, platformId })
        assertMutableCustomRoleOwnedByPlatform(role, platformId)
        const memberCount = await refresquitoProjectMemberRepo().countBy({ projectRoleId: role.id })
        if (memberCount > 0) {
            throw new ActivepiecesError({
                code: ErrorCode.VALIDATION,
                params: { message: `Cannot delete project role "${role.name}": it is still assigned to ${memberCount} project member(s)` },
            })
        }
        await refresquitoProjectRoleRepo().delete({ id: role.id })
    },
}

function findRoleByNameForPlatform({ name, platformId }: { name: string, platformId: PlatformId }): Promise<ProjectRole | null> {
    return refresquitoProjectRoleRepo()
        .createQueryBuilder('project_role')
        .where('LOWER(project_role.name) = LOWER(:name)', { name })
        .andWhere('(project_role."platformId" = :platformId OR project_role.type = :defaultType)', { platformId, defaultType: RoleType.DEFAULT })
        .getOne()
}

async function countMembersPerRole(roleIds: string[]): Promise<Map<string, number>> {
    if (roleIds.length === 0) {
        return new Map()
    }
    const rows = await refresquitoProjectMemberRepo()
        .createQueryBuilder('project_member')
        .select('project_member."projectRoleId"', 'projectRoleId')
        .addSelect('COUNT(*)', 'memberCount')
        .where('project_member."projectRoleId" IN (:...roleIds)', { roleIds })
        .groupBy('project_member."projectRoleId"')
        .getRawMany<{ projectRoleId: string, memberCount: string }>()
    return new Map(rows.map((row) => [row.projectRoleId, Number(row.memberCount)]))
}

function assertMutableCustomRoleOwnedByPlatform(role: ProjectRole, platformId: PlatformId): void {
    if (role.type !== RoleType.CUSTOM || role.platformId !== platformId) {
        throw new ActivepiecesError({
            code: ErrorCode.VALIDATION,
            params: { message: `Project role "${role.name}" is a default role and cannot be modified or deleted` },
        })
    }
}

function assertFound(role: ProjectRole | null, identifier: string): ProjectRole {
    if (isNil(role)) {
        throw new ActivepiecesError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityType: 'project_role', entityId: identifier, message: 'Project role not found' },
        })
    }
    return role
}
