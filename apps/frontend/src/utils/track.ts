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
