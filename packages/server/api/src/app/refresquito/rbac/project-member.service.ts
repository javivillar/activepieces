import {
    ActivepiecesError,
    ApId,
    apId,
    Cursor,
    DefaultProjectRole,
    ErrorCode,
    isNil,
    Permission,
    PlatformId,
    PlatformRole,
    ProjectId,
    ProjectRole,
    RefresquitoProjectMember,
    RefresquitoProjectMemberWithUser,
    SeekPage,
    unique,
    UserId,
} from '@activepieces/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { userIdentityService } from '../../authentication/user-identity/user-identity-service'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'
import { RefresquitoProjectMemberEntity } from './project-member.entity'
import { refresquitoProjectMemberRepo, refresquitoProjectRoleService } from './project-role.service'

// Refresquito fork: independent RBAC engine. Resolves and manages the
// "who has what role on which project" relationship. Deliberately never
// declares TypeORM relations on RefresquitoProjectMemberEntity -- user,
// project and role each already have their own service with its own
// invariants (soft-delete, identity lookup, etc.), so this file composes
// those services instead of reaching around them with a join.
export const refresquitoProjectMemberService = (log: FastifyBaseLogger) => ({
    async getRole({ projectId, userId }: { projectId: ProjectId, userId: UserId }): Promise<ProjectRole | null> {
        const project = await projectService(log).getOneOrThrow(projectId)

        if (project.ownerId === userId) {
            return refresquitoProjectRoleService.getOneOrThrow({ name: DefaultProjectRole.ADMIN, platformId: project.platformId })
        }

        const user = await userService(log).getOneOrFail({ id: userId })
        if (user.platformId === project.platformId) {
            const impliedRole = impliedRoleForPlatformRole(user.platformRole)
            if (!isNil(impliedRole)) {
                return refresquitoProjectRoleService.getOneOrThrow({ name: impliedRole, platformId: project.platformId })
            }
        }

        const membership = await refresquitoProjectMemberRepo().findOneBy({ projectId, userId })
        if (isNil(membership)) {
            return null
        }
        return refresquitoProjectRoleService.getOneOrThrowById({ id: membership.projectRoleId })
    },

    async list({ platformId, projectId, projectRoleId, cursorRequest, limit }: {
        platformId: PlatformId
        projectId?: ProjectId
        projectRoleId?: string
        cursorRequest: Cursor | null
        limit: number
    }): Promise<SeekPage<RefresquitoProjectMemberWithUser>> {
        const { nextCursor, previousCursor } = paginationHelper.decodeCursor(cursorRequest)
        const paginator = buildPaginator({
            entity: RefresquitoProjectMemberEntity,
            query: {
                limit,
                order: 'ASC',
                afterCursor: nextCursor,
                beforeCursor: previousCursor,
            },
        })

        // The paginator builds its ORDER BY / cursor clauses from the entity's registered
        // name, so the query alias must be that same name (not the table name).
        const alias = RefresquitoProjectMemberEntity.options.name
        const queryBuilder = refresquitoProjectMemberRepo()
            .createQueryBuilder(alias)
            .where(`${alias}."platformId" = :platformId`, { platformId })
        if (!isNil(projectId)) {
            queryBuilder.andWhere(`${alias}."projectId" = :projectId`, { projectId })
        }
        if (!isNil(projectRoleId)) {
            queryBuilder.andWhere(`${alias}."projectRoleId" = :projectRoleId`, { projectRoleId })
        }

        const { data: members, cursor } = await paginator.paginate(queryBuilder)
        const enrichedMembers = await enrichMembers(members, log)
        return paginationHelper.createPage(enrichedMembers, cursor)
    },

    async upsert({ userId, projectId, projectRoleName }: { userId: UserId, projectId: ProjectId, projectRoleName: string }): Promise<RefresquitoProjectMember> {
        const project = await projectService(log).getOneOrThrow(projectId)
        const role = await refresquitoProjectRoleService.getOneOrThrow({ name: projectRoleName, platformId: project.platformId })
        const existing = await refresquitoProjectMemberRepo().findOneBy({ projectId, userId, platformId: project.platformId })

        await refresquitoProjectMemberRepo().upsert({
            id: existing?.id ?? apId(),
            updated: dayjs().toISOString(),
            userId,
            projectId,
            platformId: project.platformId,
            projectRoleId: role.id,
        }, ['projectId', 'userId', 'platformId'])

        return refresquitoProjectMemberRepo().findOneByOrFail({ projectId, userId, platformId: project.platformId })
    },

    async update({ id, projectId, platformId, role }: { id: ApId, projectId: ProjectId, platformId: PlatformId, role: string }): Promise<RefresquitoProjectMember> {
        const membership = await refresquitoProjectMemberRepo().findOneBy({ id })
        if (isNil(membership) || membership.projectId !== projectId || membership.platformId !== platformId) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'project_member', entityId: id, message: 'Project member not found' },
            })
        }
        const newRole = await refresquitoProjectRoleService.getOneOrThrow({ name: role, platformId })
        await refresquitoProjectMemberRepo().update({ id }, { projectRoleId: newRole.id })
        return { ...membership, projectRoleId: newRole.id, updated: dayjs().toISOString() }
    },

    async delete(projectId: ProjectId, id: ApId): Promise<void> {
        await refresquitoProjectMemberRepo().delete({ projectId, id })
    },

    async getIdsOfProjects({ userId }: { userId: UserId }): Promise<ProjectId[]> {
        const memberships = await refresquitoProjectMemberRepo().find({
            where: { userId },
            select: ['projectId'],
        })
        return unique(memberships.map((membership) => membership.projectId))
    },

    async hasPermissionOnAnyProject({ userId, platformId, permission }: { userId: UserId, platformId: PlatformId, permission: Permission }): Promise<boolean> {
        const matchingMembership = await refresquitoProjectMemberRepo()
            .createQueryBuilder('project_member')
            .innerJoin('project_role', 'project_role', 'project_role.id = project_member."projectRoleId"')
            .innerJoin('project', 'project', 'project.id = project_member."projectId"')
            .where('project_member."userId" = :userId', { userId })
            .andWhere('project_member."platformId" = :platformId', { platformId })
            .andWhere('project.deleted IS NULL')
            .andWhere(':permission = ANY(project_role.permissions)', { permission })
            .getOne()
        return !isNil(matchingMembership)
    },
})

