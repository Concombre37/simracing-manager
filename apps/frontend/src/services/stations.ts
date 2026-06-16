import { api } from './api';

export interface Station {
  id: string;
  stationId: string;
  name: string;
  apiKeyHash: string | null;
  version: string | null;
  localIp: string | null;
  lastSeenAt: string | null;
  status: 'offline' | 'online' | 'in_game' | 'updating';
  config: Record<string, unknown> | null;
  content: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStationData {
  stationId: string;
  name: string;
  config?: Record<string, unknown>;
}

export interface UpdateStationData {
  name?: string;
  config?: Record<string, unknown>;
}

export interface StationWithApiKey extends Station {
  apiKey: string;
}

export const stationsApi = {
  getAll: () => api.get<Station[]>('/stations').then((res) => res.data),
  getById: (id: string) => api.get<Station>(`/stations/${id}`).then((res) => res.data),
  create: (data: CreateStationData) =>
    api.post<StationWithApiKey>('/stations', data).then((res) => res.data),
  update: (id: string, data: UpdateStationData) =>
    api.patch<Station>(`/stations/${id}`, data).then((res) => res.data),
  remove: (id: string) => api.delete<Station>(`/stations/${id}`).then((res) => res.data),
  regenerateApiKey: (id: string) =>
    api.post<StationWithApiKey>(`/stations/${id}/regenerate-api-key`).then((res) => res.data),
  launch: (id: string) => api.post(`/stations/${id}/launch`).then((res) => res.data),
  stop: (id: string) => api.post(`/stations/${id}/stop`).then((res) => res.data),
  updateAgent: (id: string) => api.post(`/stations/${id}/update-agent`).then((res) => res.data),
};
