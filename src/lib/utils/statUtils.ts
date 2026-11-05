import { StatCategory, STAT_DETAILS } from '@/types/database';

/**
 * 'Tecnica' was replaced by 'Visione'. Old data is NOT rewritten:
 *  - a 'Tecnica' category is shown as 'Visione' (same id), or hidden if 'Visione' already exists;
 *  - a player without a 'Visione' value shows their old 'Tecnica' value (see getStatValue).
 */
export function normalizeCategories(categories: StatCategory[]): StatCategory[] {
  const hasVisione = categories.some((c) => c.name === 'Visione');
  return categories
    .filter((c) => !(hasVisione && c.name === 'Tecnica'))
    .map((c) =>
      c.name === 'Tecnica'
        ? { ...c, name: 'Visione', label: STAT_DETAILS.Visione?.label || 'Visione di gioco / Tattica' }
        : c
    );
}

/** Value of a stat for a player, with the Tecnica -> Visione fallback and a default. */
export function getStatValue(
  stats: Record<string, number> | undefined | null,
  name: string,
  fallback = 6
): number {
  const v = stats?.[name] ?? (name === 'Visione' ? stats?.Tecnica : undefined);
  return typeof v === 'number' ? v : fallback;
}
