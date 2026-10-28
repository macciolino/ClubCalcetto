'use client';

import { Profile } from '@/types/database';

export interface PlayerMatchRecord {
  won: number;
  drawn: number;
  lost: number;
  total: number;
  winRate: number; // 0 - 100%
  points: number; // 3 pt vittoria, 1 pt pareggio
}

export function getPlayerMatchRecord(p: Profile): PlayerMatchRecord {
  const won = p.matches_won ?? 0;
  const drawn = p.matches_drawn ?? 0;
  const lost = p.matches_lost ?? 0;
  const total = won + drawn + lost;
  const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
  const points = won * 3 + drawn * 1;
  return { won, drawn, lost, total, winRate, points };
}

export const DEFAULT_PLAYERS: Profile[] = [
  {
    id: 'p-1',
    user_id: 'u-1',
    email: 'macciolino84@gmail.com',
    full_name: 'Marco B.',
    avatar_url: null,
    role: 'admin',
    is_guest: false,
    stats: { Resistenza: 8, Velocità: 8, Difesa: 7, Tiro: 8, Passaggio: 8, Tecnica: 9, Fisico: 7, Dribbling: 8 },
    overall_rating: 7.9,
    matches_won: 15,
    matches_drawn: 4,
    matches_lost: 5,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  },
  {
    id: 'p-2',
    user_id: null,
    email: null,
    full_name: 'Luca B.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 9, Velocità: 8, Difesa: 8, Tiro: 7, Passaggio: 7, Tecnica: 7, Fisico: 8, Dribbling: 7 },
    overall_rating: 7.8,
    matches_won: 13,
    matches_drawn: 3,
    matches_lost: 7,
    created_at: '2026-10-02T10:00:00Z',
    updated_at: '2026-10-02T10:00:00Z',
  },
  {
    id: 'p-3',
    user_id: null,
    email: null,
    full_name: 'Andrea M.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 7, Velocità: 9, Difesa: 6, Tiro: 8, Passaggio: 8, Tecnica: 9, Fisico: 6, Dribbling: 9 },
    overall_rating: 7.6,
    matches_won: 12,
    matches_drawn: 5,
    matches_lost: 6,
    created_at: '2026-10-03T10:00:00Z',
    updated_at: '2026-10-03T10:00:00Z',
  },
  {
    id: 'p-4',
    user_id: null,
    email: null,
    full_name: 'Giovanni R.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 6, Velocità: 6, Difesa: 9, Tiro: 6, Passaggio: 7, Tecnica: 6, Fisico: 9, Dribbling: 6 },
    overall_rating: 6.9,
    matches_won: 9,
    matches_drawn: 6,
    matches_lost: 8,
    created_at: '2026-10-04T10:00:00Z',
    updated_at: '2026-10-04T10:00:00Z',
  },
  {
    id: 'p-5',
    user_id: null,
    email: null,
    full_name: 'Davide P.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 8, Velocità: 7, Difesa: 7, Tiro: 8, Passaggio: 7, Tecnica: 7, Fisico: 7, Dribbling: 7 },
    overall_rating: 7.3,
    matches_won: 11,
    matches_drawn: 4,
    matches_lost: 8,
    created_at: '2026-10-05T10:00:00Z',
    updated_at: '2026-10-05T10:00:00Z',
  },
  {
    id: 'p-6',
    user_id: null,
    email: null,
    full_name: 'Matteo C.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 7, Velocità: 7, Difesa: 8, Tiro: 6, Passaggio: 8, Tecnica: 8, Fisico: 7, Dribbling: 7 },
    overall_rating: 7.3,
    matches_won: 10,
    matches_drawn: 5,
    matches_lost: 7,
    created_at: '2026-10-06T10:00:00Z',
    updated_at: '2026-10-06T10:00:00Z',
  },
  {
    id: 'p-7',
    user_id: null,
    email: null,
    full_name: 'Francesco L.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 6, Velocità: 7, Difesa: 6, Tiro: 9, Passaggio: 7, Tecnica: 8, Fisico: 6, Dribbling: 8 },
    overall_rating: 7.1,
    matches_won: 10,
    matches_drawn: 3,
    matches_lost: 9,
    created_at: '2026-10-07T10:00:00Z',
    updated_at: '2026-10-07T10:00:00Z',
  },
  {
    id: 'p-8',
    user_id: null,
    email: null,
    full_name: 'Alessandro S.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 9, Velocità: 8, Difesa: 7, Tiro: 7, Passaggio: 8, Tecnica: 8, Fisico: 8, Dribbling: 8 },
    overall_rating: 7.9,
    matches_won: 14,
    matches_drawn: 2,
    matches_lost: 6,
    created_at: '2026-10-08T10:00:00Z',
    updated_at: '2026-10-08T10:00:00Z',
  },
  {
    id: 'p-9',
    user_id: null,
    email: null,
    full_name: 'Simone T.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 8, Velocità: 6, Difesa: 8, Tiro: 6, Passaggio: 7, Tecnica: 7, Fisico: 8, Dribbling: 6 },
    overall_rating: 7.0,
    matches_won: 8,
    matches_drawn: 6,
    matches_lost: 9,
    created_at: '2026-10-09T10:00:00Z',
    updated_at: '2026-10-09T10:00:00Z',
  },
  {
    id: 'p-10',
    user_id: null,
    email: null,
    full_name: 'Federico N.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 7, Velocità: 8, Difesa: 7, Tiro: 8, Passaggio: 8, Tecnica: 8, Fisico: 7, Dribbling: 7 },
    overall_rating: 7.5,
    matches_won: 12,
    matches_drawn: 4,
    matches_lost: 7,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
  },
];

