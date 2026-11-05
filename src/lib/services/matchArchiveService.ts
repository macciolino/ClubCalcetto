'use client';

import { Match, MatchScorer, MatchAssist, Profile } from '@/types/database';
import { getStoredPlayers, saveStoredPlayers } from './playerService';
import { saveMatchDoc, saveProfileDoc } from '@/lib/firebase/firestoreService';

const MATCHES_HISTORY_KEY = 'clubcalcetto_matches_history';

export function getArchivedMatches(): Match[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MATCHES_HISTORY_KEY);
    if (raw) {
      const parsed: Match[] = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Errore lettura storico match:', err);
  }
  return [];
}

export function saveArchivedMatchLocal(match: Match) {
  if (typeof window === 'undefined') return;
  try {
    const current = getArchivedMatches();
    const filtered = current.filter((m) => m.id !== match.id && m.match_date !== match.match_date);
    const updated = [match, ...filtered];
    localStorage.setItem(MATCHES_HISTORY_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('clubcalcetto_matches_changed'));
  } catch (err) {
    console.warn('Errore salvataggio match in locale:', err);
  }
}

export interface CloseMatchPayload {
  date: string;
  scoreWhite: number;
  scoreBlack: number;
  teamWhitePlayerIds: string[];
  teamBlackPlayerIds: string[];
  mvpPlayerId?: string | null;
  scorers: MatchScorer[];
  assists: MatchAssist[];
  location?: string;
  time?: string;
  totalCost?: number;
}

export async function executeCloseAndArchiveMatch(payload: CloseMatchPayload): Promise<{
  success: boolean;
  match: Match;
  updatedPlayers: Profile[];
}> {
  const {
    date,
    scoreWhite,
    scoreBlack,
    teamWhitePlayerIds,
    teamBlackPlayerIds,
    mvpPlayerId,
    scorers,
    assists,
    location = 'Centro Sportivo Calcetto',
    time = '20:30',
    totalCost = 80,
  } = payload;

  const isWhiteWinner = scoreWhite > scoreBlack;
  const isBlackWinner = scoreBlack > scoreWhite;
  const isDraw = scoreWhite === scoreBlack;

  // 1. Aggiorna i profili dei giocatori partecipanti
  const allPlayers = getStoredPlayers();
  const updatedPlayers: Profile[] = allPlayers.map((player) => {
    const inWhite = teamWhitePlayerIds.includes(player.id);
    const inBlack = teamBlackPlayerIds.includes(player.id);

    if (!inWhite && !inBlack) return player;

    let won = player.matches_won ?? 0;
    let drawn = player.matches_drawn ?? 0;
    let lost = player.matches_lost ?? 0;

    if (isDraw) {
      drawn += 1;
    } else if (inWhite) {
      if (isWhiteWinner) won += 1;
      else lost += 1;
    } else if (inBlack) {
      if (isBlackWinner) won += 1;
      else lost += 1;
    }

    return {
      ...player,
      matches_won: won,
      matches_drawn: drawn,
      matches_lost: lost,
      updated_at: new Date().toISOString(),
    };
  });

  // Salva profili aggiornati
  saveStoredPlayers(updatedPlayers);
  for (const p of updatedPlayers) {
    if (teamWhitePlayerIds.includes(p.id) || teamBlackPlayerIds.includes(p.id)) {
      saveProfileDoc(p).catch(() => {});
    }
  }

  // 2. Crea oggetto Match completato
  const completedMatch: Match = {
    id: date,
    match_date: date,
    match_time: time,
    location,
    total_cost: totalCost,
    cost_per_player: Number((totalCost / 10).toFixed(2)),
    status: 'completed',
    score_white: scoreWhite,
    score_black: scoreBlack,
    mvp_player_id: mvpPlayerId || undefined,
    scorers,
    assists,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveArchivedMatchLocal(completedMatch);
  await saveMatchDoc(completedMatch);

  return {
    success: true,
    match: completedMatch,
    updatedPlayers,
  };
}
