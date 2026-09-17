import { ActivepiecesError, ApplicationEventName, AuthenticationResponse, ErrorCode, isNil, PlatformRole, UserIdentityProvider } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { applicationEvents } from '../../helper/application-events'
import { networkUtils } from '../../helper/network-utils'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { platformService } from '../../platform/platform.service'
import { platformUtils } from '../../platform/platform.utils'
import { userService } from '../../user/user-service'
import { authenticationService } from '../authentication.service'
import { keycloakAuthnProvider } from './keycloak-authn-provider'

const DEFAULT_ADMIN_GROUP = 'activepieces-admin'
const DEFAULT_USER_GROUP = 'activepieces-user'

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

        assertGroupAccessAllowed(idToken.groups)

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

        await syncPlatformRoleFromGroups(req.log, response, idToken.groups)

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

function assertGroupAccessAllowed(groups: string[]): void {
    const adminGroup = getAdminGroup()
    const userGroup = getUserGroup()
    if (groups.includes(adminGroup) || groups.includes(userGroup)) {
        return
    }
    throw new ActivepiecesError({
        code: ErrorCode.AUTHORIZATION,
        params: {
            message: `User is not a member of the "${adminGroup}" or "${userGroup}" Keycloak group`,
        },
    })
}

async function syncPlatformRoleFromGroups(log: FastifyBaseLogger, response: AuthenticationResponse, groups: string[]): Promise<void> {
    if (isNil(response.platformId)) {
        return
    }
    const platform = await platformService(log).getOneOrThrow(response.platformId)
    if (platform.ownerId === response.id) {
        return
    }
    const desiredRole = groups.includes(getAdminGroup()) ? PlatformRole.ADMIN : PlatformRole.MEMBER
    if (response.platformRole === desiredRole) {
        return
    }
    await userService(log).update({
        id: response.id,
        platformId: response.platformId,
        platformRole: desiredRole,
    })
    response.platformRole = desiredRole
}

function getAdminGroup(): string {
    return system.get(AppSystemProp.KEYCLOAK_ADMIN_GROUP) ?? DEFAULT_ADMIN_GROUP
}

function getUserGroup(): string {
    return system.get(AppSystemProp.KEYCLOAK_USER_GROUP) ?? DEFAULT_USER_GROUP
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
