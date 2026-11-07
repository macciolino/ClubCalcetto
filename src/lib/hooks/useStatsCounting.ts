'use client';

import { useEffect, useState } from 'react';
import { subscribeAppSettings } from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';

/**
 * Admin choice (Admin → Campi & Parametri → "Cosa conta nelle statistiche"):
 * whether scorers' goals and MVP awards are counted in the statistics. Both on by default.
 * The data is always saved with the match: switching a toggle back on shows it again.
 */
export function useStatsCounting(): { countGoals: boolean; countMvp: boolean } {
  const [value, setValue] = useState({ countGoals: true, countMvp: true });
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = subscribeAppSettings((s) =>
      setValue({ countGoals: s.count_goals !== false, countMvp: s.count_mvp !== false })
    );
    return () => unsub();
  }, []);
  return value;
}
