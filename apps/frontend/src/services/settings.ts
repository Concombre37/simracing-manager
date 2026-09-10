import { api } from './api';

export interface AppSettings {
  id: string;
  blankingDelaySeconds: number;
  tabletIdleSeconds: number;
  updatedAt: string;
}

export interface UpdateSettingsData {
  blankingDelaySeconds: number;
  tabletIdleSeconds?: number;
}

export const settingsApi = {
  get: () => api.get<AppSettings>('/settings').then((res) => res.data),
  update: (data: UpdateSettingsData) =>
    api.patch<AppSettings>('/settings', data).then((res) => res.data),
};
