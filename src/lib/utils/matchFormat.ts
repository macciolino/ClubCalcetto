import { FieldPosition, MatchFormat, SportField } from '@/types/database';

export type { MatchFormat };

/**
 * Match formats. Every count that used to be "10 starters / 5 per team" comes from here.
 * Each match day has its own format, chosen by an admin (settings/match_formats, `days[date]`);
 * a day without a choice is 5vs5. Archived matches keep their teams as they were played.
 */
export const MATCH_FORMATS: MatchFormat[] = ['5v5', '7v7', '8v8', '11v11'];
export const DEFAULT_MATCH_FORMAT: MatchFormat = '5v5';

export interface FormatInfo {
  perTeam: number;
  players: number;
  /** "5vs5" */
  label: string;
  /** Formations, the first is the default */
  formations: string[];
}

export const FORMAT_INFO: Record<MatchFormat, FormatInfo> = {
  '5v5': { perTeam: 5, players: 10, label: '5vs5', formations: ['1-1-2-1'] },
  '7v7': { perTeam: 7, players: 14, label: '7vs7', formations: ['1-2-3-1', '1-3-2-1'] },
  '8v8': { perTeam: 8, players: 16, label: '8vs8', formations: ['1-3-3-1', '1-2-3-2'] },
  '11v11': { perTeam: 11, players: 22, label: '11vs11', formations: ['1-4-3-3', '1-4-4-2'] },
};

export const isMatchFormat = (v: unknown): v is MatchFormat => typeof v === 'string' && v in FORMAT_INFO;

/** What an admin chose for a day */
export interface DayFormat {
  format: MatchFormat;
  formation?: string;
  updated_at?: string;
  updated_by?: string;
}
export type DayFormats = Record<string, DayFormat>;

/** Format and formation of a day (5vs5 1-1-2-1 when nothing was chosen or the value is not valid). */
export function dayFormat(formats: DayFormats | null | undefined, date: string): { format: MatchFormat; formation: string } {
  const d = formats?.[date];
  const format = isMatchFormat(d?.format) ? d!.format : DEFAULT_MATCH_FORMAT;
  const list = FORMAT_INFO[format].formations;
  const formation = d?.formation && list.includes(d.formation) ? d.formation : list[0];
  return { format, formation };
}

/** Starters of a day = players of its format. */
export const maxPlayersFor = (formats: DayFormats | null | undefined, date: string): number =>
  FORMAT_INFO[dayFormat(formats, date).format].players;

/** Format of teams already made (archived or saved): from how many players are in a team. */
export function formatFromTeamSize(perTeam: number): MatchFormat {
  return MATCH_FORMATS.find((f) => FORMAT_INFO[f].perTeam === perTeam) || DEFAULT_MATCH_FORMAT;
}

/**
 * Proposal to an admin when many signed up: the BIGGEST format that the sign-ups can fill and that is bigger
 * than the current one (e.g. 5vs5 with 17 sign-ups → 8vs8). null = nothing to propose.
 */
export function proposedFormat(current: MatchFormat, signedUp: number): MatchFormat | null {
  const now = FORMAT_INFO[current].players;
  const fits = MATCH_FORMATS.filter((f) => FORMAT_INFO[f].players > now && FORMAT_INFO[f].players <= signedUp);
  return fits.length ? fits[fits.length - 1] : null;
}

// ---------- cost of a match by format ----------

/** Cost of a field for a format: 5vs5 = `cost`; others = `costs[format]`. undefined = not set / not hosted. */
export function fieldFormatCost(field: SportField | undefined, format: MatchFormat): number | undefined {
  if (!field) return undefined;
  const v = format === '5v5' ? field.cost : field.costs?.[format];
  return Number(v) > 0 ? Number(v) : undefined;
}

/** A field hosts a format when it has a cost for it (5vs5 is always possible). */
export const fieldHostsFormat = (field: SportField | undefined, format: MatchFormat): boolean =>
  !field || format === '5v5' || fieldFormatCost(field, format) !== undefined;

/** Club standard cost for a format (5vs5 = standard_total_cost). */
export function standardFormatCost(
  settings: { standard_total_cost?: number; standard_costs?: Partial<Record<MatchFormat, number>> } | null | undefined,
  format: MatchFormat
): number | undefined {
  const v = format === '5v5' ? settings?.standard_total_cost : settings?.standard_costs?.[format as Exclude<MatchFormat, '5v5'>];
  return Number(v) > 0 ? Number(v) : undefined;
}

/** "€8" / "€8,50" a testa */
export function perHead(total: number, players: number): string {
  const v = Number(total || 0) / Math.max(1, players);
  return v.toFixed(v % 1 ? 2 : 0).replace('.', ',');
}

