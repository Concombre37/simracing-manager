import { describe, expect, it } from 'vitest';
import { getLeaderboard, selectResultsEntries, type RaceResultData } from './raceResultCleaner';

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
});
