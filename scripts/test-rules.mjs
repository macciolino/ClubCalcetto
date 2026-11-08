/**
 * Automated tests for firestore.rules, run against the LOCAL emulators only.
 *
 * Usage: npm run test:rules
 * (starts temporary, empty Auth + Firestore emulators on separate ports for project "demo-clubcalcetto",
 *  runs these checks, then shuts them down — no data is kept, production is never touched)
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp, updateDoc, increment, runTransaction,
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

// ---------- dates (local time, same logic as the app) ----------
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const thisSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((7 - now.getDay()) % 7));
const plusDays = (n) => ymd(new Date(thisSunday.getFullYear(), thisSunday.getMonth(), thisSunday.getDate() + n));
const TODAY = ymd(now);
const THIS_SUNDAY = ymd(thisSunday);
const NEXT_MONDAY = plusDays(1);
const NEXT_SUNDAY = plusDays(7);
const IN_TWO_WEEKS = plusDays(8);

// A presence as the app writes it (doc id = date_player, joined_at = server time)
const presence = (date, playerId, extra = {}) => ({
  id: `${date}_${playerId}`, date, player_id: playerId, status: 'waitlist', order_index: 0,
  created_at: 'x', joined_at: serverTimestamp(), ...extra,
});
const join = (client, date, playerId, extra) =>
  setDoc(doc(client.db, 'presences', `${date}_${playerId}`), presence(date, playerId, extra));

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
await expectAllowed('super admin signs up player B (today)', () => join(superAdmin, TODAY, playerB.uid));
const presB = `${TODAY}_${playerB.uid}`;

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
  setDoc(doc(playerA.db, 'profiles', playerA.uid), { full_name: 'New Name', avatar_url: 'https://lh3.googleusercontent.com/a/photo', position: 'Punta', updated_at: 'y' }, { merge: true }));
await expectDenied('changes own stats', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), { stats: { Tiro: 10, Difesa: 10 } }, { merge: true }));
await expectDenied('changes own overall rating', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), { overall_rating: 10 }, { merge: true }));
await expectDenied('promotes self to admin', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), { role: 'admin' }, { merge: true }));
await expectDenied('edits player B\'s profile', () =>
  setDoc(doc(playerA.db, 'profiles', playerB.uid), { full_name: 'Hacked' }, { merge: true }));
await expectDenied('deletes player B\'s profile', () => deleteDoc(doc(playerA.db, 'profiles', playerB.uid)));
await expectAllowed(`signs up for this week (${THIS_SUNDAY})`, () => join(playerA, THIS_SUNDAY, playerA.uid));
await expectDenied('signs up for next week before voting is open', () => join(playerA, NEXT_MONDAY, playerA.uid));
await expectDenied('signs up with a non-standard doc id', () =>
  setDoc(doc(playerA.db, 'presences', 'pres-a'), presence(TODAY, playerA.uid, { id: 'pres-a' })));
await expectDenied('signs up with a fake (client) join time to jump the queue', () =>
  join(playerA, TODAY, playerA.uid, { joined_at: new Date('2020-01-01') }));
await expectDenied('signs up with an admin override', () =>
  join(playerA, TODAY, playerA.uid, { admin_override: 'starter' }));
await expectDenied('signs up player B', () => join(playerA, THIS_SUNDAY, playerB.uid));
await expectDenied('changes B status (no more client-side promotions)', () =>
  updateDoc(doc(playerA.db, 'presences', presB), { status: 'confirmed', order_index: 1 }));
await expectDenied('reassigns B presence to someone else', () =>
  updateDoc(doc(playerA.db, 'presences', presB), { player_id: playerA.uid }));
await expectDenied('forces self into the starters', () =>
  updateDoc(doc(playerA.db, 'presences', `${THIS_SUNDAY}_${playerA.uid}`), { admin_override: 'starter' }));
await expectDenied('deletes B presence', () => deleteDoc(doc(playerA.db, 'presences', presB)));
await expectAllowed('withdraws own presence', () => deleteDoc(doc(playerA.db, 'presences', `${THIS_SUNDAY}_${playerA.uid}`)));
await expectDenied('opens next week voting', () =>
  setDoc(doc(playerA.db, 'settings', 'calendar'), { open_until: NEXT_SUNDAY }));
await expectDenied('adds a win to own record', () =>
  updateDoc(doc(playerA.db, 'profiles', playerA.uid), { matches_won: increment(1) }));
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
await expectAllowed('adds player B on a locked day (next week)', () => join(adminC, NEXT_MONDAY, playerB.uid));
await expectAllowed('forces player B into the starters', () =>
  updateDoc(doc(adminC.db, 'presences', presB), { admin_override: 'starter' }));
await expectAllowed('opens next week voting', () =>
  setDoc(doc(adminC.db, 'settings', 'calendar'), { open_until: NEXT_SUNDAY }));
await expectAllowed('saves a match result + W/D/L increments in one transaction', () =>
  runTransaction(adminC.db, async (tx) => {
    const ref = doc(adminC.db, 'profiles', playerA.uid);
    await tx.get(ref);
    tx.update(ref, { matches_won: increment(1), updated_at: 'z' });
    tx.set(doc(adminC.db, 'matches', TODAY), { id: TODAY, match_date: TODAY, status: 'completed', score_white: 3, score_black: 1, profile_effects: { [playerA.uid]: 'won' } }, { merge: true });
  }));
await expectDenied('player deletes a match from history', () => deleteDoc(doc(playerA.db, 'matches', TODAY)));
await expectAllowed('admin deletes a match from history and undoes the win', () =>
  runTransaction(adminC.db, async (tx) => {
    const ref = doc(adminC.db, 'profiles', playerA.uid);
    await tx.get(ref);
    tx.update(ref, { matches_won: increment(-1), updated_at: 'z' });
    tx.delete(doc(adminC.db, 'matches', TODAY));
  }));
await expectAllowed('deletes a guest player', () => deleteDoc(doc(adminC.db, 'profiles', 'guest-1')));
await expectDenied('deletes a registered player (only the super admin can)', () => deleteDoc(doc(adminC.db, 'profiles', playerB.uid)));

console.log('\nPlayer A after voting is open');
await expectAllowed(`signs up for next week (${NEXT_MONDAY})`, () => join(playerA, NEXT_MONDAY, playerA.uid));
await expectDenied('signs up beyond the opened range', () => join(playerA, IN_TWO_WEEKS, playerA.uid));

console.log('\nMVP votes');
const vote = (c, date, voter, player) =>
  setDoc(doc(c.db, 'mvp_votes', `${date}_${voter}`), { date, voter_id: voter, player_id: player, updated_at: serverTimestamp() });
await expectAllowed('player A votes MVP for today', () => vote(playerA, TODAY, playerA.uid, playerB.uid));
await expectAllowed('player A changes own vote', () => vote(playerA, TODAY, playerA.uid, adminC.uid));
await expectDenied('player A votes on behalf of player B', () => vote(playerA, TODAY, playerB.uid, playerA.uid));
await expectDenied('player A votes for a future match', () => vote(playerA, NEXT_MONDAY, playerA.uid, playerB.uid));
await expectDenied('player A votes with a fake time', () =>
  setDoc(doc(playerA.db, 'mvp_votes', `${TODAY}_${playerA.uid}`), { date: TODAY, voter_id: playerA.uid, player_id: 'x', updated_at: 'yesterday' }));
await expectDenied('player B deletes player A vote', () => deleteDoc(doc(playerB.db, 'mvp_votes', `${TODAY}_${playerA.uid}`)));
await expectAllowed('player B reads the votes', () => getDocs(collection(playerB.db, 'mvp_votes')));
await expectAllowed('admin C test-votes for a future match', () => vote(adminC, NEXT_MONDAY, adminC.uid, playerA.uid));
await expectDenied('player A votes early for next week (no test)', () => vote(playerA, NEXT_MONDAY, playerA.uid, playerB.uid));
await expectAllowed('admin C opens a test vote for everyone', () =>
  setDoc(doc(adminC.db, 'generated_teams', NEXT_MONDAY), { id: NEXT_MONDAY, date: NEXT_MONDAY, team_white: [], team_black: [], created_at: 'x', mvp_vote_test: 'all' }));
await expectAllowed('player A votes early during the test for everyone', () => vote(playerA, NEXT_MONDAY, playerA.uid, playerB.uid));
await expectAllowed('admin C ends the test', () =>
  updateDoc(doc(adminC.db, 'generated_teams', NEXT_MONDAY), { mvp_vote_test: false }));
await expectDenied('player A votes early after the test ended', () => vote(playerA, NEXT_MONDAY, playerA.uid, adminC.uid));
await expectAllowed('admin C clears player A test vote', () => deleteDoc(doc(adminC.db, 'mvp_votes', `${TODAY}_${playerA.uid}`)));

console.log('\nPush devices');
const regToken = (c, token, uid, profileId) =>
  setDoc(doc(c.db, 'push_tokens', token), { uid, profile_id: profileId, platform: 'android', updated_at: serverTimestamp() });
await expectAllowed('player A registers own device', () => regToken(playerA, 'tokA', playerA.uid, playerA.uid));
await expectDenied('player A registers a device for player B profile', () => regToken(playerA, 'tokX', playerA.uid, playerB.uid));
await expectDenied('player A registers a device as player B', () => regToken(playerA, 'tokY', playerB.uid, playerB.uid));
await expectDenied('player B reads player A device', () => getDoc(doc(playerB.db, 'push_tokens', 'tokA')));
await expectAllowed('player A removes own device', () => deleteDoc(doc(playerA.db, 'push_tokens', 'tokA')));

console.log('\nProfile photo');
const jpeg = 'data:image/jpeg;base64,' + 'A'.repeat(2000);
await expectAllowed('player A uploads own photo (small JPEG)', () =>
  updateDoc(doc(playerA.db, 'profiles', playerA.uid), { avatar_url: jpeg, updated_at: 'x' }));
await expectAllowed('player A removes own photo', () =>
  updateDoc(doc(playerA.db, 'profiles', playerA.uid), { avatar_url: null, updated_at: 'x' }));
await expectDenied('player A sets a preset SVG avatar', () =>
  updateDoc(doc(playerA.db, 'profiles', playerA.uid), { avatar_url: 'data:image/svg+xml;utf8,%3Csvg%3E', updated_at: 'x' }));
await expectDenied('player A uploads a huge image', () =>
  updateDoc(doc(playerA.db, 'profiles', playerA.uid), { avatar_url: 'data:image/jpeg;base64,' + 'A'.repeat(200000), updated_at: 'x' }));

console.log('\nImpostor (email/password account using the super admin address, NOT verified)');
await expectDenied('writes settings', () => setDoc(doc(impostor.db, 'settings', 'official_match'), { date: 'x' }));
await expectDenied('edits p-1', () => setDoc(doc(impostor.db, 'profiles', 'p-1'), { full_name: 'x' }, { merge: true }));

console.log('\nSuper admin');
await expectAllowed('promotes player A to admin', () =>
  setDoc(doc(superAdmin.db, 'profiles', playerA.uid), { role: 'admin' }, { merge: true }));
await expectDenied('deletes its own super admin profile p-1', () => deleteDoc(doc(superAdmin.db, 'profiles', 'p-1')));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
