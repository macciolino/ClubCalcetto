/**
 * Integration: "Bacheca Avvisi / Cerco Giocatore" (docs/ARCHITECTURE.md §3.5). Real route handler on the Firestore
 * and Auth EMULATORS: who manages a notice, who takes a spot, no overbooking, isolation from the league.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { adminAuth } from '@/lib/firebase/admin';
import { POST as notices } from '@/app/api/match-notices/route';
import { POST as notify } from '@/app/api/notify/route';
import { GET as cron } from '@/app/api/cron/mvp-vote/route';
import { inLeague } from '@/lib/server/leagueScope';
import { loadRankedPresences } from '@/lib/server/presenceWatch';
import { assertEmulators, call, db, futureDate, idToken, ldb, makeUser, profileDoc, resetEmulators } from './helpers';

assertEmulators();

const DAY = futureDate(4);
const notice = (extra: Record<string, unknown> = {}) => ({
  matchId: DAY,
  dateTime: `${DAY}T19:30:00.000Z`,
  locationName: 'Campo Luini',
  address: 'Via Luini 5, Milano',
  format: '5v5',
  totalFieldCost: 80,
  costPerPlayer: 8,
  spotsNeeded: 2,
  roleNeeded: 'ANY',
  shirtColor: 'DARK',
  ...extra,
});

/** A verified account with a global profile but NO league (or a platform role) */
async function outsider(uid: string, extra: Record<string, unknown> = {}) {
  const u = await makeUser(uid, {}, { withProfile: false });
  await db().doc(`profiles/${uid}`).set(profileDoc(uid, { full_name: `Esterno ${uid}`, ...extra }));
  return u;
}

let pres: { uid: string; token: string };
const create = async (token: string, extra: Record<string, unknown> = {}) => call(notices, { action: 'create', notice: notice(extra) }, token);
const take = (id: string, token: string) => call(notices, { action: 'take', id }, token);
const read = async (id: string) => (await db().doc(`match_notices/${id}`).get()).data()!;

beforeEach(async () => {
  await resetEmulators();
  pres = await makeUser('pres', { role: 'admin', full_name: 'Presidente' });
});

describe('Avvisi: chi li gestisce', () => {
  it('presidente, collaboratore e staff della piattaforma creano; giocatori ed esterni no', async () => {
    const res = await create(pres.token);
    expect(res.data.ok).toBe(true);
    const n = await read(String(res.data.id));
    expect(n).toMatchObject({ leagueId: 'calcettari', leagueName: 'I Calcettari', matchId: DAY, status: 'OPEN', spotsFilled: 0, spotsNeeded: 2 });
    expect(n.createdBy).toEqual({ profileId: 'pres', name: 'Presidente' });

    const coll = await makeUser('coll', {});
    await ldb().doc('players/coll').update({ leagueRole: 'COLLABORATOR' });
    expect((await create(coll.token)).data.ok).toBe(true);

    const ga = await outsider('ga', { platformRole: 'GLOBAL_ADMIN' });
    expect((await create(ga.token)).data.ok).toBe(true);

    const player = await makeUser('player', {});
    expect((await create(player.token)).status).toBe(403);
    const out = await outsider('out');
    expect((await create(out.token)).status).toBe(403);
  });

  it('dati sbagliati o partita già passata: rifiutato', async () => {
    expect((await create(pres.token, { format: '6v6' })).status).toBe(400);
    expect((await create(pres.token, { costPerPlayer: 100 })).status).toBe(400);
    const past = futureDate(-2);
    expect((await create(pres.token, { matchId: past, dateTime: `${past}T19:30:00.000Z` })).data.error).toBe('expired');
  });

  it('il presidente di un’altra lega non tocca l’avviso', async () => {
    const id = String((await create(pres.token)).data.id);
    await db().doc('leagues/altra').set({ id: 'altra', name: 'Altra lega', status: 'active' });
    const other = await outsider('other');
    await db().doc('leagues/altra/players/other').set({ id: 'other', userId: 'other', leagueRole: 'PRESIDENT' });
    await db().doc('memberships/other').set({ leagues: { altra: { player_id: 'other', league_role: 'PRESIDENT' } } });
    expect((await call(notices, { action: 'update', id, notice: { spotsNeeded: 5 } }, other.token)).status).toBe(403);
    expect((await call(notices, { action: 'cancel', id }, other.token)).status).toBe(403);
    expect((await read(id)).status).toBe('OPEN');
  });
});

