import { Match, SportField } from '@/types/database';

export const DEFAULT_MATCH_COST = 80;
export const DEFAULT_MATCH_TIME = '20:30';

/**
 * Total cost of a match: the cost saved at closing (completed matches) or a custom cost set by an admin
 * for that match; otherwise the standard cost from Admin > Campi & Regole.
 * Old match docs that only stored the default 80 do NOT override the standard anymore.
 */
export function effectiveMatchCost(match: Match | null | undefined, standardCost?: number): number {
  const standard = Number(standardCost) || DEFAULT_MATCH_COST;
  if (match && (match.status === 'completed' || match.cost_override) && Number(match.total_cost) > 0) {
    return Number(match.total_cost);
  }
  return standard;
}

export function effectiveMatchTime(match: Match | null | undefined, standardTime?: string): string {
  if (match?.time_override && match.match_time) return match.match_time.slice(0, 5);
  return standardTime || DEFAULT_MATCH_TIME;
}

/** Label used for a field in the match location (same format everywhere) */
export function fieldLabel(field: SportField): string {
  return field.address ? `${field.name} (${field.address})` : field.name;
}

/** Location of a match: the one saved on the match, otherwise the admin's default field. */
export function effectiveMatchLocation(
  match: Match | null | undefined,
  fields: SportField[],
  defaultFieldId?: string
): string {
  if (match?.location) return match.location;
  const def = fields.find((f) => f.id === defaultFieldId) || fields[0];
  return def ? fieldLabel(def) : 'Centro Sportivo Calcetto';
}

/** A match lasts 1 hour; the MVP vote opens 45 minutes after the end (e.g. start 20:00 → vote at 21:45). */
export const MATCH_DURATION_MIN = 60;
export const MVP_VOTE_DELAY_MIN = 45;
/** The vote stays open 24 hours (Firestore rules accept votes up to 3 days after the match date). */
export const MVP_VOTE_OPEN_HOURS = 24;

export function mvpVotingWindow(date: string, matchTime: string): { opensAt: Date; closesAt: Date } {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (matchTime || DEFAULT_MATCH_TIME).split(':').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
  const opensAt = new Date(start.getTime() + (MATCH_DURATION_MIN + MVP_VOTE_DELAY_MIN) * 60000);
  const closesAt = new Date(opensAt.getTime() + MVP_VOTE_OPEN_HOURS * 3600000);
  return { opensAt, closesAt };
}
