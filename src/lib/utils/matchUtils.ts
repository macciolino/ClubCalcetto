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
