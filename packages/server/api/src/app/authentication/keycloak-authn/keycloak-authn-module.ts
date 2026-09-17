import { ApplicationEventName, isNil, UserIdentityProvider } from '@activepieces/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { applicationEvents } from '../../helper/application-events'
import { networkUtils } from '../../helper/network-utils'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { platformUtils } from '../../platform/platform.utils'
import { authenticationService } from '../authentication.service'
import { keycloakAuthnProvider } from './keycloak-authn-provider'

export const keycloakAuthnModule: FastifyPluginAsyncZod = async (app) => {
    if (!(system.getBoolean(AppSystemProp.KEYCLOAK_SSO_ENABLED) ?? false)) {
        return
    }
    await app.register(keycloakAuthnController, {
        prefix: '/v1/authn/keycloak',
    })
}

const keycloakAuthnController: FastifyPluginAsyncZod = async (app) => {
    app.get('/login', LoginRequestSchema, async (req) => {
        const loginUrl = await keycloakAuthnProvider(req.log).getLoginUrl({
            issuerUrl: system.getOrThrow(AppSystemProp.KEYCLOAK_ISSUER_URL),
            clientId: system.getOrThrow(AppSystemProp.KEYCLOAK_CLIENT_ID),
        })
        return { loginUrl }
    })

    app.post('/claim', ClaimRequestSchema, async (req) => {
        const idToken = await keycloakAuthnProvider(req.log).authenticate({
            issuerUrl: system.getOrThrow(AppSystemProp.KEYCLOAK_ISSUER_URL),
            clientId: system.getOrThrow(AppSystemProp.KEYCLOAK_CLIENT_ID),
            clientSecret: system.getOrThrow(AppSystemProp.KEYCLOAK_CLIENT_SECRET),
            authorizationCode: req.body.code,
        })

        const platformId = await platformUtils.getPlatformIdForRequest(req)
        const response = await authenticationService(req.log).federatedAuthn({
            email: idToken.email,
            firstName: idToken.firstName,
            lastName: idToken.lastName,
            newsLetter: false,
            trackEvents: true,
            provider: UserIdentityProvider.KEYCLOAK,
            predefinedPlatformId: platformId ?? null,
            imageUrl: idToken.imageUrl,
        })

        if (!isNil(response.platformId)) {
            applicationEvents(req.log).sendUserEvent({
                platformId: response.platformId,
                userId: response.id,
                projectId: response.projectId ?? undefined,
                ip: networkUtils.extractClientRealIp(req, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER)),
            }, {
                action: ApplicationEventName.USER_SIGNED_UP,
                data: {
                    source: 'sso',
                },
            })
        }
        return response
    })
}

const LoginRequestSchema = {
    config: {
        security: securityAccess.public(),
    },
    schema: {},
}

const ClaimRequestSchema = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        body: z.object({
            code: z.string(),
        }),
    },
}
