'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase/config';
import { setActiveLeagueForData } from '@/lib/league/leagueRefs';
import { canManageLeague, canManageMatchesAndCash, isPresident } from '@/lib/utils/leaguePermissions';
import { CALCETTARI_LEAGUE_ID, type LeagueMemberPlayer, type LeagueMembershipEntry, type LeagueRole } from '@/types/league';

/**
 * Multi-league (1B): which leagues the signed-in user belongs to (`memberships/{uid}`, written by the server),
 * which one is active (remembered on the device, `cc_league`) and the user's card in it
 * (`leagues/{id}/players/{playerId}`, the source of the role and of the league data).
 * The pages are remounted when the active league changes, so every subscription restarts on the new league.
 */
const STORAGE_KEY = 'cc_league';

export interface LeagueSummary {
  id: string;
  name: string;
  playerId: string;
}

interface ActiveLeagueValue {
  leagues: LeagueSummary[];
  activeLeagueId: string | null;
  setActiveLeague: (leagueId: string) => void;
  /** The user's card in the active league */
  member: LeagueMemberPlayer | null;
  leagueRole: LeagueRole | null;
  isPresident: boolean;
  canManageLeague: boolean;
  canManageMatchesAndCash: boolean;
  /** Platform governance (not a league role) */
  isSuperAdmin: boolean;
  isLoading: boolean;
}

const ActiveLeagueContext = createContext<ActiveLeagueValue | null>(null);

const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export function ActiveLeagueProvider({ uid, isSuperAdmin, children }: { uid: string | null; isSuperAdmin: boolean; children: React.ReactNode }) {
  const [memberships, setMemberships] = useState<{ uid: string; leagues: LeagueSummary[] } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [card, setCard] = useState<{ key: string; member: LeagueMemberPlayer | null } | null>(null);

  useEffect(() => {
    if (!uid || !isFirebaseConfigured) return;
    return onSnapshot(
      doc(db, 'memberships', uid),
      (snap) => {
        const raw = (snap.data()?.leagues || {}) as Record<string, LeagueMembershipEntry>;
        const leagues = Object.entries(raw)
          .map(([id, e]) => ({ id, name: e.name || id, playerId: e.player_id }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setMemberships({ uid, leagues });
      },
      () => setMemberships({ uid, leagues: [] })
    );
  }, [uid]);

  const leagues = useMemo(() => (memberships && memberships.uid === uid ? memberships.leagues : []), [memberships, uid]);
  const membershipsReady = !uid || (memberships !== null && memberships.uid === uid);
  const wanted = chosen || readStored();
  const active = leagues.find((l) => l.id === wanted) || leagues[0] || null;
  const activeLeagueId = active?.id ?? null;
  const cardKey = active ? `${active.id}/${active.playerId}` : '';

  // Services read the active league from here; set before the children render
  setActiveLeagueForData(activeLeagueId ?? CALCETTARI_LEAGUE_ID);

  useEffect(() => {
    if (!active || !isFirebaseConfigured) return;
    const key = `${active.id}/${active.playerId}`;
    return onSnapshot(
      doc(db, 'leagues', active.id, 'players', active.playerId),
      (snap) => setCard({ key, member: snap.exists() ? ({ ...(snap.data() as LeagueMemberPlayer), id: snap.id }) : null }),
      () => setCard({ key, member: null })
    );
  }, [active?.id, active?.playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveLeague = useCallback((leagueId: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, leagueId);
    } catch {
      /* private mode: kept for this session only */
    }
    setChosen(leagueId);
  }, []);

  const member = card && card.key === cardKey ? card.member : null;
  const cardReady = !active || (card !== null && card.key === cardKey);
  const leagueRole = member?.leagueRole ?? null;

  const value = useMemo<ActiveLeagueValue>(
    () => ({
      leagues,
      activeLeagueId,
      setActiveLeague,
      member,
      leagueRole,
      isPresident: isPresident(leagueRole),
      canManageLeague: canManageLeague(leagueRole),
      canManageMatchesAndCash: canManageMatchesAndCash(leagueRole),
      isSuperAdmin,
      isLoading: !membershipsReady || !cardReady,
    }),
    [leagues, activeLeagueId, setActiveLeague, member, leagueRole, isSuperAdmin, membershipsReady, cardReady]
  );

  return (
    <ActiveLeagueContext.Provider value={value}>
      <React.Fragment key={activeLeagueId ?? 'none'}>{children}</React.Fragment>
    </ActiveLeagueContext.Provider>
  );
}

export function useActiveLeague(): ActiveLeagueValue {
  const ctx = useContext(ActiveLeagueContext);
  if (!ctx) throw new Error('useActiveLeague deve essere usato dentro ActiveLeagueProvider');
  return ctx;
}
