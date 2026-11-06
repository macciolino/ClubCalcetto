import { Presence } from '@/types/database';

/** Pure ranking of presences, shared by the app and the server (API routes). */
export const MAX_STARTERS = 10;

function createdMillis(p: Presence): number {
  const t = new Date(p.created_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function rankDayPresences(dayPresences: Presence[]): Presence[] {
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
    status: idx < MAX_STARTERS ? 'confirmed' : 'waitlist',
    order_index: idx + 1,
  }));
}

/** Ranks a list that may contain several dates (each date ranked on its own). */
export function rankPresencesByDate(presences: Presence[]): Presence[] {
  const byDate = new Map<string, Presence[]>();
  for (const p of presences) {
    const list = byDate.get(p.date) || [];
    list.push(p);
    byDate.set(p.date, list);
  }
  return Array.from(byDate.values()).flatMap(rankDayPresences);
}

