import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface RaceOutLap {
  car: number;
  time: number;
  cuts?: number;
}

interface RaceOutSession {
  name?: string;
  laps?: RaceOutLap[];
}

interface RaceOutResult {
  sessions?: RaceOutSession[];
}

export interface LeaderboardEntry {
  sessionId: string;
  driver: string;
  timeMs: number;
  date: string;
  stationName: string;
  /** Nom de session AC (Practice/Qualifying/Race) où ce tour a été réalisé
   * — tel que rapporté par race_out.json, pas une info inventée. */
  sessionType: string | null;
}

export interface LeaderboardCarGroup {
  carAcId: string;
  previewUrl: string | null;
  totalEntries: number;
  entries: LeaderboardEntry[];
}

export interface LeaderboardCircuit {
  track: string;
  trackLayout: string;
  previewUrl: string | null;
  sessionsCount: number;
  driversCount: number;
  carsCount: number;
  record: LeaderboardEntry & { carAcId: string };
  /** Top 3 toutes voitures confondues (pas le meilleur par voiture) — un
   * même véhicule peut y apparaître plusieurs fois si son 2e pilote est
   * aussi rapide que la voiture suivante. `podium[0]` === `record`. */
  podium: (LeaderboardEntry & { carAcId: string })[];
  /** Écart entre le 1er et le 2e du podium toutes voitures (ms), null s'il
   * n'y a qu'un seul temps classé sur ce circuit. */
  recordGapMs: number | null;
  cars: LeaderboardCarGroup[];
}

/** Le jeu chronomètre au milliseconde près en interne, mais l'affichage et
 * le classement se font au centième — arrondir ici (pas juste tronquer à
 * l'affichage) garantit que le tri et les écarts calculés plus bas
 * correspondent exactement au temps affiché. */
function roundToCentiseconds(ms: number): number {
  return Math.round(ms / 10) * 10;
}

/** Meilleur tour "propre" (sans coupure) d'une session, ou null si aucun
 * tour valide n'a été bouclé — un tour coupé n'a pas sa place dans un
 * classement. */
function bestCleanLap(
  result: unknown,
): { timeMs: number; sessionType: string | null } | null {
  const data = result as RaceOutResult | null | undefined;
  if (!data?.sessions?.length) return null;
  let best: { timeMs: number; sessionType: string | null } | null = null;
  for (const session of data.sessions) {
    for (const lap of session.laps ?? []) {
      if ((lap.cuts ?? 0) > 0) continue;
      if (!lap.time || lap.time <= 0) continue;
      if (best === null || lap.time < best.timeMs) {
        best = { timeMs: lap.time, sessionType: session.name ?? null };
      }
    }
  }
  if (!best) return null;
  return { ...best, timeMs: roundToCentiseconds(best.timeMs) };
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard(): Promise<LeaderboardCircuit[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        status: 'finished',
        track: { not: null },
        carAcId: { not: null },
        result: { not: Prisma.DbNull },
      },
      select: {
        id: true,
        track: true,
        trackLayout: true,
        carAcId: true,
        clientName: true,
        result: true,
        endedAt: true,
        createdAt: true,
        station: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    type Bucket = {
      track: string;
      trackLayout: string;
      cars: Map<string, LeaderboardEntry[]>;
      sessionIds: Set<string>;
      drivers: Set<string>;
    };
    const buckets = new Map<string, Bucket>();

    for (const s of sessions) {
      const lap = bestCleanLap(s.result);
      if (lap === null || !s.track || !s.carAcId) continue;

      const trackLayout = s.trackLayout ?? '';
      const key = `${s.track}::${trackLayout}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          track: s.track,
          trackLayout,
          cars: new Map(),
          sessionIds: new Set(),
          drivers: new Set(),
        };
        buckets.set(key, bucket);
      }
      bucket.sessionIds.add(s.id);
      const driver = s.clientName?.trim() || 'Pilote inconnu';
      bucket.drivers.add(driver);

      const entry: LeaderboardEntry = {
        sessionId: s.id,
        driver,
        timeMs: lap.timeMs,
        date: (s.endedAt ?? s.createdAt).toISOString(),
        stationName: s.station.name,
        sessionType: lap.sessionType,
      };
      const carEntries = bucket.cars.get(s.carAcId) ?? [];
      carEntries.push(entry);
      bucket.cars.set(s.carAcId, carEntries);
    }

    // Un seul aller-retour DB pour toutes les images (previews scannées par
    // n'importe quel poste — le classement n'est pas rattaché à un poste en
    // particulier, contrairement au wizard de création de serveur).
    const previewMap = await this.loadPreviewMap();

    const circuits: LeaderboardCircuit[] = [];
    for (const bucket of buckets.values()) {
      const cars: LeaderboardCarGroup[] = [];
      const allEntries: (LeaderboardEntry & { carAcId: string })[] = [];

      for (const [carAcId, entries] of bucket.cars) {
        entries.sort((a, b) => a.timeMs - b.timeMs);
        const top = entries.slice(0, 3);
        cars.push({
          carAcId,
          previewUrl: previewMap.get(`car:${carAcId}`) ?? null,
          totalEntries: entries.length,
          entries: top,
        });

        for (const entry of entries) allEntries.push({ ...entry, carAcId });
      }

      cars.sort((a, b) => a.entries[0].timeMs - b.entries[0].timeMs);

      if (allEntries.length === 0) continue;
      allEntries.sort((a, b) => a.timeMs - b.timeMs);
      const podium = allEntries.slice(0, 3);
      const recordGapMs =
        podium.length > 1 ? podium[1].timeMs - podium[0].timeMs : null;

      circuits.push({
        track: bucket.track,
        trackLayout: bucket.trackLayout,
        previewUrl: previewMap.get(`track:${bucket.track}`) ?? null,
        sessionsCount: bucket.sessionIds.size,
        driversCount: bucket.drivers.size,
        carsCount: cars.length,
        record: podium[0],
        podium,
        recordGapMs,
        cars,
      });
    }

    circuits.sort((a, b) => b.sessionsCount - a.sessionsCount);
    return circuits;
  }

  private async loadPreviewMap(): Promise<Map<string, string>> {
    const previews = await this.prisma.contentPreview.findMany({
      where: { type: { in: ['car', 'track'] } },
      select: { id: true, type: true, acId: true },
      orderBy: { createdAt: 'desc' },
    });
    const map = new Map<string, string>();
    for (const p of previews) {
      const key = `${p.type}:${p.acId}`;
      if (!map.has(key)) map.set(key, `/api/content/previews/${p.id}`);
    }
    return map;
  }
}
