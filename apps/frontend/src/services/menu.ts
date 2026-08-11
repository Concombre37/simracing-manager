import { api } from './api';

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MenuCategory {
  id: string;
  section: 'food' | 'drinks';
  title: string;
  subtitle: string | null;
  sortOrder: number;
  items: MenuItem[];
  createdAt: string;
  updatedAt: string;
}

export interface MenuCategoryInput {
  section: 'food' | 'drinks';
  title: string;
  subtitle?: string;
  sortOrder?: number;
}

export interface MenuItemInput {
  categoryId: string;
  name: string;
  description?: string;
  price: string;
  sortOrder?: number;
}

export const menuApi = {
  listGrouped: () => api.get<MenuCategory[]>('/menu').then((res) => res.data),

  createCategory: (input: MenuCategoryInput) =>
    api.post<MenuCategory>('/menu/categories', input).then((res) => res.data),
  updateCategory: (id: string, input: Partial<MenuCategoryInput>) =>
    api.patch<MenuCategory>(`/menu/categories/${id}`, input).then((res) => res.data),
  removeCategory: (id: string) => api.delete(`/menu/categories/${id}`).then((res) => res.data),

  createItem: (input: MenuItemInput) =>
    api.post<MenuItem>('/menu/items', input).then((res) => res.data),
  updateItem: (id: string, input: Partial<MenuItemInput>) =>
    api.patch<MenuItem>(`/menu/items/${id}`, input).then((res) => res.data),
  removeItem: (id: string) => api.delete(`/menu/items/${id}`).then((res) => res.data),
};
