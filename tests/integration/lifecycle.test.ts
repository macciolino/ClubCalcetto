/**
 * Integration: guest invites (profile claiming), new sign-ups, closed accounts coming back (restore / start from zero),
 * format proposals. Real API route handlers + server logic, on the Firestore and Auth EMULATORS.
 *
 * Naming in this app: the "soft delete" is the deactivation (`deactivated_at`), "waiting for restore" is
 * `restore_requested_at` + an `admin_requests/restore_<id>` request.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { adminAuth } from '@/lib/firebase/admin';
import { POST as createInvite, GET as inviteInfo } from '@/app/api/invite/route';
import { POST as registered } from '@/app/api/account/registered/route';
import { POST as returnRequest } from '@/app/api/account/return-request/route';
import { POST as resolveRequest } from '@/app/api/admin/requests/route';
import { POST as closeAccount } from '@/app/api/account/delete/route';
import { checkPromotions } from '@/lib/server/presenceWatch';
import { assertEmulators, call, db, futureDate, ldb, makeUser, profileDoc, resetEmulators } from './helpers';

assertEmulators();

let admin: { uid: string; token: string };

beforeEach(async () => {
  await resetEmulators();
  admin = await makeUser('admin1', { role: 'admin', full_name: 'Admin Uno' });
});

/** A guest with history: archived match (team, goals, MVP, W/D/L effect), a future sign-up, a payment. */
async function seedGuestWithHistory() {
  await ldb().doc('players/guest-1').set(
    profileDoc('guest-1', { is_guest: true, user_id: null, email: null, full_name: 'Ospite Luca', position: 'Punta', stats: { Tiro: 9 }, overall_rating: 7.5, matches_won: 2, matches_lost: 1 })
  );
  await ldb().doc('matches/2026-10-01').set({
    id: '2026-10-01',
    match_date: '2026-10-01',
    status: 'completed',
    score_white: 3,
    score_black: 1,
    team_white: [{ id: 'guest-1', name: 'Ospite Luca' }, { id: 'x1', name: 'X1' }],
    team_black: [{ id: 'x2', name: 'X2' }],
    scorers: [{ player_id: 'guest-1', player_name: 'Ospite Luca', goals: 2 }],
    mvp_player_id: 'guest-1',
    profile_effects: { 'guest-1': 'won' },
  });
  const day = futureDate(3);
  await ldb().doc(`presences/${day}_guest-1`).set({ id: `${day}_guest-1`, date: day, player_id: 'guest-1', status: 'confirmed', order_index: 1, created_at: '' });
  await ldb().doc('match_payments/2026-10-01').set({ date: '2026-10-01', payments: { 'guest-1': true, x1: false } });
  return day;
}

