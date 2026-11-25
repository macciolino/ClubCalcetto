'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { useBoardPrefs } from '@/lib/hooks/useBoardPrefs';
import { subscribeMySpots, subscribeOpenNotices } from '@/lib/services/matchNoticeService';
import type { MatchNotice } from '@/types/matchNotice';

/** The open notices of the "Cerco giocatore" board (future matches only, soonest first). Empty when disabled. */
export function useOpenNotices(enabled: boolean): MatchNotice[] {
  const [list, setList] = useState<MatchNotice[]>([]);
  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) return;
    const off = subscribeOpenNotices(setList);
    return () => {
      off();
      setList([]);
    };
  }, [enabled]);
  return enabled ? list : [];
}

/**
 * The notices that can interest THIS person: of other leagues (their own league's are for outsiders, they sign up from
 * Presenze), not hidden by them, not the ones they already took a spot in. Nothing at all when they hid the board.
 */
export function useInterestingNotices(enabled: boolean, ownLeagueId?: string | null): MatchNotice[] {
  const { profile } = useAuth();
  const prefs = useBoardPrefs();
  const open = useOpenNotices(enabled && !prefs.off);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const profileId = profile?.id;
  useEffect(() => {
    if (!enabled || !isFirebaseConfigured || !profileId) return;
    return subscribeMySpots(profileId, (spots) => setTaken(new Set(spots.filter((s) => s.status === 'ACTIVE').map((s) => s.noticeId))));
  }, [enabled, profileId]);
  return useMemo(
    () => (prefs.off ? [] : open.filter((n) => n.leagueId !== ownLeagueId && !prefs.hidden.includes(n.id) && !taken.has(n.id))),
    [open, prefs.off, prefs.hidden, ownLeagueId, taken]
  );
}

/** How many matches could interest this person right now (badge in the navigation). */
export function useOpenNoticeCount(enabled: boolean, ownLeagueId?: string | null): number {
  return useInterestingNotices(enabled, ownLeagueId).length;
}
