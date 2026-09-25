import { describe, expect, it } from 'vitest';
import {
  bestCleanLapForDriver,
  cleanupRaceResult,
  getLeaderboard,
  selectResultsEntries,
  selectResultsGroups,
  type RaceResultData,
} from './raceResultCleaner';

describe('bestCleanLapForDriver', () => {
  it('ignores cut laps across Practice, Qualifying and Race while keeping them in the JSON', () => {
    const result: RaceResultData = {
      players: [
        { name: 'Alice', car: 'car_a' },
        { name: 'Bob', car: 'car_b' },
      ],
      sessions: [
        { name: 'Practice', laps: [{ car: 0, time: 92000, cuts: 0 }] },
        { name: 'Qualifying', laps: [{ car: 0, time: 78000, cuts: 2 }] },
        {
          name: 'Race',
          laps: [
            { car: 0, time: 88000, cuts: 0 },
            { car: 0, time: 75000, cuts: 1 },
            { car: 1, time: 70000, cuts: 0 },
          ],
        },
      ],
    };

    expect(bestCleanLapForDriver(result, 'Alice', 'car_a')).toEqual({
      status: 'valid',
      timeMs: 88000,
    });
    expect(result.sessions[1].laps?.[0]).toEqual({ car: 0, time: 78000, cuts: 2 });
  });

  it('reports no valid score when every lap is cut', () => {
    const result: RaceResultData = {
      players: [{ name: 'Alice', car: 'car_a' }],
      sessions: [{ name: 'Race', laps: [{ car: 0, time: 75000, cuts: 1 }] }],
    };
    expect(bestCleanLapForDriver(result, 'Alice', 'car_a')).toEqual({ status: 'no-valid' });
  });

  it('uses the unique car match when the display name differs', () => {
    const result: RaceResultData = {
      players: [
        { name: 'AC Driver', car: 'car_a' },
        { name: 'Bob', car: 'car_b' },
      ],
      sessions: [{ name: 'Race', laps: [{ car: 0, time: 81000, cuts: 0 }] }],
    };
    expect(bestCleanLapForDriver(result, 'Customer', 'car_a')).toEqual({
      status: 'valid',
      timeMs: 81000,
    });
  });

  it('keeps a valid lap when lapstotal is missing or zero', () => {
    const result: RaceResultData = {
      players: [{ name: 'Alice' }, { name: 'Bob' }],
      sessions: [
        { name: 'Qualifying', lapstotal: [0, 0], laps: [{ car: 1, time: 83000, cuts: 0 }] },
      ],
    };
    const cleaned = cleanupRaceResult(result);
    expect(cleaned.valid).toBe(true);
    expect(bestCleanLapForDriver(cleaned.resultData!, 'Bob')).toEqual({
      status: 'valid',
      timeMs: 83000,
    });
  });

  it('never attributes another driver’s lap when identity is ambiguous', () => {
    const result: RaceResultData = {
      players: [
        { name: 'Alice', car: 'car_a' },
        { name: 'Bob', car: 'car_a' },
      ],
      sessions: [{ name: 'Race', laps: [{ car: 1, time: 71000, cuts: 0 }] }],
    };
    expect(bestCleanLapForDriver(result, 'Customer', 'car_a')).toEqual({ status: 'unmatched' });
  });

  it('marks a bestLaps-only format as unverifiable', () => {
    const result: RaceResultData = {
      players: [{ name: 'Alice' }],
      sessions: [{ name: 'Race', lapstotal: [1], bestLaps: [{ car: 0, time: 81000 }] }],
    };
    expect(bestCleanLapForDriver(result, 'Alice')).toEqual({ status: 'unverifiable' });
  });
});

