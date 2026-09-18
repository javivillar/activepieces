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

export const refresquitoProjectMemberService = (log: FastifyBaseLogger) => ({
    async upsert({ userId, projectId, projectRoleName }: { userId: string, projectId: ProjectId, projectRoleName: string }): Promise<RefresquitoProjectMember> {
        const { platformId } = await projectService(log).getOneOrThrow(projectId)
        const existing = await refresquitoProjectMemberRepo().findOneBy({ projectId, userId, platformId })
        const id = existing?.id ?? apId()
        const projectRole = await refresquitoProjectRoleService.getOneOrThrow({ name: projectRoleName, platformId })

        await refresquitoProjectMemberRepo().upsert({
            id,
            updated: dayjs().toISOString(),
            userId,
            platformId,
            projectId,
            projectRoleId: projectRole.id,
        }, ['projectId', 'userId', 'platformId'])

        return refresquitoProjectMemberRepo().findOneOrFail({ where: { id } })
    },

    async list({ platformId, projectId, cursorRequest, limit, projectRoleId }: { platformId: PlatformId, projectId?: ProjectId, cursorRequest: Cursor | null, limit: number, projectRoleId?: string }): Promise<SeekPage<RefresquitoProjectMemberWithUser>> {
        const decodedCursor = paginationHelper.decodeCursor(cursorRequest)
        const paginator = buildPaginator({
            entity: RefresquitoProjectMemberEntity,
            query: {
                limit,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const queryBuilder = refresquitoProjectMemberRepo().createQueryBuilder('project_member').where({ platformId })
        if (projectId) {
            queryBuilder.andWhere({ projectId })
        }
        if (projectRoleId) {
            queryBuilder.andWhere({ projectRoleId })
        }
        const { data, cursor } = await paginator.paginate(queryBuilder)
        const enriched = await Promise.all(data.map((member) => enrichWithUser(member, log)))
        return paginationHelper.createPage<RefresquitoProjectMemberWithUser>(enriched.filter((m): m is RefresquitoProjectMemberWithUser => !isNil(m)), cursor)
    },

    async getRole({ userId, projectId }: { projectId: ProjectId, userId: UserId }): Promise<ProjectRole | null> {
        const project = await projectService(log).getOneOrThrow(projectId)
        const user = await userService(log).getOneOrFail({ id: userId })

        if (user.id === project.ownerId) {
            return refresquitoProjectRoleService.getOneOrThrow({ name: DefaultProjectRole.ADMIN, platformId: project.platformId })
        }
        if (project.platformId === user.platformId && user.platformRole === PlatformRole.ADMIN) {
            return refresquitoProjectRoleService.getOneOrThrow({ name: DefaultProjectRole.ADMIN, platformId: project.platformId })
        }
        if (project.platformId === user.platformId && user.platformRole === PlatformRole.OPERATOR) {
            return refresquitoProjectRoleService.getOneOrThrow({ name: DefaultProjectRole.EDITOR, platformId: project.platformId })
        }
        const member = await refresquitoProjectMemberRepo().findOneBy({ projectId, userId })
        if (isNil(member)) {
            return null
        }
        return refresquitoProjectRoleService.getOneOrThrowById({ id: member.projectRoleId })
    },

    async update({ id, projectId, platformId, role }: { id: ApId, projectId: ProjectId, platformId: PlatformId, role: string }): Promise<RefresquitoProjectMember> {
        const projectRole = await refresquitoProjectRoleService.getOneOrThrow({ name: role, platformId })
        const member = await refresquitoProjectMemberRepo().findOneBy({ id })
        if (isNil(member) || member.projectId !== projectId || member.platformId !== platformId) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'project_member', entityId: id, message: 'Project member not found' },
            })
        }
        await refresquitoProjectMemberRepo().update({ id, projectId }, { projectRoleId: projectRole.id })
        return { ...member, projectRoleId: projectRole.id, updated: dayjs().toISOString() }
    },

    async delete(projectId: ProjectId, id: ApId): Promise<void> {
        await refresquitoProjectMemberRepo().delete({ projectId, id })
    },

    async getIdsOfProjects({ userId, platformId }: { userId: UserId, platformId: PlatformId }): Promise<string[]> {
        const members = await refresquitoProjectMemberRepo().findBy({ userId, platformId })
        return members.map((member) => member.projectId)
    },

    async hasPermissionOnAnyProject({ userId, platformId, permission }: { userId: UserId, platformId: PlatformId, permission: Permission }): Promise<boolean> {
        const count = await refresquitoProjectMemberRepo()
            .createQueryBuilder('project_member')
            .innerJoin('project_role', 'project_role', 'project_role.id = project_member."projectRoleId"')
            .innerJoin('project', 'project', 'project.id = project_member."projectId"')
            .where('project_member."userId" = :userId', { userId })
            .andWhere('project_member."platformId" = :platformId', { platformId })
            .andWhere(':permission = ANY(project_role.permissions)', { permission })
            .andWhere('project.deleted IS NULL')
            .getCount()
        return count > 0
    },
})

async function enrichWithUser(member: RefresquitoProjectMember, log: FastifyBaseLogger): Promise<RefresquitoProjectMemberWithUser | null> {
    const isProjectSoftDeleted = await projectService(log).exists({ projectId: member.projectId, isSoftDeleted: true })
    if (isProjectSoftDeleted) {
        return null
    }
    const user = await userService(log).getOneOrFail({ id: member.userId })
    const identity = await userIdentityService(log).getBasicInformation(user.identityId)
    const projectRole = await refresquitoProjectRoleService.getOneOrThrowById({ id: member.projectRoleId })
    const project = await projectService(log).getOneOrThrow(member.projectId)
    return {
        ...member,
        projectRole,
        project: { id: project.id, displayName: project.displayName },
        user: {
            platformId: user.platformId,
            platformRole: user.platformRole,
            status: user.status,
            externalId: user.externalId,
            email: identity.email,
            id: user.id,
            firstName: identity.firstName,
            lastName: identity.lastName,
            created: user.created,
            updated: user.updated,
        },
    }
}
