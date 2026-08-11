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
}

export interface CatalogItem {
  acId: string;
  name: string;
  previewUrl: string | null;
  category: string | null;
  difficulty: number | null;
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

  async getKnown(): Promise<KnownContentItem[]> {
    const rawByKey = await this.gatherRawContent();
    const labels = await this.prisma.contentLabel.findMany();
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
        };
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.rawName.localeCompare(b.rawName);
      });
  }

  /** Catalogue voitures/circuits pour la page tablette (`/tablet-menu`) —
   * même agrégation que `getKnown()`, enrichie de l'image (une par acId,
   * n'importe quel poste l'ayant scannée fait l'affaire, même principe que
   * `LeaderboardService.loadPreviewMap()`) et triée par nom affiché. */
  async getCatalog(): Promise<{ cars: CatalogItem[]; tracks: CatalogItem[] }> {
    const [rawByKey, labels, previews] = await Promise.all([
      this.gatherRawContent(),
      this.prisma.contentLabel.findMany(),
      this.prisma.contentPreview.findMany({
        where: { type: { in: ['car', 'track'] } },
        select: { id: true, type: true, acId: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const labelByKey = new Map(labels.map((l) => [`${l.type}:${l.acId}`, l]));
    const previewByKey = new Map<string, string>();
    for (const p of previews) {
      const key = `${p.type}:${p.acId}`;
      if (!previewByKey.has(key)) {
        previewByKey.set(key, `/api/content/previews/${p.id}`);
      }
    }

    const cars: CatalogItem[] = [];
    const tracks: CatalogItem[] = [];
    for (const item of rawByKey.values()) {
      const label = labelByKey.get(`${item.type}:${item.acId}`);
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

  /** Le formulaire (`ContentNames.tsx`) enregistre les trois champs
   * ensemble depuis un seul bouton par ligne — `displayName` vide n'efface
   * donc plus la ligne à lui seul, contrairement à avant l'ajout de
   * category/difficulty : sinon retirer juste le nom personnalisé
   * effacerait aussi le tag catégorie/difficulté déjà renseigné. La ligne
   * n'est supprimée que si les trois champs sont vides à la fois. */
  async upsert(dto: UpsertContentLabelDto) {
    const displayName = dto.displayName.trim();
    const category = dto.category?.trim() || null;
    const difficulty = dto.difficulty ?? null;

    if (!displayName && !category && !difficulty) {
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
      },
      update: { displayName, category, difficulty },
    });
  }
}
