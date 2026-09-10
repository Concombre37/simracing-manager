import { externalApi } from './externalApi';
import type { MenuCategory } from './menu';

export interface LayoutImage {
  name: string;
  url: string;
}

export interface ContentPresence {
  stationId: string;
  name: string;
  present: boolean;
}

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
  maxSpeedKmh: number | null;
  mirrored: boolean;
  stations: ContentPresence[];
  layoutImageUrl: string | null;
  layoutImages: LayoutImage[];
}

export interface Catalog {
  cars: CatalogItem[];
  tracks: CatalogItem[];
}

/** Une catégorie configurée via /content-categories (admin) — voir
 * ContentCategoriesService.listGroupedByType(). Sert à générer les tuiles
 * de filtre voitures/circuits sans liste figée dans le code. */
export interface CategoryTag {
  id: string;
  name: string;
  sortOrder: number;
}

export interface CategoryTags {
  cars: CategoryTag[];
  tracks: CategoryTag[];
}

export interface TabletSettings {
  tabletIdleSeconds: number;
}

/** Attraction arcade configurée via /arcade (admin) — voir ArcadeService.
 * Photo optionnelle (aucune source de scan automatique pour ce contenu,
 * contrairement aux voitures/circuits). */
export interface ArcadeAttraction {
  id: string;
  name: string;
  players: string | null;
  kind: string | null;
  photoUrl: string | null;
}

export const tabletMenuApi = {
  getContent: () => externalApi.get<Catalog>('/content').then((res) => res.data),
  getCategories: () => externalApi.get<CategoryTags>('/categories').then((res) => res.data),
  getMenu: () => externalApi.get<MenuCategory[]>('/menu').then((res) => res.data),
  getArcade: () => externalApi.get<ArcadeAttraction[]>('/arcade').then((res) => res.data),
  getSettings: () => externalApi.get<TabletSettings>('/settings').then((res) => res.data),
};
