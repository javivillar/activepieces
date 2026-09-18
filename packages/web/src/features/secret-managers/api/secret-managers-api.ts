import {
  RefresquitoSecretManagerConnectionWithStatus,
  SeekPage,
  UpsertRefresquitoSecretManagerConnectionRequest,
} from '@activepieces/shared';

import { api } from '@/lib/api';

export const secretManagersApi = {
  list(params?: { projectId?: string }) {
    return api.get<SeekPage<RefresquitoSecretManagerConnectionWithStatus>>(
      '/v1/secret-managers',
      params,
    );
  },
  create(config: UpsertRefresquitoSecretManagerConnectionRequest) {
    return api.post<RefresquitoSecretManagerConnectionWithStatus>(
      '/v1/secret-managers',
      config,
    );
  },
  update(id: string, config: UpsertRefresquitoSecretManagerConnectionRequest) {
    return api.post<RefresquitoSecretManagerConnectionWithStatus>(
      `/v1/secret-managers/${id}`,
      config,
    );
  },
  delete(id: string) {
    return api.delete<void>(`/v1/secret-managers/${id}`);
  },
  clearCache(connectionId?: string) {
    return api.delete<void>(
      '/v1/secret-managers/cache',
      connectionId ? { connectionId } : undefined,
    );
  },
};
