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

const DEFAULT_LIMIT_SIZE = 10

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

    app.get('/', ListProjectMembersRequestQueryOptions, async (request) => {
        return refresquitoProjectMemberService(request.log).list({
            platformId: request.principal.platform.id,
            projectId: request.projectId,
            cursorRequest: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_LIMIT_SIZE,
            projectRoleId: request.query.projectRoleId ?? undefined,
        })
    })

    app.post('/:id', UpdateProjectMemberRoleRequest, async (req) => {
        return refresquitoProjectMemberService(req.log).update({
            id: req.params.id,
            role: req.body.role,
            projectId: req.projectId,
            platformId: req.principal.platform.id,
        })
    })

    app.delete('/:id', DeleteProjectMemberRequest, async (request, reply) => {
        await refresquitoProjectMemberService(request.log).delete(request.projectId, request.params.id)
        await reply.status(StatusCodes.NO_CONTENT).send()
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

const ListProjectMembersRequestQueryOptions = {
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
    },
}
