export interface RaceResultPlayer {
  name?: string;
  car?: string;
  skin?: string;
  isEntryList?: boolean;
  driverLicense?: string;
  driverNation?: string;
}

export interface RaceResultLap {
  car: number;
  time: number;
  cuts?: number;
  sectors?: number[];
}

export interface RaceResultSession {
  name?: string;
  lapstotal?: number[];
  laps?: RaceResultLap[];
  raceResult?: number[];
  bestLaps?: { car: number; time: number }[];
}

export interface RaceResultData {
  players: RaceResultPlayer[];
  sessions: RaceResultSession[];
}

export interface CleanedRaceResult {
  valid: boolean;
  resultData?: RaceResultData;
}

export function cleanupRaceResult(resultData: unknown): CleanedRaceResult {
  const data = resultData as RaceResultData | undefined;
  if (!data || !Array.isArray(data.sessions) || !Array.isArray(data.players)) {
    return { valid: false };
  }

  // Keep a session that has a raceResult/bestLaps/laps block even when every
  // recorded time is invalid. AC can still provide the finishing order in
  // that situation, and the blanking screen must show the podium instead of
  // throwing the whole result away. If AC only gives the player list, create
  // a zero-lap session so the UI can explicitly report "no valid time".
  const sessionsWithResult = data.sessions.filter((session) => {
    const totalLaps = session.lapstotal?.reduce((a, b) => a + (b || 0), 0) ?? 0;
    return (
      totalLaps > 0 ||
      Boolean(session.raceResult?.length) ||
      Boolean(session.bestLaps?.length) ||
      Boolean(session.laps?.length)
    );
  });
  if (sessionsWithResult.length > 0) {
    data.sessions = sessionsWithResult;
  } else if (data.players.length > 0) {
    data.sessions = [
      {
        name: 'Race',
        lapstotal: data.players.map(() => 0),
      },
    ];
  } else {
    return { valid: false };
  }

  // Identify player indices that completed at least one lap. When there are
  // no laps at all, preserve the raceResult order (or the full entry list)
  // so positions 1-3 remain available to the results screen.
  const playersWithLapsIndices = new Set<number>();
  data.sessions.forEach((session) => {
    if (session.lapstotal) {
      session.lapstotal.forEach((laps, index) => {
        if (laps > 0) {
          playersWithLapsIndices.add(index);
        }
      });
    }
    // Some result formats omit lapstotal or leave it at zero despite
    // recording laps. Keep those drivers so their clean laps can be checked.
    session.laps?.forEach((lap) => {
      if (lap.car >= 0 && lap.car < data.players.length) playersWithLapsIndices.add(lap.car);
    });
  });

  if (playersWithLapsIndices.size === 0) {
    data.sessions.forEach((session) => {
      session.raceResult?.forEach((index) => {
        if (index >= 0 && index < data.players.length) playersWithLapsIndices.add(index);
      });
    });
  }
  if (playersWithLapsIndices.size === 0) {
    data.players.forEach((_, index) => playersWithLapsIndices.add(index));
  }

  // Build the remapped player list.
  const newPlayers: RaceResultPlayer[] = [];
  const indexMapping: Record<number, number> = {};
  data.players.forEach((player, index) => {
    if (playersWithLapsIndices.has(index)) {
      indexMapping[index] = newPlayers.length;
      newPlayers.push(player);
    }
  });

  data.sessions.forEach((session) => {
    if (session.lapstotal) {
      const newLapsTotal: number[] = [];
      data.players.forEach((_, index) => {
        if (playersWithLapsIndices.has(index)) {
          newLapsTotal.push(session.lapstotal?.[index] ?? 0);
        }
      });
      session.lapstotal = newLapsTotal;
    }

    if (session.laps) {
      session.laps = session.laps
        .filter((lap) => playersWithLapsIndices.has(lap.car))
        .map((lap) => {
          let time = lap.time;
          if (time === -1 && lap.sectors && lap.sectors.length > 0) {
            const totalSectors = lap.sectors.reduce(
              (acc, sectorTime) => acc + (typeof sectorTime === 'number' ? sectorTime : 0),
              0,
            );
            if (totalSectors > 0) {
              time = Math.floor(totalSectors);
            }
          }
          return { ...lap, car: indexMapping[lap.car], time };
        });
    }

    if (session.raceResult) {
      session.raceResult = session.raceResult
        .filter((carIndex) => playersWithLapsIndices.has(carIndex))
        .map((carIndex) => indexMapping[carIndex]);
    }

    if (session.bestLaps) {
      session.bestLaps = session.bestLaps
        .filter((bl) => playersWithLapsIndices.has(bl.car))
        .map((bl) => ({ ...bl, car: indexMapping[bl.car] }));
    }
  });

  data.players = newPlayers;

  return { valid: true, resultData: data };
}

export interface LeaderboardEntry {
  position: number;
  name: string;
  car: string;
  laps: number;
  bestLapMs: number;
}

export type VerifiedLapResult =
  { status: 'valid'; timeMs: number } | { status: 'no-valid' | 'unverifiable' | 'unmatched' };

