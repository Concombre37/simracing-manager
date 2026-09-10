import { Injectable } from '@nestjs/common';
import { formatCarName, formatTrackName } from '@simracing/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertContentLabelDto } from './dto/upsert-content-label.dto';

export interface RawContentItem {
  type: 'car' | 'track';
  acId: string;
  rawName: string;
  layoutNames?: string[];
  stations?: StationInfo[];
  layoutStations?: Record<string, StationInfo[]>;
}

export interface StationInfo {
  stationId: string;
  name: string;
}

export interface ContentPresence extends StationInfo {
  present: boolean;
}

interface StationContentShape {
  cars?: { acId: string; name?: string }[];
  tracks?: { acId: string; name?: string; layouts?: { name: string }[] }[];
}

function uniqueStations(stations: StationInfo[]): StationInfo[] {
  const byId = new Map<string, StationInfo>();
  for (const station of stations) {
    if (station.stationId && !byId.has(station.stationId))
      byId.set(station.stationId, station);
  }
  return [...byId.values()];
}

function presenceFor(
  allStations: StationInfo[],
  presentStations: StationInfo[] | undefined,
): ContentPresence[] {
  const presentIds = new Set(
    (presentStations ?? []).map((station) => station.stationId),
  );
  return allStations.map((station) => ({
    ...station,
    present: presentIds.has(station.stationId),
  }));
}

/** Fusionne les inventaires de tous les postes sans laisser un poste dont le
 * scan est plus ancien effacer un circuit ou un layout ajouté ailleurs. Les
 * previews sont déjà dédupliquées séparément par `loadPreviewMap`; ici on
 * conserve seulement l'inventaire nominatif nécessaire pour les relier. */
export function mergeRawContentItem(
  rawByKey: Map<string, RawContentItem>,
  item: RawContentItem,
): void {
  const key = `${item.type}:${item.acId}`;
  const existing = rawByKey.get(key);
  if (!existing) {
    rawByKey.set(key, {
      ...item,
      layoutNames: item.layoutNames
        ? [...new Set(item.layoutNames)]
        : undefined,
      stations: uniqueStations(item.stations ?? []),
      layoutStations: Object.fromEntries(
        Object.entries(item.layoutStations ?? {}).map(([name, stations]) => [
          name,
          uniqueStations(stations),
        ]),
      ),
    });
    return;
  }

  existing.stations = uniqueStations([
    ...(existing.stations ?? []),
    ...(item.stations ?? []),
  ]);
  if (item.type !== 'track') return;
  const mergedLayouts = [
    ...(existing.layoutNames ?? []),
    ...(item.layoutNames ?? []),
  ].filter(Boolean);
  existing.layoutNames = [...new Set(mergedLayouts)];
  const existingLayoutStations = existing.layoutStations ?? {};
  for (const [name, stations] of Object.entries(item.layoutStations ?? {})) {
    existingLayoutStations[name] = uniqueStations([
      ...(existingLayoutStations[name] ?? []),
      ...stations,
    ]);
  }
  existing.layoutStations = existingLayoutStations;
  if (!existing.rawName || existing.rawName === existing.acId) {
    existing.rawName = item.rawName;
  }
}

export interface LayoutImage {
  name: string;
  url: string;
  visible: boolean;
}

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
  maxSpeedKmh: number | null;
  mirrored: boolean;
  visible: boolean;
  previewUrl: string | null;
  layoutImageUrl: string | null;
  layoutImages: LayoutImage[];
  hiddenLayouts: string[];
  stations: ContentPresence[];
  layoutPresence: Record<string, ContentPresence[]>;
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

