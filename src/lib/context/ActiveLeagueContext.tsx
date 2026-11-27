'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { notify } from '@/components/ui/Feedback';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { usePathname } from 'next/navigation';
import { collection, doc, onSnapshot } from 'firebase/firestore';
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

/** Pages that work without a league (sign-in, invite links, the platform's "Cerco giocatore" board). */
const NO_LEAGUE_PATHS = ['/login', '/join', '/board', '/account'];

export interface LeagueSummary {
  id: string;
  name: string;
  /** The user's card in that league; '' = no card (platform staff opening any league of the platform) */
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
  /** SUPER_ADMIN or GLOBAL_ADMIN: PRESIDENT powers in every league (also without a card, also when suspended) */
  isPlatformStaff: boolean;
  /** Step 4: the platform super admin suspended the active league (read-only) */
  isSuspended: boolean;
  isLoading: boolean;
  /** Signed in, the account's leagues are still loading: the active league is not known yet */
  isResolving: boolean;
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
  isPlatformStaff = false,
  accountReady,
  noLeague,
  children,
}: {
  uid: string | null;
  isSuperAdmin: boolean;
  /** SUPER_ADMIN / GLOBAL_ADMIN: every league of the platform is in the switcher */
  isPlatformStaff?: boolean;
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

  // Platform staff: every league of the platform (the ones without a card of theirs are opened as PRESIDENT)
  const [allLeagues, setAllLeagues] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    if (!uid || !isPlatformStaff || !isFirebaseConfigured) return;
    return onSnapshot(
      collection(db, 'leagues'),
      (snap) => setAllLeagues(snap.docs.map((d) => ({ id: d.id, name: String(d.data().name || d.id) }))),
      () => setAllLeagues([])
    );
  }, [uid, isPlatformStaff]);

  const leagues = useMemo(() => {
    const own = memberships && memberships.uid === uid ? memberships.leagues : [];
    if (!isPlatformStaff || !allLeagues) return own;
    const others = allLeagues.filter((l) => !own.some((o) => o.id === l.id)).map((l) => ({ ...l, playerId: '' }));
    return [...own, ...others].sort((a, b) => a.name.localeCompare(b.name));
  }, [memberships, uid, isPlatformStaff, allLeagues]);
  const membershipsReady = !uid || (memberships !== null && memberships.uid === uid && (!isPlatformStaff || allLeagues !== null));
  const wanted = chosen || readStored();
  const active = leagues.find((l) => l.id === wanted) || leagues[0] || null;
  const activeLeagueId = active?.id ?? null;
  const cardKey = active ? `${active.id}/${active.playerId}` : '';

  // Services read the active league from here; set before the children render
  setActiveLeagueForData(activeLeagueId ?? CALCETTARI_LEAGUE_ID, activeLeagueId !== null);
  if (activeLeagueId) claimLocalCaches(activeLeagueId);

  useEffect(() => {
    if (!active || !active.playerId || !isFirebaseConfigured) return;
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
        // Platform staff keep working on a suspended league (they can still write there)
        if (!justSuspended || isPlatformStaff) return;
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
  }, [activeLeagueId, tf, isPlatformStaff]);
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

  const member = active?.playerId && card && card.key === cardKey ? card.member : null;
  const cardReady = !active || !active.playerId || (card !== null && card.key === cardKey);
  const leagueRole = member?.leagueRole ?? null;
  // Effective powers: platform staff = PRESIDENT everywhere (also suspended); members manage only an active league
  const manages = isPlatformStaff || (!isSuspended && canManageMatchesAndCash(leagueRole));
  const presides = isPlatformStaff || (!isSuspended && isPresident(leagueRole));

  const value = useMemo<ActiveLeagueValue>(
    () => ({
      leagues,
      activeLeagueId,
      setActiveLeague,
      member,
      leagueRole,
      isPresident: presides,
      canManageLeague: presides && (isPlatformStaff || canManageLeague(leagueRole)),
      canManageMatchesAndCash: manages,
      isSuperAdmin,
      isPlatformStaff,
      isSuspended,
      isLoading: !membershipsReady || !cardReady,
      isResolving: Boolean(uid) && !membershipsReady,
    }),
    [leagues, activeLeagueId, setActiveLeague, member, leagueRole, presides, manages, isSuperAdmin, isPlatformStaff, isSuspended, membershipsReady, cardReady, uid]
  );

  const showWelcome =
    Boolean(uid) && accountReady && membershipsReady && leagues.length === 0 && !NO_LEAGUE_PATHS.some((p) => pathname.startsWith(p));

  return (
    <ActiveLeagueContext.Provider value={value}>
      {showWelcome ? noLeague : <React.Fragment key={activeLeagueId ?? 'none'}>{children}</React.Fragment>}
    </ActiveLeagueContext.Provider>
  );
}

/**
 * The pages of a league start only when the active league is known: until then they would listen to the placeholder
 * league (and nothing from another league must reach this person's screen or the copies kept on the device). Pages that
 * work without a league (sign-in, invites, the board) do not wait.
 */
export function LeagueGate({ children }: { children: React.ReactNode }) {
  const ctx = useContext(ActiveLeagueContext);
  const pathname = usePathname() || '/';
  if (ctx?.isResolving && !NO_LEAGUE_PATHS.some((p) => pathname.startsWith(p))) return <PageSkeleton />;
  return <>{children}</>;
}

export function useActiveLeague(): ActiveLeagueValue {
  const ctx = useContext(ActiveLeagueContext);
  if (!ctx) throw new Error('useActiveLeague deve essere usato dentro ActiveLeagueProvider');
  return ctx;
}
