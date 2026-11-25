'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { syncBoardPrefsFromProfile } from '@/lib/hooks/useBoardPrefs';

/** When the profile is read, the board preferences saved on it (hidden board, hidden notices) are applied on this device. */
export function BoardPrefsSync() {
  const { profile } = useAuth();
  const id = profile?.id;
  const off = profile?.board_off;
  const hidden = profile?.board_hidden;
  useEffect(() => {
    syncBoardPrefsFromProfile(id ? { id, board_off: off, board_hidden: hidden } : null);
  }, [id, off, hidden]);
  return null;
}
