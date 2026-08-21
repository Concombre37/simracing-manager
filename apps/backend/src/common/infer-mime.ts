/** Devine le MIME type d'une image stockée en base64 brut (sans préfixe
 * `data:`) à partir de sa signature — `ContentPreview`/`ContentLabel`
 * n'ont pas de colonne mimeType dédiée, contrairement à
 * `BlankingMedia`/`ArcadeAttraction` qui stockent du binaire + un champ à
 * part. Partagé entre `ContentPreviewsController` et
 * `ContentLabelsController`, qui servaient chacun leur propre copie. */
export function inferMimeFromBase64(data: string): string {
  if (data.startsWith('iVBOR')) return 'image/png';
  if (data.startsWith('/9j/')) return 'image/jpeg';
  if (data.startsWith('UklG')) return 'image/webp';
  if (data.startsWith('PHN2Zy') || data.startsWith('PD94bWwg'))
    return 'image/svg+xml';
  return 'application/octet-stream';
}
