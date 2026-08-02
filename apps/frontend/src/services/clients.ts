import { api } from './api';

export interface Client {
  id: string;
  name: string;
}

export const clientsApi = {
  search: (query: string) =>
    api.get<Client[]>('/clients', { params: { search: query } }).then((res) => res.data),
};
