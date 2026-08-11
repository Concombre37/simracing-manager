import { externalApi } from './externalApi';
import type { MenuCategory } from './menu';

export interface CatalogItem {
  acId: string;
  name: string;
  previewUrl: string | null;
  category: string | null;
  difficulty: number | null;
  year: number | null;
  country: string | null;
  countryCode: string | null;
  description: string | null;
  powerHp: number | null;
  weightKg: number | null;
}

export interface Catalog {
  cars: CatalogItem[];
  tracks: CatalogItem[];
}

export const tabletMenuApi = {
  getContent: () => externalApi.get<Catalog>('/content').then((res) => res.data),
  getMenu: () => externalApi.get<MenuCategory[]>('/menu').then((res) => res.data),
};
