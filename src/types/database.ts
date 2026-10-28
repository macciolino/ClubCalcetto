export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'user' | 'admin';
export type PresenceStatus = 'confirmed' | 'waitlist';

export interface Profile {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
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
