'use client';

import { useEffect, useState } from 'react';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { StatCategory } from '@/types/database';
import { subscribeStatCategories } from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { getStoredCategories, saveStoredCategories } from '@/lib/services/statCategoryService';

/**
 * Player parameters decided by the admins (Admin → Campi & Parametri), in real time from Firestore.
 * A local copy is kept only to show something immediately while loading.
 */
export function useStatCategories(): StatCategory[] {
  const [categories, setCategories] = useState<StatCategory[]>(() => getStoredCategories());
  // Only once the active league is known (until then the data layer points at a placeholder league)
  const { isResolving } = useActiveLeague();
  useEffect(() => {
    if (!isFirebaseConfigured || isResolving) return;
    const unsub = subscribeStatCategories((list) => {
      setCategories(list);
      saveStoredCategories(list);
    });
    return () => unsub();
  }, [isResolving]);
  return categories;
}
