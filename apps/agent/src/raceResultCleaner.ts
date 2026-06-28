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

  // Remove sessions with no laps at all.
  data.sessions = data.sessions.filter((session) => {
    if (!session.lapstotal) return false;
    const totalLaps = session.lapstotal.reduce((a, b) => a + (b || 0), 0);
    return totalLaps > 0;
  });

  if (data.sessions.length === 0) {
    return { valid: false };
  }

  // Identify player indices that completed at least one lap.
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

export function getLeaderboard(resultData: RaceResultData): {
  position: number;
  name: string;
  car: string;
  laps: number;
  bestLapMs: number;
}[] {
  const session = resultData.sessions[0];
  if (!session) return [];

  const players = resultData.players ?? [];
  const lapstotal = session.lapstotal ?? [];
  const bestLaps = session.bestLaps ?? [];
  const raceResult = session.raceResult ?? [];

  const entries = players.map((player, index) => {
    const bestLap = bestLaps.find((bl) => bl.car === index);
    return {
      position: 0,
      name: player.name || `Pilote ${index + 1}`,
      car: player.car || '-',
      laps: lapstotal[index] ?? 0,
      bestLapMs: bestLap?.time ?? 0,
    };
  });

  if (raceResult.length > 0) {
    raceResult.forEach((carIndex, position) => {
      if (entries[carIndex]) {
        entries[carIndex].position = position + 1;
      }
    });
  } else {
    entries.sort((a, b) => b.laps - a.laps || a.bestLapMs - b.bestLapMs);
    entries.forEach((entry, index) => {
      entry.position = index + 1;
    });
  }

  return entries;
}
