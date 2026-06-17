import { api } from './api';

export interface ContentPreview {
  id: string;
  stationId: string;
  station: {
    id: string;
    stationId: string;
    name: string;
  };
  type: 'car' | 'track';
  acId: string;
  name: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export const contentPreviewsApi = {
  findAll: (params?: { stationId?: string; type?: string }) =>
    api.get<ContentPreview[]>('/content/previews', { params }).then((res) => res.data),

  remove: (id: string) => api.delete(`/content/previews/${id}`).then((res) => res.data),

  syncStation: (stationId: string) =>
    api.post(`/stations/${stationId}/sync-content`).then((res) => res.data),
};
