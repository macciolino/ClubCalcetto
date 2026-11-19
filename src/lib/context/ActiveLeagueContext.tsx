'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { notify } from '@/components/ui/Feedback';
import { usePathname } from 'next/navigation';
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
/** Which league the local caches (players, fields, settings, cash…) belong to: emptied when the league changes. */
const CACHE_OWNER_KEY = 'cc_cache_league';
const LEAGUE_CACHE_KEYS = [
  'clubcalcetto_players_list',
  'clubcalcetto_sport_fields',
  'clubcalcetto_official_match_date',
  'clubcalcetto_app_settings',
  'clubcalcetto_stat_categories',
];
const LEAGUE_CACHE_PREFIXES = ['clubcalcetto_payments_'];

function claimLocalCaches(leagueId: string) {
  try {
    const owner = localStorage.getItem(CACHE_OWNER_KEY);
    if (owner === leagueId) return;
    // First run after the update (no owner yet): the cache is the one of the only league there was
    if (owner) {
      LEAGUE_CACHE_KEYS.forEach((k) => localStorage.removeItem(k));
      Object.keys(localStorage)
        .filter((k) => LEAGUE_CACHE_PREFIXES.some((p) => k.startsWith(p)))
        .forEach((k) => localStorage.removeItem(k));
    }
    localStorage.setItem(CACHE_OWNER_KEY, leagueId);
  } catch {
    /* storage not available: nothing cached */
  }
}

/** Pages that work without a league (sign-in, invite links). */
const NO_LEAGUE_PATHS = ['/login', '/join'];

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
  /** Step 4: the platform super admin suspended the active league (read-only) */
  isSuspended: boolean;
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

export function ActiveLeagueProvider({
  uid,
  isSuperAdmin,
  accountReady,
  noLeague,
  children,
}: {
  uid: string | null;
  isSuperAdmin: boolean;
  /** The account profile is loaded (so an empty membership list really means "no league yet") */
  accountReady: boolean;
  /** Shown instead of the pages to a signed-in account that belongs to no league */
  noLeague: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '/';
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
  if (activeLeagueId) claimLocalCaches(activeLeagueId);

  useEffect(() => {
    if (!active || !isFirebaseConfigured) return;
    const key = `${active.id}/${active.playerId}`;
    return onSnapshot(
      doc(db, 'leagues', active.id, 'players', active.playerId),
      (snap) => setCard({ key, member: snap.exists() ? ({ ...(snap.data() as LeagueMemberPlayer), id: snap.id }) : null }),
      () => setCard({ key, member: null })
    );
  }, [active?.id, active?.playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Status of the active league (suspended = read-only banner). Suspended while it is open → another league if
  // there is one (it stays readable from the switcher), otherwise it stays here read-only with the banner.
  const [status, setStatus] = useState<{ id: string; suspended: boolean } | null>(null);
  const tf = useTranslations('league.fallback');
  const leaguesNow = useRef(leagues);
  useEffect(() => {
    leaguesNow.current = leagues;
  }, [leagues]);
  useEffect(() => {
    if (!activeLeagueId || !isFirebaseConfigured) return;
    let wasSuspended: boolean | null = null;
    return onSnapshot(
      doc(db, 'leagues', activeLeagueId),
      (snap) => {
        const suspended = snap.data()?.status === 'suspended';
        setStatus({ id: activeLeagueId, suspended });
        const justSuspended = wasSuspended === false && suspended;
        wasSuspended = suspended;
        if (!justSuspended) return;
        const name = leaguesNow.current.find((l) => l.id === activeLeagueId)?.name || '';
        const other = leaguesNow.current.find((l) => l.id !== activeLeagueId);
        if (!other) return notify(tf('suspendedStay', { name }), 'info');
        try {
          localStorage.setItem(STORAGE_KEY, other.id);
        } catch {
          /* storage not available: this session only */
        }
        setChosen(other.id);
        notify(tf('suspendedSwitched', { name, other: other.name }), 'info');
      },
      () => undefined
    );
  }, [activeLeagueId, tf]);
  const isSuspended = Boolean(status && status.id === activeLeagueId && status.suspended);

  // Fallback (no blank pages, no loops of permission errors): the active league disappears from the memberships
  // (taken out of it, or the league was deleted) → the next league, or the welcome screen if none is left.
  const previous = useRef<{ uid: string | null; leagues: LeagueSummary[]; active: string | null } | null>(null);
  useEffect(() => {
    if (!membershipsReady) return;
    const prev = previous.current;
    previous.current = { uid, leagues, active: activeLeagueId };
    if (!prev || prev.uid !== uid || !prev.active || leagues.some((l) => l.id === prev.active)) return;
    const lost = prev.leagues.find((l) => l.id === prev.active);
    if (!lost) return;
    // The active league already falls back on its own (the lost id is no longer in the list): only forget it on the device
    try {
      if (localStorage.getItem(STORAGE_KEY) === lost.id) localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage not available */
    }
    notify(leagues.length ? tf('goneSwitched', { name: lost.name, other: leagues[0].name }) : tf('goneNone', { name: lost.name }), 'info');
  }, [uid, leagues, activeLeagueId, membershipsReady, tf]);

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
      isSuspended,
      isLoading: !membershipsReady || !cardReady,
    }),
    [leagues, activeLeagueId, setActiveLeague, member, leagueRole, isSuperAdmin, isSuspended, membershipsReady, cardReady]
  );

  const showWelcome =
    Boolean(uid) && accountReady && membershipsReady && leagues.length === 0 && !NO_LEAGUE_PATHS.some((p) => pathname.startsWith(p));

  return (
    <ActiveLeagueContext.Provider value={value}>
      {showWelcome ? noLeague : <React.Fragment key={activeLeagueId ?? 'none'}>{children}</React.Fragment>}
    </ActiveLeagueContext.Provider>
  );
}

export function useActiveLeague(): ActiveLeagueValue {
  const ctx = useContext(ActiveLeagueContext);
  if (!ctx) throw new Error('useActiveLeague deve essere usato dentro ActiveLeagueProvider');
  return ctx;
}
