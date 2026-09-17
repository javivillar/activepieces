import { safeHttp } from '@activepieces/server-utils'
import {
    ActivepiecesError,
    assertNotEqual,
    ErrorCode,
    isNil,
} from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import jwksClient, { JwksClient } from 'jwks-rsa'
import { domainHelper } from '../../helper/domain-helper'
import { JwtSignAlgorithm, jwtUtils } from '../../helper/jwt-utils'

let cachedDiscovery: { issuerUrl: string, doc: OidcDiscoveryDocument } | undefined
let cachedKeyLoader: { issuerUrl: string, client: JwksClient } | undefined

export const keycloakAuthnProvider = (_log: FastifyBaseLogger) => ({
    async getLoginUrl(params: GetLoginUrlParams): Promise<string> {
        const { issuerUrl, clientId } = params
        const discovery = await getDiscoveryDocument(issuerUrl)
        const loginUrl = new URL(discovery.authorization_endpoint)
        loginUrl.searchParams.set('client_id', clientId)
        loginUrl.searchParams.set('redirect_uri', await getRedirectUrl())
        loginUrl.searchParams.set('scope', 'openid email profile groups')
        loginUrl.searchParams.set('response_type', 'code')
        return loginUrl.href
    },

    async authenticate(params: AuthenticateParams): Promise<KeycloakIdToken> {
        const { issuerUrl, clientId, clientSecret, authorizationCode } = params
        const discovery = await getDiscoveryDocument(issuerUrl)
        const idToken = await exchangeCodeForIdToken({
            tokenEndpoint: discovery.token_endpoint,
            clientId,
            clientSecret,
            code: authorizationCode,
        })
        return verifyIdToken({ issuerUrl, clientId, idToken, jwksUri: discovery.jwks_uri })
    },

    async getLogoutUrl(params: GetLogoutUrlParams): Promise<string> {
        const { issuerUrl, clientId } = params
        const discovery = await getDiscoveryDocument(issuerUrl)
        const logoutUrl = new URL(discovery.end_session_endpoint)
        logoutUrl.searchParams.set('client_id', clientId)
        logoutUrl.searchParams.set('post_logout_redirect_uri', await getPostLogoutRedirectUrl())
        return logoutUrl.href
    },
})

async function getDiscoveryDocument(issuerUrl: string): Promise<OidcDiscoveryDocument> {
    if (cachedDiscovery?.issuerUrl === issuerUrl) {
        return cachedDiscovery.doc
    }
    const wellKnownUrl = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`
    const response = await safeHttp.axios.get<OidcDiscoveryDocument>(wellKnownUrl)
    cachedDiscovery = { issuerUrl, doc: response.data }
    return response.data
}

function getKeyLoader(issuerUrl: string, jwksUri: string): JwksClient {
    if (cachedKeyLoader?.issuerUrl === issuerUrl) {
        return cachedKeyLoader.client
    }
    const client = jwksClient({
        rateLimit: true,
        cache: true,
        jwksUri,
    })
    cachedKeyLoader = { issuerUrl, client }
    return client
}

async function exchangeCodeForIdToken(params: ExchangeCodeParams): Promise<string> {
    const { tokenEndpoint, clientId, clientSecret, code } = params
    const response = await safeHttp.axios.post<{ id_token?: string }>(
        tokenEndpoint,
        new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: await getRedirectUrl(),
            grant_type: 'authorization_code',
        }),
    )
    if (isNil(response.data.id_token)) {
        throw new ActivepiecesError({
            code: ErrorCode.INVALID_CREDENTIALS,
            params: null,
        }, 'Keycloak OAuth token exchange failed: no id_token returned')
    }
    return response.data.id_token
}

async function verifyIdToken(params: VerifyIdTokenParams): Promise<KeycloakIdToken> {
    const { issuerUrl, clientId, idToken, jwksUri } = params
    const { header } = jwtUtils.decode<IdTokenPayloadRaw>({ jwt: idToken })
    const keyLoader = getKeyLoader(issuerUrl, jwksUri)
    const signingKey = await keyLoader.getSigningKey(header.kid)
    const publicKey = signingKey.getPublicKey()

    const payload = await jwtUtils.decodeAndVerify<IdTokenPayloadRaw>({
        jwt: idToken,
        key: publicKey,
        issuer: [issuerUrl],
        algorithm: JwtSignAlgorithm.RS256,
        audience: clientId,
    })

    assertNotEqual(payload.email_verified, false, 'payload.email_verified', 'Email is not verified')
    if (isNil(payload.email)) {
        throw new ActivepiecesError({
            code: ErrorCode.INVALID_CREDENTIALS,
            params: null,
        }, 'Keycloak id_token is missing an email claim')
    }
    return {
        email: payload.email,
        firstName: payload.given_name ?? payload.preferred_username ?? 'Keycloak',
        lastName: payload.family_name ?? '',
        imageUrl: payload.picture,
        groups: payload.groups ?? [],
    }
}

async function getRedirectUrl(): Promise<string> {
    return domainHelper.getInternalUrl({ path: '/redirect' })
}

async function getPostLogoutRedirectUrl(): Promise<string> {
    return domainHelper.getInternalUrl({ path: '/sign-in' })
}

type OidcDiscoveryDocument = {
    authorization_endpoint: string
    token_endpoint: string
    jwks_uri: string
    end_session_endpoint: string
}

type IdTokenPayloadRaw = {
    email?: string
    email_verified?: boolean
    given_name?: string
    family_name?: string
    preferred_username?: string
    picture?: string
    groups?: string[]
    sub: string
    aud: string
    iss: string
}

type GetLoginUrlParams = {
    issuerUrl: string
    clientId: string
}

type AuthenticateParams = {
    issuerUrl: string
    clientId: string
    clientSecret: string
    authorizationCode: string
}

type ExchangeCodeParams = {
    tokenEndpoint: string
    clientId: string
    clientSecret: string
    code: string
}

type GetLogoutUrlParams = {
    issuerUrl: string
    clientId: string
}

type VerifyIdTokenParams = {
    issuerUrl: string
    clientId: string
    idToken: string
    jwksUri: string
}

export type KeycloakIdToken = {
    email: string
    firstName: string
    lastName: string
    imageUrl?: string
    groups: string[]
}
