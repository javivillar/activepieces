import {
    GetCurrentRefresquitoProjectMemberRoleQuery,
    ListRefresquitoProjectMembersRequestQuery,
    Permission,
    PrincipalType,
    RefresquitoProjectMemberWithUser,
    SeekPage,
    SERVICE_KEY_SECURITY_OPENAPI,
    UpdateRefresquitoProjectMemberRoleRequestBody,
} from '@activepieces/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { entitiesMustBeOwnedByCurrentProject } from '../../authentication/authorization'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { RefresquitoProjectMemberEntity } from './project-member.entity'
import { refresquitoProjectMemberService } from './project-member.service'

const DEFAULT_PAGE_SIZE = 10

export const refresquitoProjectMemberModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentProject)
    await app.register(refresquitoProjectMemberController, { prefix: '/v1/project-members' })
}

const refresquitoProjectMemberController: FastifyPluginAsyncZod = async (app) => {
    app.get('/role', GetCurrentProjectMemberRoleRequest, async (request) => {
        return refresquitoProjectMemberService(request.log).getRole({
            projectId: request.projectId,
            userId: request.principal.id,
        })
    })

    app.get('/', ListProjectMembersRequest, async (request) => {
        return refresquitoProjectMemberService(request.log).list({
            platformId: request.principal.platform.id,
            projectId: request.projectId,
            projectRoleId: request.query.projectRoleId,
            cursorRequest: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
        })
    })

    app.post('/:id', UpdateProjectMemberRoleRequest, async (request) => {
        return refresquitoProjectMemberService(request.log).update({
            id: request.params.id,
            role: request.body.role,
            projectId: request.projectId,
            platformId: request.principal.platform.id,
        })
    })

    app.delete('/:id', DeleteProjectMemberRequest, async (request, reply) => {
        await refresquitoProjectMemberService(request.log).delete(request.projectId, request.params.id)
        return reply.code(StatusCodes.NO_CONTENT).send(null)
    })
}

const GetCurrentProjectMemberRoleRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER], undefined, {
            type: ProjectResourceType.QUERY,
        }),
    },
    schema: {
        querystring: GetCurrentRefresquitoProjectMemberRoleQuery,
    },
}

const ListProjectMembersRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.READ_PROJECT_MEMBER, {
            type: ProjectResourceType.QUERY,
        }),
    },
    schema: {
        tags: ['project-members'],
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: ListRefresquitoProjectMembersRequestQuery,
        response: { [StatusCodes.OK]: SeekPage(RefresquitoProjectMemberWithUser) },
    },
}

const UpdateProjectMemberRoleRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.WRITE_PROJECT_MEMBER, {
            type: ProjectResourceType.TABLE,
            tableName: RefresquitoProjectMemberEntity,
        }),
    },
    schema: {
        body: UpdateRefresquitoProjectMemberRoleRequestBody,
        params: z.object({ id: z.string() }),
    },
}

const DeleteProjectMemberRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.WRITE_PROJECT_MEMBER, {
            type: ProjectResourceType.TABLE,
            tableName: RefresquitoProjectMemberEntity,
        }),
    },
    schema: {
        params: z.object({ id: z.string() }),
        response: { [StatusCodes.NO_CONTENT]: z.null() },
    },
}