describe('Prendi il posto', () => {
  it('un esterno prende un posto: niente lega, i gestori lo sanno, non due volte', async () => {
    const id = String((await create(pres.token)).data.id);
    const out = await outsider('out');
    const res = await take(id, out.token);
    expect(res.data).toMatchObject({ ok: true, spotsFilled: 1, status: 'OPEN' });

    const spot = (await db().doc(`match_notices/${id}/applicants/out`).get()).data()!;
    expect(spot).toMatchObject({ profileId: 'out', userId: 'out', displayName: 'Esterno out' });
    // Isolation: no membership, no card in the league
    expect((await db().doc('memberships/out').get()).exists).toBe(false);
    expect((await ldb().doc('players/out').get()).exists).toBe(false);
    const bell = (await db().collection('profiles/pres/notifications').get()).docs.map((d) => String(d.data().body));
    expect(bell.some((b) => b.includes('Esterno out ha preso un posto') && b.includes('Manca 1 posto'))).toBe(true);

    expect((await take(id, out.token)).data.error).toBe('already_joined');
    expect((await read(id)).spotsFilled).toBe(1);
  });

  it('senza email verificata: niente posto', async () => {
    const id = String((await create(pres.token)).data.id);
    await adminAuth().createUser({ uid: 'nover', email: 'nover@example.com', password: 'password123', emailVerified: false });
    await db().doc('profiles/nover').set(profileDoc('nover'));
    expect((await take(id, await idToken('nover@example.com'))).status).toBe(403);
  });

  it('chi è già iscritto a quella partita nella lega non prende il posto', async () => {
    const id = String((await create(pres.token)).data.id);
    const player = await makeUser('player', {});
    await ldb().doc(`presences/${DAY}_player`).set({ id: `${DAY}_player`, date: DAY, player_id: 'player' });
    expect((await take(id, player.token)).data.error).toBe('already_in_match');
  });

  it('un membro della lega non prende un posto da esterno nella propria lega: iscriversi dalle Presenze', async () => {
    const id = String((await create(pres.token)).data.id);
    const player = await makeUser('player', {});
    const res = await take(id, player.token);
    expect(res.status).toBe(409);
    expect(res.data.error).toBe('is_member');
    expect((await read(id)).spotsFilled).toBe(0);
    expect((await ldb().doc(`presences/${DAY}_ext-player`).get()).exists).toBe(false);
    // un esterno vero (senza scheda in quella lega) sì
    expect((await take(id, (await outsider('out')).token)).data.ok).toBe(true);
  });

  it('dieci click insieme su due posti: due posti presi, avviso chiuso, nessun overbooking', async () => {
    const id = String((await create(pres.token)).data.id);
    const people = await Promise.all(Array.from({ length: 10 }, (_, i) => outsider(`p${i}`)));
    const results = await Promise.all(people.map((p) => take(id, p.token)));
    expect(results.filter((r) => r.data.ok).length).toBe(2);
    expect(results.filter((r) => !r.data.ok).every((r) => r.data.error === 'full' && r.status === 409)).toBe(true);
    const n = await read(id);
    expect(n).toMatchObject({ spotsFilled: 2, status: 'CLOSED', closedReason: 'full' });
    expect((await db().collection(`match_notices/${id}/applicants`).get()).size).toBe(2);
  });
});

