import { api } from './api';

export type ContentPreviewType = 'car' | 'track' | 'layout';

export interface ContentPreview {
  id: string;
  type: ContentPreviewType;
  acId: string;
  name: string;
  url: string;
  stations: {
    id: string;
    stationId: string;
    name: string;
  }[];
  previewCount: number;
  createdAt: string;
  updatedAt: string;
}

export const contentPreviewsApi = {
  findAll: (params?: { stationId?: string; type?: string }) =>
    api.get<ContentPreview[]>('/content/previews', { params }).then((res) => res.data),

  remove: (id: string) => api.delete(`/content/previews/${id}`).then((res) => res.data),
  removeGroup: (type: ContentPreviewType, acId: string) =>
    api.delete('/content/previews/group', { params: { type, acId } }).then((res) => res.data),

  syncStation: (stationId: string) =>
    api.post(`/stations/${stationId}/sync-content`).then((res) => res.data),
};