@Injectable()
export class ContentLabelsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Déduplique le contenu scanné (cars/tracks) à travers TOUS les postes,
   * par acId. Un seul exemplaire est affiché, avec la présence détaillée par
   * station et l'union des layouts disponibles. */
  private async gatherRawContent(): Promise<{
    items: Map<string, RawContentItem>;
    stations: StationInfo[];
  }> {
    const stations = await this.prisma.station.findMany({
      select: { stationId: true, name: true, content: true },
    });

    const rawByKey = new Map<string, RawContentItem>();
    for (const station of stations) {
      const content = station.content as StationContentShape | null;
      const stationInfo = {
        stationId: station.stationId,
        name: station.name || station.stationId,
      };
      for (const car of content?.cars ?? []) {
        if (!car.acId) continue;
        mergeRawContentItem(rawByKey, {
          type: 'car',
          acId: car.acId,
          rawName: car.name?.trim() || car.acId,
          stations: [stationInfo],
        });
      }
      for (const track of content?.tracks ?? []) {
        if (!track.acId) continue;
        mergeRawContentItem(rawByKey, {
          type: 'track',
          acId: track.acId,
          rawName: track.name?.trim() || track.acId,
          layoutNames: (track.layouts ?? []).map((l) => l.name).filter(Boolean),
          stations: [stationInfo],
          layoutStations: Object.fromEntries(
            (track.layouts ?? [])
              .filter((layout) => Boolean(layout.name))
              .map((layout) => [layout.name, [stationInfo]]),
          ),
        });
      }
    }
    return { items: rawByKey, stations: uniqueStations(stations) };
  }

  /** Une preview par (type, acId) — n'importe quel poste l'ayant scannée
   * fait l'affaire, même principe que `LeaderboardService.loadPreviewMap()`.
   * `types` inclut 'layout' pour récupérer aussi le vrai schéma de circuit
   * (`outline.png`, voir `stations.service.ts#extractPreviews()`), stocké
   * sous ce même mécanisme `ContentPreview` avec `acId` = celui du circuit. */
  private async loadPreviewMap(types: string[]): Promise<Map<string, string>> {
    const previews = await this.prisma.contentPreview.findMany({
      where: { type: { in: types } },
      select: { id: true, type: true, acId: true },
      orderBy: { createdAt: 'desc' },
    });
    const previewByKey = new Map<string, string>();
    for (const p of previews) {
      const key = `${p.type}:${p.acId}`;
      if (!previewByKey.has(key)) {
        previewByKey.set(key, `/api/content/previews/${p.id}`);
      }
    }
    return previewByKey;
  }

  /** Une entrée par layout nommé du circuit ayant un vrai schéma scanné
   * (`ContentPreview` type 'layout', acId `${trackAcId}:${layoutName}` — voir
   * `stations.service.ts#extractPreviews()`) — pas le repli `layoutImageUrl`
   * racine, qui n'a pas de nom de layout associé. */
  private resolveLayoutImages(
    acId: string,
    layoutNames: string[] | undefined,
    previewByKey: Map<string, string>,
    hiddenLayouts: string[] = [],
    includeHidden = false,
  ): LayoutImage[] {
    const hidden = new Set(hiddenLayouts);
    return (layoutNames ?? [])
      .map((name) => {
        const url = previewByKey.get(`layout:${acId}:${name}`);
        return url ? { name, url, visible: !hidden.has(name) } : null;
      })
      .filter((l): l is LayoutImage => l !== null)
      .filter((l) => includeHidden || l.visible !== false);
  }

  async getKnown(): Promise<KnownContentItem[]> {
    const [{ items: rawByKey, stations: allStations }, labels, previewByKey] =
      await Promise.all([
        this.gatherRawContent(),
        this.prisma.contentLabel.findMany(),
        this.loadPreviewMap(['car', 'track', 'layout']),
      ]);
    const labelByKey = new Map(labels.map((l) => [`${l.type}:${l.acId}`, l]));

    return Array.from(rawByKey.values())
      .map((item) => {
        const label = labelByKey.get(`${item.type}:${item.acId}`);
        return {
          type: item.type,
          acId: item.acId,
          rawName: item.rawName,
          displayName: label?.displayName || null,
          labelId: label?.id ?? null,
          category: label?.category ?? null,
          difficulty: label?.difficulty ?? null,
          year: label?.year ?? null,
          country: label?.country ?? null,
          countryCode: label?.countryCode ?? null,
          description: label?.description ?? null,
          powerHp: label?.powerHp ?? null,
          weightKg: label?.weightKg ?? null,
          maxSpeedKmh: label?.maxSpeedKmh ?? null,
          mirrored: label?.mirrored ?? false,
          visible: label?.visible ?? true,
          previewUrl: previewByKey.get(`${item.type}:${item.acId}`) ?? null,
          layoutImageUrl:
            item.type === 'track'
              ? (previewByKey.get(`layout:${item.acId}`) ??
                (label?.layoutImage
                  ? `/api/content/labels/layout-image/${label.id}`
                  : null))
              : null,
          layoutImages:
            item.type === 'track'
              ? this.resolveLayoutImages(
                  item.acId,
                  item.layoutNames,
                  previewByKey,
                  label?.hiddenLayouts ?? [],
                  true,
                )
              : [],
          hiddenLayouts: label?.hiddenLayouts ?? [],
          stations: presenceFor(allStations, item.stations),
          layoutPresence: Object.fromEntries(
            (item.layoutNames ?? []).map((name) => [
              name,
              presenceFor(allStations, item.layoutStations?.[name]),
            ]),
          ),
        };
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.rawName.localeCompare(b.rawName);
      });
  }

  /** Catalogue voitures/circuits pour la page tablette (`/tablet-menu`) —
   * même agrégation que `getKnown()`, enrichie de l'image et triée par nom
   * affiché. */
  async getCatalog(): Promise<{ cars: CatalogItem[]; tracks: CatalogItem[] }> {
    const [{ items: rawByKey, stations: allStations }, labels, previewByKey] = await Promise.all([
      this.gatherRawContent(),
      this.prisma.contentLabel.findMany(),
      this.loadPreviewMap(['car', 'track', 'layout']),
    ]);
    const labelByKey = new Map(labels.map((l) => [`${l.type}:${l.acId}`, l]));

    const cars: CatalogItem[] = [];
    const tracks: CatalogItem[] = [];
    for (const item of rawByKey.values()) {
      const label = labelByKey.get(`${item.type}:${item.acId}`);
      if (label?.visible === false) continue;
      const override = label?.displayName
        ? { [item.acId]: label.displayName }
        : {};
      const name =
        item.type === 'car'
          ? formatCarName(item.rawName, item.acId, { car: override, track: {} })
          : formatTrackName(item.rawName, item.acId, {
              car: {},
              track: override,
            });
      const entry: CatalogItem = {
        acId: item.acId,
        name,
        previewUrl: previewByKey.get(`${item.type}:${item.acId}`) ?? null,
        category: label?.category ?? null,
        difficulty: label?.difficulty ?? null,
        year: label?.year ?? null,
        country: label?.country ?? null,
        countryCode: label?.countryCode ?? null,
        description: label?.description ?? null,
        powerHp: label?.powerHp ?? null,
        weightKg: label?.weightKg ?? null,
        maxSpeedKmh: label?.maxSpeedKmh ?? null,
        mirrored: label?.mirrored ?? false,
        stations: presenceFor(allStations, item.stations),
        // Vrai schéma scanné (outline.png réel du circuit installé) préféré
        // au schéma web (Wikimedia) peuplé manuellement en v2.2.126 — celui-ci
        // ne reste utilisé qu'en repli, pour les circuits pas encore
        // (re-)scannés par un poste avec la nouvelle version de l'agent.
        layoutImageUrl:
          previewByKey.get(`layout:${item.acId}`) ??
          (label?.layoutImage
            ? `/api/content/labels/layout-image/${label.id}`
            : null),
        layoutImages:
          item.type === 'track'
            ? this.resolveLayoutImages(
                item.acId,
                item.layoutNames,
                previewByKey,
                label?.hiddenLayouts ?? [],
              )
            : [],
      };
      (item.type === 'car' ? cars : tracks).push(entry);
    }

    cars.sort((a, b) => a.name.localeCompare(b.name));
    tracks.sort((a, b) => a.name.localeCompare(b.name));
    return { cars, tracks };
  }

  async getMap(): Promise<{
    car: Record<string, string>;
    track: Record<string, string>;
  }> {
    const labels = await this.prisma.contentLabel.findMany();
    const map: { car: Record<string, string>; track: Record<string, string> } =
      {
        car: {},
        track: {},
      };
    for (const label of labels) {
      map[label.type as 'car' | 'track'][label.acId] = label.displayName;
    }
    return map;
  }

  /** Le formulaire (`ContentNames.tsx`) enregistre tous les champs ensemble
   * depuis un seul bouton par ligne — `displayName` vide n'efface donc pas
   * la ligne à lui seul, contrairement à avant l'ajout de
   * category/difficulty/année/pays/description : sinon retirer juste le nom
   * personnalisé effacerait aussi tout le reste déjà renseigné. La ligne
   * n'est supprimée que si tous les champs sont vides à la fois. */
  async upsert(dto: UpsertContentLabelDto) {
    const displayName = dto.displayName.trim();
    const category = dto.category?.trim() || null;
    const difficulty = dto.difficulty ?? null;
    const year = dto.year ?? null;
    const country = dto.country?.trim() || null;
    const countryCode = dto.countryCode?.trim() || null;
    const description = dto.description?.trim() || null;
    const powerHp = dto.powerHp ?? null;
    const weightKg = dto.weightKg ?? null;
    const maxSpeedKmh = dto.maxSpeedKmh ?? null;
    const mirrored = dto.mirrored ?? false;
    const visible = dto.visible ?? true;
    const hiddenLayouts = Array.from(
      new Set(
        (dto.hiddenLayouts ?? [])
          .map((layout) => layout.trim())
          .filter(Boolean),
      ),
    );

    if (
      !displayName &&
      !category &&
      !difficulty &&
      !year &&
      !country &&
      !countryCode &&
      !description &&
      !powerHp &&
      !weightKg &&
      !maxSpeedKmh &&
      !mirrored &&
      visible &&
      hiddenLayouts.length === 0
    ) {
      await this.prisma.contentLabel.deleteMany({
        where: { type: dto.type, acId: dto.acId },
      });
      return null;
    }

    return this.prisma.contentLabel.upsert({
      where: { type_acId: { type: dto.type, acId: dto.acId } },
      create: {
        type: dto.type,
        acId: dto.acId,
        displayName,
        category,
        difficulty,
        year,
        country,
        countryCode,
        description,
        powerHp,
        weightKg,
        maxSpeedKmh,
        mirrored,
        visible,
        hiddenLayouts,
      },
      update: {
        displayName,
        category,
        difficulty,
        year,
        country,
        countryCode,
        description,
        powerHp,
        weightKg,
        maxSpeedKmh,
        mirrored,
        visible,
        hiddenLayouts,
      },
    });
  }

  /** Sert le schéma de circuit (base64) pour `ContentLabelsController`.
   * Pas de champ dédié dans `RowPayload`/`upsert()` — renseigné directement
   * en base via un script one-off (source externe, voir 3.2), jamais via le
   * formulaire admin ; `upsert()` ne le touche donc jamais. */
  async getLayoutImage(id: string): Promise<string | null> {
    const label = await this.prisma.contentLabel.findUnique({ where: { id } });
    return label?.layoutImage ?? null;
  }
}
