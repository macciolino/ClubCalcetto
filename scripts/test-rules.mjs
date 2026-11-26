/**
 * Automated tests for firestore.rules, run against the LOCAL emulators only.
 *
 * Usage: npm run test:rules
 * (starts temporary, empty Auth + Firestore emulators on separate ports for project "demo-clubcalcetto",
 *  runs these checks, then shuts them down — no data is kept, production is never touched)
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp, updateDoc, increment, runTransaction, deleteField, FieldPath, query, where,
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
// The founder's legacy profile p-1 with the platform role, as the migration leaves it (server-written)
await ownerSet('profiles/p-1', baseProfile('p-1', { role: 'admin', user_id: superAdmin.uid, platformRole: 'SUPER_ADMIN' }));
console.log('\nSetup');
await expectAllowed('super admin (platformRole on p-1) edits its own profile p-1', () =>
  setDoc(doc(superAdmin.db, 'profiles', 'p-1'), { full_name: 'Marco' }, { merge: true }));
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

console.log('\nAdmin C: old global role "admin" (grants nothing on global accounts) + PRESIDENT of the league');
await expectDenied('old global admin edits player A\'s global stats', () =>
  setDoc(doc(adminC.db, 'profiles', playerA.uid), { stats: { Tiro: 9, Difesa: 7 }, overall_rating: 8 }, { merge: true }));
await expectAllowed('president C edits player A\'s stats on the LEAGUE card', () =>
  setDoc(doc(adminC.db, ...LG, 'players', playerA.uid), { stats: { Tiro: 9, Difesa: 7 }, overall_rating: 8 }, { merge: true }));
await expectDenied('old global admin changes B\'s global role', () =>
  setDoc(doc(adminC.db, 'profiles', playerB.uid), { role: 'player' }, { merge: true }));
await expectDenied('old global admin promotes player A to global admin', () =>
  setDoc(doc(adminC.db, 'profiles', playerA.uid), { role: 'admin' }, { merge: true }));
await expectDenied('demotes the super admin', () =>
  setDoc(doc(adminC.db, 'profiles', 'p-1'), { role: 'player' }, { merge: true }));
await expectDenied('deletes the super admin profile', () => deleteDoc(doc(adminC.db, 'profiles', 'p-1')));
await expectDenied('old global admin creates a global guest profile (guests are league cards)', () =>
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
await expectAllowed('saves a match result + W/D/L increments on the league cards in one transaction', () =>
  runTransaction(adminC.db, async (tx) => {
    const ref = doc(adminC.db, ...LG, 'players', playerA.uid);
    await tx.get(ref);
    tx.update(ref, { matches_won: increment(1), updated_at: 'z' });
    tx.set(doc(adminC.db, ...LG, 'matches', TODAY), { id: TODAY, match_date: TODAY, status: 'completed', score_white: 3, score_black: 1, profile_effects: { [playerA.uid]: 'won' } }, { merge: true });
  }));
await expectDenied('player deletes a match from history', () => deleteDoc(doc(playerA.db, ...LG, 'matches', TODAY)));
await expectAllowed('admin deletes a match from history and undoes the win (league card)', () =>
  runTransaction(adminC.db, async (tx) => {
    const ref = doc(adminC.db, ...LG, 'players', playerA.uid);
    await tx.get(ref);
    tx.update(ref, { matches_won: increment(-1), updated_at: 'z' });
    tx.delete(doc(adminC.db, ...LG, 'matches', TODAY));
  }));
await expectDenied('old global admin deletes a global profile', () => deleteDoc(doc(adminC.db, 'profiles', 'guest-1')));
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
await expectDenied('old global admin C removes player A device', () => deleteDoc(doc(adminC.db, 'push_tokens', 'tokA')));
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
await expectAllowed('player A hides the board and some notices', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { board_off: true, board_hidden: ['n1', 'n2'], updated_at: 'x' }));
await expectDenied('player A writes own Radar Base from the app', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { baseRadar: { Tiro: 10 } }));
await expectDenied('player A clears own Radar Base step from the app', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { base_radar_pending: false }));
await expectDenied('player A sets own Radar Base step from the app', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { base_radar_pending: true }));
await expectDenied('player A saves a board flag that is not a boolean', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { board_off: 'yes' }));
await expectDenied('player A saves hidden notices that are not a list', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { board_hidden: 'n1' }));
await expectDenied('player A saves more than 100 hidden notices', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { board_hidden: Array.from({ length: 101 }, (_, i) => 'n' + i) }));
await expectDenied('player A changes the board preferences of player B', () => updateDoc(doc(playerA.db, 'profiles', playerB.uid), { board_off: true }));
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
  await expectAllowed('update meanwhile: W/D/L 3 → 4 (league card)', () =>
    setDoc(doc(adminC.db, ...LG, 'players', playerB.uid), { matches_won: 4, stats: { Tiro: 6, Difesa: 6 } }, { merge: true }));
  await expectAllowed('admin saves only position + one parameter (league card)', () =>
    updateDoc(doc(adminC.db, ...LG, 'players', playerB.uid), new FieldPath('position'), 'Punta', new FieldPath('stats', 'Tiro'), 8));
  const p = (await getDoc(doc(adminC.db, ...LG, 'players', playerB.uid))).data();
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
await expectDenied('old global admin edits a not-moved profile', () =>
  setDoc(doc(adminC.db, 'profiles', 'legacy-1'), { full_name: 'Legacy 2' }, { merge: true }));
await expectAllowed('super admin edits a not-moved profile (email unchanged)', () =>
  setDoc(doc(superAdmin.db, 'profiles', 'legacy-1'), { full_name: 'Legacy 2' }, { merge: true }));
await expectDenied('admin changes the email in the public profile', () =>
  setDoc(doc(adminC.db, 'profiles', 'legacy-1'), { email: 'other@example.com' }, { merge: true }));
await expectDenied('admin adds an email to a profile without one', () =>
  setDoc(doc(adminC.db, 'profiles', playerB.uid), { email: 'b@example.com' }, { merge: true }));
await expectDenied('super admin adds an email to a profile', () =>
  setDoc(doc(superAdmin.db, 'profiles', playerB.uid), { email: 'b@example.com' }, { merge: true }));
await expectAllowed('super admin removes the email from the public profile', () =>
  updateDoc(doc(superAdmin.db, 'profiles', 'legacy-1'), { email: deleteField() }));
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
await expectDenied('old global admin lists all private emails (managers get only their league, from the server)', () => getDocs(collection(adminC.db, 'private_profiles')));
await expectDenied('old global admin reads another player private doc', () => getDoc(doc(adminC.db, 'private_profiles', playerB.uid)));
await expectAllowed('super admin lists all private emails', () => getDocs(collection(superAdmin.db, 'private_profiles')));
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
await expectAllowed('super admin writes a league it is not in (PRESIDENT everywhere)', () =>
  setDoc(doc(superAdmin.db, 'leagues', 'other', 'matches', '2026-01-02'), { status: 'completed' }));
await expectDenied('impostor (not verified) reads a league', () => getDoc(doc(impostor.db, 'leagues', 'calcettari')));
await expectDenied('anyone creates a league from the app', () => setDoc(doc(adminC.db, 'leagues', 'new'), { name: 'x' }));

console.log('\nRadar: every league keeps its own values; external ratings feed the global radar only');
{
  // One account in TWO leagues (a card in each, same id), a president of each league
  const dual = await client({ google: { sub: 'dual', email: 'dual@example.com' } });
  const presOther = await client({ google: { sub: 'pres-other', email: 'pres.other@example.com' } });
  await ownerSet(`leagues/calcettari/players/${dual.uid}`, card(dual.uid, dual.uid, 'PLAYER', { stats: { Tiro: 7 }, stat_status: 'CONFIRMED' }));
  await ownerSet(`leagues/other/players/${dual.uid}`, card(dual.uid, dual.uid, 'PLAYER', { stats: { Tiro: 4 }, stat_status: 'UNCONFIRMED' }));
  await ownerSet(`memberships/${dual.uid}`, { leagues: { calcettari: { player_id: dual.uid, league_role: 'PLAYER', name: 'calcettari' }, other: { player_id: dual.uid, league_role: 'PLAYER', name: 'other' } } });
  await ownerSet(`leagues/other/players/${presOther.uid}`, card(presOther.uid, presOther.uid, 'PRESIDENT'));
  await ownerSet(`memberships/${presOther.uid}`, { leagues: { other: { player_id: presOther.uid, league_role: 'PRESIDENT', name: 'other' } } });
  await ownerSet(`profiles/${dual.uid}`, baseProfile(dual.uid, { baseRadar: { Tiro: 6 } }));

  await expectAllowed('president of "other" corrects the card of the shared player in "other"', () =>
    updateDoc(doc(presOther.db, 'leagues', 'other', 'players', dual.uid), { stats: { Tiro: 5 }, stat_status: 'CONFIRMED' }));
  await expectDenied('president of "other" cannot touch the same player\'s card in "calcettari"', () =>
    updateDoc(doc(presOther.db, ...LG, 'players', dual.uid), { stats: { Tiro: 1 } }));
  await expectDenied('president of "calcettari" cannot touch the same player\'s card in "other"', () =>
    updateDoc(doc(adminC.db, 'leagues', 'other', 'players', dual.uid), { stats: { Tiro: 1 } }));
  await expectDenied('president of "other" cannot confirm values in "calcettari"', () =>
    updateDoc(doc(presOther.db, ...LG, 'players', dual.uid), { stat_status: 'CONFIRMED' }));
  await expectDenied('president of "calcettari" cannot read the shared player\'s card in "other"', () =>
    getDoc(doc(adminC.db, 'leagues', 'other', 'players', dual.uid)));
  await expectDenied('a manager cannot write the global Radar Base of a player', () =>
    updateDoc(doc(adminC.db, 'profiles', dual.uid), { baseRadar: { Tiro: 10 } }));
  await expectDenied('the player cannot write their own Radar Base from the app (server only)', () =>
    updateDoc(doc(dual.db, 'profiles', dual.uid), { baseRadar: { Tiro: 10 } }));
  await expectDenied('the player cannot change the status of their own card', () =>
    updateDoc(doc(dual.db, ...LG, 'players', dual.uid), { stat_status: 'UNCONFIRMED' }));
  await expectDenied('the player cannot change the values of their own card', () =>
    updateDoc(doc(dual.db, 'leagues', 'other', 'players', dual.uid), { stats: { Tiro: 10 } }));

  // external ratings: only the server writes them (also not by the managers of the league)
  await ownerSet('leagues/calcettari/matches/2027-03-01', { id: '2027-03-01', status: 'completed', score_white: 1, score_black: 0, external_ratings: { 'ext-x': { profileId: 'x', stats: { Tiro: 7 }, overall_rating: 7, rated_by: 'p-1', rated_at: 'z' } } });
  await expectDenied('manager adds an external rating from the app', () =>
    setDoc(doc(adminC.db, ...LG, 'matches', '2027-03-02'), { id: '2027-03-02', status: 'completed', external_ratings: { 'ext-y': { stats: { Tiro: 10 } } } }));
  await expectDenied('manager changes an external rating from the app', () =>
    updateDoc(doc(adminC.db, ...LG, 'matches', '2027-03-01'), { external_ratings: { 'ext-x': { profileId: 'x', stats: { Tiro: 10 }, overall_rating: 10 } } }));
  await expectDenied('manager removes the external ratings from the app', () =>
    updateDoc(doc(adminC.db, ...LG, 'matches', '2027-03-01'), { external_ratings: deleteField() }));
  await expectAllowed('manager edits the rest of the report (the ratings stay as they are)', () =>
    updateDoc(doc(adminC.db, ...LG, 'matches', '2027-03-01'), { score_white: 2, updated_at: 'k' }));
  await expectAllowed('manager re-saves the report with a merge, ratings untouched', () =>
    setDoc(doc(adminC.db, ...LG, 'matches', '2027-03-01'), { score_black: 1 }, { merge: true }));
  await expectAllowed('manager creates a report without ratings', () =>
    setDoc(doc(adminC.db, ...LG, 'matches', '2027-03-03'), { id: '2027-03-03', status: 'completed' }));
  // the person's global radar copy: readable by them only, never written from the app
  await ownerSet(`profiles/${dual.uid}/spots/n1`, { noticeId: 'n1', status: 'ACTIVE', rating: { stats: { Tiro: 8 }, overall_rating: 8, rated_at: 'z' } });
  await expectAllowed('the person reads their own spot (with the rating)', () => getDoc(doc(dual.db, 'profiles', dual.uid, 'spots', 'n1')));
  await expectDenied('a manager reads someone else\'s spots', () => getDoc(doc(adminC.db, 'profiles', dual.uid, 'spots', 'n1')));
  await expectDenied('the person writes a rating on their own spot', () =>
    updateDoc(doc(dual.db, 'profiles', dual.uid, 'spots', 'n1'), { rating: { stats: { Tiro: 10 }, overall_rating: 10 } }));
  await expectDenied('a manager writes a rating on someone else\'s spot', () =>
    updateDoc(doc(adminC.db, 'profiles', dual.uid, 'spots', 'n1'), { rating: { stats: { Tiro: 1 }, overall_rating: 1 } }));
}

console.log('\nPlatform roles come from profiles.platformRole, never from the email');
{
  const helper = await client({ google: { sub: 'helper', email: 'helper@example.com' } });
  await ownerSet(`profiles/${helper.uid}`, baseProfile(helper.uid, { platformRole: 'GLOBAL_ADMIN' }));
  await expectDenied('GLOBAL_ADMIN has no super admin power in the rules (emails)', () => getDocs(collection(helper.db, 'private_profiles')));
  await expectAllowed('GLOBAL_ADMIN reads a league it is not in', () => getDoc(doc(helper.db, 'leagues', 'calcettari')));
  await expectAllowed('GLOBAL_ADMIN lists every league (switcher)', () => getDocs(collection(helper.db, 'leagues')));
  await expectDenied('player B lists every league', () => getDocs(collection(playerB.db, 'leagues')));
  await expectAllowed('GLOBAL_ADMIN writes a match of a league it is not in', () =>
    setDoc(doc(helper.db, 'leagues', 'other', 'matches', '2026-01-03'), { status: 'scheduled' }));
  await expectAllowed('GLOBAL_ADMIN signs up player B (as a manager)', () => join(helper, NEXT_SUNDAY, playerB.uid));
  await expectAllowed('GLOBAL_ADMIN makes player A collaborator', () =>
    updateDoc(doc(helper.db, ...LG, 'players', playerA.uid), { leagueRole: 'COLLABORATOR', role: 'admin' }));
  await expectAllowed('GLOBAL_ADMIN reads the managers\' requests', () => getDocs(collection(helper.db, ...LG, 'admin_requests')));
  await expectDenied('GLOBAL_ADMIN changes the super admin\'s card role', () =>
    updateDoc(doc(helper.db, ...LG, 'players', 'p-1'), { leagueRole: 'PLAYER', role: 'player' }));
  await expectDenied('president C changes the super admin\'s card role', () =>
    updateDoc(doc(adminC.db, ...LG, 'players', 'p-1'), { leagueRole: 'PLAYER', role: 'player' }));
  await ownerSet(`leagues/calcettari/players/${playerA.uid}`, card(playerA.uid, playerA.uid, 'PLAYER'));
  await expectDenied('GLOBAL_ADMIN gives itself SUPER_ADMIN', () =>
    setDoc(doc(helper.db, 'profiles', helper.uid), { platformRole: 'SUPER_ADMIN' }, { merge: true }));
  const boss2 = await client({ google: { sub: 'boss-2', email: 'boss2@example.com' } });
  await ownerSet(`profiles/${boss2.uid}`, baseProfile(boss2.uid, { platformRole: 'SUPER_ADMIN' }));
  await expectAllowed('another account with platformRole SUPER_ADMIN is super admin (no email needed)', () =>
    getDocs(collection(boss2.db, 'private_profiles')));
  await ownerSet('profiles/p-1', baseProfile('p-1', { role: 'admin', user_id: superAdmin.uid, platformRole: 'USER' }));
  await expectDenied('founder with platformRole USER on p-1: no super admin power', () => getDocs(collection(superAdmin.db, 'private_profiles')));
  await ownerSet('profiles/p-1', baseProfile('p-1', { role: 'admin', user_id: superAdmin.uid, platformRole: 'SUPER_ADMIN' }));
  // Any SUPER_ADMIN account is protected by its role (not only p-1): a president can't demote its card
  await ownerSet(`leagues/calcettari/players/${boss2.uid}`, card(boss2.uid, boss2.uid, 'COLLABORATOR'));
  await expectDenied('president C demotes another super admin\'s card', () =>
    updateDoc(doc(adminC.db, ...LG, 'players', boss2.uid), { leagueRole: 'PLAYER', role: 'player' }));
  await expectAllowed('super admin changes another super admin\'s card', () =>
    updateDoc(doc(superAdmin.db, ...LG, 'players', boss2.uid), { leagueRole: 'PLAYER', role: 'player' }));
}

console.log('\nOrganiser ("Gioco anch\'io" off): never signs up for the pitch');
await ownerSet(`leagues/calcettari/players/${playerA.uid}`, card(playerA.uid, playerA.uid, 'PLAYER', { isActivePlayer: false }));
await expectDenied('organiser A signs up', () => join(playerA, TODAY, playerA.uid));
await expectDenied('organiser A votes MVP (does not play here)', () => vote(playerA, TODAY, playerA.uid, playerB.uid));
await expectDenied('president C signs up organiser A', () => join(adminC, plusDays(2), playerA.uid));
await expectDenied('super admin (staff) signs up organiser A', () => join(superAdmin, plusDays(2), playerA.uid));
await ownerSet(`leagues/calcettari/players/${adminC.uid}`, card(adminC.uid, adminC.uid, 'PRESIDENT', { isActivePlayer: false }));
await expectDenied('organiser president C signs up himself', () => join(adminC, plusDays(2), adminC.uid));
await expectAllowed('organiser president C still signs up a player who plays', () => join(adminC, plusDays(2), newbie.uid));
await expectAllowed('organiser president C signs up a guest', () => join(adminC, plusDays(2), 'guest-1'));
await expectDenied('president C signs up a card that is not in the league', () => join(adminC, plusDays(2), 'nobody-here'));
await ownerSet(`leagues/calcettari/players/${adminC.uid}`, card(adminC.uid, adminC.uid, 'PRESIDENT'));
await ownerSet(`leagues/calcettari/players/${playerA.uid}`, card(playerA.uid, playerA.uid, 'PLAYER'));
await expectAllowed('playing again: A signs up', () => join(playerA, NEXT_SUNDAY, playerA.uid));
await expectAllowed('playing again: A votes MVP', () => vote(playerA, TODAY, playerA.uid, playerB.uid));

console.log('\nPlayer cards');
await expectAllowed('player B renames own card', () => updateDoc(LC(playerB, 'players', playerB.uid), { full_name: 'B nuovo', updated_at: 'y' }));
await expectDenied('player B raises own parameters', () => updateDoc(LC(playerB, 'players', playerB.uid), { 'stats.Tiro': 10 }));
await expectDenied('player B confirms own parameters', () => updateDoc(LC(playerB, 'players', playerB.uid), { stat_status: 'CONFIRMED' }));
await expectDenied('player B becomes president', () => updateDoc(LC(playerB, 'players', playerB.uid), { leagueRole: 'PRESIDENT' }));
await expectDenied('player B edits player A card', () => updateDoc(LC(playerB, 'players', playerA.uid), { full_name: 'x' }));
await expectAllowed('president C edits B parameters and W/D/L', () =>
  updateDoc(LC(adminC, 'players', playerB.uid), { 'stats.Tiro': 8, matches_won: increment(1) }));
await expectAllowed('president C confirms B parameters', () => updateDoc(LC(adminC, 'players', playerB.uid), { stat_status: 'CONFIRMED' }));
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
await expectDenied('old global admin C reads an old match', () => getDoc(doc(adminC.db, 'matches', '2026-01-01')));
await expectAllowed('super admin reads an old match (backup)', () => getDoc(doc(superAdmin.db, 'matches', '2026-01-01')));
await expectDenied('admin C writes an old match', () => setDoc(doc(adminC.db, 'matches', '2026-01-01'), { status: 'scheduled' }));
await expectDenied('super admin writes old settings', () => setDoc(doc(superAdmin.db, 'settings', 'app_config'), { a: 1 }));
await expectDenied('player B reads an old match', () => getDoc(doc(playerB.db, 'matches', '2026-01-01')));
await expectDenied('player B signs up in the old presences', () => setDoc(doc(playerB.db, 'presences', `${TODAY}_${playerB.uid}`), presence(TODAY, playerB.uid)));

console.log('\nInvite links (step 3): server only');
await ownerSet('league_invites/abc123def456', { code: 'abc123def456', leagueId: 'calcettari', revoked: false });
await expectDenied('president C reads an invite code', () => getDoc(doc(adminC.db, 'league_invites', 'abc123def456')));
await expectDenied('player B lists invite codes', () => getDocs(collection(playerB.db, 'league_invites')));
await expectDenied('player B creates an invite code', () => setDoc(doc(playerB.db, 'league_invites', 'mine123456'), { leagueId: 'calcettari', revoked: false }));

console.log('\nPlatform role (step 4): server only');
await expectDenied('player A gives itself platformRole SUPER_ADMIN', () => updateDoc(doc(playerA.db, 'profiles', playerA.uid), { platformRole: 'SUPER_ADMIN' }));
await expectDenied('admin C gives player B platformRole SUPER_ADMIN', () => setDoc(doc(adminC.db, 'profiles', playerB.uid), { platformRole: 'SUPER_ADMIN' }, { merge: true }));
await expectDenied('super admin writes a platformRole from the app', () => setDoc(doc(superAdmin.db, 'profiles', playerB.uid), { platformRole: 'SUPER_ADMIN' }, { merge: true }));
const newbie3 = await client({ google: { sub: 'newbie-3', email: 'newbie3@example.com' } });
await expectDenied('newbie-3 creates its own profile already SUPER_ADMIN', () =>
  setDoc(doc(newbie3.db, 'profiles', newbie3.uid), baseProfile(newbie3.uid, { platformRole: 'SUPER_ADMIN' })));
await expectAllowed('newbie-3 creates its own profile normally', () => setDoc(doc(newbie3.db, 'profiles', newbie3.uid), baseProfile(newbie3.uid)));
await expectDenied('old global admin C edits someone else\'s profile', () => setDoc(doc(adminC.db, 'profiles', playerB.uid), { full_name: 'B ok' }, { merge: true }));
await expectAllowed('super admin edits someone else\'s profile', () => setDoc(doc(superAdmin.db, 'profiles', playerB.uid), { full_name: 'B ok' }, { merge: true }));

console.log('\nGlobal fields catalog (field_catalog) and linked league fields');
await ownerSet('field_catalog/ok', { name: 'Campo Luini', address: 'Via Luini 5', status: 'approved', linked: {} });
await ownerSet('field_catalog/wait', { name: 'Campo Nuovo', address: 'Via Nuova 1', status: 'pending', linked: {} });
await expectAllowed('player B reads an approved catalog pitch', () => getDoc(doc(playerB.db, 'field_catalog', 'ok')));
await expectAllowed('player B lists the approved catalog', () => getDocs(query(collection(playerB.db, 'field_catalog'), where('status', '==', 'approved'))));
await expectDenied('player B reads a pending catalog pitch', () => getDoc(doc(playerB.db, 'field_catalog', 'wait')));
await expectDenied('president C reads a pending catalog pitch from the app', () => getDoc(doc(adminC.db, 'field_catalog', 'wait')));
await expectAllowed('super admin (staff) reads a pending catalog pitch', () => getDoc(doc(superAdmin.db, 'field_catalog', 'wait')));
await expectDenied('anonymous reads the catalog', () => getDoc(doc(anon.db, 'field_catalog', 'ok')));
await expectDenied('president C writes the catalog', () => setDoc(doc(adminC.db, 'field_catalog', 'ok'), { status: 'approved', name: 'x' }, { merge: true }));
await expectDenied('super admin writes the catalog from the app', () => setDoc(doc(superAdmin.db, 'field_catalog', 'x'), { name: 'x', status: 'approved' }));
await ownerSet('leagues/calcettari/sport_fields/linked', { id: 'linked', name: 'Campo Luini', address: 'Via Luini 5', cost: 80, catalog_id: 'ok', catalog_status: 'approved', price_override: false });
await ownerSet('leagues/calcettari/sport_fields/mine', { id: 'mine', name: 'Campo Privato', address: 'Via Mia 3', cost: 60 });
await expectAllowed('president C sets the league price of a linked field', () =>
  setDoc(LC(adminC, 'sport_fields', 'linked'), { cost: 95, price_override: true, notes: 'campo 3' }, { merge: true }));
await expectDenied('president C renames a linked field', () => setDoc(LC(adminC, 'sport_fields', 'linked'), { name: 'Altro nome' }, { merge: true }));
await expectDenied('president C moves a linked field', () => setDoc(LC(adminC, 'sport_fields', 'linked'), { address: 'Via Altra 9' }, { merge: true }));
await expectDenied('president C unlinks a field from the app', () => setDoc(LC(adminC, 'sport_fields', 'linked'), { catalog_id: null }, { merge: true }));
await expectDenied('president C marks its own field as approved in the catalog', () =>
  setDoc(LC(adminC, 'sport_fields', 'mine'), { catalog_id: 'ok', catalog_status: 'approved' }, { merge: true }));
await expectDenied('president C creates a field already "linked"', () =>
  setDoc(LC(adminC, 'sport_fields', 'fake'), { id: 'fake', name: 'x', address: 'y', catalog_id: 'ok', catalog_status: 'approved' }));
await expectAllowed('president C still edits a private field freely', () => setDoc(LC(adminC, 'sport_fields', 'mine'), { name: 'Campo Mio', cost: 65 }, { merge: true }));
await expectAllowed('president C creates a private field', () => setDoc(LC(adminC, 'sport_fields', 'new1'), { id: 'new1', name: 'Nuovo', address: 'Via 1' }));
await expectDenied('player B sets the price of a linked field', () => setDoc(LC(playerB, 'sport_fields', 'linked'), { cost: 1 }, { merge: true }));
await expectAllowed('president C deletes a linked field of the league', () => deleteDoc(LC(adminC, 'sport_fields', 'linked')));

console.log('\n"Cerco giocatore" board (match_notices): everyone verified reads, only the server writes');
{
  const outsider = await client({ google: { sub: 'outsider', email: 'outsider@example.com' } });
  const notice = { id: 'n1', leagueId: 'calcettari', leagueName: 'I Calcettari', matchId: NEXT_SUNDAY, status: 'OPEN', spotsNeeded: 2, spotsFilled: 1 };
  await ownerSet('match_notices/n1', notice);
  await ownerSet(`match_notices/n1/applicants/${outsider.uid}`, { profileId: outsider.uid, userId: outsider.uid, displayName: 'Outsider', joinedAt: 'x' });
  await ownerSet('match_notices/n1/applicants/someone', { profileId: 'someone', userId: 'someone', displayName: 'Someone', joinedAt: 'x' });
  const N = (c, ...p) => doc(c.db, 'match_notices', 'n1', ...p);
  await expectAllowed('a user of another league reads a notice', () => getDoc(N(outsider)));
  await expectAllowed('a user of another league lists the open notices', () =>
    getDocs(query(collection(outsider.db, 'match_notices'), where('status', '==', 'OPEN'))));
  await expectDenied('anonymous reads the board', () => getDoc(N(anon)));
  await expectDenied('an unverified account reads the board', () => getDoc(N(impostor)));
  await expectDenied('a user creates a notice from the app', () => setDoc(doc(outsider.db, 'match_notices', 'n2'), { ...notice, id: 'n2' }));
  await expectDenied('a user takes a spot by writing the counter', () => updateDoc(N(outsider), { spotsFilled: 2 }));
  await expectDenied('president C edits the notice from the app (server only)', () => updateDoc(N(adminC), { status: 'CANCELLED' }));
  await expectDenied('a user adds themselves to the applicants from the app', () =>
    setDoc(doc(outsider.db, 'match_notices', 'n1', 'applicants', 'fake'), { profileId: 'fake', userId: outsider.uid }));
  await expectAllowed('the applicant reads their own spot', () => getDoc(N(outsider, 'applicants', outsider.uid)));
  await expectDenied('the applicant reads someone else’s spot', () => getDoc(N(outsider, 'applicants', 'someone')));
  await expectDenied('the applicant lists who else took a spot', () => getDocs(collection(outsider.db, 'match_notices', 'n1', 'applicants')));
  await expectDenied('player B (member, not a manager) lists the applicants', () => getDocs(collection(playerB.db, 'match_notices', 'n1', 'applicants')));
  await expectAllowed('president C (manager of the league) lists the applicants', () => getDocs(collection(adminC.db, 'match_notices', 'n1', 'applicants')));
  await expectAllowed('super admin (staff) lists the applicants', () => getDocs(collection(superAdmin.db, 'match_notices', 'n1', 'applicants')));
  await expectDenied('the applicant does not get into the league (players)', () => getDocs(collection(outsider.db, ...LG, 'players')));
  await expectDenied('the applicant does not get into the league (cash)', () => getDocs(collection(outsider.db, ...LG, 'match_payments')));

  // Each person's own copy of the spots taken (career, "i miei posti"): owner reads, nobody writes from the app
  await ownerSet(`profiles/${outsider.uid}/spots/n1`, { noticeId: 'n1', leagueId: 'calcettari', status: 'ACTIVE' });
  await expectAllowed('the applicant reads their own spots', () => getDocs(collection(outsider.db, 'profiles', outsider.uid, 'spots')));
  await expectDenied('player B reads someone else’s spots', () => getDocs(collection(playerB.db, 'profiles', outsider.uid, 'spots')));
  await expectDenied('president C reads someone else’s spots', () => getDoc(doc(adminC.db, 'profiles', outsider.uid, 'spots', 'n1')));
  // The external player's sign-up of that match leaves only through the server (it is tied to the notice)
  await ownerSet(`leagues/calcettari/presences/${NEXT_SUNDAY}_ext-${outsider.uid}`, {
    ...presence(NEXT_SUNDAY, `ext-${outsider.uid}`), joined_at: 'x', external: { profileId: outsider.uid, userId: outsider.uid, name: 'Outsider', noticeId: 'n1' },
  });
  await expectAllowed('members see the external player among the sign-ups', () => getDoc(LC(playerB, 'presences', `${NEXT_SUNDAY}_ext-${outsider.uid}`)));
  await expectDenied('president C deletes the external sign-up from the app', () => deleteDoc(LC(adminC, 'presences', `${NEXT_SUNDAY}_ext-${outsider.uid}`)));
  await expectDenied('the external player reads the league sign-ups', () => getDocs(collection(outsider.db, ...LG, 'presences')));
  await expectDenied('the applicant writes a fake spot', () =>
    setDoc(doc(outsider.db, 'profiles', outsider.uid, 'spots', 'fake'), { noticeId: 'fake', status: 'ACTIVE' }));
}

console.log('\nSuspended league (step 4): read-only for members, platform staff still write');
await ownerSet('leagues/calcettari', { id: 'calcettari', name: 'I Calcettari', status: 'suspended', visibility: 'private' });
await expectAllowed('member B still reads the matches', () => getDocs(collection(playerB.db, ...LG, 'matches')));
await expectAllowed('super admin reads the suspended league', () => getDoc(doc(superAdmin.db, 'leagues', 'calcettari')));
await expectDenied('president C writes a match', () => setDoc(LC(adminC, 'matches', '2026-03-01'), { status: 'scheduled' }));
await expectDenied('president C marks cash', () => setDoc(LC(adminC, 'match_payments', '2026-03-01'), { payments: { x: true } }, { merge: true }));
await expectDenied('president C changes a role', () => updateDoc(LC(adminC, 'players', playerA.uid), { leagueRole: 'COLLABORATOR' }));
await expectDenied('player B signs up today', () => join(playerB, TODAY, playerB.uid));
await expectDenied('player B renames own card', () => updateDoc(LC(playerB, 'players', playerB.uid), { full_name: 'B sospeso', updated_at: 'z' }));
await expectAllowed('super admin (platform staff) still writes a match', () => setDoc(LC(superAdmin, 'matches', '2026-03-02'), { status: 'scheduled' }));
{
  const helper2 = await client({ google: { sub: 'helper-2', email: 'helper2@example.com' } });
  await ownerSet(`profiles/${helper2.uid}`, baseProfile(helper2.uid, { platformRole: 'GLOBAL_ADMIN' }));
  await expectAllowed('GLOBAL_ADMIN still marks cash in the suspended league', () =>
    setDoc(doc(helper2.db, ...LG, 'match_payments', '2026-03-02'), { payments: { x: true } }, { merge: true }));
}
await ownerSet('leagues/calcettari', { id: 'calcettari', name: 'I Calcettari', status: 'active', visibility: 'private' });
await expectAllowed('re-activated: president C writes a match again', () => setDoc(LC(adminC, 'matches', '2026-03-01'), { status: 'scheduled' }));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
