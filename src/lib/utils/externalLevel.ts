import { BASE_RADAR_DEFAULT, cleanBaseRadar, radarOverall } from '@/lib/utils/baseRadar';

/**
 * The level of an EXTERNAL player ("Spot" from the board, docs/ARCHITECTURE.md §3.5) for the teams of ONE match of a
 * league that is not theirs. They have no card there and nobody asks them to confirm anything: the level comes from
 * what the platform already knows about the account, in this order:
 *   1. the average of their radars already CONFIRMED in their own leagues, together with the quick ratings other
 *      leagues left after matches they played as guests (`ratings`);
 *   2. their Radar Base (the one set at sign-up on the global profile);
 *   3. nothing: the neutral level of the club (6), as for every other new player.
 * Pure: tests/unit/externalLevel.test.ts.
 */
export type ExternalLevelSource = 'leagues' | 'radar' | 'default';

export interface ExternalLevel {
  from: ExternalLevelSource;
  stats?: Record<string, number>;
  overall_rating?: number;
  /** How many radars the average is made of (0 for radar / default) */
  count: number;
}

const valid = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
};

/** Per parameter, the average of the radars that have it (one decimal); parameters nobody has are left out. */
export function averageRadars(radars: Record<string, number>[]): Record<string, number> {
  const sums: Record<string, { sum: number; n: number }> = {};
  radars.forEach((r) =>
    Object.entries(r || {}).forEach(([name, v]) => {
      const x = valid(v);
      if (x === null) return;
      const s = (sums[name] ||= { sum: 0, n: 0 });
      s.sum += x;
      s.n += 1;
    })
  );
  return Object.fromEntries(Object.entries(sums).map(([name, s]) => [name, Number((s.sum / s.n).toFixed(1))]));
}

export function externalLevel(input: {
  /** `profiles.baseRadar` of the account (any value; only a complete valid radar counts) */
  radar?: unknown;
  /** Stats of the account's cards in OTHER leagues that a manager confirmed (or that predate the review flow) */
  confirmedCards?: Record<string, number>[];
  /** Quick ratings left by other leagues after a match the person played as a guest */
  ratings?: Record<string, number>[];
}): ExternalLevel {
  const fromLeagues = [...(input.confirmedCards || []), ...(input.ratings || [])].filter((r) => Object.keys(averageRadars([r])).length > 0);
  if (fromLeagues.length > 0) {
    const stats = averageRadars(fromLeagues);
    return { from: 'leagues', stats, overall_rating: radarOverall(stats), count: fromLeagues.length };
  }
  const radar = cleanBaseRadar(input.radar);
  if (radar) return { from: 'radar', stats: radar, overall_rating: radarOverall(radar), count: 0 };
  return { from: 'default', overall_rating: BASE_RADAR_DEFAULT, count: 0 };
}
