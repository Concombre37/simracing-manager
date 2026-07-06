export function cleanTrackName(name: string): string {
  return name
    .replace(/\s+-\s*layout\s*$/i, '')
    .replace(/-layout\s*$/i, '')
    .replace(/\s+layout\s*$/i, '')
    .trim();
}

export function formatTrackAcId(acId: string): string {
  return acId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function formatTrackName(name: string | undefined, acId: string): string {
  const cleaned = cleanTrackName(name || '');
  if (cleaned && cleaned.toLowerCase() !== acId.toLowerCase()) {
    return cleaned;
  }
  return formatTrackAcId(acId);
}

export interface TrackLike {
  acId: string;
  name: string;
}

export function findTrackName(
  trackAcId: string,
  content: { tracks?: TrackLike[] } | null | undefined,
): string {
  const track = content?.tracks?.find((t) => t.acId === trackAcId);
  return formatTrackName(track?.name, trackAcId);
}

export function findTrackPreview(
  trackAcId: string | undefined,
  content: { tracks?: (TrackLike & { preview?: string })[] } | null | undefined,
): string | undefined {
  if (!trackAcId) return undefined;
  return content?.tracks?.find((t) => t.acId === trackAcId)?.preview;
}

export interface CarLike {
  acId: string;
  name: string;
  preview?: string;
}

export function formatCarName(name: string | undefined, acId: string): string {
  const cleaned = (name || '').trim();
  if (cleaned && cleaned.toLowerCase() !== acId.toLowerCase()) {
    return cleaned;
  }
  return formatTrackAcId(acId);
}

export function findCar(
  carAcId: string | undefined,
  content: { cars?: CarLike[] } | null | undefined,
): CarLike | undefined {
  if (!carAcId) return undefined;
  return content?.cars?.find((c) => c.acId === carAcId);
}
