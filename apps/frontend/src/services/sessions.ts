import { api } from './api';

export interface ActiveSession {
  id: string;
  stationId: string;
  type: string;
  serverId?: string;
  clientName?: string;
  difficulty?: 'EASY' | 'PRO' | 'CUSTOM';
  carAcId?: string;
  track?: string;
  trackLayout?: string | null;
  durationMinutes?: number;
  status: string;
  /** Null until the player can actually drive (blanking confirmed torn down
   * on the agent) — the duration countdown withholds until then. */
  startedAt: string | null;
  endedAt?: string | null;
  station: {
    id: string;
    stationId: string;
    name: string;
    status: string;
  };
}

export interface SessionHistoryItem {
  id: string;
  track: string | null;
  trackLayout: string | null;
  carAcId: string | null;
  clientName: string | null;
  type: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  durationMinutes: number | null;
  station: { name: string; stationId: string };
}

export interface SessionLap {
  sessionType: string | null;
  lapNumber: number | null;
  timeMs: number;
  cuts: number;
  valid: boolean;
  tyre: string | null;
  sectors: number[] | null;
}

export interface SessionDetail {
  id: string;
  type: string;
  status: string;
  track: string | null;
  trackLayout: string | null;
  carAcId: string | null;
  difficulty: string | null;
  gearbox: string | null;
  durationMinutes: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  driver: { name: string | null; clientId: string | null };
  station: { id: string; stationId: string; name: string };
  telemetryFiles: { id: string; fileName: string; sizeBytes: number; createdAt: string }[];
  summary: {
    bestCleanLapMs: number | null;
    totalLaps: number;
    cleanLaps: number;
    cutLaps: number;
  };
  laps: SessionLap[];
  raw: unknown;
}

export const sessionsApi = {
  getActive: () => api.get<ActiveSession[]>('/sessions/active').then((res) => res.data),
  extend: (id: string, minutes: number) =>
    api.post<ActiveSession>(`/sessions/${id}/extend`, { minutes }).then((res) => res.data),
  stop: (id: string) => api.post<ActiveSession>(`/sessions/${id}/stop`).then((res) => res.data),
  getHistory: (params?: { limit?: number; cursor?: string }) =>
    api.get<SessionHistoryItem[]>('/sessions/history', { params }).then((res) => res.data),
  getDetail: (id: string) => api.get<SessionDetail>(`/sessions/${id}`).then((res) => res.data),
};
