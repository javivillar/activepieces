import { ActivepiecesError, ApplicationEventName, AuthenticationResponse, DefaultProjectRole, ErrorCode, isNil, PlatformRole, UserIdentityProvider } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { projectMemberService } from '../../ee/projects/project-members/project-member.service'
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
const DEFAULT_EDITOR_GROUP = 'activepieces-editor'
const DEFAULT_VIEWER_GROUP = 'activepieces-viewer'

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

    app.get('/logout', LogoutRequestSchema, async (req) => {
        const logoutUrl = await keycloakAuthnProvider(req.log).getLogoutUrl({
            issuerUrl: system.getOrThrow(AppSystemProp.KEYCLOAK_ISSUER_URL),
            clientId: system.getOrThrow(AppSystemProp.KEYCLOAK_CLIENT_ID),
        })
        return { logoutUrl }
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
        await syncSharedProjectRoleFromGroups(req.log, response, idToken.groups)

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
    const accessGroups = [getAdminGroup(), getUserGroup(), getEditorGroup(), getViewerGroup()]
    if (accessGroups.some((group) => groups.includes(group))) {
        return
    }
    throw new ActivepiecesError({
        code: ErrorCode.AUTHORIZATION,
        params: {
            message: `User is not a member of any of the Keycloak groups that grant access: ${accessGroups.join(', ')}`,
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

async function syncSharedProjectRoleFromGroups(log: FastifyBaseLogger, response: AuthenticationResponse, groups: string[]): Promise<void> {
    const sharedProjectId = system.get(AppSystemProp.KEYCLOAK_SHARED_PROJECT_ID)
    if (isNil(sharedProjectId) || isNil(response.platformId)) {
        return
    }
    const platform = await platformService(log).getOneOrThrow(response.platformId)
    // Platform admins are already privileged (see userService.isUserPrivileged) and can
    // access every project without an explicit membership row.
    if (platform.ownerId === response.id || response.platformRole === PlatformRole.ADMIN) {
        return
    }
    const desiredRoleName = resolveDesiredSharedProjectRole(groups)

    const existingRole = await projectMemberService(log).getRole({ userId: response.id, projectId: sharedProjectId })
    if (isNil(desiredRoleName)) {
        if (!isNil(existingRole)) {
            await removeSharedProjectMembership(log, platform.id, sharedProjectId, response.id)
        }
        return
    }
    if (existingRole?.name === desiredRoleName) {
        return
    }
    await projectMemberService(log).upsert({
        userId: response.id,
        projectId: sharedProjectId,
        projectRoleName: desiredRoleName,
    })
}

function resolveDesiredSharedProjectRole(groups: string[]): DefaultProjectRole | null {
    if (groups.includes(getEditorGroup())) {
        return DefaultProjectRole.EDITOR
    }
    if (groups.includes(getViewerGroup())) {
        return DefaultProjectRole.VIEWER
    }
    return null
}

async function removeSharedProjectMembership(log: FastifyBaseLogger, platformId: string, projectId: string, userId: string): Promise<void> {
    const { data } = await projectMemberService(log).list({
        platformId,
        projectId,
        cursorRequest: null,
        limit: 1000,
    })
    const member = data.find((m) => m.userId === userId)
    if (!isNil(member)) {
        await projectMemberService(log).delete(projectId, member.id)
    }
}

function getAdminGroup(): string {
    return system.get(AppSystemProp.KEYCLOAK_ADMIN_GROUP) ?? DEFAULT_ADMIN_GROUP
}

function getUserGroup(): string {
    return system.get(AppSystemProp.KEYCLOAK_USER_GROUP) ?? DEFAULT_USER_GROUP
}

function getEditorGroup(): string {
    return system.get(AppSystemProp.KEYCLOAK_EDITOR_GROUP) ?? DEFAULT_EDITOR_GROUP
}

function getViewerGroup(): string {
    return system.get(AppSystemProp.KEYCLOAK_VIEWER_GROUP) ?? DEFAULT_VIEWER_GROUP
}

const LoginRequestSchema = {
    config: {
        security: securityAccess.public(),
    },
    schema: {},
}

const LogoutRequestSchema = {
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
