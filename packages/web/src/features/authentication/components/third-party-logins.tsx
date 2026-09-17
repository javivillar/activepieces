import {
  ApEdition,
  ApFlagId,
  isNil,
  ThirdPartyAuthnProviderEnum,
  ThirdPartyAuthnProvidersToShowMap,
  TelemetryEventName,
} from '@activepieces/shared';
import { t } from 'i18next';
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { authenticationApi } from '@/api/authentication-api';
import GoogleIcon from '@/assets/img/custom/auth/google-icon.svg';
import KeycloakIcon from '@/assets/img/custom/auth/keycloak.svg';
import SamlIcon from '@/assets/img/custom/auth/saml.svg';
import { useTelemetry } from '@/components/providers/telemetry-provider';
import { Button } from '@/components/ui/button';
import { internalErrorToast } from '@/components/ui/sonner';
import { oauth2Utils } from '@/features/connections/utils/oauth2-utils';
import { flagsHooks } from '@/hooks/flags-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { FROM_QUERY_PARAM } from '@/lib/navigation-utils';

const ThirdPartyIcon = ({ icon }: { icon: string }) => {
  return <img src={icon} alt="icon" width={24} height={24} className="mr-2" />;
};

const ThirdPartyLogin = React.memo(
  ({
    isSignUp,
    onSamlClick,
  }: {
    isSignUp: boolean;
    onSamlClick: () => void;
  }) => {
    const { data: thirdPartyAuthProviders } =
      flagsHooks.useFlag<ThirdPartyAuthnProvidersToShowMap>(
        ApFlagId.THIRD_PARTY_AUTH_PROVIDERS_TO_SHOW_MAP,
      );
    const { data: thirdPartyRedirectUrl } = flagsHooks.useFlag<string>(
      ApFlagId.THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL,
    );
    const { data: edition } = flagsHooks.useFlag<ApEdition>(ApFlagId.EDITION);
    const isCloud = edition === ApEdition.CLOUD;
    const thirdPartyLogin = oauth2Utils.useThirdPartyLogin();
    const { capture } = useTelemetry();
    const { data: keycloakSsoEnabled } = flagsHooks.useFlag<boolean>(
      ApFlagId.KEYCLOAK_SSO_ENABLED,
    );
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const handleKeycloakClick = async () => {
      capture({
        name: TelemetryEventName.FEDERATED_LOGIN_STARTED,
        payload: { provider: 'keycloak' },
      });
      try {
        const { loginUrl } = await authenticationApi.getKeycloakLoginUrl();
        const { code } = await oauth2Utils.openOAuth2Popup({
          authorizationUrl: loginUrl,
          redirectUrl: window.location.origin,
        });
        const data = await authenticationApi.claimKeycloakRequest({ code });
        authenticationSession.saveResponse(data, false);
        if (isNil(data.projectId)) {
          navigate('/create-platform');
          return;
        }
        navigate(searchParams.get(FROM_QUERY_PARAM) || '/flows');
      } catch (e) {
        internalErrorToast();
      }
    };

    const handleProviderClick = async (
      event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
      providerName: ThirdPartyAuthnProviderEnum,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      capture({
        name: TelemetryEventName.FEDERATED_LOGIN_STARTED,
        payload: {
          provider:
            providerName === ThirdPartyAuthnProviderEnum.GOOGLE
              ? 'google'
              : 'saml',
        },
      });
      const { loginUrl } = await authenticationApi.getFederatedAuthLoginUrl(
        providerName,
      );

      if (!loginUrl || !thirdPartyRedirectUrl) {
        internalErrorToast();
        return;
      }
      thirdPartyLogin(loginUrl, providerName);
    };

    return (
      <div className="flex flex-col gap-4">
        {thirdPartyAuthProviders?.google && (
          <Button
            variant="outline"
            className="w-full rounded-sm"
            onClick={(e) =>
              handleProviderClick(e, ThirdPartyAuthnProviderEnum.GOOGLE)
            }
          >
            <ThirdPartyIcon icon={GoogleIcon} />
            {isSignUp
              ? `${t(`Sign up With`)} ${t('Google')}`
              : `${t(`Sign in With`)} ${t('Google')}`}
          </Button>
        )}
        {isCloud && (
          <Button
            variant="outline"
            className="w-full rounded-sm"
            onClick={() => {
              capture({
                name: TelemetryEventName.FEDERATED_LOGIN_STARTED,
                payload: { provider: 'saml' },
              });
              onSamlClick();
            }}
          >
            <ThirdPartyIcon icon={SamlIcon} />
            {isSignUp
              ? `${t(`Sign up With`)} ${t('SAML')}`
              : `${t(`Sign in With`)} ${t('SAML')}`}
          </Button>
        )}
        {keycloakSsoEnabled && (
          <Button
            variant="outline"
            className="w-full rounded-sm"
            onClick={handleKeycloakClick}
          >
            <ThirdPartyIcon icon={KeycloakIcon} />
            {isSignUp
              ? `${t(`Sign up With`)} ${t('Keycloak')}`
              : `${t(`Sign in With`)} ${t('Keycloak')}`}
          </Button>
        )}
        {!isCloud && thirdPartyAuthProviders?.saml && (
          <Button
            variant="outline"
            className="w-full rounded-sm"
            onClick={() => {
              capture({
                name: TelemetryEventName.FEDERATED_LOGIN_STARTED,
                payload: { provider: 'saml' },
              });
              window.location.href = '/api/v1/authn/saml/login';
            }}
          >
            <ThirdPartyIcon icon={SamlIcon} />
            {isSignUp
              ? `${t(`Sign up With`)} ${t('SAML')}`
              : `${t(`Sign in With`)} ${t('SAML')}`}
          </Button>
        )}
      </div>
    );
  },
);

ThirdPartyLogin.displayName = 'ThirdPartyLogin';
export { ThirdPartyLogin };
