import { api } from './api';

export interface ScreenRecording {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  createdAt: string;
  playbackUrl: string;
  downloadUrl: string;
}

export interface SpectatorScreenState {
  updatedAt: string;
  servers: {
    id: string;
    name: string;
    track: string;
    trackLayout: string | null;
    status: string;
    maxClients: number;
    stationName: string;
    stationIp: string | null;
    raceFormatName: string | null;
    startedAt: string | null;
  }[];
  sessions: {
    id: string;
    serverId: string | null;
    clientName: string | null;
    carAcId: string | null;
    track: string | null;
    status: string;
    stationName: string;
    startedAt: string | null;
  }[];
}

export interface LiveSource {
  stationId: string;
  updatedAt: number;
}

export const spectatorApi = {
  getPublicScreenState: () =>
    api.get<SpectatorScreenState>('/spectator/screen-state').then((res) => res.data),
  getLiveSources: () => api.get<LiveSource[]>('/spectator/live-sources').then((res) => res.data),
  listRecordings: () => api.get<ScreenRecording[]>('/spectator/recordings').then((res) => res.data),
  uploadRecording: (file: Blob, fileName: string, title: string, durationSeconds: number) => {
    const form = new FormData();
    form.append('file', file, fileName);
    form.append('title', title);
    form.append('durationSeconds', String(durationSeconds));
    return api
      .post<ScreenRecording>('/spectator/recordings', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 10 * 60 * 1000,
      })
      .then((res) => res.data);
  },
  removeRecording: (id: string) => api.delete(`/spectator/recordings/${id}`),
  getRecordingBlob: (id: string) =>
    api.get<Blob>(`/spectator/recordings/${id}/file`, { responseType: 'blob' }).then((res) => res.data),
};
