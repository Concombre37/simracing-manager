import { api } from './api';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'technician';
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserData {
  email: string;
  password?: string;
  role: 'admin' | 'technician';
}

export interface UpdateUserData {
  email?: string;
  password?: string;
  role?: 'admin' | 'technician';
}

export const usersApi = {
  getAll: () => api.get<User[]>('/users').then((res) => res.data),
  create: (data: CreateUserData) => api.post<User>('/users', data).then((res) => res.data),
  update: (id: string, data: UpdateUserData) =>
    api.patch<User>(`/users/${id}`, data).then((res) => res.data),
  remove: (id: string) => api.delete<User>(`/users/${id}`).then((res) => res.data),
};
