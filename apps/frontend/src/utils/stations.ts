/** Tri naturel des postes : pod2 vient avant pod10. */
const stationCollator = new Intl.Collator('fr', {
  numeric: true,
  sensitivity: 'base',
});

export interface StationSortValue {
  stationId?: string | null;
  name?: string | null;
}

export function compareStations(a: StationSortValue, b: StationSortValue): number {
  const byId = stationCollator.compare(a.stationId ?? '', b.stationId ?? '');
  return byId !== 0 ? byId : stationCollator.compare(a.name ?? '', b.name ?? '');
}

export function sortStations<T extends StationSortValue>(stations: T[]): T[] {
  return [...stations].sort(compareStations);
}
