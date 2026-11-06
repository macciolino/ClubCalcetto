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


const STORAGE_KEY = 'clubcalcetto_players_list';

export function getStoredPlayers(): Profile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Old builds cached demo players p-2..p-11 locally: they never existed in Firestore, drop them.
      const parsed: Profile[] = (JSON.parse(raw) as Profile[]).filter(
        (p) => p && (p.id === 'p-1' || !/^p-\d+$/.test(p.id))
      );
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Assicura che Marco B. mantenga sempre il ruolo Admin, che i ruoli 'user' siano 'player' e che le posizioni siano valorizzate
        return parsed.map((p) => {
          const won = p.matches_won ?? 0;
          const drawn = p.matches_drawn ?? 0;
          const lost = p.matches_lost ?? 0;
          const position = p.position || 'Esterno';

          if (p.email && p.email.toLowerCase().includes('macciolino84')) {
            return {
              ...p,
              role: 'admin',
              position: p.position || 'Esterno',
              matches_won: won,
              matches_drawn: drawn,
              matches_lost: lost,
            };
          }

          // Se ruolo era 'user', converti in 'player'
          const role = (p.role === 'admin' ? 'admin' : 'player') as 'admin' | 'player';
          const rawStats = p.stats || {};
          const stats = {
            ...rawStats,
            Visione: rawStats.Visione ?? rawStats.Tecnica ?? 7,
          };

          return {
            ...p,
            role,
            position,
            stats,
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
  // Nessun dato demo: i giocatori arrivano solo da Firestore
  return [];
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
