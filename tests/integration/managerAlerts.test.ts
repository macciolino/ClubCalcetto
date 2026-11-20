/**
 * Integration: alerts to the league managers (presidents + collaborators, bell + push) when the starters of a match
 * change: full again after withdrawals and new sign-ups, a player missing from saved teams, a deleted guest.
 * Real route handlers on the Firestore and Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { POST as notify } from '@/app/api/notify/route';
import { assertEmulators, call, db, futureDate, ldb, makeUser, resetEmulators } from './helpers';

assertEmulators();

const DAY = futureDate(5);
let pres: { uid: string; token: string };

beforeEach(async () => {
  await resetEmulators();
  pres = await makeUser('pres', { role: 'admin', full_name: 'Presidente' });
  await ldb().doc('settings/match_formats').set({ days: { [DAY]: { format: '8v8', formation: '3-3-1' } } });
});

/** n players with a card and a sign-up for DAY, in order. */
async function signUp(ids: string[], from = 0) {
  for (let i = 0; i < ids.length; i++) {
    await ldb().doc(`players/${ids[i]}`).set({ id: ids[i], full_name: `Giocatore ${ids[i]}`, is_guest: true, userId: null, leagueRole: 'PLAYER' }, { merge: true });
    await ldb().doc(`presences/${DAY}_${ids[i]}`).set({ id: `${DAY}_${ids[i]}`, date: DAY, player_id: ids[i], joined_at: Timestamp.fromMillis(1_700_000_000_000 + (from + i) * 1000) });
  }
}
const check = () => call(notify, { type: 'reconcile', date: DAY }, pres.token);
const bell = async () => (await db().collection('profiles/pres/notifications').get()).docs.map((d) => String(d.data().title));

describe('Avvisi ai gestori quando cambiano i titolari', () => {
  it('16 al completo → escono 2 → ne entrano 2: il presidente riceve di nuovo l’avviso', async () => {
    const ids = Array.from({ length: 16 }, (_, i) => `g${i}`);
    await signUp(ids);
    await check();
    expect((await bell()).filter((t) => t.includes('16 iscritti'))).toHaveLength(1);
    await ldb().doc(`presences/${DAY}_g3`).delete();
    await ldb().doc(`presences/${DAY}_g7`).delete();
    await check();
    await signUp(['n1', 'n2'], 100);
    await check();
    expect((await bell()).filter((t) => t.includes('16 iscritti'))).toHaveLength(2);
    // quando sono usciti, il presidente è stato avvisato che mancano 2 giocatori
    expect(await bell()).toContain('⚠️ Mancano 2 giocatori');
  });

  it('solo presidente e collaboratori ricevono l’avviso; i giocatori no', async () => {
    const coll = await makeUser('coll', { full_name: 'Collaboratore' });
    await ldb().doc('players/coll').update({ leagueRole: 'COLLABORATOR' });
    const pl = await makeUser('pl', {});
    await signUp(Array.from({ length: 16 }, (_, i) => `g${i}`));
    await check();
    await ldb().doc(`presences/${DAY}_g0`).delete();
    await call(notify, { type: 'reconcile', date: DAY }, pl.token);
    const titles = async (uid: string) => (await db().collection(`profiles/${uid}/notifications`).get()).docs.map((d) => String(d.data().title));
    expect(await titles('coll')).toContain('⚠️ Manca un giocatore');
    expect(await titles('pres')).toContain('⚠️ Manca un giocatore');
    expect((await titles('pl')).some((t) => t.includes('Manca'))).toBe(false);
  });

  it('ospite cancellato dopo le squadre: la sua iscrizione non conta più e il presidente sa che manca un giocatore', async () => {
    const ids = Array.from({ length: 16 }, (_, i) => `g${i}`);
    await signUp(ids);
    await ldb().doc(`generated_teams/${DAY}`).set({
      id: DAY,
      date: DAY,
      team_white: ids.slice(0, 8).map((id) => ({ id, name: `Giocatore ${id}` })),
      team_black: ids.slice(8).map((id) => ({ id, name: `Giocatore ${id}` })),
      confirmed: true,
    });
    await check();
    // la scheda sparisce ma l'iscrizione resta (dati vecchi): non deve più occupare un posto
    await ldb().doc('players/g5').delete();
    await check();
    const t = await bell();
    expect(t).toContain('⚠️ Manca un giocatore');
    const body = (await db().collection('profiles/pres/notifications').get()).docs.map((d) => String(d.data().body)).find((b) => b.includes('Giocatore g5'));
    expect(body).toMatch(/15\/16 titolari, un posto libero nelle squadre/);
  });

  it('formato ridotto (8vs8 → 7vs7): avviso ai gestori e squadre da confermare di nuovo; un giocatore non può inviarlo', async () => {
    const pl = await makeUser('pl', {});
    await ldb().doc(`generated_teams/${DAY}`).set({ id: DAY, date: DAY, team_white: [], team_black: [], confirmed: true, confirmed_by: 'pres' });
    expect((await call(notify, { type: 'format_reduced', date: DAY, from: '8v8', to: '7v7' }, pl.token)).status).toBe(403);
    expect((await call(notify, { type: 'format_reduced', date: DAY, from: '8v8', to: '7v7' }, pres.token)).data.ok).toBe(true);
    expect((await ldb().doc(`generated_teams/${DAY}`).get()).data()).toMatchObject({ confirmed: false });
    expect(await bell()).toContain('📉 Partita ridotta a 7vs7');
    expect((await db().collection('profiles/pl/notifications').get()).size).toBe(0);
    // verso l'alto non è un "ridotto"
    expect((await call(notify, { type: 'format_reduced', date: DAY, from: '5v5', to: '7v7' }, pres.token)).data.skipped).toBe('not_reduced');
  });
});
