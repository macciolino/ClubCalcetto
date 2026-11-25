'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { savePreferences } from '@/lib/firebase/firestoreService';
import type { Profile } from '@/types/database';

/**
 * Personal preferences about the "Cerco giocatore" board: the whole board hidden (navigation, Home card, badge) and the
 * notices this person is not interested in. Saved on the profile (`board_off`, `board_hidden`, so they follow the person
 * on every device) and kept on this device too, so the change shows at once and works before the profile is read.
 */
export const MAX_HIDDEN_NOTICES = 100;
const KEY = 'cc_board_prefs';

interface Stored {
  profileId: string;
  off: boolean;
  hidden: string[];
}

const EMPTY: Stored = { profileId: '', off: false, hidden: [] };
let state: Stored | null = null;
const listeners = new Set<() => void>();

const clean = (list: unknown): string[] =>
  Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(-MAX_HIDDEN_NOTICES) : [];

function current(): Stored {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      state = { profileId: typeof p.profileId === 'string' ? p.profileId : '', off: Boolean(p.off), hidden: clean(p.hidden) };
    }
  } catch {
    /* storage not available: the profile is the only copy */
  }
  return (state ??= EMPTY);
}

function commit(next: Stored) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** When the profile is read: its saved preferences win; without any, this device's own (same person) stay. */
export function syncBoardPrefsFromProfile(profile: Pick<Profile, 'id' | 'board_off' | 'board_hidden'> | null) {
  if (!profile?.id) return;
  const local = current();
  const saved = profile.board_off !== undefined || profile.board_hidden !== undefined;
  if (saved) commit({ profileId: profile.id, off: Boolean(profile.board_off), hidden: clean(profile.board_hidden) });
  else if (local.profileId !== profile.id) commit({ profileId: profile.id, off: false, hidden: [] });
}

/** Forgets the device's copy (sign-out): the next person on this device starts clean. */
export function forgetBoardPrefs() {
  commit(EMPTY);
}

export function useBoardPrefs() {
  const { profile } = useAuth();
  const s = useSyncExternalStore(subscribe, current, () => EMPTY);
  const profileId = profile?.id || '';
  // Only this person's preferences: another account on the same device never inherits them
  const mine = s.profileId === profileId ? s : EMPTY;

  return useMemo(() => {
    const save = (patch: Partial<Pick<Profile, 'board_off' | 'board_hidden'>>) => {
      if (profileId) savePreferences(profileId, patch).catch((e) => console.warn('Preferenze Bacheca non salvate sul profilo:', e));
    };
    return {
      off: mine.off,
      hidden: mine.hidden,
      /** The whole board hidden (or shown again) */
      setOff: (off: boolean) => {
        commit({ ...mine, profileId, off });
        save({ board_off: off });
      },
      /** "Non mi interessa": this notice disappears for this person only */
      hide: (noticeId: string) => {
        if (mine.hidden.includes(noticeId)) return;
        const hidden = [...mine.hidden, noticeId].slice(-MAX_HIDDEN_NOTICES);
        commit({ ...mine, profileId, hidden });
        save({ board_hidden: hidden });
      },
      /** Shows every hidden notice again */
      showAll: () => {
        commit({ ...mine, profileId, hidden: [] });
        save({ board_hidden: [] });
      },
    };
  }, [mine, profileId]);
}
