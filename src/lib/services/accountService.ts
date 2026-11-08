'use client';

import { auth } from '@/lib/firebase/config';

/** Reasons shown to the player (same list as the server, src/lib/server/accountDeletion.ts). */
export const DELETE_REASONS = [
  'Non gioco più con il gruppo',
  'Troppe notifiche',
  "L'app è difficile da usare",
  'Problemi o errori nell’app',
  'Privacy: non voglio i miei dati qui',
  'Altro',
] as const;

async function authFetch(url: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'unauthenticated' } as Record<string, unknown>;
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}`, ...(init.headers || {}) },
  });
  return (await res.json().catch(() => ({ ok: false, error: 'bad_response' }))) as Record<string, unknown>;
}

/** The signed-in player deletes their own account (the reason goes to the developer). */
export function deleteMyAccount(reason: string, details: string) {
  return authFetch('/api/account/delete', { method: 'POST', body: JSON.stringify({ reason, details }) });
}

/** Super admin: deletes another player's account (login, profile, devices, sign-ups). */
export function deleteAccountAsSuperAdmin(targetProfileId: string) {
  return authFetch('/api/account/delete', { method: 'POST', body: JSON.stringify({ targetProfileId }) });
}

export interface DeletionFeedback {
  id: string;
  name: string;
  reason: string;
  details: string;
  deletedBy: 'self' | 'super_admin';
  at: string;
}

/** Super admin: reasons left by who deleted the account. */
export async function fetchDeletionFeedback(): Promise<DeletionFeedback[] | null> {
  const res = await authFetch('/api/account/feedback');
  return res.ok ? ((res.items as DeletionFeedback[]) || []) : null;
}