// ---------- formations on the pitch ----------

/**
 * One place of a formation. x: 0 (left) – 100 (right); y: 0 – 50 = own half of the WHITE team (goal at the top).
 * The black team is mirrored (y → 100 − y). `role` = which player role fits that place best.
 */
export interface FormationSlot {
  label: string;
  role: FieldPosition;
  x: number;
  y: number;
}

const S = (label: string, role: FieldPosition, x: number, y: number): FormationSlot => ({ label, role, x, y });

export const FORMATIONS: Record<string, FormationSlot[]> = {
  // 5vs5 — rombo (stesse posizioni di sempre)
  '5v5:1-1-2-1': [
    S('POR', 'Portiere', 50, 7.5),
    S('DIF', 'Difensore', 50, 22),
    S('EST SX', 'Esterno', 19, 33),
    S('EST DX', 'Esterno', 81, 33),
    S('PUN', 'Punta', 50, 42),
  ],
  '7v7:1-2-3-1': [
    S('POR', 'Portiere', 50, 6),
    S('DIF SX', 'Difensore', 30, 17),
    S('DIF DX', 'Difensore', 70, 17),
    S('EST SX', 'Esterno', 13, 30),
    S('CEN', 'Centrocampista', 50, 29),
    S('EST DX', 'Esterno', 87, 30),
    S('PUN', 'Punta', 50, 42),
  ],
  '7v7:1-3-2-1': [
    S('POR', 'Portiere', 50, 6),
    S('DIF SX', 'Difensore', 17, 17),
    S('DC', 'Difensore', 50, 16),
    S('DIF DX', 'Difensore', 83, 17),
    S('CEN SX', 'Centrocampista', 32, 29),
    S('CEN DX', 'Centrocampista', 68, 29),
    S('PUN', 'Punta', 50, 42),
  ],
  '8v8:1-3-3-1': [
    S('POR', 'Portiere', 50, 5),
    S('DIF SX', 'Difensore', 17, 17),
    S('DC', 'Difensore', 50, 16.5),
    S('DIF DX', 'Difensore', 83, 17),
    S('EST SX', 'Esterno', 13, 29.5),
    S('CEN', 'Centrocampista', 50, 29),
    S('EST DX', 'Esterno', 87, 29.5),
    S('PUN', 'Punta', 50, 42),
  ],
  '8v8:1-2-3-2': [
    S('POR', 'Portiere', 50, 5.5),
    S('DIF SX', 'Difensore', 30, 16),
    S('DIF DX', 'Difensore', 70, 16),
    S('EST SX', 'Esterno', 13, 28),
    S('CEN', 'Centrocampista', 50, 27.5),
    S('EST DX', 'Esterno', 87, 28),
    S('ATT SX', 'Punta', 32, 41),
    S('ATT DX', 'Punta', 68, 41),
  ],
  '11v11:1-4-3-3': [
    S('POR', 'Portiere', 50, 4.5),
    S('TS', 'Difensore', 12, 15),
    S('DC', 'Difensore', 37, 13.5),
    S('DC', 'Difensore', 63, 13.5),
    S('TD', 'Difensore', 88, 15),
    S('CC', 'Centrocampista', 24, 27),
    S('MED', 'Centrocampista', 50, 25.5),
    S('CC', 'Centrocampista', 76, 27),
    S('ALA SX', 'Esterno', 13, 39.5),
    S('PUN', 'Punta', 50, 42.5),
    S('ALA DX', 'Esterno', 87, 39.5),
  ],
  '11v11:1-4-4-2': [
    S('POR', 'Portiere', 50, 4.5),
    S('TS', 'Difensore', 12, 15),
    S('DC', 'Difensore', 37, 13.5),
    S('DC', 'Difensore', 63, 13.5),
    S('TD', 'Difensore', 88, 15),
    S('ES', 'Esterno', 12, 28),
    S('CC', 'Centrocampista', 37, 26.5),
    S('CC', 'Centrocampista', 63, 26.5),
    S('ED', 'Esterno', 88, 28),
    S('ATT', 'Punta', 34, 41.5),
    S('ATT', 'Punta', 66, 41.5),
  ],
};

/** Places of a formation, in the order players are stored in a team (index 0 = goalkeeper). */
export function formationSlots(format: MatchFormat, formation?: string): FormationSlot[] {
  const list = FORMAT_INFO[format].formations;
  const f = formation && list.includes(formation) ? formation : list[0];
  return FORMATIONS[`${format}:${f}`];
}

/** Places for teams of a given size (archived matches, teams saved before a format change). */
export function slotsForTeamSize(perTeam: number, formation?: string): FormationSlot[] {
  return formationSlots(formatFromTeamSize(perTeam), formation);
}
