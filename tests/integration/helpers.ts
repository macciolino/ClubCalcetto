/**
 * Helpers for integration tests. They run ONLY inside `firebase emulators:exec` (fake project demo-clubcalcetto):
 * the Admin SDK and the API routes then talk to the local emulators (see src/lib/firebase/admin.ts).
 */
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export const PROJECT = process.env.GCLOUD_PROJECT || 'demo-clubcalcetto';
const FS = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;

/** Refuses to run anywhere but on the emulators of the demo project. */
export function assertEmulators() {
  if (!FS || !AUTH || !PROJECT.startsWith('demo-')) {
    throw new Error('I test d’integrazione girano solo sugli emulatori: usa "npm run test:integration".');
  }
}

/** Empties Firestore and Auth of the emulators. */
export async function resetEmulators() {
  assertEmulators();
  await fetch(`http://${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

export const db = () => adminDb();

/** Profile as the app writes it. */
export function profileDoc(id: string, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id,
    user_id: id,
    email: `${id}@example.com`,
    full_name: `Giocatore ${id}`,
    avatar_url: null,
    role: 'player',
    position: 'Esterno',
    is_guest: false,
    stats: { Velocità: 6, Tiro: 6, Difesa: 6 },
    overall_rating: 6,
    matches_won: 0,
    matches_drawn: 0,
    matches_lost: 0,
    created_at: now,
    updated_at: now,
    ...extra,
  };
}

/** Auth account (email + password, email verified) + its profile. Returns an ID token to call the API routes. */
export async function makeUser(uid: string, profile: Record<string, unknown> = {}, opts: { email?: string; withProfile?: boolean } = {}) {
  const email = opts.email || `${uid}@example.com`;
  await adminAuth().createUser({ uid, email, password: 'password123', emailVerified: true });
  if (opts.withProfile !== false) await db().doc(`profiles/${uid}`).set(profileDoc(uid, { email, ...profile }));
  return { uid, email, token: await idToken(email) };
}

/** Signs in on the Auth emulator (REST) and returns a fresh ID token. */
export async function idToken(email: string, password = 'password123'): Promise<string> {
  const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = (await res.json()) as { idToken?: string; error?: { message: string } };
  if (!data.idToken) throw new Error(`login emulatore non riuscito: ${data.error?.message}`);
  return data.idToken;
}

type Handler = (req: Request) => Promise<Response>;

/** Calls an API route handler like the browser would. */
export async function call(handler: Handler, body?: unknown, token?: string, url = 'http://localhost/api/test') {
  const res = await handler(
    new Request(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
}

export const futureDate = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
};
