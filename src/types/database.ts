export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Ruoli Applicativi di Sistema (distinti dai ruoli tattici in campo)
export type UserRole = 'admin' | 'player';

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

// ==========================================
// 8 PARAMETRI OTTAGONO OTTIMIZZATI PER CALCETTO 5v5
// ==========================================
export interface StatDetail {
  code: string;
  name: string;
  label: string;
  description: string;
}

export const STAT_DETAILS: Record<string, StatDetail> = {
  Velocità: {
    code: 'VEL',
    name: 'Velocità',
    label: 'Velocità / Scatto breve',
    description: 'Rapidità nei primi metri, accelerazione e reattività nelle transizioni offensive e difensive tipiche del calcetto.',
  },
  Fisico: {
    code: 'FIS',
    name: 'Fisico',
    label: 'Fisico / Protezione palla e contrasti',
    description: 'Forza nei contrasti ruvidi, tenuta nei duelli fisici corpo a corpo e capacità di difendere palla spalle alla porta.',
  },
  Resistenza: {
    code: 'RES',
    name: 'Resistenza',
    label: 'Resistenza / Fiato',
    description: 'Capacità polmonare di mantenere ritmi intensi per tutti i 60 minuti senza calare nel finale di partita.',
  },
  Tiro: {
    code: 'TIR',
    name: 'Tiro',
    label: 'Tiro / Conclusione',
    description: 'Precisione balistica, potenza di collo/piattone, tiro di punta improvviso e freddezza davanti al portiere.',
  },
  Passaggio: {
    code: 'PAS',
    name: 'Passaggio',
    label: 'Passaggio / Sponde',
    description: 'Precisione nelle sponde rapide a un tocco, verticalizzazioni filtranti rasoterra e cambi di fronte nello stretto.',
  },
  Dribbling: {
    code: 'DRI',
    name: 'Dribbling',
    label: 'Dribbling / Controllo palla nello stretto',
    description: 'Agilità con la suola, cambi di direzione repentini e capacità di saltare l\'uomo creando superiorità numerica.',
  },
  Difesa: {
    code: 'DIF',
    name: 'Difesa',
    label: 'Difesa / 1v1',
    description: 'Tempismo nei raddoppi, lettura delle linee di passaggio avversarie, intercetti e solidità nell\'1 contro 1 difensivo.',
  },
  Visione: {
    code: 'VIS',
    name: 'Visione',
    label: 'Visione di gioco / Tattica',
    description: 'Intelligenza tattica, senso della posizione preventiva, capacità di anticipare lo sviluppo del gioco e dettare i ritmi.',
  },
  // Retrocompatibilità
  Tecnica: {
    code: 'TEC',
    name: 'Tecnica',
    label: 'Tecnica di base',
    description: 'Controllo di palla e pulizia del gesto tecnico.',
  },
};

// Ordine canonico fisso delle statistiche per coerenza visiva su grafici e tabelle
export const STAT_CANONICAL_ORDER = [
  'Velocità',
  'Fisico',
  'Resistenza',
  'Tiro',
  'Passaggio',
  'Dribbling',
  'Difesa',
  'Visione',
  'Tecnica',
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

// Anagrafica Centri Sportivi & Campi da Calcio
export interface SportField {
  id: string;
  name: string;
  address: string;
  maps_url?: string;
  phone?: string;
  court_type?: string; // es. 'Sintetico 4G Outdoor', 'Indoor Parquet', ecc.
  notes?: string;
  created_at?: string;
}

// Tracciamento Cassa & Quota Partita
export interface MatchPaymentRecord {
  date: string;
  total_cost: number;
  cost_per_player: number;
  payments: Record<string, boolean>; // playerId -> true se pagato
  updated_at: string;
}

export interface MatchScorer {
  player_id: string;
  player_name?: string;
  goals: number;
}

export interface MatchAssist {
  player_id: string;
  player_name?: string;
  count: number;
}

export interface Match {
  id: string;
  match_date: string; // YYYY-MM-DD
  match_time: string; // HH:mm
  location: string;
  field_id?: string;
  total_cost: number;
  cost_per_player?: number;
  status: 'open' | 'completed' | 'cancelled';
  score_white?: number;
  score_black?: number;
  mvp_player_id?: string;
  scorers?: MatchScorer[];
  assists?: MatchAssist[];
  /** Teams as they played (names kept so the history stays readable even if a player is deleted) */
  team_white?: MatchTeamPlayer[];
  team_black?: MatchTeamPlayer[];
  /** Result already applied to each player's W/D/L counters (makes re-saving a result safe) */
  profile_effects?: Record<string, MatchOutcome>;
  closed_at?: string;
  closed_by?: string;
  created_at: string;
  updated_at: string;
}

export type MatchOutcome = 'won' | 'drawn' | 'lost';

export interface MatchTeamPlayer {
  id: string;
  name: string;
}

export interface Presence {
  id: string;
  date: string;
  player_id: string;
  status: PresenceStatus;
  /** Hint only: the real status is computed by rankDayPresences() from the join order. */
  order_index: number;
  created_at: string;
  /** Firestore server timestamp written on sign-up (presences created after the 2026-11 redesign). */
  joined_at?: unknown;
  /** Client-side only: joined_at converted to epoch millis (never written to Firestore). */
  joined_ms?: number;
  /** Set only by admins: force a player into the starters or onto the waitlist. */
  admin_override?: 'starter' | 'waitlist' | null;
  profile?: Profile;
}

export interface CalendarSettings {
  /** Last date (YYYY-MM-DD) players can sign up for beyond the current week. Empty = next week locked. */
  open_until?: string;
  updated_at?: string;
  updated_by?: string;
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
  timelock_enabled?: boolean;
  timelock_hours_before?: number; // es. 2, 4, 12, 24
  standard_match_time?: string;
  standard_total_cost?: number;
  default_field_id?: string;
}

/**
 * Ordina un insieme di chiavi statistiche secondo l'ordine canonico predefinito,
 * ponendo eventuali statistiche personalizzate aggiunte in fondo in ordine alfabetico.
 */
export function sortStatsByCanonicalOrder(statKeys: string[]): string[] {
  const canonicalList: string[] = [...STAT_CANONICAL_ORDER];
  const known = statKeys.filter((k) => canonicalList.includes(k as any));
  const unknown = statKeys.filter((k) => !canonicalList.includes(k as any)).sort();

  known.sort((a, b) => canonicalList.indexOf(a as any) - canonicalList.indexOf(b as any));
  return [...known, ...unknown];
}
