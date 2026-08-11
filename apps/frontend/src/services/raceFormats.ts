import { RaceMode, GridType } from '@simracing/shared';
import { api } from './api';

export interface RaceFormat {
  id: string;
  name: string;
  description: string | null;
  practiceEnabled: boolean;
  practiceMinutes: number;
  qualifyingEnabled: boolean;
  qualifyingMinutes: number;
  raceEnabled: boolean;
  raceMode: RaceMode;
  raceLaps: number;
  raceMinutes: number;
  gridType: GridType;
  weatherGraphics: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: { email: string } | null;
}

export interface RaceFormatInput {
  name: string;
  description?: string;
  practiceEnabled: boolean;
  practiceMinutes: number;
  qualifyingEnabled: boolean;
  qualifyingMinutes: number;
  raceEnabled: boolean;
  raceMode: RaceMode;
  raceLaps: number;
  raceMinutes: number;
  gridType: GridType;
  weatherGraphics: string[];
}

export const raceFormatsApi = {
  list: () => api.get<RaceFormat[]>('/race-formats').then((res) => res.data),
  get: (id: string) => api.get<RaceFormat>(`/race-formats/${id}`).then((res) => res.data),
  create: (input: RaceFormatInput) =>
    api.post<RaceFormat>('/race-formats', input).then((res) => res.data),
  update: (id: string, input: Partial<RaceFormatInput>) =>
    api.patch<RaceFormat>(`/race-formats/${id}`, input).then((res) => res.data),
  remove: (id: string) => api.delete(`/race-formats/${id}`).then((res) => res.data),
};
