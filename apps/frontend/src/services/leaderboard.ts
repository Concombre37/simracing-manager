import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface LeaderboardEntry {
  sessionId: string;
  driver: string;
  timeMs: number;
  date: string;
  stationName: string;
  sessionType: string | null;
}

export interface LeaderboardCarGroup {
  carAcId: string;
  previewUrl: string | null;
  totalEntries: number;
  entries: LeaderboardEntry[];
}

export interface LeaderboardCircuit {
  track: string;
  trackLayout: string;
  previewUrl: string | null;
  sessionsCount: number;
  driversCount: number;
  carsCount: number;
  record: LeaderboardEntry & { carAcId: string };
  podium: (LeaderboardEntry & { carAcId: string })[];
  recordGapMs: number | null;
  cars: LeaderboardCarGroup[];
}

export const leaderboardApi = {
  get: () => api.get<LeaderboardCircuit[]>('/leaderboard').then((res) => res.data),
};

export function useLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: leaderboardApi.get,
    staleTime: 30_000,
  });
}
