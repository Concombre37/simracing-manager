import { describe, expect, it } from 'vitest';
import { bestCleanLap } from './leaderboard.service';

describe('bestCleanLap', () => {
  it('keeps the lap belonging to the session owner', () => {
    const result = {
      players: [{ name: 'Hervé boi' }, { name: 'Gaelle BOI' }],
      sessions: [
        {
          name: 'Practice',
          laps: [
            { car: 0, time: 214374, cuts: 0 },
            { car: 1, time: 175381, cuts: 0 },
          ],
        },
      ],
    };

    expect(bestCleanLap(result, 'Hervé boi')).toEqual({
      timeMs: 214370,
      sessionType: 'Practice',
    });
    expect(bestCleanLap(result, 'Gaelle BOI')).toEqual({
      timeMs: 175380,
      sessionType: 'Practice',
    });
  });

  it('preserves legacy results that do not contain a player list', () => {
    const result = {
      sessions: [
        { name: 'Practice', laps: [{ car: 4, time: 90001, cuts: 0 }] },
      ],
    };

    expect(bestCleanLap(result, 'Pilote')).toEqual({
      timeMs: 90000,
      sessionType: 'Practice',
    });
  });

  it('resolves the owner correctly when a session contains many players', () => {
    const result = {
      players: Array.from({ length: 10 }, (_, index) => ({
        name: `Pilote ${index + 1}`,
      })),
      sessions: [
        {
          name: 'Practice',
          laps: [
            { car: 2, time: 120000, cuts: 0 },
            { car: 7, time: 98000, cuts: 0 },
            { car: 9, time: 105000, cuts: 0 },
          ],
        },
      ],
    };

    expect(bestCleanLap(result, 'Pilote 8')).toEqual({
      timeMs: 98000,
      sessionType: 'Practice',
    });
  });
});
