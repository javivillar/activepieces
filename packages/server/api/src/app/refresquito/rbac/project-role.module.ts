import {
    ApId,
    ApplicationEventName,
    CreateRefresquitoProjectRoleRequestBody,
    ListRefresquitoProjectMembersForProjectRoleRequestQuery,
    PrincipalType,
    ProjectRole,
    RefresquitoProjectMemberWithUser,
    SeekPage,
    SERVICE_KEY_SECURITY_OPENAPI,
    UpdateRefresquitoProjectRoleRequestBody,
} from '@activepieces/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { applicationEvents } from '../../helper/application-events'
import { refresquitoProjectMemberService } from './project-member.service'
import { refresquitoProjectRoleService } from './project-role.service'

const DEFAULT_LIMIT_SIZE = 10

export const refresquitoProjectRoleModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(refresquitoProjectRoleController, { prefix: '/v1/project-roles' })
}

const refresquitoProjectRoleController: FastifyPluginAsyncZod = async (app) => {
    app.get('/:id', GetProjectRoleRequest, async (req) => {
        return refresquitoProjectRoleService.getOneOrThrowById({ id: req.params.id })
    })

    app.get('/:id/project-members', ListProjectMembersForProjectRoleRequest, async (req) => {
        return refresquitoProjectMemberService(req.log).list({
            projectRoleId: req.params.id,
            platformId: req.principal.platform.id,
            cursorRequest: req.query.cursor ?? null,
            limit: req.query.limit ?? DEFAULT_LIMIT_SIZE,
        })
    })

    app.get('/', ListProjectRolesRequest, async (req) => {
        return refresquitoProjectRoleService.list({ platformId: req.principal.platform.id })
    })

    app.post('/', CreateProjectRoleRequest, async (req, reply) => {
        const projectRole = await refresquitoProjectRoleService.create(req.principal.platform.id, req.body)
        applicationEvents(req.log).sendUserEvent(req, {
            action: ApplicationEventName.PROJECT_ROLE_CREATED,
            data: { projectRole },
        })
        return reply.code(StatusCodes.CREATED).send(projectRole)
    })

    app.post('/:id', UpdateProjectRoleRequest, async (req) => {
        const projectRole = await refresquitoProjectRoleService.update({
            id: req.params.id,
            platformId: req.principal.platform.id,
            params: req.body,
        })
        applicationEvents(req.log).sendUserEvent(req, {
            action: ApplicationEventName.PROJECT_ROLE_UPDATED,
            data: { projectRole },
        })
        return projectRole
    })

    app.delete('/:name', DeleteProjectRoleRequest, async (req) => {
        const projectRole = await refresquitoProjectRoleService.getOneOrThrow({
            name: req.params.name,
            platformId: req.principal.platform.id,
        })
        applicationEvents(req.log).sendUserEvent(req, {
            action: ApplicationEventName.PROJECT_ROLE_DELETED,
            data: { projectRole },
        })
        return refresquitoProjectRoleService.delete({
            name: req.params.name,
            platformId: req.principal.platform.id,
        })
    })
}

const GetProjectRoleRequest = {
    config: { security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]) },
    schema: { params: z.object({ id: ApId }) },
}

const ListProjectRolesRequest = {
    config: { security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]) },
    schema: { response: { [StatusCodes.OK]: SeekPage(ProjectRole) } },
}

const CreateProjectRoleRequest = {
    config: { security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]) },
    schema: {
        body: CreateRefresquitoProjectRoleRequestBody,
        response: { [StatusCodes.CREATED]: ProjectRole },
    },
}

const UpdateProjectRoleRequest = {
    config: { security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]) },
    schema: {
        body: UpdateRefresquitoProjectRoleRequestBody,
        params: z.object({ id: ApId }),
        response: { [StatusCodes.OK]: ProjectRole },
    },
}

const DeleteProjectRoleRequest = {
    config: { security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]) },
    schema: {
        params: z.object({ name: z.string() }),
        response: { [StatusCodes.NO_CONTENT]: z.null() },
    },
}

const ListProjectMembersForProjectRoleRequest = {
    config: { security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]) },
    schema: {
        tags: ['project-members'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: z.object({ id: ApId }),
        querystring: ListRefresquitoProjectMembersForProjectRoleRequestQuery,
        response: { [StatusCodes.OK]: SeekPage(RefresquitoProjectMemberWithUser) },
    },
}