describe('Modifica, chiusura, annullamento', () => {
  it('mai sotto i posti presi; aggiungere posti riapre un avviso pieno', async () => {
    const id = String((await create(pres.token, { spotsNeeded: 1 })).data.id);
    await take(id, (await outsider('out')).token);
    expect((await read(id)).status).toBe('CLOSED');

    expect((await call(notices, { action: 'update', id, notice: { spotsNeeded: 0 } }, pres.token)).status).toBe(400);
    expect((await call(notices, { action: 'update', id, notice: { spotsNeeded: 3, matchId: '2030-01-01' } }, pres.token)).data.ok).toBe(true);
    expect(await read(id)).toMatchObject({ status: 'OPEN', closedReason: null, spotsNeeded: 3, spotsFilled: 1, matchId: DAY });

    const player = await makeUser('player', {});
    expect((await call(notices, { action: 'update', id, notice: { spotsNeeded: 9 } }, player.token)).status).toBe(403);
  });

  it('chiuso a mano o annullato: nessuno prende più il posto', async () => {
    const id = String((await create(pres.token)).data.id);
    const out = await outsider('out');
    expect((await call(notices, { action: 'close', id }, pres.token)).data.ok).toBe(true);
    expect((await take(id, out.token)).data.error).toBe('not_open');
    expect((await call(notices, { action: 'cancel', id }, pres.token)).data.ok).toBe(true);
    expect((await take(id, out.token)).data.error).toBe('cancelled');
    expect((await call(notices, { action: 'update', id, notice: { notes: 'x' } }, pres.token)).data.error).toBe('cancelled');
  });

  it('lega sospesa: i membri non creano, nessuno prende posti; lo staff gestisce ancora', async () => {
    const id = String((await create(pres.token)).data.id);
    await db().doc('leagues/calcettari').update({ status: 'suspended' });
    expect((await create(pres.token)).status).toBe(423);
    expect((await take(id, (await outsider('out')).token)).status).toBe(423);
    const ga = await outsider('ga', { platformRole: 'GLOBAL_ADMIN' });
    expect((await call(notices, { action: 'cancel', id }, ga.token)).data.ok).toBe(true);
  });
});

describe('I miei posti, annullamento, invito dopo la partita', () => {
  it('chi prende il posto ne ha una copia sua, aggiornata quando il gestore cambia ora o campo', async () => {
    const id = String((await create(pres.token)).data.id);
    await take(id, (await outsider('out')).token);
    expect((await db().doc(`profiles/out/spots/${id}`).get()).data()).toMatchObject({
      noticeId: id, leagueId: 'calcettari', leagueName: 'I Calcettari', matchId: DAY, locationName: 'Campo Luini', status: 'ACTIVE',
    });
    await call(notices, { action: 'update', id, notice: { locationName: 'Campo Nuovo', dateTime: `${DAY}T20:00:00.000Z` } }, pres.token);
    expect((await db().doc(`profiles/out/spots/${id}`).get()).data()).toMatchObject({ locationName: 'Campo Nuovo', dateTime: `${DAY}T20:00:00.000Z` });
  });

  it('avviso annullato: chi aveva il posto riceve una notifica e il posto risulta annullato', async () => {
    const id = String((await create(pres.token)).data.id);
    await take(id, (await outsider('out')).token);
    expect((await call(notices, { action: 'cancel', id }, pres.token)).data.ok).toBe(true);
    expect((await db().doc(`profiles/out/spots/${id}`).get()).data()?.status).toBe('CANCELLED');
    const bell = (await db().collection('profiles/out/notifications').get()).docs.map((d) => `${d.data().title} ${d.data().body}`);
    expect(bell.some((b) => b.includes('Partita annullata') && b.includes('I Calcettari'))).toBe(true);
  });

  it('invito nella lega: solo dopo la partita, solo i gestori, mai a chi è già membro', async () => {
    const id = String((await create(pres.token)).data.id);
    const out = await outsider('out');
    await take(id, out.token);
    const invite = (token: string, profileId = 'out') => call(notices, { action: 'invite', id, profileId }, token);
    expect((await invite(pres.token)).data.error).toBe('too_early');

    // la partita è passata
    await db().doc(`match_notices/${id}`).update({ dateTime: '2020-01-01T19:30:00.000Z' });
    expect((await invite(out.token)).status).toBe(403);
    expect((await invite(pres.token)).data.ok).toBe(true);
    const bell = (await db().collection('profiles/out/notifications').get()).docs.map((d) => d.data());
    const msg = bell.find((b) => String(b.title).includes('Invito in "I Calcettari"'));
    expect(String(msg?.url)).toMatch(/^\/join\/[A-Za-z0-9]+/);
    expect((await db().doc(`match_notices/${id}/applicants/out`).get()).data()?.invitedAt).toBeTruthy();
    // la persona non entra da sola nella lega: deve usare il link
    expect((await db().doc('memberships/out').get()).exists).toBe(false);

    // chi è già membro non viene invitato
    await db().doc('memberships/out').set({ leagues: { calcettari: { player_id: 'out', league_role: 'PLAYER' } } });
    expect((await invite(pres.token)).data.error).toBe('already_member');
  });
});

