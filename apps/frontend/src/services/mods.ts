import type { ContentLabelMap } from '@simracing/shared';
import type { Station } from './stations';

export type ModType = 'car' | 'track';

export interface ModStationPresence {
  stationId: string;
  name: string;
  role: 'simulator' | 'admin';
  present: boolean;
}

export interface ModInventoryItem {
  type: ModType;
  acId: string;
  name: string;
  category: string | null;
  layouts: string[];
  stations: ModStationPresence[];
}

interface ScannedCar {
  acId?: unknown;
  name?: unknown;
  category?: unknown;
}

interface ScannedLayout {
  name?: unknown;
}

interface ScannedTrack {
  acId?: unknown;
  name?: unknown;
  layouts?: unknown;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stationContent(station: Station): { cars: ScannedCar[]; tracks: ScannedTrack[] } {
  const content = station.content;
  if (!content || typeof content !== 'object') return { cars: [], tracks: [] };
  const value = content as { cars?: unknown; tracks?: unknown };
  return {
    cars: Array.isArray(value.cars) ? (value.cars as ScannedCar[]) : [],
    tracks: Array.isArray(value.tracks) ? (value.tracks as ScannedTrack[]) : [],
  };
}

function labelName(
  type: ModType,
  acId: string,
  fallback: string,
  labels?: ContentLabelMap,
): string {
  return labels?.[type]?.[acId]?.trim() || fallback;
}

/** Builds one deduplicated mod row from every simulator/admin station's last scan. */
export function collectModInventory(
  stations: Station[],
  labels?: ContentLabelMap,
): ModInventoryItem[] {
  // Admin stations host dedicated servers and therefore need the same
  // content inventory as the driving pods. Spectator stations are excluded:
  // they do not launch Assetto Corsa and their local files are unrelated to
  // the fleet content that must be synchronized.
  const fleetStations = stations.filter(
    (station) => station.role === 'simulator' || station.role === 'admin',
  );
  const byKey = new Map<
    string,
    {
      type: ModType;
      acId: string;
      name: string;
      category: string | null;
      layouts: Set<string>;
      present: Set<string>;
    }
  >();

  for (const station of fleetStations) {
    const content = stationContent(station);
    for (const car of content.cars) {
      const acId = text(car.acId);
      if (!acId) continue;
      const rawName = text(car.name) || acId;
      const key = `car:${acId}`;
      const row = byKey.get(key) ?? {
        type: 'car' as const,
        acId,
        name: labelName('car', acId, rawName, labels),
        category: text(car.category) || null,
        layouts: new Set<string>(),
        present: new Set<string>(),
      };
      row.present.add(station.stationId);
      byKey.set(key, row);
    }

    for (const track of content.tracks) {
      const acId = text(track.acId);
      if (!acId) continue;
      const rawName = text(track.name) || acId;
      const key = `track:${acId}`;
      const row = byKey.get(key) ?? {
        type: 'track' as const,
        acId,
        name: labelName('track', acId, rawName, labels),
        category: null,
        layouts: new Set<string>(),
        present: new Set<string>(),
      };
      const layouts = Array.isArray(track.layouts) ? (track.layouts as ScannedLayout[]) : [];
      for (const layout of layouts) {
        const layoutName = text(layout.name);
        if (layoutName) row.layouts.add(layoutName);
      }
      row.present.add(station.stationId);
      byKey.set(key, row);
    }
  }

  return [...byKey.values()]
    .map((row) => ({
      type: row.type,
      acId: row.acId,
      name: row.name,
      category: row.category,
      layouts: [...row.layouts].sort((a, b) => a.localeCompare(b)),
      stations: fleetStations.map((station) => ({
        stationId: station.stationId,
        name: station.name || station.stationId,
        role: station.role,
        present: row.present.has(station.stationId),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
