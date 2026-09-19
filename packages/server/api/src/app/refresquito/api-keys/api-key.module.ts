import {
    ApId,
    CreateRefresquitoApiKeyRequest,
    PrincipalType,
    RefresquitoApiKeyResponseWithoutValue,
    RefresquitoApiKeyResponseWithValue,
    SeekPage,
} from '@activepieces/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { refresquitoApiKeyService } from './api-key.service'

export const refresquitoApiKeyModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(refresquitoApiKeyController, { prefix: '/v1/api-keys' })
}

const refresquitoApiKeyController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', CreateRequest, async (req, reply) => {
        const apiKey = await refresquitoApiKeyService.create({
            platformId: req.principal.platform.id,
            displayName: req.body.displayName,
        })
        return reply.status(StatusCodes.CREATED).send(apiKey)
    })

    app.get('/', ListRequest, async (req) => {
        return refresquitoApiKeyService.list({
            platformId: req.principal.platform.id,
        })
    })

    app.delete('/:id', DeleteRequest, async (req, reply) => {
        await refresquitoApiKeyService.delete({
            platformId: req.principal.platform.id,
            id: req.params.id,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const ListRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        response: {
            [StatusCodes.OK]: SeekPage(RefresquitoApiKeyResponseWithoutValue),
        },
    },
}

const CreateRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        body: CreateRefresquitoApiKeyRequest,
        response: {
            [StatusCodes.CREATED]: RefresquitoApiKeyResponseWithValue,
        },
    },
}

const DeleteRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        params: z.object({
            id: ApId,
        }),
    },
}
