/**
 * Automated tests for firestore.rules, run against the LOCAL emulators only.
 *
 * Usage: npm run test:rules
 * (starts temporary, empty Auth + Firestore emulators on separate ports for project "demo-clubcalcetto",
 *  runs these checks, then shuts them down — no data is kept, production is never touched)
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc, collection, getDocs,
} from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider, createUserWithEmailAndPassword,
} from 'firebase/auth';

const PROJECT_ID = 'demo-clubcalcetto';
// Hosts are provided by `firebase emulators:exec` (separate test ports, see firebase.test.json)
const [FS_HOST, FS_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180').split(':');
const AUTH_URL = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199'}`;
let appCounter = 0;

async function client(identity) {
  const app = initializeApp(
    { apiKey: 'emulator-local-key', projectId: PROJECT_ID, appId: '1:000000000000:web:emulator' },
    `client-${appCounter++}`
  );
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FS_HOST, Number(FS_PORT));
  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });
  let uid = null;
  if (identity?.google) {
    const cred = await signInWithCredential(
      auth,
      GoogleAuthProvider.credential(JSON.stringify({ email_verified: true, ...identity.google }))
    );
    uid = cred.user.uid;
  } else if (identity?.password) {
    const cred = await createUserWithEmailAndPassword(auth, identity.password.email, 'password123');
    uid = cred.user.uid;
  }
  return { db, uid };
}

let passed = 0;
let failed = 0;
async function expectAllowed(label, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ALLOWED  ${label}`);
  } catch (e) {
    failed++;
    console.log(`  ✘ expected ALLOWED but was denied: ${label} (${e.code || e.message})`);
  }
}
async function expectDenied(label, fn) {
  try {
    await fn();
    failed++;
    console.log(`  ✘ expected DENIED but was allowed: ${label}`);
  } catch (e) {
    if (e.code === 'permission-denied') {
      passed++;
      console.log(`  ✔ DENIED   ${label}`);
    } else {
      failed++;
      console.log(`  ✘ unexpected error: ${label} (${e.code || e.message})`);
    }
  }
}

const baseProfile = (id, extra = {}) => ({
  id, user_id: id, email: `${id}@example.com`, full_name: id, avatar_url: null, role: 'player',
  position: 'Esterno', is_guest: false, stats: { Tiro: 6, Difesa: 6 }, overall_rating: 6,
  matches_won: 0, matches_drawn: 0, matches_lost: 0, created_at: 'x', updated_at: 'x', ...extra,
});

// ---------- identities ----------
// Impostor: registers FIRST with email/password using the super admin address (email NOT verified).
// Its session token has email_verified = false, so the rules must not treat it as super admin.
const impostor = await client({ password: { email: 'macciolino84@gmail.com' } });
const anon = await client(null);
const superAdmin = await client({ google: { sub: 'super', email: 'macciolino84@gmail.com' } });
const playerA = await client({ google: { sub: 'player-a', email: 'player.a@example.com' } });
const playerB = await client({ google: { sub: 'player-b', email: 'player.b@example.com' } });
const adminC = await client({ google: { sub: 'admin-c', email: 'admin.c@example.com' } });
// ---------- setup (by the super admin) ----------
console.log('\nSetup');
await expectAllowed('super admin creates its own profile p-1', () =>
  setDoc(doc(superAdmin.db, 'profiles', 'p-1'), baseProfile('p-1', { role: 'admin', email: 'macciolino84@gmail.com' })));
await expectAllowed('super admin creates an admin profile', () =>
  setDoc(doc(superAdmin.db, 'profiles', adminC.uid), baseProfile(adminC.uid, { role: 'admin' })));
await expectAllowed('super admin creates a legacy "user" profile for player B', () =>
  setDoc(doc(superAdmin.db, 'profiles', playerB.uid), baseProfile(playerB.uid, { role: 'user', matches_won: 5 })));
await expectAllowed('super admin writes settings', () =>
  setDoc(doc(superAdmin.db, 'settings', 'official_match'), { date: '2026-11-10' }));
await expectAllowed('super admin creates presence of player B', () =>
  setDoc(doc(superAdmin.db, 'presences', 'pres-b'), { id: 'pres-b', date: '2026-11-10', player_id: playerB.uid, status: 'waitlist', order_index: 11, created_at: 'x' }));

console.log('\nNot signed in');
await expectDenied('anonymous reads profiles', () => getDocs(collection(anon.db, 'profiles')));
await expectDenied('anonymous writes settings', () => setDoc(doc(anon.db, 'settings', 'x'), { a: 1 }));

console.log('\nPlayer A (normal user)');
await expectAllowed('reads profiles', () => getDocs(collection(playerA.db, 'profiles')));
await expectDenied('creates own profile as ADMIN', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), baseProfile(playerA.uid, { role: 'admin' })));
await expectDenied('creates own profile with fake match history', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), baseProfile(playerA.uid, { matches_won: 20 })));
await expectAllowed('creates own profile as player', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), baseProfile(playerA.uid)));
await expectDenied('creates a profile with someone else\'s id', () =>
  setDoc(doc(playerA.db, 'profiles', 'someone-else'), baseProfile('someone-else')));
await expectAllowed('changes own name / avatar / position', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), { full_name: 'New Name', avatar_url: 'data:x', position: 'Punta', updated_at: 'y' }, { merge: true }));
await expectDenied('changes own stats', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), { stats: { Tiro: 10, Difesa: 10 } }, { merge: true }));
await expectDenied('changes own overall rating', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), { overall_rating: 10 }, { merge: true }));
await expectDenied('promotes self to admin', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), { role: 'admin' }, { merge: true }));
await expectDenied('edits player B\'s profile', () =>
  setDoc(doc(playerA.db, 'profiles', playerB.uid), { full_name: 'Hacked' }, { merge: true }));
await expectDenied('deletes player B\'s profile', () => deleteDoc(doc(playerA.db, 'profiles', playerB.uid)));
await expectAllowed('signs up for a match (own presence)', () =>
  setDoc(doc(playerA.db, 'presences', 'pres-a'), { id: 'pres-a', date: '2026-11-10', player_id: playerA.uid, status: 'confirmed', order_index: 1, created_at: 'x' }));
await expectDenied('signs up player B', () =>
  setDoc(doc(playerA.db, 'presences', 'pres-fake'), { id: 'pres-fake', date: '2026-11-10', player_id: playerB.uid, status: 'confirmed', order_index: 2, created_at: 'x' }));
await expectAllowed('promotes B from waitlist (status/order only — automatic substitution)', () =>
  setDoc(doc(playerA.db, 'presences', 'pres-b'), { status: 'confirmed', order_index: 2 }, { merge: true }));
await expectDenied('reassigns B\'s presence to someone else', () =>
  setDoc(doc(playerA.db, 'presences', 'pres-b'), { player_id: playerA.uid }, { merge: true }));
await expectDenied('deletes B\'s presence', () => deleteDoc(doc(playerA.db, 'presences', 'pres-b')));
await expectAllowed('withdraws own presence', () => deleteDoc(doc(playerA.db, 'presences', 'pres-a')));
for (const col of ['settings', 'stat_categories', 'matches', 'generated_teams', 'match_payments', 'sport_fields']) {
  await expectDenied(`writes ${col}`, () => setDoc(doc(playerA.db, col, 'hack'), { a: 1 }));
}
await expectAllowed('reads settings', () => getDoc(doc(playerA.db, 'settings', 'official_match')));

console.log('\nAdmin C (promoted by the super admin)');
await expectAllowed('edits player A\'s stats', () =>
  setDoc(doc(adminC.db, 'profiles', playerA.uid), { stats: { Tiro: 9, Difesa: 7 }, overall_rating: 8 }, { merge: true }));
await expectAllowed('normalises legacy role user -> player on B', () =>
  setDoc(doc(adminC.db, 'profiles', playerB.uid), { role: 'player' }, { merge: true }));
await expectDenied('promotes player A to admin', () =>
  setDoc(doc(adminC.db, 'profiles', playerA.uid), { role: 'admin' }, { merge: true }));
await expectDenied('demotes the super admin', () =>
  setDoc(doc(adminC.db, 'profiles', 'p-1'), { role: 'player' }, { merge: true }));
await expectDenied('deletes the super admin profile', () => deleteDoc(doc(adminC.db, 'profiles', 'p-1')));
await expectAllowed('creates a guest player', () =>
  setDoc(doc(adminC.db, 'profiles', 'guest-1'), baseProfile('guest-1', { is_guest: true, user_id: null })));
await expectDenied('creates a guest as admin', () =>
  setDoc(doc(adminC.db, 'profiles', 'guest-2'), baseProfile('guest-2', { role: 'admin' })));
await expectAllowed('writes settings', () =>
  setDoc(doc(adminC.db, 'settings', 'app_config'), { standard_total_cost: 80 }, { merge: true }));
await expectAllowed('adds player B presence', () =>
  setDoc(doc(adminC.db, 'presences', 'pres-b2'), { id: 'pres-b2', date: '2026-11-11', player_id: playerB.uid, status: 'confirmed', order_index: 1, created_at: 'x' }));
await expectAllowed('deletes a guest player', () => deleteDoc(doc(adminC.db, 'profiles', 'guest-1')));

console.log('\nImpostor (email/password account using the super admin address, NOT verified)');
await expectDenied('writes settings', () => setDoc(doc(impostor.db, 'settings', 'official_match'), { date: 'x' }));
await expectDenied('edits p-1', () => setDoc(doc(impostor.db, 'profiles', 'p-1'), { full_name: 'x' }, { merge: true }));

console.log('\nSuper admin');
await expectAllowed('promotes player A to admin', () =>
  setDoc(doc(superAdmin.db, 'profiles', playerA.uid), { role: 'admin' }, { merge: true }));
await expectDenied('deletes its own super admin profile p-1', () => deleteDoc(doc(superAdmin.db, 'profiles', 'p-1')));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
