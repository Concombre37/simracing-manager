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

export const sessionsApi = {
  getActive: () => api.get<ActiveSession[]>('/sessions/active').then((res) => res.data),
  extend: (id: string, minutes: number) =>
    api.post<ActiveSession>(`/sessions/${id}/extend`, { minutes }).then((res) => res.data),
  stop: (id: string) => api.post<ActiveSession>(`/sessions/${id}/stop`).then((res) => res.data),
};
