/**
 * Automated tests for firestore.rules, run against the LOCAL emulators only.
 *
 * Usage: npm run test:rules
 * (starts temporary, empty Auth + Firestore emulators on separate ports for project "demo-clubcalcetto",
 *  runs these checks, then shuts them down — no data is kept, production is never touched)
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp, updateDoc, increment, runTransaction, deleteField, FieldPath,
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
  setDoc(doc(client.db, ...LG, 'presences', `${date}_${playerId}`), presence(date, playerId, extra));

const baseProfile = (id, extra = {}) => ({
  id, user_id: id, full_name: id, avatar_url: null, role: 'player',
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
const newbie = await client({ google: { sub: 'newbie', email: 'newbie@example.com' } }); // C3: no profile yet
const adminC = await client({ google: { sub: 'admin-c', email: 'admin.c@example.com' } });

// ---------- multi-league (1B): owner writes (bypass rules) to seed memberships and player cards ----------
const LG = ['leagues', 'calcettari'];
const toValue = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
};
const ownerSet = async (path, data) => {
  const res = await fetch(`http://${FS_HOST}:${FS_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toValue(data).mapValue.fields }),
  });
  if (!res.ok) throw new Error(`seed ${path}: ${res.status}`);
};
const card = (id, userId, leagueRole, extra = {}) =>
  baseProfile(id, { user_id: userId, userId, leagueRole, isActivePlayer: true, role: leagueRole === 'PLAYER' ? 'player' : 'admin', ...extra });
const joinLeague = async (who, playerId, leagueRole, league = 'calcettari', extra = {}) => {
  await ownerSet(`leagues/${league}/players/${playerId}`, card(playerId, who.uid, leagueRole, extra));
  await ownerSet(`memberships/${who.uid}`, { leagues: { [league]: { player_id: playerId, league_role: leagueRole, name: league } } });
};
await ownerSet('leagues/calcettari', { id: 'calcettari', name: 'I Calcettari', status: 'active', visibility: 'private' });
await joinLeague(superAdmin, 'p-1', 'PRESIDENT');
await joinLeague(adminC, adminC.uid, 'PRESIDENT');
await joinLeague(playerA, playerA.uid, 'PLAYER');
await joinLeague(playerB, playerB.uid, 'PLAYER', 'calcettari', { matches_won: 5 });
await joinLeague(newbie, newbie.uid, 'PLAYER');
await ownerSet('leagues/calcettari/players/guest-1', card('guest-1', null, 'PLAYER', { is_guest: true, user_id: null }));
// ---------- setup (by the super admin) ----------
console.log('\nSetup');
await expectAllowed('super admin creates its own profile p-1', () =>
  setDoc(doc(superAdmin.db, 'profiles', 'p-1'), baseProfile('p-1', { role: 'admin' })));
await expectAllowed('super admin creates an admin profile', () =>
  setDoc(doc(superAdmin.db, 'profiles', adminC.uid), baseProfile(adminC.uid, { role: 'admin' })));
await expectAllowed('super admin creates a legacy "user" profile for player B', () =>
  setDoc(doc(superAdmin.db, 'profiles', playerB.uid), baseProfile(playerB.uid, { role: 'user', matches_won: 5 })));
await expectAllowed('super admin writes settings', () =>
  setDoc(doc(superAdmin.db, ...LG, 'settings', 'official_match'), { date: '2026-11-10' }));
await expectAllowed('super admin signs up player B (today)', () => join(superAdmin, TODAY, playerB.uid));
const presB = `${TODAY}_${playerB.uid}`;

console.log('\nNot signed in');
await expectDenied('anonymous reads profiles', () => getDocs(collection(anon.db, 'profiles')));
await expectDenied('anonymous writes settings', () => setDoc(doc(anon.db, ...LG, 'settings', 'x'), { a: 1 }));

console.log('\nPlayer A (normal user)');
await expectAllowed('reads profiles', () => getDocs(collection(playerA.db, 'profiles')));
await expectDenied('creates own profile as ADMIN', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), baseProfile(playerA.uid, { role: 'admin' })));
await expectDenied('creates own profile with fake match history', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), baseProfile(playerA.uid, { matches_won: 20 })));
await expectAllowed('creates own profile as player', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid), baseProfile(playerA.uid)));
await expectDenied('C3: creates own profile with all parameters at 10', () =>
  setDoc(doc(newbie.db, 'profiles', newbie.uid), baseProfile(newbie.uid, { stats: { Tiro: 10, Difesa: 10 } })));
await expectDenied('C3: creates own profile with OVR 10', () =>
  setDoc(doc(newbie.db, 'profiles', newbie.uid), baseProfile(newbie.uid, { overall_rating: 10 })));
await expectDenied('C3: creates own profile with a server-only flag', () =>
  setDoc(doc(newbie.db, 'profiles', newbie.uid), baseProfile(newbie.uid, { needs_stat_review: false })));
await expectDenied('C3: creates own profile as guest', () =>
  setDoc(doc(newbie.db, 'profiles', newbie.uid), baseProfile(newbie.uid, { is_guest: true })));
await expectDenied('C3: creates own profile with an SVG avatar', () =>
  setDoc(doc(newbie.db, 'profiles', newbie.uid), baseProfile(newbie.uid, { avatar_url: 'data:image/svg+xml;base64,AAAA' })));
await expectAllowed('C3: creates own profile like the app (defaults 7, names, Google photo, OVR 7)', () =>
  setDoc(doc(newbie.db, 'profiles', newbie.uid), baseProfile(newbie.uid, {
    stats: { Tiro: 7, Difesa: 7 }, overall_rating: 7, first_name: 'B', last_name: 'B',
    avatar_url: 'https://lh3.googleusercontent.com/a/photo' })));
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
  setDoc(doc(playerA.db, ...LG, 'presences', 'pres-a'), presence(TODAY, playerA.uid, { id: 'pres-a' })));
await expectDenied('signs up with a fake (client) join time to jump the queue', () =>
  join(playerA, TODAY, playerA.uid, { joined_at: new Date('2020-01-01') }));
await expectDenied('signs up with an admin override', () =>
  join(playerA, TODAY, playerA.uid, { admin_override: 'starter' }));
await expectDenied('signs up player B', () => join(playerA, THIS_SUNDAY, playerB.uid));
await expectDenied('changes B status (no more client-side promotions)', () =>
  updateDoc(doc(playerA.db, ...LG, 'presences', presB), { status: 'confirmed', order_index: 1 }));
await expectDenied('reassigns B presence to someone else', () =>
  updateDoc(doc(playerA.db, ...LG, 'presences', presB), { player_id: playerA.uid }));
await expectDenied('forces self into the starters', () =>
  updateDoc(doc(playerA.db, ...LG, 'presences', `${THIS_SUNDAY}_${playerA.uid}`), { admin_override: 'starter' }));
await expectDenied('deletes B presence', () => deleteDoc(doc(playerA.db, ...LG, 'presences', presB)));
await expectAllowed('withdraws own presence', () => deleteDoc(doc(playerA.db, ...LG, 'presences', `${THIS_SUNDAY}_${playerA.uid}`)));
await expectDenied('opens next week voting', () =>
  setDoc(doc(playerA.db, ...LG, 'settings', 'calendar'), { open_until: NEXT_SUNDAY }));
await expectDenied('adds a win to own record', () =>
  updateDoc(doc(playerA.db, 'profiles', playerA.uid), { matches_won: increment(1) }));
for (const col of ['settings', 'stat_categories', 'matches', 'generated_teams', 'match_payments', 'sport_fields']) {
  await expectDenied(`writes ${col}`, () => setDoc(doc(playerA.db, col, 'hack'), { a: 1 }));
}
await expectAllowed('reads settings', () => getDoc(doc(playerA.db, ...LG, 'settings', 'official_match')));

console.log('\nAdmin C (promoted by the super admin)');
await expectAllowed('edits player A\'s stats', () =>
  setDoc(doc(adminC.db, 'profiles', playerA.uid), { stats: { Tiro: 9, Difesa: 7 }, overall_rating: 8 }, { merge: true }));
await expectAllowed('normalises legacy role user -> player on B', () =>
  setDoc(doc(adminC.db, 'profiles', playerB.uid), { role: 'player' }, { merge: true }));
await expectAllowed('promotes player A to admin', () =>
  setDoc(doc(adminC.db, 'profiles', playerA.uid), { role: 'admin' }, { merge: true }));
await expectAllowed('demotes player A back to player', () =>
  setDoc(doc(adminC.db, 'profiles', playerA.uid), { role: 'player' }, { merge: true }));
await expectDenied('demotes the super admin', () =>
  setDoc(doc(adminC.db, 'profiles', 'p-1'), { role: 'player' }, { merge: true }));
await expectDenied('deletes the super admin profile', () => deleteDoc(doc(adminC.db, 'profiles', 'p-1')));
await expectAllowed('creates a guest player', () =>
  setDoc(doc(adminC.db, 'profiles', 'guest-1'), baseProfile('guest-1', { is_guest: true, user_id: null })));
await expectDenied('makes a guest admin', () =>
  setDoc(doc(adminC.db, 'profiles', 'guest-1'), { role: 'admin' }, { merge: true }));
await expectDenied('creates a guest as admin', () =>
  setDoc(doc(adminC.db, 'profiles', 'guest-2'), baseProfile('guest-2', { role: 'admin' })));
await expectAllowed('writes settings', () =>
  setDoc(doc(adminC.db, ...LG, 'settings', 'app_config'), { standard_total_cost: 80 }, { merge: true }));
await expectAllowed('adds player B on a locked day (next week)', () => join(adminC, NEXT_MONDAY, playerB.uid));
await expectAllowed('forces player B into the starters', () =>
  updateDoc(doc(adminC.db, ...LG, 'presences', presB), { admin_override: 'starter' }));
await expectAllowed('opens next week voting', () =>
  setDoc(doc(adminC.db, ...LG, 'settings', 'calendar'), { open_until: NEXT_SUNDAY }));
await expectAllowed('saves a match result + W/D/L increments in one transaction', () =>
  runTransaction(adminC.db, async (tx) => {
    const ref = doc(adminC.db, 'profiles', playerA.uid);
    await tx.get(ref);
    tx.update(ref, { matches_won: increment(1), updated_at: 'z' });
    tx.set(doc(adminC.db, ...LG, 'matches', TODAY), { id: TODAY, match_date: TODAY, status: 'completed', score_white: 3, score_black: 1, profile_effects: { [playerA.uid]: 'won' } }, { merge: true });
  }));
await expectDenied('player deletes a match from history', () => deleteDoc(doc(playerA.db, ...LG, 'matches', TODAY)));
await expectAllowed('admin deletes a match from history and undoes the win', () =>
  runTransaction(adminC.db, async (tx) => {
    const ref = doc(adminC.db, 'profiles', playerA.uid);
    await tx.get(ref);
    tx.update(ref, { matches_won: increment(-1), updated_at: 'z' });
    tx.delete(doc(adminC.db, ...LG, 'matches', TODAY));
  }));
await expectAllowed('deletes a guest player', () => deleteDoc(doc(adminC.db, 'profiles', 'guest-1')));
await expectDenied('deletes a registered player (only the super admin can)', () => deleteDoc(doc(adminC.db, 'profiles', playerB.uid)));

console.log('\nPlayer A after voting is open');
await expectAllowed(`signs up for next week (${NEXT_MONDAY})`, () => join(playerA, NEXT_MONDAY, playerA.uid));
await expectDenied('signs up beyond the opened range', () => join(playerA, IN_TWO_WEEKS, playerA.uid));

console.log('\nMVP votes');
const vote = (c, date, voter, player) =>
  setDoc(doc(c.db, ...LG, 'mvp_votes', `${date}_${voter}`), { date, voter_id: voter, player_id: player, updated_at: serverTimestamp() });
await expectAllowed('player A votes MVP for today', () => vote(playerA, TODAY, playerA.uid, playerB.uid));
await expectAllowed('player A changes own vote', () => vote(playerA, TODAY, playerA.uid, adminC.uid));
await expectDenied('player A votes on behalf of player B', () => vote(playerA, TODAY, playerB.uid, playerA.uid));
await expectDenied('player A votes for a future match', () => vote(playerA, NEXT_MONDAY, playerA.uid, playerB.uid));
await expectDenied('player A votes with a fake time', () =>
  setDoc(doc(playerA.db, ...LG, 'mvp_votes', `${TODAY}_${playerA.uid}`), { date: TODAY, voter_id: playerA.uid, player_id: 'x', updated_at: 'yesterday' }));
await expectDenied('player B deletes player A vote', () => deleteDoc(doc(playerB.db, ...LG, 'mvp_votes', `${TODAY}_${playerA.uid}`)));
await expectAllowed('player B reads the votes', () => getDocs(collection(playerB.db, ...LG, 'mvp_votes')));
await expectAllowed('admin C test-votes for a future match', () => vote(adminC, NEXT_MONDAY, adminC.uid, playerA.uid));
await expectDenied('player A votes early for next week (no test)', () => vote(playerA, NEXT_MONDAY, playerA.uid, playerB.uid));
await expectAllowed('admin C opens a test vote for everyone', () =>
  setDoc(doc(adminC.db, ...LG, 'generated_teams', NEXT_MONDAY), { id: NEXT_MONDAY, date: NEXT_MONDAY, team_white: [], team_black: [], created_at: 'x', mvp_vote_test: 'all' }));
await expectAllowed('player A votes early during the test for everyone', () => vote(playerA, NEXT_MONDAY, playerA.uid, playerB.uid));
await expectAllowed('admin C ends the test', () =>
  updateDoc(doc(adminC.db, ...LG, 'generated_teams', NEXT_MONDAY), { mvp_vote_test: false }));
await expectDenied('player A votes early after the test ended', () => vote(playerA, NEXT_MONDAY, playerA.uid, adminC.uid));
await expectAllowed('admin C clears player A test vote', () => deleteDoc(doc(adminC.db, ...LG, 'mvp_votes', `${TODAY}_${playerA.uid}`)));

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

console.log('\nIn-app bell (profiles/{id}/notifications)');
await expectAllowed('player A reads own notifications', () => getDocs(collection(playerA.db, 'profiles', playerA.uid, 'notifications')));
await expectDenied('player B reads player A notifications', () => getDocs(collection(playerB.db, 'profiles', playerA.uid, 'notifications')));
await expectDenied('player A writes a notification', () =>
  setDoc(doc(playerA.db, 'profiles', playerA.uid, 'notifications', 'n1'), { title: 'x', read: false }));
await expectDenied('admin C writes a notification for player A', () =>
  setDoc(doc(adminC.db, 'profiles', playerA.uid, 'notifications', 'n2'), { title: 'x', read: false }));

console.log('\nAdmin requests and invites (server only)');
await expectAllowed('admin C reads the admin requests', () => getDoc(doc(adminC.db, ...LG, 'admin_requests', 'signup_x')));
await expectDenied('player B reads the admin requests', () => getDoc(doc(playerB.db, ...LG, 'admin_requests', 'signup_x')));
await expectDenied('admin C writes an admin request', () => setDoc(doc(adminC.db, ...LG, 'admin_requests', 'x'), { status: 'done' }));
await expectDenied('player B reads an invite', () => getDoc(doc(playerB.db, 'invites', 'tok')));
await expectDenied('admin C writes an invite', () => setDoc(doc(adminC.db, 'invites', 'tok'), { guest_id: 'g' }));

console.log('\nCassa: ogni tocco scrive solo il giocatore toccato (merge sulla mappa payments)');
{
  const ref = doc(adminC.db, ...LG, 'match_payments', '2026-01-01');
  const pay = (changes) => setDoc(ref, { date: '2026-01-01', payments: changes }, { merge: true });
  await pay({ a: true });
  await pay({ b: true }); // un secondo admin segna un altro giocatore
  let p = (await getDoc(ref)).data().payments;
  const ok1 = p.a === true && p.b === true;
  await pay({ a: false }); // tolgo il pagamento ad A
  p = (await getDoc(ref)).data().payments;
  const ok2 = p.a === false && p.b === true;
  await pay({ c: true, d: true }); // "Tutti pagati" solo sui mancanti
  p = (await getDoc(ref)).data().payments;
  const ok3 = p.a === false && p.b === true && p.c === true && p.d === true;
  for (const [label, ok] of [
    ['segnare B non tocca A', ok1],
    ['togliere A non tocca B', ok2],
    ['"Tutti pagati" sui mancanti non tocca gli altri', ok3],
  ]) {
    if (ok) { passed++; console.log(`  ✔ ${label}`); } else { failed++; console.log(`  ✘ ${label}`, JSON.stringify(p)); }
  }
  await expectDenied('player B writes the cassa', () => setDoc(doc(playerB.db, ...LG, 'match_payments', '2026-01-01'), { payments: { b: false } }, { merge: true }));
  await expectDenied('player B marks himself paid', () => updateDoc(doc(playerB.db, ...LG, 'match_payments', '2026-01-01'), { 'payments.b': true }));
  await expectAllowed('player B reads the cassa', () => getDoc(doc(playerB.db, ...LG, 'match_payments', '2026-01-01')));
}

console.log('\nChiusura partita e risultato: solo admin');
{
  await setDoc(doc(adminC.db, ...LG, 'matches', '2026-01-01'), { id: '2026-01-01', match_date: '2026-01-01', status: 'scheduled' });
  await expectDenied('player B closes the match', () => updateDoc(doc(playerB.db, ...LG, 'matches', '2026-01-01'), { status: 'completed', score_white: 5, score_black: 0 }));
  await expectDenied('player B changes the MVP', () => updateDoc(doc(playerB.db, ...LG, 'matches', '2026-01-01'), { mvp_player_id: playerB.uid }));
  await expectDenied('player B deletes the match', () => deleteDoc(doc(playerB.db, ...LG, 'matches', '2026-01-01')));
  await expectDenied('player B edits the teams', () => setDoc(doc(playerB.db, ...LG, 'generated_teams', '2026-01-01'), { confirmed: true }, { merge: true }));
  await expectAllowed('player B reads the match', () => getDoc(doc(playerB.db, ...LG, 'matches', '2026-01-01')));
  await expectAllowed('admin C closes the match', () => updateDoc(doc(adminC.db, ...LG, 'matches', '2026-01-01'), { status: 'completed', score_white: 3, score_black: 2 }));
}

console.log('\nPreferenze personali (lingua e tema)');
await expectAllowed('player A saves own language', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { locale: 'en', updated_at: 'x' }));
await expectAllowed('player A saves own theme', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { theme: 'dark', updated_at: 'x' }));
await expectDenied('player A saves an unknown language', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { locale: 'fr' }));
await expectDenied('player A saves an unknown theme', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { theme: 'blue' }));
await expectDenied('player A changes player B language', () => updateDoc(doc(playerA.db, 'profiles', playerB.uid), { locale: 'en' }));
await expectDenied('player A sneaks a role change with the language', () =>
  updateDoc(doc(playerA.db, 'profiles', playerA.uid), { locale: 'it', role: 'admin' }));

console.log('\nImpostor (email/password account using the super admin address, NOT verified)');
await expectDenied('writes settings', () => setDoc(doc(impostor.db, ...LG, 'settings', 'official_match'), { date: 'x' }));
await expectDenied('edits p-1', () => setDoc(doc(impostor.db, 'profiles', 'p-1'), { full_name: 'x' }, { merge: true }));

console.log('\nSuper admin');
await expectAllowed('promotes player A to admin', () =>
  setDoc(doc(superAdmin.db, 'profiles', playerA.uid), { role: 'admin' }, { merge: true }));
await expectDenied('deletes its own super admin profile p-1', () => deleteDoc(doc(superAdmin.db, 'profiles', 'p-1')));

console.log('\nC12: withdrawal lock also in the rules');
await expectAllowed('player (newbie) signs up today', () => join(newbie, TODAY, newbie.uid));
await expectAllowed('admin turns the lock on (48h before)', () =>
  setDoc(doc(adminC.db, ...LG, 'settings', 'app_config'), { timelock_enabled: true, timelock_hours_before: 48 }, { merge: true }));
await expectDenied('player (newbie) withdraws during the lock', () => deleteDoc(doc(newbie.db, ...LG, 'presences', `${TODAY}_${newbie.uid}`)));
await expectAllowed('admin turns the lock off', () =>
  setDoc(doc(adminC.db, ...LG, 'settings', 'app_config'), { timelock_enabled: false }, { merge: true }));
await expectAllowed('player (newbie) withdraws with the lock off', () => deleteDoc(doc(newbie.db, ...LG, 'presences', `${TODAY}_${newbie.uid}`)));
await expectAllowed('player (newbie) signs up today again', () => join(newbie, TODAY, newbie.uid));
await expectAllowed('admin turns the lock on again', () =>
  setDoc(doc(adminC.db, ...LG, 'settings', 'app_config'), { timelock_enabled: true, timelock_hours_before: 48 }, { merge: true }));
await expectAllowed('admin removes player (newbie) during the lock', () => deleteDoc(doc(adminC.db, ...LG, 'presences', `${TODAY}_${newbie.uid}`)));
await expectAllowed('admin turns the lock off (cleanup)', () =>
  setDoc(doc(adminC.db, ...LG, 'settings', 'app_config'), { timelock_enabled: false }, { merge: true }));

console.log('\nC1: partial save by an admin keeps what changed meanwhile');
{
  await expectAllowed('server-like update: W/D/L 3 → 4 meanwhile', () =>
    setDoc(doc(superAdmin.db, 'profiles', playerB.uid), { matches_won: 4, stats: { Tiro: 6, Difesa: 6 } }, { merge: true }));
  await expectAllowed('admin saves only position + one parameter', () =>
    updateDoc(doc(adminC.db, 'profiles', playerB.uid), new FieldPath('position'), 'Punta', new FieldPath('stats', 'Tiro'), 8));
  const p = (await getDoc(doc(adminC.db, 'profiles', playerB.uid))).data();
  const ok = p.matches_won === 4 && p.position === 'Punta' && p.stats.Tiro === 8 && p.stats.Difesa === 6;
  if (ok) { passed++; console.log('  ✔ W/D/L and untouched parameter kept'); } else { failed++; console.log('  ✘ W/D/L or parameter lost', JSON.stringify(p)); }
}

console.log('\nC2: email in private_profiles, never added back to the public profile');
// A profile not moved yet (still has its email), written bypassing the rules (emulator owner token)
await fetch(`http://${FS_HOST}:${FS_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/profiles/legacy-1`, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { id: { stringValue: 'legacy-1' }, full_name: { stringValue: 'Legacy' }, role: { stringValue: 'player' },
    is_guest: { booleanValue: false }, email: { stringValue: 'legacy@example.com' } } }),
});
const newbie2 = await client({ google: { sub: 'newbie-2', email: 'newbie2@example.com' } });
await expectDenied('new player creates own profile WITH email', () =>
  setDoc(doc(newbie2.db, 'profiles', newbie2.uid), baseProfile(newbie2.uid, { email: 'newbie2@example.com' })));
await expectAllowed('new player creates own profile without email (like the app)', () =>
  setDoc(doc(newbie2.db, 'profiles', newbie2.uid), baseProfile(newbie2.uid)));
await expectAllowed('admin edits a not-moved profile (email unchanged)', () =>
  setDoc(doc(adminC.db, 'profiles', 'legacy-1'), { full_name: 'Legacy 2' }, { merge: true }));
await expectDenied('admin changes the email in the public profile', () =>
  setDoc(doc(adminC.db, 'profiles', 'legacy-1'), { email: 'other@example.com' }, { merge: true }));
await expectDenied('admin adds an email to a profile without one', () =>
  setDoc(doc(adminC.db, 'profiles', playerB.uid), { email: 'b@example.com' }, { merge: true }));
await expectDenied('super admin adds an email to a profile', () =>
  setDoc(doc(superAdmin.db, 'profiles', playerB.uid), { email: 'b@example.com' }, { merge: true }));
await expectAllowed('admin removes the email from the public profile', () =>
  updateDoc(doc(adminC.db, 'profiles', 'legacy-1'), { email: deleteField() }));
await expectAllowed('player B saves own sign-in email privately', () =>
  setDoc(doc(playerB.db, 'private_profiles', playerB.uid), { email: 'player.b@example.com', updated_at: 'x' }));
await expectDenied('player B saves a different email privately', () =>
  setDoc(doc(playerB.db, 'private_profiles', playerB.uid), { email: 'fake@example.com', updated_at: 'x' }));
await expectDenied('player B adds other fields to the private doc', () =>
  setDoc(doc(playerB.db, 'private_profiles', playerB.uid), { email: 'player.b@example.com', role: 'admin' }));
await expectDenied('player B writes player A private doc', () =>
  setDoc(doc(playerB.db, 'private_profiles', playerA.uid), { email: 'player.b@example.com' }));
await expectAllowed('player B reads own private doc', () => getDoc(doc(playerB.db, 'private_profiles', playerB.uid)));
await expectDenied('player B reads player A private doc', () => getDoc(doc(playerB.db, 'private_profiles', playerA.uid)));
await expectDenied('player B lists all private emails', () => getDocs(collection(playerB.db, 'private_profiles')));
await expectDenied('anonymous lists all private emails', () => getDocs(collection(anon.db, 'private_profiles')));
await expectAllowed('admin lists all private emails', () => getDocs(collection(adminC.db, 'private_profiles')));
await expectAllowed('super admin saves own email in p-1 private doc', () =>
  setDoc(doc(superAdmin.db, 'private_profiles', 'p-1'), { email: 'macciolino84@gmail.com', updated_at: 'x' }));
await expectDenied('impostor (not verified) reads p-1 private doc', () => getDoc(doc(impostor.db, 'private_profiles', 'p-1')));
await expectDenied('admin deletes a private doc (only super admin)', () => deleteDoc(doc(adminC.db, 'private_profiles', playerB.uid)));

// ---------- multi-league (1B): isolation, cards, league roles, legacy backup ----------
console.log('\nMulti-league (1B)');
const LC = (c, ...p) => doc(c.db, ...LG, ...p);
await ownerSet('leagues/other', { id: 'other', name: 'Altra lega', status: 'active' });
await ownerSet('leagues/other/matches/2026-01-01', { status: 'completed' });
await ownerSet('matches/2026-01-01', { status: 'completed' });

await expectAllowed('member B reads own memberships', () => getDoc(doc(playerB.db, 'memberships', playerB.uid)));
await expectDenied('player A reads B memberships', () => getDoc(doc(playerA.db, 'memberships', playerB.uid)));
await expectDenied('member B writes own memberships (joins another league)', () =>
  setDoc(doc(playerB.db, 'memberships', playerB.uid), { leagues: { other: { player_id: playerB.uid } } }, { merge: true }));
await expectAllowed('member B reads the league and its players', async () => {
  await getDoc(doc(playerB.db, 'leagues', 'calcettari'));
  await getDocs(collection(playerB.db, ...LG, 'players'));
});
await expectDenied('member B reads another league match', () => getDoc(doc(playerB.db, 'leagues', 'other', 'matches', '2026-01-01')));
await expectDenied('member B lists another league players', () => getDocs(collection(playerB.db, 'leagues', 'other', 'players')));
await expectDenied('newbie-2 (no league) reads the league', () => getDoc(doc(newbie2.db, 'leagues', 'calcettari')));
await expectDenied('admin C writes a match of a league it is not in', () =>
  setDoc(doc(adminC.db, 'leagues', 'other', 'matches', '2026-01-02'), { status: 'completed' }));
await expectAllowed('super admin reads any league (governance)', () => getDoc(doc(superAdmin.db, 'leagues', 'other', 'matches', '2026-01-01')));
await expectDenied('super admin writes a league it is not in', () =>
  setDoc(doc(superAdmin.db, 'leagues', 'other', 'matches', '2026-01-02'), { status: 'completed' }));
await expectDenied('impostor (not verified) reads a league', () => getDoc(doc(impostor.db, 'leagues', 'calcettari')));
await expectDenied('anyone creates a league from the app', () => setDoc(doc(adminC.db, 'leagues', 'new'), { name: 'x' }));

console.log('\nPlayer cards');
await expectAllowed('player B renames own card', () => updateDoc(LC(playerB, 'players', playerB.uid), { full_name: 'B nuovo', updated_at: 'y' }));
await expectDenied('player B raises own parameters', () => updateDoc(LC(playerB, 'players', playerB.uid), { 'stats.Tiro': 10 }));
await expectDenied('player B becomes president', () => updateDoc(LC(playerB, 'players', playerB.uid), { leagueRole: 'PRESIDENT' }));
await expectDenied('player B edits player A card', () => updateDoc(LC(playerB, 'players', playerA.uid), { full_name: 'x' }));
await expectAllowed('president C edits B parameters and W/D/L', () =>
  updateDoc(LC(adminC, 'players', playerB.uid), { 'stats.Tiro': 8, matches_won: increment(1) }));
await expectDenied('president C moves B card to another account', () => updateDoc(LC(adminC, 'players', playerB.uid), { userId: playerA.uid }));
await expectDenied('president C demotes the super admin card', () => updateDoc(LC(adminC, 'players', 'p-1'), { leagueRole: 'PLAYER', role: 'player' }));
await expectDenied('president C makes a guest president', () => updateDoc(LC(adminC, 'players', 'guest-1'), { leagueRole: 'PRESIDENT', role: 'admin' }));
await expectDenied('president C sets an unknown role', () => updateDoc(LC(adminC, 'players', playerA.uid), { leagueRole: 'OWNER' }));
await expectAllowed('president C makes B collaborator', () => updateDoc(LC(adminC, 'players', playerB.uid), { leagueRole: 'COLLABORATOR' }));
await expectAllowed('collaborator B writes a match', () => setDoc(LC(playerB, 'matches', '2026-02-01'), { status: 'scheduled' }));
await expectAllowed('collaborator B marks cash', () => setDoc(LC(playerB, 'match_payments', '2026-02-01'), { payments: { x: true } }, { merge: true }));
await expectDenied('collaborator B promotes A (presidents only)', () => updateDoc(LC(playerB, 'players', playerA.uid), { leagueRole: 'COLLABORATOR' }));
await expectAllowed('president C makes B player again', () => updateDoc(LC(adminC, 'players', playerB.uid), { leagueRole: 'PLAYER', role: 'player' }));
await expectDenied('player B (no longer collaborator) writes a match', () => setDoc(LC(playerB, 'matches', '2026-02-02'), { status: 'scheduled' }));
await expectAllowed('president C adds a guest card', () =>
  setDoc(LC(adminC, 'players', 'guest-9'), card('guest-9', null, 'PLAYER', { is_guest: true, user_id: null })));
await expectDenied('president C adds a card linked to an account', () =>
  setDoc(LC(adminC, 'players', 'fake'), card('fake', playerA.uid, 'PLAYER')));
await expectDenied('player A adds a guest card', () =>
  setDoc(LC(playerA, 'players', 'guest-8'), card('guest-8', null, 'PLAYER', { is_guest: true, user_id: null })));
await expectAllowed('president C deletes a guest card', () => deleteDoc(LC(adminC, 'players', 'guest-9')));
await expectDenied('president C deletes a registered card', () => deleteDoc(LC(adminC, 'players', playerA.uid)));

console.log('\nDeactivated president');
await ownerSet(`leagues/calcettari/players/${adminC.uid}`, card(adminC.uid, adminC.uid, 'PRESIDENT', { deactivated_at: '2026-01-01' }));
await expectDenied('deactivated president C writes a match', () => setDoc(LC(adminC, 'matches', '2026-02-03'), { status: 'scheduled' }));
await ownerSet(`leagues/calcettari/players/${adminC.uid}`, card(adminC.uid, adminC.uid, 'PRESIDENT'));
await expectAllowed('president C (active again) writes a match', () => setDoc(LC(adminC, 'matches', '2026-02-03'), { status: 'scheduled' }));

console.log('\nOld single-group collections (backup, read-only)');
await expectAllowed('admin C reads an old match', () => getDoc(doc(adminC.db, 'matches', '2026-01-01')));
await expectDenied('admin C writes an old match', () => setDoc(doc(adminC.db, 'matches', '2026-01-01'), { status: 'scheduled' }));
await expectDenied('super admin writes old settings', () => setDoc(doc(superAdmin.db, 'settings', 'app_config'), { a: 1 }));
await expectDenied('player B reads an old match', () => getDoc(doc(playerB.db, 'matches', '2026-01-01')));
await expectDenied('player B signs up in the old presences', () => setDoc(doc(playerB.db, 'presences', `${TODAY}_${playerB.uid}`), presence(TODAY, playerB.uid)));

console.log('\nInvite links (step 3): server only');
await ownerSet('league_invites/abc123def456', { code: 'abc123def456', leagueId: 'calcettari', revoked: false });
await expectDenied('president C reads an invite code', () => getDoc(doc(adminC.db, 'league_invites', 'abc123def456')));
await expectDenied('player B lists invite codes', () => getDocs(collection(playerB.db, 'league_invites')));
await expectDenied('player B creates an invite code', () => setDoc(doc(playerB.db, 'league_invites', 'mine123456'), { leagueId: 'calcettari', revoked: false }));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