describe('L’esterno nella singola partita', () => {
  const ext = (id: string) => ldb().doc(`presences/${DAY}_ext-${id}`);

  it('prende il posto → è iscritto a quella partita (titolare), senza scheda nella lega', async () => {
    const id = String((await create(pres.token)).data.id);
    await take(id, (await outsider('out')).token);
    const p = (await ext('out').get()).data()!;
    expect(p).toMatchObject({ date: DAY, player_id: 'ext-out', status: 'confirmed', external: { profileId: 'out', name: 'Esterno out', noticeId: id } });
    expect((await ldb().doc('players/ext-out').get()).exists).toBe(false);
    const { starterIds } = await inLeague('calcettari', () => loadRankedPresences(DAY));
    expect(starterIds).toContain('ext-out');
  });

  it('porta il livello della sua lega (OVR e parametri) per bilanciare le squadre; senza lega quello di partenza', async () => {
    const id = String((await create(pres.token, { spotsNeeded: 2 })).data.id);
    // "luca" gioca nella Lega Amici con OVR 8 e i suoi parametri
    const luca = await outsider('luca');
    await db().doc('leagues/amici').set({ id: 'amici', name: 'Lega Amici', status: 'active' });
    await db().doc('leagues/amici/players/luca').set({ id: 'luca', userId: 'luca', overall_rating: 8, stats: { Difesa: 9, Tiro: 7 }, position: 'Difensore', stat_reviewed_at: '2026-11-01T10:00:00.000Z' });
    await take(id, luca.token);
    expect((await ext('luca').get()).data()?.external).toMatchObject({ overall_rating: 8, stats: { Difesa: 9, Tiro: 7 }, position: 'Difensore', ratedIn: 'Lega Amici' });

    await take(id, (await outsider('nuovo')).token);
    const nuovo = (await ext('nuovo').get()).data()?.external;
    expect(nuovo?.overall_rating).toBeUndefined();
    expect(nuovo?.stats).toBeUndefined();
  });

  it('il gestore lo toglie prima della partita: posto libero, avviso riaperto, persona avvisata', async () => {
    const id = String((await create(pres.token, { spotsNeeded: 1 })).data.id);
    await take(id, (await outsider('out')).token);
    expect((await read(id)).status).toBe('CLOSED');
    expect((await call(notices, { action: 'remove', id, profileId: 'out' }, pres.token)).data.ok).toBe(true);
    expect(await read(id)).toMatchObject({ status: 'OPEN', spotsFilled: 0 });
    expect((await ext('out').get()).exists).toBe(false);
    expect((await db().doc(`profiles/out/spots/${id}`).get()).data()?.status).toBe('REMOVED');
    const bell = (await db().collection('profiles/out/notifications').get()).docs.map((d) => String(d.data().title));
    expect(bell).toContain('↩️ Posto liberato');
    // a partita iniziata non si toglie più
    await take(id, (await outsider('altro')).token);
    await db().doc(`match_notices/${id}`).update({ dateTime: '2020-01-01T19:30:00.000Z' });
    expect((await call(notices, { action: 'remove', id, profileId: 'altro' }, pres.token)).data.error).toBe('too_late');
  });

  it('avviso annullato prima della partita: l’esterno esce dagli iscritti', async () => {
    const id = String((await create(pres.token)).data.id);
    await take(id, (await outsider('out')).token);
    await call(notices, { action: 'cancel', id }, pres.token);
    expect((await ext('out').get()).exists).toBe(false);
  });

  it('partita archiviata: esito, gol e MVP solo nella sua carriera; partita cancellata: esito tolto', async () => {
    const id = String((await create(pres.token)).data.id);
    await take(id, (await outsider('out')).token);
    await ldb().doc(`matches/${DAY}`).set({
      id: DAY, match_date: DAY, status: 'completed', score_white: 3, score_black: 1,
      team_white: [{ id: 'ext-out', name: 'Esterno out' }, { id: 'pres', name: 'Presidente' }], team_black: [],
      scorers: [{ player_id: 'ext-out', goals: 2 }], mvp_player_id: 'ext-out', profile_effects: { pres: 'won' },
    });
    expect((await call(notify, { type: 'first_match', date: DAY }, pres.token)).data.ok).toBe(true);
    expect((await db().doc(`profiles/out/spots/${id}`).get()).data()).toMatchObject({ result: 'won', goals: 2, mvp: true });
    expect((await ldb().doc('players/ext-out').get()).exists).toBe(false); // la lega non lo conta

    await ldb().doc(`matches/${DAY}`).delete();
    await call(notify, { type: 'first_match', date: DAY }, pres.token);
    expect((await db().doc(`profiles/out/spots/${id}`).get()).data()).toMatchObject({ result: null, goals: 0, mvp: false });
  });

  it('voto MVP dell’esterno: solo nella finestra, solo per chi era in squadra, solo chi ha il posto', async () => {
    const id = String((await create(pres.token)).data.id);
    const out = await outsider('out');
    await take(id, out.token);
    await ldb().doc(`generated_teams/${DAY}`).set({ id: DAY, date: DAY, team_white: [{ id: 'ext-out', name: 'Esterno out' }], team_black: [{ id: 'pres', name: 'Presidente' }] });
    const vote = (token: string, playerId: string) => call(notices, { action: 'mvp_vote', id, playerId }, token);

    expect((await vote(out.token, 'pres')).data.error).toBe('vote_closed'); // la partita non è ancora giocata
    // la partita è iniziata 3 ore fa: il voto è aperto
    await db().doc(`match_notices/${id}`).update({ dateTime: new Date(Date.now() - 3 * 3_600_000).toISOString() });
    const view = (await call(notices, { action: 'match_view', id }, out.token)).data;
    expect(view.teams).toEqual({ white: [{ id: 'ext-out', name: 'Esterno out' }], black: [{ id: 'pres', name: 'Presidente' }] });
    expect((await vote(out.token, 'nessuno')).data.error).toBe('not_candidate');
    expect((await vote(out.token, 'pres')).data.ok).toBe(true);
    expect((await ldb().doc(`mvp_votes/${DAY}_out`).get()).data()).toMatchObject({ date: DAY, voter_id: 'out', player_id: 'pres' });
    expect((await call(notices, { action: 'match_view', id }, out.token)).data.myVote).toBe('pres');

    const stranger = await outsider('estraneo');
    expect((await vote(stranger.token, 'pres')).status).toBe(403);
  });
});

