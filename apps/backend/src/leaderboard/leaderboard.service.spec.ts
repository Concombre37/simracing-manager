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
});
