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
    return totalLaps > 0 || Boolean(session.raceResult?.length) || Boolean(session.bestLaps?.length) || Boolean(session.laps?.length);
  });
  if (sessionsWithResult.length > 0) {
    data.sessions = sessionsWithResult;
  } else if (data.players.length > 0) {
    data.sessions = [{
      name: 'Race',
      lapstotal: data.players.map(() => 0),
    }];
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
    const fallbackLap = (session.laps ?? [])
      .filter((lap) => lap.car === index && lap.time > 0)
      .sort((a, b) => a.time - b.time)[0];
    return {
      position: 0,
      name: player.name || `Pilote ${index + 1}`,
      car: player.car || '-',
      laps: lapstotal[index] ?? 0,
      bestLapMs: bestLap?.time ?? fallbackLap?.time ?? 0,
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

function validLap(timeMs: number): number {
  return timeMs > 0 ? timeMs : Number.POSITIVE_INFINITY;
}