describe('Notifiche all’esterno', () => {
  const bellOf = async (uid: string) => (await db().collection(`profiles/${uid}/notifications`).get()).docs.map((d) => d.data());

  it('"partita confermata" e sostituzioni arrivano all’esterno (modalità "tutti") e aprono la Bacheca', async () => {
    const id = String((await create(pres.token)).data.id);
    const out = await outsider('out');
    await take(id, out.token);
    await ldb().doc('settings/notifications').set({ mode: 'all' });
    const res = await call(notify, { type: 'match_confirmed', date: DAY, playerIds: ['ext-out', 'pres'] }, pres.token);
    expect(res.data.ok).toBe(true);
    const mine = await bellOf('out');
    expect(mine.map((n) => String(n.title))).toContain('⚽ Partita confermata');
    expect(mine.find((n) => String(n.title).includes('Partita confermata'))?.url).toBe('/board');
    // nessun "profilo" fantasma con l'id ext-…
    expect((await db().collection('profiles/ext-out/notifications').get()).size).toBe(0);
    // un membro vede il suo link normale
    expect((await bellOf('pres')).find((n) => String(n.title).includes('Partita confermata'))?.url).not.toBe('/board');
  });

  it('modalità prova (predefinita): niente all’esterno, solo agli admin', async () => {
    const id = String((await create(pres.token)).data.id);
    await take(id, (await outsider('out')).token);
    await call(notify, { type: 'match_confirmed', date: DAY, playerIds: ['ext-out'] }, pres.token);
    expect((await bellOf('out')).filter((n) => String(n.title).includes('Partita confermata'))).toHaveLength(0);
  });

  it('avviso "Vota l’MVP" (cron): anche gli esterni di quella partita', async () => {
    process.env.CRON_SECRET = 'segreto-di-prova';
    const start = new Date(Date.now() - 2 * 3_600_000);
    const day = start.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    const time = start.toLocaleTimeString('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    await ldb().doc('settings/app_config').set({ standard_match_time: time });
    await ldb().doc('settings/notifications').set({ mode: 'all' });
    await ldb().doc(`generated_teams/${day}`).set({ id: day, date: day, confirmed: true, team_white: [{ id: 'pres', name: 'Presidente' }], team_black: [] });
    await ldb().doc(`presences/${day}_ext-out`).set({
      id: `${day}_ext-out`, date: day, player_id: 'ext-out', status: 'confirmed', order_index: 0,
      external: { profileId: 'out', userId: 'out', name: 'Esterno out', noticeId: 'n' },
    });
    await outsider('out');
    const res = await call(cron, undefined, undefined, 'http://localhost/api/cron/mvp-vote', { authorization: 'Bearer segreto-di-prova' });
    expect(res.status).toBe(200);
    const vote = (await bellOf('out')).find((n) => String(n.title).includes('Vota l’MVP'));
    expect(vote?.url).toBe('/board');
    expect((await bellOf('pres')).find((n) => String(n.title).includes('Vota l’MVP'))?.url).toBe(`/teams?date=${day}`);
  });
});

describe('Avvisi: chi ha preso il posto lo restituisce', () => {
  const leave = (id: string, token: string) => call(notices, { action: 'leave', id }, token);
  const ext = (uid: string) => ldb().doc(`presences/${DAY}_ext-${uid}`);
  const titles = async (uid: string) => (await db().collection(`profiles/${uid}/notifications`).get()).docs.map((d) => String(d.data().title));

  it('rinuncia al posto: sparisce da tutte le parti, il posto torna libero, i gestori lo sanno', async () => {
    const id = String((await create(pres.token, { spotsNeeded: 1 })).data.id);
    const out = await outsider('out');
    await take(id, out.token);
    expect(await read(id)).toMatchObject({ status: 'CLOSED', closedReason: 'full', spotsFilled: 1 });
    expect((await ext('out').get()).exists).toBe(true);

    expect((await leave(id, out.token)).data.ok).toBe(true);
    expect(await read(id)).toMatchObject({ status: 'OPEN', spotsFilled: 0 });
    expect((await db().doc(`match_notices/${id}/applicants/out`).get()).exists).toBe(false);
    expect((await db().doc(`profiles/out/spots/${id}`).get()).exists).toBe(false);
    expect((await ext('out').get()).exists).toBe(false);
    // il presidente (e chi ha pubblicato l'avviso) riceve la notifica della rinuncia
    expect(await titles('pres')).toContain('↩️ Posto liberato');
    // una seconda volta non c'è più nulla da restituire
    expect((await leave(id, out.token)).data.error).toBe('not_applicant');
    // e può riprendere il posto
    expect((await take(id, out.token)).data.ok).toBe(true);
  });

  it('avviso chiuso a mano: dopo la rinuncia si riapre (i posti sono liberi)', async () => {
    const id = String((await create(pres.token)).data.id);
    const out = await outsider('out');
    await take(id, out.token);
    await call(notices, { action: 'close', id }, pres.token);
    expect(await read(id)).toMatchObject({ status: 'CLOSED', closedReason: 'manual' });
    expect((await leave(id, out.token)).data.ok).toBe(true);
    expect(await read(id)).toMatchObject({ status: 'OPEN', spotsFilled: 0 });
  });

  it('a partita iniziata non si rinuncia più; chi non ha preso il posto non può', async () => {
    const id = String((await create(pres.token)).data.id);
    const out = await outsider('out');
    await take(id, out.token);
    expect((await leave(id, (await outsider('altro')).token)).data.error).toBe('not_applicant');
    await db().doc(`match_notices/${id}`).update({ dateTime: '2020-01-01T19:30:00.000Z' });
    expect((await leave(id, out.token)).data.error).toBe('too_late');
    expect((await db().doc(`profiles/out/spots/${id}`).get()).exists).toBe(true);
  });

  it('posto annullato o tolto dal gestore: la persona lo toglie dal suo elenco, senza toccare l\u2019avviso', async () => {
    const id = String((await create(pres.token)).data.id);
    const out = await outsider('out');
    await take(id, out.token);
    await call(notices, { action: 'remove', id, profileId: 'out' }, pres.token);
    expect((await db().doc(`profiles/out/spots/${id}`).get()).data()?.status).toBe('REMOVED');
    const before = await read(id);
    expect((await leave(id, out.token)).data.ok).toBe(true);
    expect((await db().doc(`profiles/out/spots/${id}`).get()).exists).toBe(false);
    expect(await read(id)).toMatchObject({ spotsFilled: before.spotsFilled, status: before.status });
    // avviso annullato: stesso discorso
    const id2 = String((await create(pres.token)).data.id);
    await take(id2, out.token);
    await call(notices, { action: 'cancel', id: id2 }, pres.token);
    expect((await leave(id2, out.token)).data.ok).toBe(true);
    expect((await db().doc(`profiles/out/spots/${id2}`).get()).exists).toBe(false);
  });

  it('chi ha pubblicato l\u2019avviso riceve "posto preso" anche se la lega non ha presidenti né collaboratori', async () => {
    // a platform admin (no card in the league) publishes; nobody in the league has a manager role
    await ldb().doc('players/pres').update({ leagueRole: 'PLAYER' });
    const ga = await outsider('ga', { platformRole: 'GLOBAL_ADMIN' });
    const id = String((await create(ga.token)).data.id);
    await take(id, (await outsider('out')).token);
    expect(await titles('ga')).toContain('🙋 Posto preso');
    expect(await titles('pres')).not.toContain('🙋 Posto preso');
    const out2 = await outsider('out2');
    await take(id, out2.token);
    await leave(id, out2.token);
    expect(await titles('ga')).toContain('↩️ Posto liberato');
  });
});

describe('Avvisi scaduti', () => {
  it('il lavoro periodico chiude gli avvisi con la partita già iniziata, senza toccare gli altri né chi ha preso il posto', async () => {
    const past = String((await create(pres.token)).data.id);
    const future = String((await create(pres.token)).data.id);
    await take(past, (await outsider('out')).token);
    await db().doc(`match_notices/${past}`).update({ dateTime: new Date(Date.now() - 3_600_000).toISOString() });
    const res = await call(cron, undefined, undefined, 'http://localhost/api/cron/mvp-vote', { authorization: 'Bearer segreto-di-prova' });
    expect(res.status).toBe(200);
    expect(res.data.noticesClosed).toBe(1);
    expect(await read(past)).toMatchObject({ status: 'CLOSED', closedReason: 'expired', spotsFilled: 1 });
    expect((await db().doc(`match_notices/${past}/applicants/out`).get()).exists).toBe(true);
    expect(await read(future)).toMatchObject({ status: 'OPEN' });
    // un secondo passaggio non fa altro
    const again = await call(cron, undefined, undefined, 'http://localhost/api/cron/mvp-vote', { authorization: 'Bearer segreto-di-prova' });
    expect(again.data.noticesClosed).toBe(0);
  });
});
