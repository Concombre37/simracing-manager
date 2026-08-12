import { api } from './api';

export interface ArcadeAttraction {
  id: string;
  name: string;
  players: string | null;
  kind: string | null;
  photoUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArcadeAttractionInput {
  name: string;
  players?: string;
  kind?: string;
  sortOrder?: number;
}

export const arcadeApi = {
  list: () => api.get<ArcadeAttraction[]>('/arcade').then((res) => res.data),
  create: (input: ArcadeAttractionInput) =>
    api.post<ArcadeAttraction>('/arcade', input).then((res) => res.data),
  update: (id: string, input: Partial<ArcadeAttractionInput>) =>
    api.patch<ArcadeAttraction>(`/arcade/${id}`, input).then((res) => res.data),
  remove: (id: string) => api.delete(`/arcade/${id}`).then((res) => res.data),
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<ArcadeAttraction>(`/arcade/${id}/photo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((res) => res.data);
  },
  removePhoto: (id: string) =>
    api.delete<ArcadeAttraction>(`/arcade/${id}/photo`).then((res) => res.data),
};
