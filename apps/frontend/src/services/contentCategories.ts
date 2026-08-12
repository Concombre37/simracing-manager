import { api } from './api';

export type ContentCategoryType = 'car' | 'track';

export interface ContentCategory {
  id: string;
  type: ContentCategoryType;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentCategoryInput {
  type: ContentCategoryType;
  name: string;
  sortOrder?: number;
}

export const contentCategoriesApi = {
  list: (type?: ContentCategoryType) =>
    api
      .get<ContentCategory[]>('/content-categories', { params: type ? { type } : undefined })
      .then((res) => res.data),
  create: (input: ContentCategoryInput) =>
    api.post<ContentCategory>('/content-categories', input).then((res) => res.data),
  update: (id: string, input: Partial<Pick<ContentCategoryInput, 'name' | 'sortOrder'>>) =>
    api.patch<ContentCategory>(`/content-categories/${id}`, input).then((res) => res.data),
  remove: (id: string) => api.delete(`/content-categories/${id}`).then((res) => res.data),
};
