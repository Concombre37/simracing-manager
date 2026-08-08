import type { Session, Station, Client } from '@prisma/client';

interface RaceOutLap {
  car: number;
  lap?: number;
  time: number;
  cuts?: number;
  tyre?: string;
  sectors?: number[];
}

interface RaceOutSession {
  name?: string;
  type?: number;
  event?: number;
  duration?: number;
  laps?: RaceOutLap[];
  lapstotal?: number[];
  lapsCount?: number;
  bestLaps?: { car: number; time: number }[];
  raceResult?: number[];
}

interface RaceOutPlayer {
  car?: string;
  name?: string;
  skin?: string;
}

export interface RaceOutResult {
  track?: string;
  players?: RaceOutPlayer[];
  sessions?: RaceOutSession[];
  extras?: { name: string; time?: number }[];
  number_of_sessions?: number;
}

type SessionWithRelations = Session & {
  station: Pick<Station, 'id' | 'stationId' | 'name'>;
  client: Pick<Client, 'id' | 'name'> | null;
  telemetryFiles: {
    id: string;
    fileName: string;
    sizeBytes: number;
    createdAt: Date;
  }[];
};

/** Tous les tours "propres" (sans coupure) toutes sessions AC confondues
 * (Practice/Qualifying/Race), triés du plus rapide au plus lent — pas
 * seulement le meilleur, contrairement à `LeaderboardService`. */
function extractCleanLaps(data: RaceOutResult) {
  const laps: {
    sessionType: string | null;
    timeMs: number;
    tyre: string | null;
    sectors: number[] | null;
    lapNumber: number | null;
  }[] = [];
  for (const session of data.sessions ?? []) {
    for (const lap of session.laps ?? []) {
      if ((lap.cuts ?? 0) > 0 || !lap.time || lap.time <= 0) continue;
      laps.push({
        sessionType: session.name ?? null,
        timeMs: lap.time,
        tyre: lap.tyre ?? null,
        sectors: lap.sectors ?? null,
        lapNumber: lap.lap ?? null,
      });
    }
  }
  return laps.sort((a, b) => a.timeMs - b.timeMs);
}

export function buildSessionDetail(session: SessionWithRelations) {
  const data = (session.result ?? null) as RaceOutResult | null;
  const cleanLaps = data ? extractCleanLaps(data) : [];
  const allLaps = (data?.sessions ?? []).flatMap((s) =>
    (s.laps ?? []).map((lap) => ({
      sessionType: s.name ?? null,
      lapNumber: lap.lap ?? null,
      timeMs: lap.time,
      cuts: lap.cuts ?? 0,
      valid: (lap.cuts ?? 0) === 0,
      tyre: lap.tyre ?? null,
      sectors: lap.sectors ?? null,
    })),
  );

  return {
    id: session.id,
    type: session.type,
    status: session.status,
    track: session.track,
    trackLayout: session.trackLayout,
    carAcId: session.carAcId,
    difficulty: session.difficulty,
    gearbox: session.gearbox,
    durationMinutes: session.durationMinutes,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    createdAt: session.createdAt,
    driver: {
      name: session.clientName,
      clientId: session.client?.id ?? null,
    },
    station: {
      id: session.station.id,
      stationId: session.station.stationId,
      name: session.station.name,
    },
    telemetryFiles: session.telemetryFiles,
    // Résumé pratique pour un affichage rapide (dashboard, API externe).
    summary: {
      bestCleanLapMs: cleanLaps[0]?.timeMs ?? null,
      totalLaps: allLaps.length,
      cleanLaps: cleanLaps.length,
      cutLaps: allLaps.length - cleanLaps.length,
    },
    laps: allLaps,
    // Le JSON complet de race_out.json (nettoyé par l'agent), pour ne
    // perdre aucune information même celle non modélisée ci-dessus
    // (classement final `raceResult`, `bestLaps` par voiture, `players`...).
    raw: data,
  };
}

export type SessionDetail = ReturnType<typeof buildSessionDetail>;
