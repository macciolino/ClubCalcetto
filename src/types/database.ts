export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Ruoli Applicativi di Sistema (distinti dai ruoli tattici in campo)
export type UserRole = 'admin' | 'player' | 'user';

// Posizioni Tattiche in Campo (Field Positions per il campetto e l'algoritmo)
export type FieldPosition = 'Portiere' | 'Difensore' | 'Esterno' | 'Punta';

export const FIELD_POSITIONS: FieldPosition[] = [
  'Portiere',
  'Difensore',
  'Esterno',
  'Punta',
];

export const FIELD_POSITION_ABBR: Record<FieldPosition, string> = {
  Portiere: 'POR',
  Difensore: 'DIF',
  Esterno: 'EST',
  Punta: 'PUN',
};

// Ordine canonico fisso delle statistiche per coerenza visiva su grafici e tabelle
export const STAT_CANONICAL_ORDER = [
  'Fisico',
  'Velocità',
  'Tiro',
  'Difesa',
  'Passaggio',
  'Resistenza',
  'Tecnica',
  'Dribbling',
] as const;

export type PresenceStatus = 'confirmed' | 'waitlist';

export interface Profile {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string;
  avatar_url: string | null;
  role: UserRole; // 'admin' | 'player'
  position?: FieldPosition; // 'Portiere' | 'Difensore' | 'Esterno' | 'Punta'
  is_guest: boolean;
  stats: Record<string, number>;
  overall_rating: number;
  matches_won?: number;
  matches_drawn?: number;
  matches_lost?: number;
  created_at: string;
  updated_at: string;
}

export interface StatCategory {
  id: string;
  name: string;
  label: string;
  default_value: number;
  created_at?: string;
}

export interface Match {
  id: string;
  match_date: string; // YYYY-MM-DD
  match_time: string; // HH:mm
  location: string;
  total_cost: number;
  status: 'open' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface Presence {
  id: string;
  date: string;
  player_id: string;
  status: PresenceStatus;
  order_index: number;
  created_at: string;
  profile?: Profile;
}

export interface GeneratedTeamRecord {
  id: string;
  date: string;
  team_white: Profile[];
  team_black: Profile[];
  white_score_avg: number;
  black_score_avg: number;
  created_at: string;
}

export interface AppSettings {
  official_match_date?: string;
}

/**
 * Ordina un insieme di chiavi statistiche secondo l'ordine canonico predefinito,
 * ponendo eventuali statistiche personalizzate aggiunte in fondo in ordine alfabetico.
 */
export function sortStatsByCanonicalOrder(statKeys: string[]): string[] {
  const canonicalList: string[] = [...STAT_CANONICAL_ORDER];
  const known = statKeys.filter((k) => canonicalList.includes(k));
  const unknown = statKeys.filter((k) => !canonicalList.includes(k)).sort();

  known.sort((a, b) => canonicalList.indexOf(a) - canonicalList.indexOf(b));
  return [...known, ...unknown];
}