const STORAGE_KEY = 'clubcalcetto_players_list';

export function getStoredPlayers(): Profile[] {
  if (typeof window === 'undefined') return DEFAULT_PLAYERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: Profile[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Assicura che Marco B. mantenga sempre il ruolo Admin e che V-P-S siano valorizzati
        return parsed.map((p) => {
          const defaultRef = DEFAULT_PLAYERS.find((dp) => dp.id === p.id);
          const won = p.matches_won ?? defaultRef?.matches_won ?? 0;
          const drawn = p.matches_drawn ?? defaultRef?.matches_drawn ?? 0;
          const lost = p.matches_lost ?? defaultRef?.matches_lost ?? 0;

          if (p.email && p.email.toLowerCase().includes('macciolino84')) {
            return {
              ...p,
              role: 'admin',
              full_name: 'Marco B.',
              matches_won: won,
              matches_drawn: drawn,
              matches_lost: lost,
            };
          }
          return {
            ...p,
            matches_won: won,
            matches_drawn: drawn,
            matches_lost: lost,
          };
        });
      }
    }
  } catch (err) {
    console.warn('Errore lettura player da localStorage:', err);
  }
  // Se vuoto, inizializza con DEFAULT_PLAYERS
  saveStoredPlayers(DEFAULT_PLAYERS);
  return DEFAULT_PLAYERS;
}

export function isPlayerMatch(p: Profile, target: Partial<Profile>): boolean {
  if (target.id && p.id === target.id) return true;
  if (target.user_id && p.user_id && p.user_id === target.user_id) return true;
  if (target.email && p.email && target.email.toLowerCase().trim() === p.email.toLowerCase().trim()) return true;
  if (
    target.email &&
    target.email.toLowerCase().includes('macciolino84') &&
    (p.id === 'p-1' || (p.email && p.email.toLowerCase().includes('macciolino84')))
  ) {
    return true;
  }
  return false;
}

export function findPlayerByAuth(authId?: string | null, authEmail?: string | null): Profile | undefined {
  const current = getStoredPlayers();
  if (authEmail && authEmail.toLowerCase().includes('macciolino84')) {
    const marco = current.find(
      (p) => p.id === 'p-1' || (p.email && p.email.toLowerCase().includes('macciolino84'))
    );
    if (marco) return marco;
  }
  return current.find(
    (p) =>
      (authId && (p.id === authId || p.user_id === authId)) ||
      (authEmail && p.email && p.email.toLowerCase().trim() === authEmail.toLowerCase().trim())
  );
}

export function saveStoredPlayers(players: Profile[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
    window.dispatchEvent(new Event('clubcalcetto_players_changed'));
  } catch (err) {
    console.warn('Errore salvataggio player in localStorage:', err);
  }
}

export function addStoredPlayer(player: Profile): Profile[] {
  const current = getStoredPlayers();
  const exists = current.some((p) => isPlayerMatch(p, player));
  const playerWithStats = {
    ...player,
    matches_won: player.matches_won ?? 0,
    matches_drawn: player.matches_drawn ?? 0,
    matches_lost: player.matches_lost ?? 0,
  };
  const updated = exists
    ? current.map((p) => (isPlayerMatch(p, player) ? { ...p, ...playerWithStats, id: p.id } : p))
    : [playerWithStats, ...current];
  saveStoredPlayers(updated);
  return updated;
}

export function updateStoredPlayer(player: Profile): Profile[] {
  const current = getStoredPlayers();
  let matched = false;
  const updated = current.map((p) => {
    if (isPlayerMatch(p, player)) {
      matched = true;
      return {
        ...p,
        ...player,
        id: p.id, // Preserva l'ID canonico (es. 'p-1') per non rompere presenze e formazioni
        user_id: player.user_id || p.user_id,
        email: player.email || p.email,
        full_name: player.full_name || p.full_name,
        avatar_url: player.avatar_url !== undefined ? player.avatar_url : p.avatar_url,
        stats: player.stats ? { ...p.stats, ...player.stats } : p.stats,
        overall_rating: player.overall_rating ?? p.overall_rating,
        matches_won: player.matches_won !== undefined ? player.matches_won : p.matches_won,
        matches_drawn: player.matches_drawn !== undefined ? player.matches_drawn : p.matches_drawn,
        matches_lost: player.matches_lost !== undefined ? player.matches_lost : p.matches_lost,
        updated_at: new Date().toISOString(),
      };
    }
    return p;
  });

  const finalPlayers = matched ? updated : [player, ...current];
  saveStoredPlayers(finalPlayers);
  return finalPlayers;
}

export function removeStoredPlayer(playerId: string): Profile[] {
  const current = getStoredPlayers();
  // Proteggi Marco B. dall'eliminazione
  const updated = current.filter(
    (p) => p.id !== playerId || (p.email && p.email.toLowerCase().includes('macciolino84'))
  );
  saveStoredPlayers(updated);
  return updated;
}
