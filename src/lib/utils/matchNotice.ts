import { MATCH_FORMATS } from '@/lib/utils/matchFormat';
import type { MatchFormat } from '@/types/database';
import {
  NOTICE_ROLES,
  SHIRT_COLORS,
  type MatchNotice,
  type MatchNoticeInput,
  type NoticeRole,
  type NoticeStatus,
  type ShirtColor,
} from '@/types/matchNotice';

/** Pure rules of the "Cerco giocatore" board (shared by server and tests). See docs/ARCHITECTURE.md §3.5. */

export const MAX_SPOTS = 22;
const MAX_COST = 10000;
/** Fields a manager may change after creating the notice (never the league or the match it refers to) */
export const EDITABLE_NOTICE_KEYS = [
  'dateTime',
  'locationName',
  'address',
  'format',
  'totalFieldCost',
  'costPerPlayer',
  'spotsNeeded',
  'roleNeeded',
  'shirtColor',
  'notes',
] as const;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const money = (v: unknown) => {
  const n = Number(v);
  return typeof v !== 'boolean' && v !== '' && v !== null && Number.isFinite(n) && n >= 0 && n <= MAX_COST
    ? Math.round(n * 100) / 100
    : null;
};

/** Validates a full notice as the app sends it; null = not acceptable. */
export function cleanNoticeInput(raw: unknown): MatchNoticeInput | null {
  const b = (raw || {}) as Record<string, unknown>;
  const matchId = str(b.matchId, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(matchId)) return null;
  const dateTime = str(b.dateTime, 40);
  const when = Date.parse(dateTime);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(dateTime) || !Number.isFinite(when)) return null;
  const locationName = str(b.locationName, 80);
  const address = str(b.address, 160);
  if (!locationName || !address) return null;
  if (!MATCH_FORMATS.includes(b.format as MatchFormat)) return null;
  const totalFieldCost = money(b.totalFieldCost);
  const costPerPlayer = money(b.costPerPlayer);
  if (totalFieldCost === null || costPerPlayer === null || costPerPlayer > totalFieldCost) return null;
  const spotsNeeded = Number(b.spotsNeeded);
  if (!Number.isInteger(spotsNeeded) || spotsNeeded < 1 || spotsNeeded > MAX_SPOTS) return null;
  if (!NOTICE_ROLES.includes(b.roleNeeded as NoticeRole)) return null;
  if (!SHIRT_COLORS.includes(b.shirtColor as ShirtColor)) return null;
  const notes = str(b.notes, 300);
  return {
    matchId,
    dateTime: new Date(when).toISOString(),
    locationName,
    address,
    format: b.format as MatchFormat,
    totalFieldCost,
    costPerPlayer,
    spotsNeeded,
    roleNeeded: b.roleNeeded as NoticeRole,
    shirtColor: b.shirtColor as ShirtColor,
    ...(notes ? { notes } : {}),
  };
}

/** The notice with a manager's changes applied (only editable keys), validated again as a whole. */
export function patchNotice(current: MatchNotice, raw: unknown): MatchNoticeInput | null {
  const patch = (raw || {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { matchId: current.matchId };
  EDITABLE_NOTICE_KEYS.forEach((k) => (next[k] = k in patch ? patch[k] : current[k]));
  return cleanNoticeInput(next);
}

/** Quick filters of the board: when (any day, today, next 7 days), format, role. */
export interface NoticeFilters {
  when: 'all' | 'today' | 'week';
  format: MatchFormat | 'all';
  role: NoticeRole | 'all';
}
export const NO_FILTERS: NoticeFilters = { when: 'all', format: 'all', role: 'all' };

const romeDay = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });

/**
 * Notices that match the filters. A role filter keeps the notices for that role AND those open to any role
 * (a goalkeeper can take an "any role" spot).
 */
export function filterNotices<T extends Pick<MatchNotice, 'dateTime' | 'format' | 'roleNeeded'>>(list: T[], f: NoticeFilters, now: number): T[] {
  const today = romeDay(now);
  const weekEnd = now + 7 * 86_400_000;
  return list.filter((n) => {
    const at = Date.parse(n.dateTime);
    if (f.when === 'today' && romeDay(at) !== today) return false;
    if (f.when === 'week' && at > weekEnd) return false;
    if (f.format !== 'all' && n.format !== f.format) return false;
    if (f.role !== 'all' && n.roleNeeded !== f.role && n.roleNeeded !== 'ANY') return false;
    return true;
  });
}

/** Kick-off typed in the form (Italian day and time, `YYYY-MM-DD` + `HH:mm`) as an ISO instant; '' if not valid. */
export function romeToIso(date: string, time: string): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return '';
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  // What Rome's clock shows at that UTC instant: the difference is Rome's offset that day (+1h or +2h)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value])
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess - (wall - guess)).toISOString();
}

/** The Italian time (`HH:mm`) of an ISO instant, to fill the form when editing. */
export function romeTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/**
 * Status after the spots change: full → CLOSED ('full'); an automatic close reopens when a manager adds spots.
 * A manual close and a cancellation never change by themselves.
 */
export function statusFor(
  spotsFilled: number,
  spotsNeeded: number,
  current: { status: NoticeStatus; closedReason?: 'full' | 'manual' }
): { status: NoticeStatus; closedReason?: 'full' | 'manual' } {
  if (current.status === 'CANCELLED') return { status: 'CANCELLED' };
  if (current.status === 'CLOSED' && current.closedReason === 'manual') return { status: 'CLOSED', closedReason: 'manual' };
  return spotsFilled >= spotsNeeded ? { status: 'CLOSED', closedReason: 'full' } : { status: 'OPEN' };
}
