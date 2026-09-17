import {
  AuthenticationResponse,
  isNil,
  Principal,
  PrincipalType,
} from '@activepieces/shared';
import dayjs from 'dayjs';
import { jwtDecode } from 'jwt-decode';

import { authenticationApi } from '@/api/authentication-api';
import { queryClient } from '@/app/query-client';

import { ApStorage } from './ap-browser-storage';
const tokenKey = 'token';
const projectIdKey = 'projectId';
const keycloakSsoKey = 'keycloakSso';
const keycloakIdTokenKey = 'keycloakIdToken';
export const authenticationSession = {
  setProjectId(projectId: string) {
    ApStorage.getInstance().setItem(projectIdKey, projectId);
  },
  saveResponse(
    response: AuthenticationResponse,
    isEmbedding: boolean,
    keycloakIdToken?: string,
  ) {
    if (isEmbedding) {
      ApStorage.setInstanceToSessionStorage();
    }
    ApStorage.getInstance().setItem(tokenKey, response.token);
    if (!isNil(response.projectId)) {
      ApStorage.getInstance().setItem(projectIdKey, response.projectId);
    }
    if (!isNil(keycloakIdToken)) {
      ApStorage.getInstance().setItem(keycloakSsoKey, 'true');
      ApStorage.getInstance().setItem(keycloakIdTokenKey, keycloakIdToken);
    }
    queryClient.invalidateQueries({ queryKey: ['flags'] });
    window.dispatchEvent(new Event('storage'));
  },
  isJwtExpired(token: string): boolean {
    if (!token) {
      return true;
    }
    try {
      const decoded = jwtDecode(token);
      if (decoded && decoded.exp && dayjs().isAfter(dayjs.unix(decoded.exp))) {
        return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  },
  getToken(): string | null {
    return ApStorage.getInstance().getItem(tokenKey) ?? null;
  },

  getProjectId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const projectId = ApStorage.getInstance().getItem(projectIdKey);
    if (!isNil(projectId)) {
      return projectId;
    }
    const decodedJwt = getDecodedJwt(token);
    if ('projectId' in decodedJwt && typeof decodedJwt.projectId === 'string') {
      return decodedJwt.projectId;
    }
    return null;
  },
  getCurrentUserId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const decodedJwt = getDecodedJwt(token);
    return decodedJwt.id;
  },
  appendProjectRoutePrefix(path: string): string {
    const projectId = this.getProjectId();

    if (isNil(projectId)) {
      return path;
    }
    return `/projects/${projectId}${path.startsWith('/') ? path : `/${path}`}`;
  },
  getPlatformId(): string | null {
    const token = this.getToken();
    if (isNil(token)) {
      return null;
    }
    const decodedJwt = getDecodedJwt(token);
    if ('platform' in decodedJwt && decodedJwt.platform) {
      return decodedJwt.platform.id;
    }
    return null;
  },
  isOnboarding(): boolean {
    const token = this.getToken();
    if (isNil(token)) {
      return false;
    }
    const decodedJwt = jwtDecode<{ type: string }>(token);
    return decodedJwt.type === PrincipalType.ONBOARDING;
  },
  async switchToPlatform(platformId: string) {
    if (authenticationSession.getPlatformId() === platformId) {
      return;
    }
    const result = await authenticationApi.switchPlatform({
      platformId,
    });
    ApStorage.getInstance().setItem(tokenKey, result.token);
    if (!isNil(result.projectId)) {
      ApStorage.getInstance().setItem(projectIdKey, result.projectId);
    }
    window.location.href = '/';
  },
  switchToProject(projectId: string) {
    if (authenticationSession.getProjectId() === projectId) {
      return;
    }
    ApStorage.getInstance().setItem(projectIdKey, projectId);
    window.dispatchEvent(new Event('storage'));
  },
  isLoggedIn(): boolean {
    const token = this.getToken();
    if (isNil(token)) {
      return false;
    }
    return !this.isJwtExpired(token);
  },
  clearSession() {
    ApStorage.getInstance().removeItem(projectIdKey);
    ApStorage.getInstance().removeItem(tokenKey);
    ApStorage.getInstance().removeItem(keycloakSsoKey);
    ApStorage.getInstance().removeItem(keycloakIdTokenKey);
  },
  logOut() {
    const wasKeycloakSso =
      ApStorage.getInstance().getItem(keycloakSsoKey) === 'true';
    const keycloakIdToken =
      ApStorage.getInstance().getItem(keycloakIdTokenKey) ?? undefined;
    this.clearSession();
    if (!wasKeycloakSso) {
      window.location.href = '/sign-in';
      return;
    }
    // A plain redirect to /sign-in isn't enough for a Keycloak-authenticated
    // session: Keycloak keeps its own SSO cookie, so clicking "Sign in with
    // Keycloak" again would silently re-authenticate without ever prompting
    // for credentials. End the Keycloak session too (RP-initiated logout).
    // id_token_hint is required for Keycloak to end it silently -- without
    // it, Keycloak shows an interactive "Do you want to log out?" page
    // instead.
    authenticationApi
      .getKeycloakLogoutUrl(keycloakIdToken)
      .then(({ logoutUrl }) => {
        window.location.href = logoutUrl;
      })
      .catch(() => {
        window.location.href = '/sign-in';
      });
  },
};

function getDecodedJwt(token: string): Principal {
  return jwtDecode<Principal>(token);
}