describe('getLeaderboard', () => {
  it('uses the Race session when Practice and Qualifying precede it', () => {
    const result: RaceResultData = {
      players: [
        { name: 'Alice', car: 'car_a' },
        { name: 'Bob', car: 'car_b' },
      ],
      sessions: [
        { name: 'Practice', lapstotal: [4, 3], bestLaps: [{ car: 0, time: 90000 }] },
        { name: 'Qualifying', lapstotal: [2, 2], bestLaps: [{ car: 1, time: 80000 }] },
        {
          name: 'Race',
          lapstotal: [12, 10],
          raceResult: [1, 0],
          bestLaps: [
            { car: 0, time: 70000 },
            { car: 1, time: 68000 },
          ],
        },
      ],
    };

    expect(getLeaderboard(result).map((entry) => [entry.name, entry.position, entry.laps])).toEqual(
      [
        ['Bob', 1, 10],
        ['Alice', 2, 12],
      ],
    );
  });

  it('puts drivers without a valid lap after drivers with a valid lap', () => {
    const result: RaceResultData = {
      players: [{ name: 'Alice' }, { name: 'Bob' }],
      sessions: [{ name: 'Race', lapstotal: [3, 3], laps: [{ car: 0, time: 72000 }] }],
    };

    expect(getLeaderboard(result).map((entry) => entry.name)).toEqual(['Alice', 'Bob']);
  });

  it('does not use a cut lap or an unverified bestLaps entry as a score', () => {
    const result: RaceResultData = {
      players: [{ name: 'Alice' }],
      sessions: [
        {
          name: 'Race',
          laps: [{ car: 0, time: 70000, cuts: 1 }],
          bestLaps: [{ car: 0, time: 70000 }],
        },
      ],
    };
    expect(getLeaderboard(result)[0].bestLapMs).toBe(0);
  });

  it('keeps the race order when all recorded times are invalid', () => {
    const result: RaceResultData = {
      players: [
        { name: 'Alice', car: 'car_a' },
        { name: 'Bob', car: 'car_b' },
        { name: 'Chloé', car: 'car_c' },
      ],
      sessions: [{ name: 'Race', lapstotal: [0, 0, 0], raceResult: [2, 0, 1] }],
    };

    const cleaned = cleanupRaceResult(result);
    expect(cleaned.valid).toBe(true);
    expect(
      getLeaderboard(cleaned.resultData!).map((entry) => [
        entry.name,
        entry.position,
        entry.bestLapMs,
      ]),
    ).toEqual([
      ['Chloé', 1, 0],
      ['Alice', 2, 0],
      ['Bob', 3, 0],
    ]);
  });

  it('creates a zero-time fallback leaderboard from the entry list', () => {
    const result: RaceResultData = {
      players: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Chloé' }],
      sessions: [{ name: 'Race', lapstotal: [0, 0, 0] }],
    };

    const cleaned = cleanupRaceResult(result);
    expect(cleaned.valid).toBe(true);
    expect(getLeaderboard(cleaned.resultData!).map((entry) => entry.position)).toEqual([1, 2, 3]);
    expect(getLeaderboard(cleaned.resultData!).every((entry) => entry.bestLapMs === 0)).toBe(true);
  });

  it('keeps the podium and the immediate neighbours of a driver deep in the field', () => {
    const entries = Array.from({ length: 65 }, (_, index) => ({
      position: index + 1,
      name: `Driver ${index + 1}`,
      car: 'car',
      laps: 10,
      bestLapMs: 90000,
    }));

    expect(selectResultsEntries(entries, 64).map((entry) => entry.position)).toEqual([
      1, 2, 3, 63, 64, 65,
    ]);
  });

  it('does not duplicate podium rows when the driver is already on the podium', () => {
    const entries = Array.from({ length: 6 }, (_, index) => ({
      position: index + 1,
      name: `Driver ${index + 1}`,
      car: 'car',
      laps: 10,
      bestLapMs: 90000,
    }));

    expect(selectResultsEntries(entries, 3).map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
  });

  it('keeps podium and context groups separate for every edge position', () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      position: index + 1,
      name: `Driver ${index + 1}`,
      car: 'car',
      laps: 10,
      bestLapMs: 90000,
    }));

    expect(selectResultsGroups(entries, 1).context.map((entry) => entry.position)).toEqual([]);
    expect(selectResultsGroups(entries, 2).context.map((entry) => entry.position)).toEqual([]);
    expect(selectResultsGroups(entries, 3).context.map((entry) => entry.position)).toEqual([4]);
    expect(selectResultsGroups(entries, 4).context.map((entry) => entry.position)).toEqual([4, 5]);
    expect(selectResultsGroups(entries, 5).context.map((entry) => entry.position)).toEqual([4, 5]);
  });
});
