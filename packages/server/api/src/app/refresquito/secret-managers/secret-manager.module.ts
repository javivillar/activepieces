import { PrincipalType, UpsertRefresquitoSecretManagerConnectionRequest } from '@activepieces/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { refresquitoSecretManagerCache } from './secret-manager-cache'
import { refresquitoSecretManagerService } from './secret-manager.service'

export const refresquitoSecretManagerModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(refresquitoSecretManagerController, { prefix: '/v1/secret-managers' })
}

const refresquitoSecretManagerController: FastifyPluginAsyncZod = async (app) => {
    const service = refresquitoSecretManagerService(app.log)

    app.get('/', ListRequest, async (request) => {
        return service.list({
            platformId: request.principal.platform.id,
            projectId: request.query.projectId,
        })
    })

    app.post('/', CreateRequest, async (request, reply) => {
        const result = await service.create(request.principal.platform.id, request.body)
        return reply.status(StatusCodes.CREATED).send(result)
    })

    app.post('/:id', UpdateRequest, async (request) => {
        return service.update({
            id: request.params.id,
            platformId: request.principal.platform.id,
            request: request.body,
        })
    })

    app.delete('/:id', DeleteRequest, async (request, reply) => {
        await service.delete({
            id: request.params.id,
            platformId: request.principal.platform.id,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.delete('/cache', ClearCacheRequest, async (request, reply) => {
        if (request.query.connectionId) {
            await refresquitoSecretManagerCache.invalidate({ connectionId: request.query.connectionId })
        }
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const ListRequest = {
    config: {
        security: securityAccess.publicPlatform([PrincipalType.USER]),
    },
    schema: {
        querystring: z.object({
            projectId: z.string().optional(),
        }),
    },
}

const CreateRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        body: UpsertRefresquitoSecretManagerConnectionRequest,
    },
}

const UpdateRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        params: z.object({ id: z.string() }),
        body: UpsertRefresquitoSecretManagerConnectionRequest,
    },
}

const DeleteRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        params: z.object({ id: z.string() }),
    },
}

const ClearCacheRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        querystring: z.object({
            connectionId: z.string().optional(),
        }),
    },
}
