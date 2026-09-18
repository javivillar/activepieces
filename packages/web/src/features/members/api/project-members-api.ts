import {
  ListRefresquitoProjectMembersRequestQuery,
  RefresquitoProjectMemberWithUser,
  UpdateRefresquitoProjectMemberRoleRequestBody,
  SeekPage,
} from '@activepieces/shared';

import { api } from '@/lib/api';

export const projectMembersApi = {
  list(request: ListRefresquitoProjectMembersRequestQuery) {
    return api.get<SeekPage<RefresquitoProjectMemberWithUser>>(
      '/v1/project-members',
      request,
    );
  },
  update(
    memberId: string,
    request: UpdateRefresquitoProjectMemberRoleRequestBody,
  ) {
    return api.post<void>(`/v1/project-members/${memberId}`, request);
  },
  delete(id: string): Promise<void> {
    return api.delete<void>(`/v1/project-members/${id}`);
  },
};
