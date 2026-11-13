/**
 * Fake data for the end-to-end tests, written with the Admin SDK into the LOCAL emulators only
 * (project demo-clubcalcetto, ports of firebase.json). Never reaches production.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { Page } from '@playwright/test';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const PROJECT = 'demo-clubcalcetto';

const app = getApps()[0] || initializeApp({ projectId: PROJECT });
export const db = getFirestore(app);
export const auth = getAuth(app);

export const ADMIN = { email: 'macciolino84@gmail.com', password: 'password123' };
export const PLAYERS = ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei', 'Sette', 'Otto', 'Nove', 'Dieci'].map((n, i) => ({
  id: `t${i + 1}`,
  name: `Test ${n}`,
}));

/** YYYY-MM-DD in Italian time, `offset` days from today. */
export function romeDay(offset = 0): string {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
}

async function clear() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/**
 * Super admin (email + password, verified) and 10 players; yesterday's match with teams already made
 * (5vs5, not archived yet → "Da chiudere"); the official day is tomorrow.
 */
export async function seedMatchDay(): Promise<{ date: string }> {
  await clear();
  const now = new Date().toISOString();
  const date = romeDay(-1);
  await auth.createUser({ uid: 'e2e-super', email: ADMIN.email, password: ADMIN.password, emailVerified: true, displayName: 'Marco Test' });

  const batch = db.batch();
  const base = { avatar_url: null, position: 'Esterno', is_guest: false, stats: { Velocità: 6, Tiro: 6, Difesa: 6 }, overall_rating: 6, matches_won: 0, matches_drawn: 0, matches_lost: 0, created_at: now, updated_at: now };
  batch.set(db.doc('profiles/p-1'), { ...base, id: 'p-1', user_id: 'e2e-super', email: ADMIN.email, full_name: 'Marco Test', role: 'admin' });
  PLAYERS.forEach((p) => batch.set(db.doc(`profiles/${p.id}`), { ...base, id: p.id, user_id: p.id, email: `${p.id}@example.com`, full_name: p.name, role: 'player' }));
  batch.set(db.doc(`generated_teams/${date}`), {
    id: date,
    date,
    team_white: PLAYERS.slice(0, 5),
    team_black: PLAYERS.slice(5),
    created_at: now,
    confirmed: true,
  });
  // Come nella realtà: chi è in squadra era anche iscritto a quel giorno (10 titolari)
  PLAYERS.forEach((p, i) =>
    batch.set(db.doc(`presences/${date}_${p.id}`), { id: `${date}_${p.id}`, date, player_id: p.id, status: 'confirmed', order_index: i + 1, created_at: new Date(Date.now() - (20 - i) * 60_000).toISOString() })
  );
  batch.set(db.doc('settings/official_match'), { date: romeDay(1), updated_at: now });
  batch.set(db.doc('settings/app_config'), { standard_total_cost: 80, standard_match_time: '20:30', default_field_id: 'f1' });
  batch.set(db.doc('sport_fields/f1'), { id: 'f1', name: 'Campo Test', address: 'Via dei Test 1', cost: 80 });
  await batch.commit();
  return { date };
}

/** Logs in as the super admin through the real login form. */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('#auth-email').fill(ADMIN.email);
  await page.locator('#auth-password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 60_000 });
}

/** Waits until a Firestore document satisfies `check` (the app writes asynchronously). */
export async function waitForDoc(path: string, check: (data: FirebaseFirestore.DocumentData | undefined) => boolean, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  let last: FirebaseFirestore.DocumentData | undefined;
  while (Date.now() < end) {
    last = (await db.doc(path).get()).data();
    if (check(last)) return last;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${path} non è arrivato allo stato atteso: ${JSON.stringify(last)}`);
}
