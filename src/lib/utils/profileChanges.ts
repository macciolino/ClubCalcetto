import type { Profile, StatCategory } from '@/types/database';
import { getStatValue } from '@/lib/utils/statUtils';

/**
 * C1 — what an admin really changed in the player window, compared with the copy opened at the start.
 * Only these fields are saved: whatever changed meanwhile in the database (W/D/L of a match just closed,
 * self-assessment / review / return flags written by the server, untouched parameters) is left alone.
 */
export function profileChanges(
  before: Profile,
  after: Pick<Profile, 'full_name' | 'position' | 'avatar_url' | 'overall_rating' | 'matches_won' | 'matches_drawn' | 'matches_lost'>,
  stats: Record<string, number>,
  categories: Pick<StatCategory, 'name' | 'default_value'>[]
): { fields: Partial<Profile>; stats: Record<string, number> } {
  const fields: Partial<Profile> = {};
  if (after.full_name !== before.full_name) fields.full_name = after.full_name;
  if (after.position !== before.position) fields.position = after.position;
  if ((after.avatar_url || null) !== (before.avatar_url || null)) fields.avatar_url = after.avatar_url || null;
  if (after.overall_rating !== before.overall_rating) fields.overall_rating = after.overall_rating;
  if (after.matches_won !== (before.matches_won ?? 0)) fields.matches_won = after.matches_won;
  if (after.matches_drawn !== (before.matches_drawn ?? 0)) fields.matches_drawn = after.matches_drawn;
  if (after.matches_lost !== (before.matches_lost ?? 0)) fields.matches_lost = after.matches_lost;
  const changedStats: Record<string, number> = {};
  categories.forEach((cat) => {
    const old = Number(getStatValue(before.stats, cat.name, cat.default_value ?? 6));
    if (stats[cat.name] !== undefined && stats[cat.name] !== old) changedStats[cat.name] = stats[cat.name];
  });
  return { fields, stats: changedStats };
}
