import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendToProfiles } from '@/lib/server/push';

export const SUPER_ADMIN_EMAIL = 'macciolino84@gmail.com';
export const SUPER_ADMIN_PROFILE_ID = 'p-1';

export const DELETE_REASONS = [
  'Non gioco più con il gruppo',
  'Troppe notifiche',
  "L'app è difficile da usare",
  'Problemi o errori nell’app',
  'Privacy: non voglio i miei dati qui',
  'Altro',
] as const;

/**
 * Deletes an account for good: Firebase login, profile, devices for notifications and sign-ups.
 * The archived matches keep the name written in them, so the history stays readable.
 * Returns the dates whose sign-ups were removed (the app then re-checks substitutions for those days).
 */
export async function deleteAccount(profileId: string): Promise<{ name: string; dates: string[] }> {
  const db = adminDb();
  const profileRef = db.doc(`profiles/${profileId}`);
  const profile = await profileRef.get();
  const data = profile.data() || {};
  const name = (data.full_name as string) || 'Giocatore';

  const presences = await db.collection('presences').where('player_id', '==', profileId).get();
  const tokens = await db.collection('push_tokens').where('profile_id', '==', profileId).get();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const dates = Array.from(
    new Set(presences.docs.map((d) => d.data().date as string).filter((d) => typeof d === 'string' && d >= today))
  );

  const refs = [...presences.docs.map((d) => d.ref), ...tokens.docs.map((d) => d.ref), profileRef];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }

  // Account di accesso (gli ospiti non ce l'hanno)
  const uid = (data.user_id as string) || (data.is_guest ? '' : profileId);
  if (uid) {
    await adminAuth()
      .deleteUser(uid)
      .catch((err: { code?: string }) => {
        if (err?.code !== 'auth/user-not-found') throw err;
      });
  }
  return { name, dates };
}

/**
 * Deactivates an account WITHOUT losing its data: the login is blocked and the profile is hidden from every page,
 * but parameters, W/D/L counters and the link to the archived matches stay, so the super admin can reactivate it.
 * Future sign-ups and notification devices are removed.
 */
export async function deactivateAccount(
  profileId: string,
  by: 'self' | 'super_admin'
): Promise<{ name: string; dates: string[] }> {
  const db = adminDb();
  const profileRef = db.doc(`profiles/${profileId}`);
  const data = (await profileRef.get()).data() || {};
  const name = (data.full_name as string) || 'Giocatore';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });

  const presences = await db.collection('presences').where('player_id', '==', profileId).get();
  const future = presences.docs.filter((d) => String(d.data().date || '') >= today);
  const tokens = await db.collection('push_tokens').where('profile_id', '==', profileId).get();
  const batch = db.batch();
  [...future, ...tokens.docs].forEach((d) => batch.delete(d.ref));
  batch.update(profileRef, { deactivated_at: new Date().toISOString(), deactivated_by: by });
  await batch.commit();

  const uid = (data.user_id as string) || profileId;
  await adminAuth()
    .updateUser(uid, { disabled: true })
    .then(() => adminAuth().revokeRefreshTokens(uid))
    .catch((err: { code?: string }) => {
      if (err?.code !== 'auth/user-not-found') throw err;
    });
  return { name, dates: Array.from(new Set(future.map((d) => d.data().date as string))) };
}

/** Super admin: the account can sign in again and is visible again, with all its data. */
export async function reactivateAccount(profileId: string): Promise<void> {
  const profileRef = adminDb().doc(`profiles/${profileId}`);
  const data = (await profileRef.get()).data() || {};
  await adminAuth().updateUser((data.user_id as string) || profileId, { disabled: false });
  await profileRef.update({ deactivated_at: FieldValue.delete(), deactivated_by: FieldValue.delete() });
}

/** Saves the reason in account_feedback (server only) and tells the developer (super admin) with a notification. */
export async function saveDeletionFeedback(entry: {
  name: string;
  reason: string;
  details: string;
  deletedBy: 'self' | 'super_admin';
  /** 'deactivate' = data kept, 'delete' = everything removed */
  mode: 'deactivate' | 'delete';
}): Promise<void> {
  const at = new Date().toISOString();
  await adminDb().collection('account_feedback').add({ ...entry, at });
  const verb = entry.mode === 'deactivate' ? 'disattivato' : 'eliminato';
  const who = entry.deletedBy === 'self' ? `${entry.name} ha ${verb} il suo account` : `Account di ${entry.name} ${verb}`;
  await sendToProfiles([SUPER_ADMIN_PROFILE_ID], {
    title: entry.mode === 'deactivate' ? '⏸️ Account disattivato' : '🗑️ Account eliminato',
    body: `${who}. Motivo: ${entry.reason}${entry.details ? ` — "${entry.details.slice(0, 120)}"` : ''}`,
    url: '/impostazioni?sezione=account',
  }).catch(() => 0);
}
