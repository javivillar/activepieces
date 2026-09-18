import {
  RefresquitoSecretManagerConnectionWithStatus,
  RefresquitoSecretManagerScope,
  UpsertRefresquitoSecretManagerConnectionRequest,
} from '@activepieces/shared';

export const secretManagersUtils = {
  getDefaultValues,
};

function getDefaultValues(
  connection: RefresquitoSecretManagerConnectionWithStatus | undefined,
): UpsertRefresquitoSecretManagerConnectionRequest {
  if (connection) {
    return {
      name: connection.name,
      namespace: connection.namespace,
      secretName: connection.secretName,
      scope: connection.scope,
      projectIds:
        connection.scope === RefresquitoSecretManagerScope.PROJECT
          ? connection.projectIds ?? []
          : [],
    };
  }
  return {
    name: '',
    namespace: '',
    secretName: '',
    scope: RefresquitoSecretManagerScope.PLATFORM,
    projectIds: [],
  };
}
