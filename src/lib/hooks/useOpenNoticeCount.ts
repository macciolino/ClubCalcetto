'use client';

import { useEffect, useState } from 'react';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { subscribeOpenNotices } from '@/lib/services/matchNoticeService';

/** How many matches on the "Cerco giocatore" board are looking for players right now (badge in the navigation). */
export function useOpenNoticeCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled || !isFirebaseConfigured) return;
    const off = subscribeOpenNotices((list) => setCount(list.length));
    return () => {
      off();
      setCount(0);
    };
  }, [enabled]);
  return enabled ? count : 0;
}
