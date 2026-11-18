'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '@/types/database';
import { subscribeProfileEmails } from '@/lib/firebase/firestoreService';

/**
 * C2 — players' emails for ADMIN screens only. They live in private_profiles (rules: the player and admins);
 * profiles not moved yet still carry `email`, used as fallback. Pass `enabled = false` for players: no read at all.
 */
export function useProfileEmails(enabled: boolean): (p: Profile) => string | null {
  const [emails, setEmails] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribeProfileEmails(setEmails);
    return () => unsub();
  }, [enabled]);
  return useCallback((p: Profile) => (enabled ? emails[p.id] || p.email || null : null), [emails, enabled]);
}
