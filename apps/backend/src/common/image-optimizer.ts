// `sharp` exporte via `export =` (pas de default export ESM) — sans
// esModuleInterop dans tsconfig.json (ce projet ne l'active pas), un
// `import sharp from 'sharp'` compile en `sharp_1.default(...)`, qui vaut
// `undefined` à l'exécution (TypeError silencieusement avalé par le
// try/catch ci-dessous). Bug réel trouvé en déboguant ce fichier : le
// resize-if-oversized de BlankingMediaService avait exactement le même
// import et ne s'est donc jamais exécuté depuis son ajout (v2.2.95) — voir
// ce fichier, corrigé au même moment. `import sharp = require(...)` est la
// syntaxe correcte pour ce style d'export sans esModuleInterop — mais sans
// `moduleResolution: "node16"/"bundler"` non plus (également absent de
// tsconfig.json), TS ignore la map "exports" du package sharp et retombe
// sur son champ "types" racine, qui pointe vers les déclarations ESM
// (`dist/index.d.mts`, sans `export =`) plutôt que les vraies déclarations
// CJS (`dist/index.d.cts`) — d'où "has no call signatures" alors que
// l'appel fonctionne bien à l'exécution (vérifié directement). Changer la
// résolution de modules du projet pour corriger ça proprement dépasserait
// largement le cadre de cette tâche ; on retype donc juste localement le
// strict nécessaire plutôt que de laisser passer un mensonge de type plus
// large (`any`) ou de se battre avec les déclarations amont.
import sharpRuntime = require('sharp');

interface MinimalSharp {
  metadata(): Promise<{ width?: number; height?: number }>;
  resize(
    width: number,
    height: number,
    options: { fit: 'inside'; withoutEnlargement: boolean },
  ): MinimalSharp;
  webp(options: {
    quality?: number;
    nearLossless?: boolean;
    effort: number;
  }): MinimalSharp;
  toBuffer(): Promise<Buffer>;
}

const sharp = sharpRuntime as unknown as (buffer: Buffer) => MinimalSharp;

export interface OptimizeImageOptions {
  /** Redimensionne si besoin avant l'encodage, aspect ratio préservé,
   * jamais d'agrandissement. Omis = pas de redimensionnement. */
  maxDimension?: number;
  /** Line art avec transparence (ex: schémas de circuit) : une compression
   * avec perte floute les traits fins. Utilise le mode quasi sans perte de
   * WebP à la place — toujours plus compact qu'un PNG équivalent. */
  preserveTransparency?: boolean;
  /** Qualité WebP (0-100) pour le mode avec perte (photos). Sans objet si
   * `preserveTransparency` est actif. */
  quality?: number;
}

const DEFAULT_QUALITY = 82;

/** Convertit n'importe quelle image raster (PNG/JPEG/...) en WebP optimisé
 * — utilisé partout où /tablet-menu affiche une image stockée en base
 * (voitures/circuits scannés, schémas de tracé, photos arcade), pour le
 * gain réseau sur un point d'accès tablette public.
 *
 * Ne traite jamais de SVG (sharp le rastériserait, perdant le
 * redimensionnement infini d'un vectoriel déjà minuscule en octets — aux
 * appelants de filtrer ça en amont, voir ContentLabelsService).
 *
 * Retourne le buffer d'origine si sharp échoue à décoder (fichier
 * corrompu/format inattendu) plutôt que de bloquer l'appelant — même
 * principe que le reste de ce backend (BlankingMediaService, ArcadeService). */
export async function optimizeToWebp(
  buffer: Buffer,
  options: OptimizeImageOptions = {},
): Promise<Buffer> {
  try {
    let pipeline = sharp(buffer);

    if (options.maxDimension) {
      const { width, height } = await pipeline.metadata();
      if (
        width &&
        height &&
        (width > options.maxDimension || height > options.maxDimension)
      ) {
        pipeline = pipeline.resize(options.maxDimension, options.maxDimension, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
    }

    return await pipeline
      .webp(
        options.preserveTransparency
          ? { nearLossless: true, effort: 6 }
          : { quality: options.quality ?? DEFAULT_QUALITY, effort: 6 },
      )
      .toBuffer();
  } catch {
    return buffer;
  }
}
