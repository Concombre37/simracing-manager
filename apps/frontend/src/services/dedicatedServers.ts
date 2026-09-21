import { api } from './api';
import { Station } from './stations';

export interface DedicatedServer {
  id: string;
  name: string;
  stationId: string;
  station: Station;
  track: string;
  trackLayout: string | null;
  cars: string[];
  maxClients: number;
  password: string | null;
  rconPassword: string | null;
  status: 'stopped' | 'starting' | 'running' | 'error';
  serverDir: string | null;
  udpPort: number | null;
  tcpPort: number | null;
  httpPort: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  raceFormat: { id: string; name: string } | null;
}

export interface Car {
  acId: string;
  name: string;
  brand?: string;
  category?: string;
  preview?: string;
}

export interface TrackLayout {
  name: string;
  preview?: string;
}

export interface Track {
  acId: string;
  name: string;
  layouts: TrackLayout[];
  preview?: string;
}

export interface AcContent {
  cars: Car[];
  tracks: Track[];
}

export interface CreateDedicatedServerData {
  name: string;
  stationId: string;
  track: string;
  trackLayout?: string;
  cars: string[];
  maxClients: number;
  password?: string;
  rconPassword?: string;
  raceFormatId: string;
}

export interface UpdateDedicatedServerData {
  name?: string;
  maxClients?: number;
  password?: string;
  rconPassword?: string;
}

export interface SpectatorLaunchResult {
  success: boolean;
  spectatorStationId: string;
  carAcId: string;
  reservedSlot: number;
}

export interface SpectatorAssignment {
  id: string;
  carAcId: string;
  startedAt: string;
  station: { id: string; stationId: string; name: string; status: string };
  server: {
    id: string;
    name: string;
    track: string;
    trackLayout: string | null;
    status: string;
  };
}

export const dedicatedServersApi = {
  getAll: () => api.get<DedicatedServer[]>('/dedicated-servers').then((res) => res.data),
  getById: (id: string) =>
    api.get<DedicatedServer>(`/dedicated-servers/${id}`).then((res) => res.data),
  create: (data: CreateDedicatedServerData) =>
    api.post<DedicatedServer>('/dedicated-servers', data).then((res) => res.data),
  update: (id: string, data: UpdateDedicatedServerData) =>
    api.patch<DedicatedServer>(`/dedicated-servers/${id}`, data).then((res) => res.data),
  remove: (id: string) =>
    api.delete<DedicatedServer>(`/dedicated-servers/${id}`).then((res) => res.data),
  stop: (id: string) => api.post(`/dedicated-servers/${id}/stop`).then((res) => res.data),
  join: (
    id: string,
    pods: {
      stationId: string;
      carAcId: string;
      clientName?: string;
      difficulty?: string;
      gearbox?: string;
      durationMinutes?: number;
    }[],
  ) => api.post(`/dedicated-servers/${id}/join`, { pods }).then((res) => res.data),
  spectate: (id: string) =>
    api.post<SpectatorLaunchResult>(`/dedicated-servers/${id}/spectate`).then((res) => res.data),
  getSpectateStatus: () =>
    api.get<SpectatorAssignment[]>('/dedicated-servers/spectate-status').then((res) => res.data),
  stopSpectating: (assignmentId: string) =>
    api.post('/dedicated-servers/spectator-stop', { assignmentId }).then((res) => res.data),
};
