import { DEFAULT_BASE_CATEGORIES } from '@/lib/utils/defaultCategories';
import type { StatCategory } from '@/types/database';

/**
 * "Radar Base" (self-assessment): the technical attributes every NEW account sets once, right after signing up, before
 * joining any league. It is the starting point of the player on the platform: saved on the global profile
 * (`profiles/{id}.baseRadar`) and copied on the card of every league the person joins, where the values count as
 * UNCONFIRMED until a president or collaborator of that league approves them (after the first match).
 * Shared by the app and the server.
 */
export const BASE_RADAR_DEFAULT = 6;

/** The platform's base parameters, every one starting at 6 (the person can change it or just continue). */
export const BASE_RADAR_CATEGORIES: StatCategory[] = DEFAULT_BASE_CATEGORIES.map((c) => ({ ...c, default_value: BASE_RADAR_DEFAULT }));

export const BASE_RADAR_NAMES: string[] = BASE_RADAR_CATEGORIES.map((c) => c.name);

export const defaultBaseRadar = (): Record<string, number> => Object.fromEntries(BASE_RADAR_NAMES.map((n) => [n, BASE_RADAR_DEFAULT]));

/** A valid Radar Base (an integer 1–10 for EVERY base parameter), or null. Anything else in the object is dropped. */
export function cleanBaseRadar(input: unknown): Record<string, number> | null {
  if (!input || typeof input !== 'object') return null;
  const out: Record<string, number> = {};
  for (const name of BASE_RADAR_NAMES) {
    const v = Number((input as Record<string, unknown>)[name]);
    if (!Number.isInteger(v) || v < 1 || v > 10) return null;
    out[name] = v;
  }
  return out;
}

/** Average of the values, one decimal (the OVR of the radar on the 1–10 scale). */
export function radarOverall(stats: Record<string, number>): number {
  const values = Object.values(stats);
  return values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : BASE_RADAR_DEFAULT;
}

/**
 * Starting parameters of a NEW card in a league: for each of the league's parameters, the value carried from the last
 * card the person had in another league (more reliable: a president already reviewed it), otherwise their Radar Base,
 * otherwise the parameter's default. Values outside 1–10 are ignored.
 */
export function buildCardStats(
  categories: { name: unknown; default_value?: number }[],
  carried?: Record<string, number> | null,
  radar?: Record<string, number> | null
): { stats: Record<string, number>; source: 'league' | 'radar' | 'default' } {
  const valid = (v: unknown) => {
    const n = Number(v);
    return n >= 1 && n <= 10 ? n : null;
  };
  const stats: Record<string, number> = {};
  let source: 'league' | 'radar' | 'default' = 'default';
  categories.forEach((c) => {
    const name = String(c.name);
    const fromLeague = valid(carried?.[name]);
    const fromRadar = valid(radar?.[name]);
    if (fromLeague !== null) {
      stats[name] = fromLeague;
      source = 'league';
    } else if (fromRadar !== null) {
      stats[name] = fromRadar;
      if (source === 'default') source = 'radar';
    } else {
      stats[name] = Number(c.default_value ?? BASE_RADAR_DEFAULT);
    }
  });
  return { stats, source };
}
