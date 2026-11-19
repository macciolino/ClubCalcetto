'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '@/types/database';
import { fetchLeagueEmails } from '@/lib/services/leagueService';

/**
 * C2 — players' emails for the managers' screens. Asked to the server (/api/league-emails), which answers only
 * to presidents / collaborators of the active league (and the super admin) and only with that league's members.
 * Pass `enabled = false` for players: no request at all. Profiles not moved yet still carry `email` (fallback).
 */
export function useProfileEmails(enabled: boolean): (p: Profile) => string | null {
  const [emails, setEmails] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchLeagueEmails().then((res) => alive && res && setEmails(res));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return useCallback((p: Profile) => (enabled ? emails[p.id] || p.email || null : null), [emails, enabled]);
}
