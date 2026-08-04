export interface ContentLabelMap {
  car: Record<string, string>;
  track: Record<string, string>;
}

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

export function formatTrackName(
  name: string | undefined,
  acId: string,
  labelMap?: ContentLabelMap,
): string {
  const override = labelMap?.track?.[acId];
  if (override) return override;
  const cleaned = cleanTrackName(name || '');
  if (cleaned && cleaned.toLowerCase() !== acId.toLowerCase()) {
    return cleaned;
  }
  return formatTrackAcId(acId);
}

export function formatCarName(
  name: string | undefined,
  acId: string,
  labelMap?: ContentLabelMap,
): string {
  const override = labelMap?.car?.[acId];
  if (override) return override;
  const cleaned = (name || '').trim();
  if (cleaned && cleaned.toLowerCase() !== acId.toLowerCase()) {
    return cleaned;
  }
  return formatTrackAcId(acId);
}
