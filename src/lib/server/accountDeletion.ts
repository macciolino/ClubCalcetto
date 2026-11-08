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

/** Saves the reason in account_feedback (server only) and tells the developer (super admin) with a notification. */
export async function saveDeletionFeedback(entry: {
  name: string;
  reason: string;
  details: string;
  deletedBy: 'self' | 'super_admin';
}): Promise<void> {
  const at = new Date().toISOString();
  await adminDb().collection('account_feedback').add({ ...entry, at });
  const who = entry.deletedBy === 'self' ? `${entry.name} ha eliminato il suo account` : `Account di ${entry.name} eliminato`;
  await sendToProfiles([SUPER_ADMIN_PROFILE_ID], {
    title: '🗑️ Account eliminato',
    body: `${who}. Motivo: ${entry.reason}${entry.details ? ` — "${entry.details.slice(0, 120)}"` : ''}`,
    url: '/admin',
  }).catch(() => 0);
}
