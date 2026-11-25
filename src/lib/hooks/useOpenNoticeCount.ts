'use client';

import { useEffect, useState } from 'react';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { subscribeOpenNotices } from '@/lib/services/matchNoticeService';
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

/** How many matches on the board are looking for players right now (badge in the navigation). */
export function useOpenNoticeCount(enabled: boolean): number {
  return useOpenNotices(enabled).length;
}
