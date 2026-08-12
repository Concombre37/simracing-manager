import { Injectable } from '@nestjs/common';
import { formatCarName, formatTrackName } from '@simracing/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertContentLabelDto } from './dto/upsert-content-label.dto';

interface RawContentItem {
  type: 'car' | 'track';
  acId: string;
  rawName: string;
}

interface StationContentShape {
  cars?: { acId: string; name?: string }[];
  tracks?: { acId: string; name?: string }[];
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
  mirrored: boolean;
  visible: boolean;
  previewUrl: string | null;
  layoutImageUrl: string | null;
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
  mirrored: boolean;
  layoutImageUrl: string | null;
}

@Injectable()
export class ContentLabelsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Déduplique le contenu scanné (cars/tracks) à travers TOUS les postes,
   * par acId — un même acId peut apparaître sur plusieurs postes, un seul
   * exemplaire (le dernier vu) suffit pour lister "ce qui existe". */
  private async gatherRawContent(): Promise<Map<string, RawContentItem>> {
    const stations = await this.prisma.station.findMany({
      select: { content: true },
    });

    const rawByKey = new Map<string, RawContentItem>();
    for (const station of stations) {
      const content = station.content as StationContentShape | null;
      for (const car of content?.cars ?? []) {
        if (!car.acId) continue;
        rawByKey.set(`car:${car.acId}`, {
          type: 'car',
          acId: car.acId,
          rawName: car.name?.trim() || car.acId,
        });
      }
      for (const track of content?.tracks ?? []) {
        if (!track.acId) continue;
        rawByKey.set(`track:${track.acId}`, {
          type: 'track',
          acId: track.acId,
          rawName: track.name?.trim() || track.acId,
        });
      }
    }
    return rawByKey;
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

  async getKnown(): Promise<KnownContentItem[]> {
    const [rawByKey, labels, previewByKey] = await Promise.all([
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
    const [rawByKey, labels, previewByKey] = await Promise.all([
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
        mirrored: label?.mirrored ?? false,
        // Vrai schéma scanné (outline.png réel du circuit installé) préféré
        // au schéma web (Wikimedia) peuplé manuellement en v2.2.126 — celui-ci
        // ne reste utilisé qu'en repli, pour les circuits pas encore
        // (re-)scannés par un poste avec la nouvelle version de l'agent.
        layoutImageUrl:
          previewByKey.get(`layout:${item.acId}`) ??
          (label?.layoutImage
            ? `/api/content/labels/layout-image/${label.id}`
            : null),
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
    const mirrored = dto.mirrored ?? false;
    const visible = dto.visible ?? true;

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
      !mirrored &&
      visible
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
        mirrored,
        visible,
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
        mirrored,
        visible,
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