function impliedRoleForPlatformRole(platformRole: PlatformRole): DefaultProjectRole | null {
    switch (platformRole) {
        case PlatformRole.ADMIN:
            return DefaultProjectRole.ADMIN
        case PlatformRole.OPERATOR:
            return DefaultProjectRole.EDITOR
        case PlatformRole.MEMBER:
            return null
    }
}

async function enrichMembers(members: RefresquitoProjectMember[], log: FastifyBaseLogger): Promise<RefresquitoProjectMemberWithUser[]> {
    if (members.length === 0) {
        return []
    }

    const roleById = new Map((await Promise.all(
        unique(members.map((member) => member.projectRoleId)).map((id) => refresquitoProjectRoleService.getOneOrThrowById({ id })),
    )).map((role) => [role.id, role]))

    const projectById = new Map((await Promise.all(
        unique(members.map((member) => member.projectId)).map(async (id) => [id, await projectService(log).getOne(id)] as const),
    )))

    const enriched: RefresquitoProjectMemberWithUser[] = []
    for (const member of members) {
        const project = projectById.get(member.projectId)
        const role = roleById.get(member.projectRoleId)
        if (isNil(project) || isNil(role)) {
            continue
        }
        const user = await userService(log).getOneOrFail({ id: member.userId })
        const identity = await userIdentityService(log).getBasicInformation(user.identityId)
        enriched.push({
            ...member,
            projectRole: role,
            project: { id: project.id, displayName: project.displayName },
            user: {
                id: user.id,
                platformId: user.platformId,
                platformRole: user.platformRole,
                status: user.status,
                externalId: user.externalId,
                email: identity.email,
                firstName: identity.firstName,
                lastName: identity.lastName,
                created: user.created,
                updated: user.updated,
            },
        })
    }
    return enriched
}
