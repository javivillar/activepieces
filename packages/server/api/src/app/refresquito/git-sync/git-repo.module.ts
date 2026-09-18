import {
    Permission,
    PrincipalType,
    RefresquitoConfigureRepoRequest,
    RefresquitoGitPushOperationType,
    RefresquitoGitRepoWithoutSensitiveData,
    RefresquitoPushGitRepoRequest,
    SeekPage,
} from '@activepieces/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { entitiesMustBeOwnedByCurrentProject } from '../../authentication/authorization'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { RefresquitoGitRepoEntity } from './git-repo.entity'
import { refresquitoGitRepoService } from './git-repo.service'

export const refresquitoGitRepoModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentProject)
    await app.register(refresquitoGitRepoController, { prefix: '/v1/git-repos' })
}

const refresquitoGitRepoController: FastifyPluginAsyncZod = async (app) => {
    const service = refresquitoGitRepoService(app.log)

    app.post('/', ConfigureRepoRequestSchema, async (request, reply) => {
        const gitSync = await service.upsert(request.body)
        await reply.status(StatusCodes.CREATED).send(gitSync)
    })

    app.get('/', ListRepoRequestSchema, async (request) => {
        return service.list({ projectId: request.query.projectId })
    })

    app.post('/:id/push', PushRepoRequestSchema, async (request) => {
        const service = refresquitoGitRepoService(request.log)
        switch (request.body.type) {
            case RefresquitoGitPushOperationType.PUSH_FLOW:
                return service.pushFlows({ id: request.params.id, userId: request.principal.id, request: request.body })
            case RefresquitoGitPushOperationType.DELETE_FLOW:
                return service.deleteFlows({ id: request.params.id, userId: request.principal.id, request: request.body })
            case RefresquitoGitPushOperationType.PUSH_TABLE:
                return service.pushTables({ id: request.params.id, userId: request.principal.id, request: request.body })
            case RefresquitoGitPushOperationType.DELETE_TABLE:
                return service.deleteTables({ id: request.params.id, userId: request.principal.id, request: request.body })
            case RefresquitoGitPushOperationType.PUSH_EVERYTHING:
                return service.pushEverything({ id: request.params.id, userId: request.principal.id, commitMessage: request.body.commitMessage })
        }
    })

    app.delete('/:id', DeleteRepoRequestSchema, async (request, reply) => {
        await service.delete({ id: request.params.id, projectId: request.projectId })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const ConfigureRepoRequestSchema = {
    config: {
        security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.WRITE_PROJECT_RELEASE, {
            type: ProjectResourceType.BODY,
        }),
    },
    schema: {
        body: RefresquitoConfigureRepoRequest,
        response: {
            [StatusCodes.CREATED]: RefresquitoGitRepoWithoutSensitiveData,
        },
    },
}

const ListRepoRequestSchema = {
    config: {
        security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.READ_PROJECT_RELEASE, {
            type: ProjectResourceType.QUERY,
        }),
    },
    schema: {
        querystring: z.object({ projectId: z.string() }),
        response: {
            [StatusCodes.OK]: SeekPage(RefresquitoGitRepoWithoutSensitiveData),
        },
    },
}

const PushRepoRequestSchema = {
    config: {
        security: securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT_RELEASE, {
            type: ProjectResourceType.TABLE,
            tableName: RefresquitoGitRepoEntity,
        }),
    },
    schema: {
        body: RefresquitoPushGitRepoRequest,
        params: z.object({ id: z.string() }),
    },
}

const DeleteRepoRequestSchema = {
    config: {
        security: securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT_RELEASE, {
            type: ProjectResourceType.TABLE,
            tableName: RefresquitoGitRepoEntity,
        }),
    },
    schema: {
        params: z.object({ id: z.string() }),
    },
}
