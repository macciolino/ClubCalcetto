import { Presence } from '@/types/database';

/** Pure ranking of presences, shared by the app and the server (API routes). */
/** Starters of a 5vs5 (default). The real number depends on the day's format: see maxPlayersFor() in matchFormat. */
export const MAX_STARTERS = 10;

function createdMillis(p: Presence): number {
  const t = new Date(p.created_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function rankDayPresences(dayPresences: Presence[], maxStarters: number = MAX_STARTERS): Presence[] {
  const legacy = dayPresences
    .filter((p) => typeof p.joined_ms !== 'number')
    .sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999) || createdMillis(a) - createdMillis(b));
  const modern = dayPresences
    .filter((p) => typeof p.joined_ms === 'number')
    .sort((a, b) => (a.joined_ms as number) - (b.joined_ms as number) || a.id.localeCompare(b.id));
  const queue = [...legacy, ...modern];
  const ordered = [
    ...queue.filter((p) => p.admin_override === 'starter'),
    ...queue.filter((p) => !p.admin_override),
    ...queue.filter((p) => p.admin_override === 'waitlist'),
  ];
  return ordered.map((p, idx) => ({
    ...p,
    status: idx < maxStarters ? 'confirmed' : 'waitlist',
    order_index: idx + 1,
  }));
}

/** Ranks a list that may contain several dates (each date ranked on its own, with its own number of starters). */
export function rankPresencesByDate(presences: Presence[], maxFor: (date: string) => number = () => MAX_STARTERS): Presence[] {
  const byDate = new Map<string, Presence[]>();
  for (const p of presences) {
    const list = byDate.get(p.date) || [];
    list.push(p);
    byDate.set(p.date, list);
  }
  return Array.from(byDate.entries()).flatMap(([date, list]) => rankDayPresences(list, maxFor(date)));
}


/**
 * For each week, the day that was complete FIRST (moment its last starter signed up; 10 for a 5vs5, 14 for a 7vs7…).
 * Shown with 🥇 in Presenze and in Admin → Match. Days are { dateString, dateObj }.
 */
export function firstToTenByWeek(
  days: { dateString: string; dateObj: Date }[],
  presences: Presence[],
  maxFor: (date: string) => number = () => MAX_STARTERS
): Set<string> {
  const reachedAt = (date: string): number | null => {
    const starters = presences.filter((p) => p.date === date && p.status === 'confirmed');
    if (starters.length < maxFor(date)) return null;
    return Math.max(
      ...starters.map((p) =>
        typeof p.joined_ms === 'number' ? p.joined_ms : Date.parse(p.created_at) || Number.MAX_SAFE_INTEGER
      )
    );
  };
  const weekOf = (d: Date) => {
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
  };
  const best = new Map<string, { date: string; at: number }>();
  days.forEach((day) => {
    const at = reachedAt(day.dateString);
    if (at === null) return;
    const wk = weekOf(day.dateObj);
    const cur = best.get(wk);
    if (!cur || at < cur.at) best.set(wk, { date: day.dateString, at });
  });
  return new Set(Array.from(best.values()).map((b) => b.date));
}
