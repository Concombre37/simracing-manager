import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type StationRole = 'simulator' | 'admin';

export interface Station {
  id: string;
  stationId: string;
  name: string;
  role: StationRole;
  apiKeyHash: string | null;
  version: string | null;
  localIp: string | null;
  macAddress: string | null;
  lastSeenAt: string | null;
  status: 'offline' | 'online' | 'in_game' | 'updating';
  blankingActive: boolean;
  config: Record<string, unknown> | null;
  content: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStationData {
  stationId: string;
  name: string;
  role?: StationRole;
  config?: Record<string, unknown>;
}

export interface UpdateStationData {
  name?: string;
  role?: StationRole;
  config?: Record<string, unknown>;
}

export interface StationWithApiKey extends Station {
  apiKey: string;
}

export type BlankingMediaCategory = 'idle' | 'launching' | 'results';

export interface BlankingMediaFile {
  id: string;
  /** Null for global media (launching/results — shared by every pod). */
  stationId: string | null;
  category: BlankingMediaCategory;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  order: number;
  downloadUrl: string;
  createdAt: string;
  updatedAt: string;
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
  syncContent: (id: string) => api.post(`/stations/${id}/sync-content`).then((res) => res.data),
  getLogs: (id: string) =>
    api.get<{ lines: string[] }>(`/stations/${id}/logs`).then((res) => res.data),
  getBlankingMedia: (id: string, category: BlankingMediaCategory = 'idle') =>
    api
      .get<BlankingMediaFile[]>(`/stations/${id}/blanking-media`, { params: { category } })
      .then((res) => res.data),
  uploadBlankingMedia: (id: string, file: File, category: BlankingMediaCategory = 'idle') => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<BlankingMediaFile>(`/stations/${id}/blanking-media`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { category },
      })
      .then((res) => res.data);
  },
  deleteBlankingMedia: (stationId: string, mediaId: string) =>
    api.delete(`/stations/${stationId}/blanking-media/${mediaId}`).then((res) => res.data),
  uploadBlankingMediaBulk: (
    stationIds: string[],
    file: File,
    category: BlankingMediaCategory = 'idle',
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('stationIds', JSON.stringify(stationIds));
    formData.append('category', category);
    return api
      .post<{ success: number; failed: { stationId: string; reason: string }[] }>(
        '/blanking-media/bulk',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      )
      .then((res) => res.data);
  },
  reorderBlankingMedia: (
    stationId: string,
    mediaIds: string[],
    category: BlankingMediaCategory = 'idle',
  ) =>
    api
      .patch(
        `/stations/${stationId}/blanking-media/reorder`,
        { mediaIds },
        { params: { category } },
      )
      .then((res) => res.data),
  // Global (station-less) media — "launching" and "results" only, shared by
  // every pod. See BlankingMedia.category in @simracing/shared.
  getGlobalBlankingMedia: (category: 'launching' | 'results') =>
    api
      .get<BlankingMediaFile[]>('/blanking-media/global', { params: { category } })
      .then((res) => res.data),
  uploadGlobalBlankingMedia: (file: File, category: 'launching' | 'results') => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<BlankingMediaFile>('/blanking-media/global', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { category },
      })
      .then((res) => res.data);
  },
  deleteGlobalBlankingMedia: (mediaId: string) =>
    api.delete(`/blanking-media/global/${mediaId}`).then((res) => res.data),
  reorderGlobalBlankingMedia: (mediaIds: string[], category: 'launching' | 'results') =>
    api
      .patch('/blanking-media/global/reorder', { mediaIds }, { params: { category } })
      .then((res) => res.data),
  wake: (id: string) =>
    api
      .post<{
        relayStationId: string;
        targetMac: string;
        targetIp: string | null;
      }>(`/stations/${id}/wake`)
      .then((res) => res.data),
  shutdown: (id: string) =>
    api.post<{ success: boolean }>(`/stations/${id}/shutdown`).then((res) => res.data),
};

/** The "results" global blanking media is a single logo shared by every pod
 * (see BlankingMedia.category) — reused as the site's own logo/favicon so
 * there's only one place to configure branding, not two. */
export function useSiteLogo(enabled: boolean): BlankingMediaFile | null {
  const { data } = useQuery({
    queryKey: ['blanking-media', 'global', 'results'],
    queryFn: () => stationsApi.getGlobalBlankingMedia('results'),
    staleTime: 60_000,
    enabled,
  });
  return data?.[0] ?? null;
}