describe('Invito ospite (profile claiming con invite token)', () => {
  it('l’admin crea il link, il nuovo account riscatta l’ospite e ne prende tutto lo storico', async () => {
    const day = await seedGuestWithHistory();

    const inv = await call(createInvite, { guestId: 'guest-1' }, admin.token);
    expect(inv.status).toBe(200);
    const token = String(inv.data.token);
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,64}$/);
    // stesso ospite → stesso link finché non è usato
    expect((await call(createInvite, { guestId: 'guest-1' }, admin.token)).data.token).toBe(token);
    // il banner del login conosce il nome
    expect((await call(inviteInfo, undefined, undefined, `http://localhost/api/invite?token=${token}`)).data.name).toBe('Ospite Luca');

    const user = await makeUser('newuser', { full_name: 'Luca Rossi' });
    const res = await call(registered, { invite: token }, user.token);
    expect(res.data).toMatchObject({ ok: true, claimed: true, guestName: 'Ospite Luca' });

    // ospite eliminato, storico passato all'account
    expect((await ldb().doc('players/guest-1').get()).exists).toBe(false);
    const p = (await ldb().doc('players/newuser').get()).data()!;
    expect(p).toMatchObject({ full_name: 'Luca Rossi', is_guest: false, position: 'Punta', overall_rating: 7.5, matches_won: 2, matches_lost: 1, needs_stat_review: false });
    expect(p.stats).toEqual({ Tiro: 9 });
    const m = (await ldb().doc('matches/2026-10-01').get()).data()!;
    expect(m.team_white[0].id).toBe('newuser');
    expect(m.scorers[0].player_id).toBe('newuser');
    expect(m.mvp_player_id).toBe('newuser');
    expect(m.profile_effects).toEqual({ newuser: 'won' });
    expect((await ldb().doc(`presences/${day}_newuser`).get()).data()?.player_id).toBe('newuser');
    expect((await ldb().doc(`presences/${day}_guest-1`).get()).exists).toBe(false);
    expect((await ldb().doc('match_payments/2026-10-01').get()).data()?.payments).toEqual({ newuser: true, x1: false });

    // il link vale una volta sola
    const again = await makeUser('other', {});
    expect((await call(registered, { invite: token }, again.token)).status).toBe(400);
    expect((await call(inviteInfo, undefined, undefined, `http://localhost/api/invite?token=${token}`)).status).toBe(404);
  });

  it('un giocatore normale non può creare inviti; un link inventato non vale', async () => {
    await seedGuestWithHistory();
    const player = await makeUser('player1', {});
    expect((await call(createInvite, { guestId: 'guest-1' }, player.token)).status).toBe(403);
    expect((await call(createInvite, { guestId: 'guest-1' })).status).toBe(403);
    expect((await call(inviteInfo, undefined, undefined, 'http://localhost/api/invite?token=AAAAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404);
  });

  it('si invita solo un ospite (non un account registrato)', async () => {
    await makeUser('registered1', {});
    expect((await call(createInvite, { guestId: 'registered1' }, admin.token)).status).toBe(400);
  });
});

describe('Iscrizione senza link', () => {
  it('richiesta "nuovo iscritto" ancora aperta (di prima delle leghe): l’admin collega l’ospite', async () => {
    await seedGuestWithHistory();
    await makeUser('spont', { full_name: 'Luca Spontaneo' });
    // Multi-league step 3: new sign-ups no longer open it (they join with /join links); old open ones still work
    await ldb().doc('admin_requests/signup_spont').set({ type: 'new_signup', status: 'open', profile_id: 'spont', name: 'Luca Spontaneo', created_at: 'x' });

    const link = await call(resolveRequest, { id: 'signup_spont', action: 'link', guestId: 'guest-1' }, admin.token);
    expect(link.data.ok).toBe(true);
    expect((await ldb().doc('players/guest-1').get()).exists).toBe(false);
    expect((await ldb().doc('players/spont').get()).data()?.matches_won).toBe(2);
    expect((await ldb().doc('admin_requests/signup_spont').get()).data()?.status).toBe('done');
    // la stessa richiesta non si gestisce due volte
    expect((await call(resolveRequest, { id: 'signup_spont', action: 'new' }, admin.token)).status).toBe(409);
  });

  it('senza ospiti: nessuna richiesta', async () => {
    const user = await makeUser('alone', {});
    await call(registered, {}, user.token);
    expect((await ldb().doc('admin_requests/signup_alone').get()).exists).toBe(false);
  });

  it('solo un admin risolve le richieste', async () => {
    await seedGuestWithHistory();
    const user = await makeUser('spont2', {});
    await ldb().doc('admin_requests/signup_spont2').set({ type: 'new_signup', status: 'open', profile_id: 'spont2', name: 'x', created_at: 'x' });
    expect((await call(resolveRequest, { id: 'signup_spont2', action: 'new' }, user.token)).status).toBe(403);
  });
});

describe('Account chiuso (soft delete) e rientro', () => {
  async function closeOwnAccount(uid: string) {
    const u = await makeUser(uid, { full_name: `Mario ${uid}`, matches_won: 4, stats: { Tiro: 8 } });
    await ldb().doc('matches/2026-09-01').set({ id: '2026-09-01', match_date: '2026-09-01', status: 'completed', team_white: [{ id: uid, name: `Mario ${uid}` }], team_black: [] });
    const res = await call(closeAccount, { mode: 'deactivate', reason: 'Non gioco più con il gruppo' }, u.token);
    expect(res.data.ok).toBe(true);
    return u;
  }

  it('disattivazione: profilo nascosto con i dati, login bloccato, avviso agli admin', async () => {
    await closeOwnAccount('m1');
    const p = (await ldb().doc('players/m1').get()).data()!;
    expect(p.deactivated_at).toBeTruthy();
    expect(p.matches_won).toBe(4); // dati conservati
    expect((await adminAuth().getUser('m1')).disabled).toBe(true);
    expect((await ldb().doc('admin_requests/closed_m1').get()).data()).toMatchObject({ type: 'account_closed', mode: 'deactivate', status: 'open' });
  });

  it('tentativo di rientro → "attesa ripristino" + una sola richiesta; decide lo staff di piattaforma: ripristina', async () => {
    const u = await closeOwnAccount('m2');
    const r1 = await call(returnRequest, { email: u.email.toUpperCase() });
    expect(r1.data).toMatchObject({ ok: true, pending: true });
    await call(returnRequest, { email: u.email }); // secondo tentativo: niente doppioni
    expect((await ldb().doc('players/m2').get()).data()?.restore_requested_at).toBeTruthy();
    const open = await ldb().collection('admin_requests').where('type', '==', 'restore').get();
    expect(open.size).toBe(1);

    // account GLOBALE: il presidente della lega non decide, l'admin di piattaforma sì
    expect((await call(resolveRequest, { id: 'restore_m2', action: 'restore' }, admin.token)).status).toBe(403);
    const staff = await makeUser('staff1', { platformRole: 'GLOBAL_ADMIN' });
    expect((await call(resolveRequest, { id: 'restore_m2', action: 'restore' }, staff.token)).data.ok).toBe(true);
    const p = (await ldb().doc('players/m2').get()).data()!;
    expect(p.deactivated_at).toBeUndefined();
    expect(p.restore_requested_at).toBeUndefined();
    expect(p.matches_won).toBe(4);
    expect((await adminAuth().getUser('m2')).disabled).toBe(false);
  });

  it('decide lo staff di piattaforma: riparti da zero → storico archiviato con il vecchio nome, account pulito', async () => {
    const u = await closeOwnAccount('m3');
    await call(returnRequest, { email: u.email });
    expect((await call(resolveRequest, { id: 'restore_m3', action: 'reset' }, admin.token)).status).toBe(403);
    const sup = await makeUser('sup1', { platformRole: 'SUPER_ADMIN' });
    expect((await call(resolveRequest, { id: 'restore_m3', action: 'reset' }, sup.token)).data.ok).toBe(true);

    const fresh = (await ldb().doc('players/m3').get()).data()!;
    expect(fresh).toMatchObject({ matches_won: 0, matches_drawn: 0, matches_lost: 0, role: 'player', full_name: 'Mario m3' });
    expect(fresh.deactivated_at).toBeUndefined();
    expect((await adminAuth().getUser('m3')).disabled).toBe(false);

    const archived = (await ldb().collection('players').where('archived_at', '>', '').get()).docs;
    expect(archived).toHaveLength(1);
    const ex = archived[0].data();
    expect(ex).toMatchObject({ user_id: null, userId: null, is_guest: true, matches_won: 4 });
    expect(ex.deactivated_at).toBeTruthy();
    // la partita passata ora punta al record archiviato, non al nuovo account
    expect((await ldb().doc('matches/2026-09-01').get()).data()?.team_white[0].id).toBe(archived[0].id);
  });

  it('email sconosciuta o account attivo: stessa risposta (C10), ma nessuna richiesta e nessun flag', async () => {
    await makeUser('active1', {});
    const a = await call(returnRequest, { email: 'active1@example.com' });
    const b = await call(returnRequest, { email: 'nessuno@example.com' });
    expect(a.data).toEqual({ ok: true, pending: true });
    expect(b.data).toEqual({ ok: true, pending: true });
    expect((await ldb().doc('players/active1').get()).data()?.restore_requested_at).toBeUndefined();
    expect((await ldb().collection('admin_requests').where('type', '==', 'restore').get()).size).toBe(0);
    expect((await call(returnRequest, { email: 'non-una-email' })).data.pending).toBe(false);
  });

  it('account chiuso: la risposta non contiene il nome (C10)', async () => {
    const u = await closeOwnAccount('m9');
    expect((await call(returnRequest, { email: u.email })).data).toEqual({ ok: true, pending: true });
  });

  it('il giocatore non può decidere da solo: niente ripristino senza admin', async () => {
    const u = await closeOwnAccount('m4');
    await call(returnRequest, { email: u.email });
    expect((await call(resolveRequest, { id: 'restore_m4', action: 'restore' }, u.token)).status).toBe(403);
    expect((await ldb().doc('players/m4').get()).data()?.deactivated_at).toBeTruthy();
  });
});

describe('Proposta di cambio formato agli admin', () => {
  it('14 iscritti in un 5vs5 → una sola proposta 7vs7, anche se gli iscritti crescono', async () => {
    const day = futureDate(5);
    const batch = db().batch();
    for (let i = 0; i < 15; i++) {
      batch.set(ldb().doc(`presences/${day}_p${i}`), { id: `${day}_p${i}`, date: day, player_id: `p${i}`, status: 'waitlist', order_index: i + 1, created_at: new Date(1000 + i).toISOString() });
    }
    await batch.commit();
    const state = await checkPromotions(day);
    expect(state.starterIds).toHaveLength(10); // 5vs5: 10 titolari, 5 in attesa
    await checkPromotions(day);
    const reqs = await ldb().collection('admin_requests').where('type', '==', 'format_proposal').get();
    expect(reqs.size).toBe(1);
    expect(reqs.docs[0].data()).toMatchObject({ date: day, format: '7v7', from_format: '5v5', count: 15 });

    // l'admin accetta: il giorno diventa 7vs7 e i titolari salgono a 14
    expect((await call(resolveRequest, { id: reqs.docs[0].id, action: 'apply_format' }, admin.token)).data.ok).toBe(true);
    expect((await ldb().doc('settings/match_formats').get()).data()?.days[day]).toMatchObject({ format: '7v7', formation: '1-2-3-1' });
    expect((await checkPromotions(day)).starterIds).toHaveLength(14);
  });
});
