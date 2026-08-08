import { api } from './api';

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: { email: string } | null;
}

export interface CreatedApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
}

export const apiKeysApi = {
  list: () => api.get<ApiKeySummary[]>('/api-keys').then((res) => res.data),
  create: (name: string) => api.post<CreatedApiKey>('/api-keys', { name }).then((res) => res.data),
  revoke: (id: string) => api.post(`/api-keys/${id}/revoke`).then((res) => res.data),
  remove: (id: string) => api.delete(`/api-keys/${id}`).then((res) => res.data),
};
