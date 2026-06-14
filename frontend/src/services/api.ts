import axios from 'axios';
import { User, UserRole, LoginResponse, Station, Car, Track, SimSession, SessionConfig, DedicatedServer } from '../types';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
  }) => api.post('/auth/register', data).then((r) => r.data),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
};

export const usersApi = {
  getAll: () => api.get<User[]>('/users').then((r) => r.data),
  updateRole: (id: string, role: UserRole) =>
    api.patch<User>(`/users/${id}/role`, { role }).then((r) => r.data),
};

export const stationsApi = {
  getAll: () => api.get<Station[]>('/stations').then((r) => r.data),
  update: (id: string, data: Partial<Station>) =>
    api.patch<Station>(`/stations/${id}`, data).then((r) => r.data),
};

export const carsApi = {
  getAll: () => api.get<Car[]>('/cars').then((r) => r.data),
  create: (data: Partial<Car>) => api.post<Car>('/cars', data).then((r) => r.data),
};

export const tracksApi = {
  getAll: () => api.get<Track[]>('/tracks').then((r) => r.data),
  create: (data: Partial<Track>) => api.post<Track>('/tracks', data).then((r) => r.data),
};

export const sessionConfigsApi = {
  getAll: () => api.get<SessionConfig[]>('/session-configs').then((r) => r.data),
  getById: (id: string) => api.get<SessionConfig>(`/session-configs/${id}`).then((r) => r.data),
  getDefault: () => api.get<SessionConfig | undefined>('/session-configs/default').then((r) => r.data),
  create: (data: Partial<SessionConfig>) => api.post<SessionConfig>('/session-configs', data).then((r) => r.data),
  update: (id: string, data: Partial<SessionConfig>) =>
    api.patch<SessionConfig>(`/session-configs/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/session-configs/${id}`),
};

export const sessionsApi = {
  getAll: () => api.get<SimSession[]>('/sessions').then((r) => r.data),
  start: (data: { stationId: string; configId: string }) =>
    api.post<SimSession>('/sessions', data).then((r) => r.data),
  stop: (id: string) => api.post(`/sessions/${id}/stop`).then((r) => r.data),
  getResults: (id: string) => api.get(`/sessions/${id}/results`).then((r) => r.data),
};

export const leaderboardApi = {
  get: (params?: { trackId?: string; carId?: string }) =>
    api.get('/leaderboard', { params }).then((r) => r.data),
};

export const serversApi = {
  getAll: () => api.get<DedicatedServer[]>('/servers').then((r) => r.data),
  create: (data: Partial<DedicatedServer> & { stationId: string; track: string }) =>
    api.post<DedicatedServer>('/servers', data).then((r) => r.data),
  stop: (id: string) => api.post(`/servers/${id}/stop`).then((r) => r.data),
  delete: (id: string) => api.delete(`/servers/${id}`),
};

export default api;
