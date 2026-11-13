import { AppSettings, Match, MatchFormat, SportField } from '@/types/database';
import { FORMAT_INFO, fieldFormatCost, standardFormatCost } from '@/lib/utils/matchFormat';

export const DEFAULT_MATCH_COST = 80;
export const DEFAULT_MATCH_TIME = '20:30';

/**
 * Total cost of a match: the cost saved at closing (completed matches) or a custom cost set by an admin
 * for that match; otherwise the cost of the chosen field, otherwise the standard cost (Impostazioni → Campi e costi).
 * Old match docs that only stored the default 80 do NOT override the standard anymore.
 */
export function effectiveMatchCost(match: Match | null | undefined, standardCost?: number, fieldCost?: number): number {
  // Senza un costo deciso per la partita: il costo del campo scelto, altrimenti quello standard del club
  const standard = Number(fieldCost) || Number(standardCost) || DEFAULT_MATCH_COST;
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

/**
 * Cost of the field where the match is played: the field of `location` (or of the match), otherwise the default
 * field. undefined when that field has no cost of its own (then the club's standard cost applies).
 */
export function fieldCostFor(
  match: Match | null | undefined,
  fields: SportField[],
  defaultFieldId?: string,
  location?: string,
  format: MatchFormat = '5v5'
): number | undefined {
  return fieldFormatCost(matchField(match, fields, defaultFieldId, location), format);
}

/** The field where the match is played: the one of `location` (or of the match), otherwise the default field. */
export function matchField(
  match: Match | null | undefined,
  fields: SportField[],
  defaultFieldId?: string,
  location?: string
): SportField | undefined {
  const loc = location ?? match?.location;
  const byLocation = loc ? fields.find((f) => fieldLabel(f) === loc || f.name === loc) : undefined;
  return byLocation || (loc ? undefined : fields.find((f) => f.id === defaultFieldId) || fields[0]);
}

/**
 * Club standard cost for a format. Without one set for 7vs7 / 8vs8 / 11vs11, the 5vs5 standard is scaled to the
 * number of players (e.g. €80 for 10 → €112 for 14), so the quota a testa stays the same.
 */
export function standardCostFor(settings: Pick<AppSettings, 'standard_total_cost' | 'standard_costs'> | null | undefined, format: MatchFormat): number {
  const own = standardFormatCost(settings, format);
  if (own) return own;
  const base = Number(settings?.standard_total_cost) || DEFAULT_MATCH_COST;
  return Math.round((base / 10) * FORMAT_INFO[format].players * 100) / 100;
}

/** Total cost of a match of a given format: match override → field cost for the format → club standard for the format. */
export function matchCostFor(
  match: Match | null | undefined,
  settings: Pick<AppSettings, 'standard_total_cost' | 'standard_costs' | 'default_field_id'> | null | undefined,
  fields: SportField[],
  format: MatchFormat,
  location?: string
): number {
  return effectiveMatchCost(match, standardCostFor(settings, format), fieldCostFor(match, fields, settings?.default_field_id, location, format));
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