/** Only a lap listed in race_out.json with no cuts can confirm a score. */
export function bestCleanLapForDriver(
  result: RaceResultData,
  clientName?: string,
  carAcId?: string,
): VerifiedLapResult {
  const players = result.players ?? [];
  const normalizedName = (clientName ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  let playerIndex = normalizedName
    ? players.findIndex(
        (player) =>
          (player.name ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase() === normalizedName,
      )
    : -1;
  if (playerIndex < 0 && carAcId) {
    const matches = players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => player.car === carAcId);
    if (matches.length === 1) playerIndex = matches[0].index;
  }
  if (playerIndex < 0 && players.length === 1 && (!carAcId || players[0].car === carAcId)) {
    playerIndex = 0;
  }
  if (playerIndex < 0) return { status: 'unmatched' };

  let best: number | null = null;
  for (const session of result.sessions ?? []) {
    for (const lap of session.laps ?? []) {
      if (
        lap.car !== playerIndex ||
        (lap.cuts ?? 0) > 0 ||
        !Number.isFinite(lap.time) ||
        lap.time <= 0
      )
        continue;
      if (best === null || lap.time < best) best = lap.time;
    }
  }
  if (best !== null) return { status: 'valid', timeMs: best };
  const hasLapsWithoutDetails = result.sessions.some(
    (session) =>
      (session.lapstotal?.[playerIndex] ?? 0) > 0 &&
      !(session.laps ?? []).some((lap) => lap.car === playerIndex),
  );
  const hasUnverifiedBestLap = result.sessions.some((session) =>
    (session.bestLaps ?? []).some((lap) => lap.car === playerIndex && lap.time > 0),
  );
  return { status: hasLapsWithoutDetails || hasUnverifiedBestLap ? 'unverifiable' : 'no-valid' };
}

export function getLeaderboard(resultData: RaceResultData): LeaderboardEntry[] {
  // AC writes one result block per enabled session. Prefer the final Race
  // block (identified by a raceResult), then a named Race block, and only
  // fall back to the last available block for Practice/Qualifying-only runs.
  // Reading sessions[0] made a Practice -> Qualifying -> Race server show the
  // wrong classification on the results screen.
  const session =
    [...resultData.sessions].reverse().find((candidate) => candidate.raceResult?.length) ??
    [...resultData.sessions]
      .reverse()
      .find((candidate) => /race|course/i.test(candidate.name ?? '')) ??
    resultData.sessions.at(-1);
  if (!session) return [];

  const players = resultData.players ?? [];
  const lapstotal = session.lapstotal ?? [];
  const bestLaps = session.bestLaps ?? [];
  const raceResult = session.raceResult ?? [];

  const entries = players.map((player, index) => {
    const bestLap = bestLaps.find((bl) => bl.car === index);
    const cleanLap = (session.laps ?? [])
      .filter((lap) => lap.car === index && (lap.cuts ?? 0) === 0 && lap.time > 0)
      .sort((a, b) => a.time - b.time)[0];
    return {
      position: 0,
      name: player.name || `Pilote ${index + 1}`,
      car: player.car || '-',
      laps: lapstotal[index] ?? 0,
      bestLapMs: session.laps?.length ? (cleanLap?.time ?? 0) : (bestLap?.time ?? 0),
    };
  });

  if (raceResult.length > 0) {
    const classified = new Set<number>();
    raceResult.forEach((carIndex, position) => {
      if (entries[carIndex]) {
        entries[carIndex].position = position + 1;
        classified.add(carIndex);
      }
    });
    // Drivers not present in raceResult (DNF/no classified finish) stay after
    // classified drivers, ordered by completed laps and then best valid lap.
    const unclassified = entries
      .filter((_, index) => !classified.has(index))
      .sort((a, b) => b.laps - a.laps || validLap(a.bestLapMs) - validLap(b.bestLapMs));
    unclassified.forEach((entry, index) => {
      entry.position = raceResult.length + index + 1;
    });
  } else {
    entries.sort((a, b) => b.laps - a.laps || validLap(a.bestLapMs) - validLap(b.bestLapMs));
    entries.forEach((entry, index) => {
      entry.position = index + 1;
    });
  }

  return entries.sort((a, b) => a.position - b.position);
}

/**
 * The results blanking screen has room for the podium and the driver's local
 * context, not for a 64-row scrolling table. Keep the first three positions
 * and the immediate predecessor/successor of the station's driver. The set
 * removes duplicates when the driver is already in the podium.
 */
export function selectResultsEntries(
  entries: LeaderboardEntry[],
  ownPosition?: number,
): LeaderboardEntry[] {
  const positions = new Set([1, 2, 3]);
  if (Number.isInteger(ownPosition) && (ownPosition as number) > 0) {
    const position = ownPosition as number;
    positions.add(Math.max(1, position - 1));
    positions.add(position);
    positions.add(position + 1);
  }
  return entries.filter((entry) => positions.has(entry.position));
}

/**
 * Split the compact result view into the two visual groups used by the
 * blanking screen. The podium is always kept together. The local context is
 * limited to the driver's real predecessor/current/successor and excludes
 * anything already shown in the podium, so P1/P2 never get a duplicate lower
 * table and the last driver never gets a phantom row after them.
 */
export interface ResultsGroups {
  podium: LeaderboardEntry[];
  context: LeaderboardEntry[];
}

export function selectResultsGroups(
  entries: LeaderboardEntry[],
  ownPosition?: number,
): ResultsGroups {
  const podium = entries.filter((entry) => entry.position >= 1 && entry.position <= 3);
  if (!Number.isInteger(ownPosition) || (ownPosition as number) <= 0) {
    return { podium, context: [] };
  }

  const position = ownPosition as number;
  const contextPositions = new Set(
    [position - 1, position, position + 1].filter((candidate) => candidate > 3),
  );
  const context = entries.filter((entry) => contextPositions.has(entry.position));
  return { podium, context };
}

function validLap(timeMs: number): number {
  return timeMs > 0 ? timeMs : Number.POSITIVE_INFINITY;
}
