import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';

/**
 * C2 — players' emails are personal data: they live in `private_profiles/{profileId}` ({ email }), readable only
 * by the player and by admins, NOT in `profiles` (readable by every signed-in user).
 *
 * Moving the emails of existing profiles is done in two safe steps, both repeatable without side effects:
 *  1. copy:   profiles/{id}.email → private_profiles/{id}.email (an existing private email is never overwritten);
 *  2. remove: delete the `email` field from the profile, ONLY when the private copy holds the same address.
 * With `dryRun` nothing is written: the counts say what would happen.
 */
export interface EmailMigrationResult {
  withEmail: number;
  copied: number;
  removed: number;
  mismatched: string[];
}

export async function migrateProfileEmails(dryRun: boolean): Promise<EmailMigrationResult> {
  const db = adminDb();
  const profiles = await db.collection('profiles').get();
  const result: EmailMigrationResult = { withEmail: 0, copied: 0, removed: 0, mismatched: [] };

  for (const p of profiles.docs) {
    const email = p.data().email;
    if (typeof email !== 'string' || !email.trim()) {
      // `email: null` (guests, archived records): just drop the empty field
      if (p.data().email === null) {
        if (!dryRun) await p.ref.update({ email: FieldValue.delete() });
        result.removed++;
      }
      continue;
    }
    result.withEmail++;
    const clean = email.trim().toLowerCase();
    const privRef = db.doc(`private_profiles/${p.id}`);

    const done = await db.runTransaction(async (tx) => {
      const priv = await tx.get(privRef);
      const current = priv.exists ? String(priv.data()?.email || '').trim().toLowerCase() : '';
      if (current && current !== clean) return 'mismatch' as const;
      if (dryRun) return current ? ('remove' as const) : ('copy' as const);
      if (!current) tx.set(privRef, { email: clean, updated_at: new Date().toISOString() }, { merge: true });
      tx.update(p.ref, { email: FieldValue.delete() });
      return current ? ('remove' as const) : ('copy' as const);
    });
    if (done === 'mismatch') {
      result.mismatched.push(p.id); // left untouched: an admin looks at it
      continue;
    }
    if (done === 'copy') result.copied++;
    result.removed++;
  }
  return result;
}

/** Profile ids whose email is `email` (private copy first, then profiles not migrated yet). */
export async function profileIdsByEmail(email: string): Promise<string[]> {
  const db = adminDb();
  const [priv, legacy] = await Promise.all([
    db.collection('private_profiles').where('email', '==', email).get(),
    db.collection('profiles').where('email', '==', email).get(),
  ]);
  return Array.from(new Set([...priv.docs.map((d) => d.id), ...legacy.docs.map((d) => d.id)]));
}
