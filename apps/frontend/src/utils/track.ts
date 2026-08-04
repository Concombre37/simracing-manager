import type { ContentLabelMap } from '../services/contentLabels';
import { cleanTrackName, formatTrackAcId, formatTrackName, formatCarName } from '@simracing/shared';

export { cleanTrackName, formatTrackAcId, formatTrackName, formatCarName };

export interface TrackLike {
  acId: string;
  name: string;
}

export function findTrackName(
  trackAcId: string,
  content: { tracks?: TrackLike[] } | null | undefined,
  labelMap?: ContentLabelMap,
): string {
  const track = content?.tracks?.find((t) => t.acId === trackAcId);
  return formatTrackName(track?.name, trackAcId, labelMap);
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

export function findCar(
  carAcId: string | undefined,
  content: { cars?: CarLike[] } | null | undefined,
): CarLike | undefined {
  if (!carAcId) return undefined;
  return content?.cars?.find((c) => c.acId === carAcId);
}
