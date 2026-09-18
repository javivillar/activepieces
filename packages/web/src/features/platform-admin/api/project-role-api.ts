import {
  RefresquitoProjectMemberWithUser,
  CreateRefresquitoProjectRoleRequestBody,
  UpdateRefresquitoProjectRoleRequestBody,
  ProjectRole,
  SeekPage,
  ListRefresquitoProjectMembersForProjectRoleRequestQuery,
} from '@activepieces/shared';

import { api } from '@/lib/api';

export const projectRoleApi = {
  async get(id: string) {
    return await api.get<ProjectRole>(`/v1/project-roles/${id}`);
  },
  async list() {
    return await api.get<SeekPage<ProjectRole>>(`/v1/project-roles`);
  },
  async create(requestBody: CreateRefresquitoProjectRoleRequestBody) {
    return await api.post<ProjectRole>('/v1/project-roles', requestBody);
  },
  async update(
    id: string,
    requestBody: UpdateRefresquitoProjectRoleRequestBody,
  ) {
    return await api.post<ProjectRole>(`/v1/project-roles/${id}`, requestBody);
  },
  async delete(id: string) {
    return await api.delete<void>(`/v1/project-roles/${id}`);
  },
  async listProjectMembers(
    id: string,
    requestQuery: ListRefresquitoProjectMembersForProjectRoleRequestQuery,
  ) {
    return await api.get<SeekPage<RefresquitoProjectMemberWithUser>>(
      `/v1/project-roles/${id}/project-members`,
      requestQuery,
    );
  },
};
