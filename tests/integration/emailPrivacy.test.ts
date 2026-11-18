/**
 * Integration (C2): players' emails move from `profiles` (readable by every signed-in user) to `private_profiles`
 * (the player + admins). Server logic and real route handlers, on the Firestore and Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as emailPrivacy } from '@/app/api/admin/email-privacy/route';
import { POST as returnRequest } from '@/app/api/account/return-request/route';
import { migrateProfileEmails } from '@/lib/server/emailPrivacy';
import { deleteAccount } from '@/lib/server/accountDeletion';
import { archiveAndReset } from '@/lib/server/profileMerge';
import { assertEmulators, call, db, makeUser, profileDoc, resetEmulators } from './helpers';

assertEmulators();

beforeEach(async () => {
  await resetEmulators();
});

const profile = async (id: string) => (await db().doc(`profiles/${id}`).get()).data();
const privateEmail = async (id: string) => (await db().doc(`private_profiles/${id}`).get()).data()?.email;

describe('Spostamento delle email (C2)', () => {
  it('prova: conta senza scrivere; poi sposta, toglie dal profilo e non tocca il resto', async () => {
    await db().doc('profiles/a').set(profileDoc('a', { email: 'A@Example.com', matches_won: 3, stats: { Tiro: 8 } }));
    await db().doc('profiles/guest').set(profileDoc('guest', { is_guest: true, user_id: null, email: null }));

    const dry = await migrateProfileEmails(true);
    expect(dry).toMatchObject({ withEmail: 1, copied: 1, mismatched: [] });
    expect((await profile('a'))?.email).toBe('A@Example.com');
    expect(await privateEmail('a')).toBeUndefined();

    const run = await migrateProfileEmails(false);
    expect(run).toMatchObject({ withEmail: 1, copied: 1, mismatched: [] });
    const a = await profile('a');
    expect(a?.email).toBeUndefined();
    expect(a).toMatchObject({ matches_won: 3, stats: { Tiro: 8 }, full_name: 'Giocatore a' });
    expect(await privateEmail('a')).toBe('a@example.com');
    expect((await profile('guest'))?.email).toBeUndefined();
    expect((await profile('guest'))?.is_guest).toBe(true);

    // Ripetibile: la seconda volta non c'è più niente da spostare
    expect(await migrateProfileEmails(false)).toMatchObject({ withEmail: 0, copied: 0, removed: 0 });
  });

  it('email privata diversa da quella del profilo: profilo lasciato com’è, segnalato', async () => {
    await db().doc('profiles/b').set(profileDoc('b', { email: 'b@example.com' }));
    await db().doc('private_profiles/b').set({ email: 'other@example.com' });
    const run = await migrateProfileEmails(false);
    expect(run.mismatched).toEqual(['b']);
    expect((await profile('b'))?.email).toBe('b@example.com');
    expect(await privateEmail('b')).toBe('other@example.com');
  });

  it('email privata già presente e uguale: si toglie solo dal profilo', async () => {
    await db().doc('profiles/c').set(profileDoc('c', { email: 'c@example.com' }));
    await db().doc('private_profiles/c').set({ email: 'c@example.com' });
    expect(await migrateProfileEmails(false)).toMatchObject({ copied: 0, removed: 1 });
    expect((await profile('c'))?.email).toBeUndefined();
  });

  it('la route è solo del super admin e di default fa solo la prova', async () => {
    const player = await makeUser('p1');
    expect((await call(emailPrivacy, { dryRun: false }, player.token)).status).toBe(403);
    expect((await call(emailPrivacy, {})).status).toBe(401);

    const sup = await makeUser('super', { role: 'admin' }, { email: 'macciolino84@gmail.com' });
    const dry = await call(emailPrivacy, {}, sup.token);
    expect(dry.data).toMatchObject({ ok: true, dryRun: true });
    expect((await profile('p1'))?.email).toBe('p1@example.com');
    const run = await call(emailPrivacy, { dryRun: false }, sup.token);
    expect(run.data).toMatchObject({ ok: true, dryRun: false, mismatched: [] });
    expect((await profile('p1'))?.email).toBeUndefined();
    expect(await privateEmail('p1')).toBe('p1@example.com');
  });

  it('dopo lo spostamento la richiesta di rientro trova ancora l’account chiuso', async () => {
    await db().doc('profiles/m1').set(profileDoc('m1', { email: 'm1@example.com', deactivated_at: '2026-01-01', deactivated_by: 'self' }));
    await migrateProfileEmails(false);
    const r = await call(returnRequest, { email: 'M1@example.com' });
    expect(r.data).toMatchObject({ ok: true, pending: true });
    expect((await profile('m1'))?.restore_requested_at).toBeTruthy();
  });

  it('eliminazione definitiva: sparisce anche l’email privata', async () => {
    await makeUser('d1');
    await migrateProfileEmails(false);
    await deleteAccount('d1');
    expect(await profile('d1')).toBeUndefined();
    expect(await privateEmail('d1')).toBeUndefined();
  });

  it('riparti da zero: il nuovo profilo non ha l’email, che resta solo nel documento privato', async () => {
    await makeUser('z1', { deactivated_at: '2026-01-01', deactivated_by: 'self', matches_won: 2 });
    await archiveAndReset('z1');
    const fresh = await profile('z1');
    expect(fresh?.email).toBeUndefined();
    expect(fresh?.matches_won).toBe(0);
    expect(await privateEmail('z1')).toBe('z1@example.com');
  });
});
