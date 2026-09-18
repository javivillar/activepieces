import {
    ActivepiecesError,
    ApId,
    apId,
    CreateRefresquitoProjectRoleRequestBody,
    ErrorCode,
    isNil,
    PlatformId,
    ProjectRole,
    RoleType,
    SeekPage,
    spreadIfDefined,
    UpdateRefresquitoProjectRoleRequestBody,
} from '@activepieces/shared'
import { Brackets, Equal } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { RefresquitoProjectMemberEntity } from './project-member.entity'
import { RefresquitoProjectRoleEntity } from './project-role.entity'

export const refresquitoProjectRoleRepo = repoFactory(RefresquitoProjectRoleEntity)
export const refresquitoProjectMemberRepo = repoFactory(RefresquitoProjectMemberEntity)

export const refresquitoProjectRoleService = {
    async getOneOrThrowById({ id }: { id: ApId }): Promise<ProjectRole> {
        const projectRole = await refresquitoProjectRoleRepo().findOneBy({ id })
        if (isNil(projectRole)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'project_role', entityId: id, message: 'Project Role by id not found' },
            })
        }
        return projectRole
    },

    async getOne({ name, platformId }: { name: string, platformId: PlatformId }): Promise<ProjectRole | null> {
        return refresquitoProjectRoleRepo().createQueryBuilder('projectRole')
            .where('LOWER(projectRole.name) = LOWER(:name)', { name })
            .andWhere(new Brackets((qb) => qb.where({ platformId }).orWhere({ type: RoleType.DEFAULT })))
            .getOne()
    },

    async getOneOrThrow({ name, platformId }: { name: string, platformId: PlatformId }): Promise<ProjectRole> {
        const projectRole = await this.getOne({ name, platformId })
        if (isNil(projectRole)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'project_role', entityId: name, message: 'Project Role by name and platformId not found' },
            })
        }
        return projectRole
    },

    async list({ platformId }: { platformId: PlatformId }): Promise<SeekPage<ProjectRole>> {
        const projectRoles = await refresquitoProjectRoleRepo().find({
            where: [
                { platformId: Equal(platformId) },
                { type: RoleType.DEFAULT },
            ],
            order: { created: 'ASC' },
        })
        return {
            data: await Promise.all(projectRoles.map(async (projectRole) => ({
                ...projectRole,
                userCount: await refresquitoProjectMemberRepo().countBy({ platformId, projectRoleId: projectRole.id }),
            }))),
            next: null,
            previous: null,
        }
    },

    async create(platformId: PlatformId, params: CreateRefresquitoProjectRoleRequestBody): Promise<ProjectRole> {
        const existing = await this.getOne({ name: params.name, platformId })
        if (!isNil(existing)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'project_role', entityId: params.name, message: 'Project Role name already exists' },
            })
        }
        return refresquitoProjectRoleRepo().save({
            id: apId(),
            platformId,
            ...params,
        })
    },

    async update({ id, platformId, params }: { id: ApId, platformId: PlatformId, params: UpdateRefresquitoProjectRoleRequestBody }): Promise<ProjectRole> {
        await refresquitoProjectRoleRepo().update({ id, platformId }, {
            ...spreadIfDefined('name', params.name),
            ...spreadIfDefined('permissions', params.permissions),
        })
        return refresquitoProjectRoleRepo().findOneByOrFail({ id, platformId })
    },

    async delete({ name, platformId }: { name: string, platformId: PlatformId }): Promise<void> {
        await refresquitoProjectRoleRepo().delete({ name, platformId })
    },
}
