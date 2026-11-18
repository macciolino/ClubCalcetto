/**
 * Integration (C8): operations in several steps (link a guest, "start from zero") can be repeated after an
 * interruption without counting W/D/L twice or creating duplicate archived records. Firestore + Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { archiveAndReset, claimGuest, moveReferences } from '@/lib/server/profileMerge';
import { assertEmulators, ldb, makeUser, profileDoc, resetEmulators } from './helpers';

assertEmulators();

beforeEach(async () => {
  await resetEmulators();
});

async function seedGuest() {
  await ldb().doc('players/guest-1').set(
    profileDoc('guest-1', { is_guest: true, user_id: null, email: null, full_name: 'Ospite Luca', matches_won: 2, matches_lost: 1 })
  );
  await ldb().doc('matches/2026-10-01').set({
    id: '2026-10-01', status: 'completed', team_white: [{ id: 'guest-1', name: 'Ospite Luca' }], team_black: [],
    scorers: [{ player_id: 'guest-1', goals: 2 }], profile_effects: { 'guest-1': 'won' },
  });
}

describe('Ospite collegato: ripetibile (C8)', () => {
  it('interrotto dopo lo spostamento dei riferimenti: ripetendo, V/P/S sommate una volta sola', async () => {
    await seedGuest();
    await makeUser('acc1', { matches_won: 1 });
    await moveReferences('guest-1', 'acc1'); // the first attempt stopped here
    await claimGuest('guest-1', 'acc1'); // retry
    const p = (await ldb().doc('players/acc1').get()).data()!;
    expect(p.matches_won).toBe(3);
    expect(p.matches_lost).toBe(1);
    expect((await ldb().doc('players/guest-1').get()).exists).toBe(false);
    expect((await ldb().doc('matches/2026-10-01').get()).data()?.team_white[0].id).toBe('acc1');
  });

  it('ripetuto dopo che è finito: nessun doppio conteggio', async () => {
    await seedGuest();
    await makeUser('acc2', { matches_won: 1 });
    await claimGuest('guest-1', 'acc2');
    await expect(claimGuest('guest-1', 'acc2')).rejects.toThrow('not_a_guest');
    expect((await ldb().doc('players/acc2').get()).data()?.matches_won).toBe(3);
  });
});

describe('Riparti da zero: ripetibile (C8)', () => {
  it('interrotto dopo aver creato l’archivio: ripetendo, un solo profilo "ex-" con tutto lo storico', async () => {
    await makeUser('z1', { deactivated_at: '2026-01-01', deactivated_by: 'self', matches_won: 2, full_name: 'Zeno' });
    await ldb().doc('matches/2026-10-02').set({ id: '2026-10-02', status: 'completed', team_white: [{ id: 'z1', name: 'Zeno' }], team_black: [] });
    // first attempt: archive id saved and archive created, then it stopped
    await ldb().doc('players/z1').update({ archive_in_progress: 'ex-test' });
    await ldb().doc('players/ex-test').set(profileDoc('ex-test', { is_guest: true, user_id: null, email: null, full_name: 'Zeno', archived_at: 'x' }));

    await archiveAndReset('z1'); // retry
    const archived = (await ldb().collection('players').get()).docs.filter((d) => d.id.startsWith('ex-'));
    expect(archived.map((d) => d.id)).toEqual(['ex-test']);
    expect((await ldb().doc('matches/2026-10-02').get()).data()?.team_white[0].id).toBe('ex-test');
    const fresh = (await ldb().doc('players/z1').get()).data()!;
    expect(fresh.matches_won).toBe(0);
    expect(fresh.archive_in_progress).toBeUndefined();
  });

  it('senza interruzioni: un solo archivio e il flag di avanzamento sparisce', async () => {
    await makeUser('z2', { deactivated_at: '2026-01-01', deactivated_by: 'self' });
    await archiveAndReset('z2');
    const archived = (await ldb().collection('players').get()).docs.filter((d) => d.id.startsWith('ex-'));
    expect(archived).toHaveLength(1);
    expect(archived[0].data().archive_in_progress).toBeUndefined();
    expect((await ldb().doc('players/z2').get()).data()?.archive_in_progress).toBeUndefined();
  });
});
