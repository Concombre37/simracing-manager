import { useQuery } from '@tanstack/react-query';
import type { ContentLabelMap } from '@simracing/shared';
import { api } from './api';

export type { ContentLabelMap };

export interface KnownContentItem {
  type: 'car' | 'track';
  acId: string;
  rawName: string;
  displayName: string | null;
  labelId: string | null;
  category: string | null;
  difficulty: number | null;
  year: number | null;
  country: string | null;
  countryCode: string | null;
  description: string | null;
  powerHp: number | null;
  weightKg: number | null;
  mirrored: boolean;
}

export const contentLabelsApi = {
  getKnown: () => api.get<KnownContentItem[]>('/content/labels/known').then((res) => res.data),

  getMap: () => api.get<ContentLabelMap>('/content/labels/map').then((res) => res.data),

  upsert: (params: {
    type: 'car' | 'track';
    acId: string;
    displayName: string;
    category?: string;
    difficulty?: number;
    year?: number;
    country?: string;
    countryCode?: string;
    description?: string;
    powerHp?: number;
    weightKg?: number;
    mirrored?: boolean;
  }) => api.put('/content/labels', params).then((res) => res.data),
};

const EMPTY_LABEL_MAP: ContentLabelMap = { car: {}, track: {} };

/** Shared cache key so every consumer dedupes onto a single network fetch. */
export function useContentLabelMap(): ContentLabelMap {
  const { data } = useQuery({
    queryKey: ['content-labels-map'],
    queryFn: contentLabelsApi.getMap,
    staleTime: 60_000,
  });
  return data ?? EMPTY_LABEL_MAP;
}
