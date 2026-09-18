import {
  RefresquitoConfigureRepoRequest,
  RefresquitoGitRepo,
  RefresquitoPushGitRepoRequest,
  SeekPage,
} from '@activepieces/shared';

import { api } from '@/lib/api';

export const gitSyncApi = {
  async get(projectId: string): Promise<RefresquitoGitRepo | null> {
    const response = await api.get<SeekPage<RefresquitoGitRepo>>(
      `/v1/git-repos`,
      {
        projectId,
      },
    );
    if (response.data.length === 0) {
      return null;
    }
    return response.data[0];
  },
  configure(request: RefresquitoConfigureRepoRequest) {
    return api.post<RefresquitoGitRepo>(`/v1/git-repos`, request);
  },
  disconnect(repoId: string) {
    return api.delete<void>(`/v1/git-repos/${repoId}`);
  },
  push(repoId: string, request: RefresquitoPushGitRepoRequest) {
    return api.post<void>(`/v1/git-repos/${repoId}/push`, request);
  },
};
