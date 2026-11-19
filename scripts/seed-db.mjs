/**
 * Test data for the multi-league model, written directly with the Firebase Admin SDK (no app API routes).
 *
 * Creates 2 leagues ("Socco Academy", "Marco Barbaro il Chierichetto") and 40 fake global accounts:
 * 10 in BOTH leagues + 15 only in each one → 25 members per league. Every league has 1 PRESIDENT,
 * 2 COLLABORATOR and 22 PLAYER; the overlap shows the per-league roles (president in one, player in the other).
 *
 * SAFETY (production data is real):
 * - Default target = EMULATOR. Production only with BOTH `--key <service-account.json>` and `--production`.
 * - Every document has a `seed-` id and `seed: true`: `--remove` deletes exactly these and nothing else.
 * - Re-running overwrites the same documents (same ids, deterministic random values): no duplicates.
 * - No Firebase Auth accounts: the fake users cannot sign in (they are data for lists, teams, stats).
 *
 * Usage:
 *   Emulator:    FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-db.mjs
 *   Remove:      FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-db.mjs --remove
 *   Production:  node scripts/seed-db.mjs --key C:\path\service-account.json --production   (add --remove to clean up)
 *
 * Real testers: `--member <email>` (repeatable) adds an EXISTING account of the app (signed up, email verified) to
 * the test leagues: PRESIDENT of "Socco Academy", PLAYER in "Marco Barbaro il Chierichetto". `--remove` takes
 * these memberships away again without touching the rest of that account.
 */
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const keyPath = args.includes('--key') ? args[args.indexOf('--key') + 1] : undefined;
const memberEmails = args.flatMap((a, i) => (a === '--member' && args[i + 1] ? [args[i + 1].trim().toLowerCase()] : []));
const MEMBER_ROLES = ['PRESIDENT', 'PLAYER']; // per league, same order as LEAGUES

let target;
if (process.env.FIRESTORE_EMULATOR_HOST) {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-clubcalcetto' });
  target = `emulatore (${process.env.FIRESTORE_EMULATOR_HOST})`;
} else if (keyPath && flag('--production')) {
  const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
  target = `PRODUZIONE (${sa.project_id})`;
} else {
  console.error(
    'Nessun database scelto.\n' +
      '  Emulatore:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-db.mjs\n' +
      '  Produzione: node scripts/seed-db.mjs --key <service-account.json> --production'
  );
  process.exit(1);
}
const db = getFirestore();

// ---------- Fixed data ----------

const LEAGUES = [
  { id: 'seed-socco-academy', name: 'Socco Academy' },
  { id: 'seed-marco-barbaro-il-chierichetto', name: 'Marco Barbaro il Chierichetto' },
];

const FIRST = ['Luca', 'Marco', 'Giuseppe', 'Francesco', 'Alessandro', 'Andrea', 'Matteo', 'Lorenzo', 'Davide', 'Simone',
  'Federico', 'Riccardo', 'Gabriele', 'Stefano', 'Paolo', 'Antonio', 'Giovanni', 'Roberto', 'Nicola', 'Fabio'];
const LAST = ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco',
  'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti',
  'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone',
  'Longo', 'Gentile', 'Martinelli', 'Vitale', 'Lombardo', 'Serra', 'Coppola', 'De Santis', "D'Angelo", 'Marchetti'];
const POSITIONS = ['Portiere', 'Difensore', 'Centrocampista', 'Esterno', 'Punta'];

// Same parameters as a new league (src/lib/utils/defaultCategories.ts)
const CATEGORIES = [
  ['Velocità', 'Velocità / Scatto breve'],
  ['Fisico', 'Fisico / Protezione palla e contrasti'],
  ['Resistenza', 'Resistenza / Fiato'],
  ['Tiro', 'Tiro / Conclusione'],
  ['Passaggio', 'Passaggio / Sponde'],
  ['Dribbling', 'Dribbling / Controllo nello stretto'],
  ['Visione', 'Visione di gioco / Tattica'],
  ['Difesa', 'Difesa / 1v1'],
];

// Deterministic random numbers: every run writes the same values
let state = 20261118;
const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
const between = (min, max) => Math.round(min + rand() * (max - min));

const slugPart = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/**
 * OVR 60–95 is shown in the "FIFA" style, but the app rates every parameter 1–10:
 * the card stores parameters around OVR/10 (e.g. OVR 82 → 8, 8, 9, 7...) and overall_rating = their average.
 */
function ratings(position) {
  const ovr = between(60, 95);
  const stats = {};
  for (const [name] of CATEGORIES) {
    let bias = 0;
    if (position === 'Portiere' && ['Difesa', 'Fisico'].includes(name)) bias = 1;
    if (position === 'Punta' && ['Tiro', 'Dribbling'].includes(name)) bias = 1;
    if (position === 'Difensore' && name === 'Difesa') bias = 1;
    if (position === 'Centrocampista' && ['Passaggio', 'Visione'].includes(name)) bias = 1;
    if (position === 'Esterno' && ['Velocità', 'Resistenza'].includes(name)) bias = 1;
    stats[name] = Math.min(10, Math.max(1, Math.round(ovr / 10 + bias + (rand() - 0.5) * 2)));
  }
  const values = Object.values(stats);
  return { ovr, stats, overall_rating: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) };
}

// ---------- 40 accounts and their leagues ----------
// 0–9 in both leagues · 10–24 only Socco Academy · 25–39 only Marco Barbaro
const USERS = Array.from({ length: 40 }, (_, i) => {
  const first = FIRST[i % FIRST.length];
  const last = LAST[i];
  const position = i % 10 === 0 ? 'Portiere' : POSITIONS[1 + (i % 4)];
  return {
    n: i + 1,
    profileId: `seed-p${i + 1}`,
    uid: `seed-uid-${i + 1}`,
    first,
    last,
    full_name: `${first} ${last}`,
    email: `${slugPart(first)}.${slugPart(last)}@test.com`,
    position,
    leagues: i < 10 ? [0, 1] : i < 25 ? [0] : [1],
  };
});

// Roles per league. Overlap on purpose: n.1 is president of Socco and player in Barbaro, n.2 the opposite
const ROLES = [
  { 'seed-p1': 'PRESIDENT', 'seed-p3': 'COLLABORATOR', 'seed-p11': 'COLLABORATOR' },
  { 'seed-p2': 'PRESIDENT', 'seed-p4': 'COLLABORATOR', 'seed-p26': 'COLLABORATOR' },
];

// ---------- Batched writes ----------

async function commitAll(ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch();
    ops.slice(i, i + 450).forEach((op) => op(batch));
    await batch.commit();
  }
}

async function seed() {
  const now = new Date().toISOString();
  const ops = [];
  const summary = LEAGUES.map((l) => ({ name: l.name, id: l.id, PRESIDENT: [], COLLABORATOR: [], PLAYER: 0 }));

  LEAGUES.forEach((l, li) => {
    const president = Object.entries(ROLES[li]).find(([, r]) => r === 'PRESIDENT')[0];
    const ref = db.doc(`leagues/${l.id}`);
    ops.push((b) =>
      b.set(ref, {
        id: l.id,
        name: l.name,
        slug: l.id.replace(/^seed-/, ''),
        status: 'active',
        visibility: 'private',
        createdAt: now,
        createdBy: president,
        defaultFormat: '5v5',
        seed: true,
      })
    );
    CATEGORIES.forEach(([name, label], i) =>
      ops.push((b) =>
        b.set(ref.collection('stat_categories').doc(`cat-${i + 1}`), { id: `cat-${i + 1}`, name, label, default_value: 7, created_at: `${now}-${i}`, seed: true })
      )
    );
  });

  for (const u of USERS) {
    // Global account: public profile (no email, C2) + private email + the leagues it belongs to
    const own = ratings(u.position);
    ops.push((b) =>
      b.set(db.doc(`profiles/${u.profileId}`), {
        id: u.profileId,
        user_id: u.uid,
        full_name: u.full_name,
        first_name: u.first,
        last_name: u.last,
        avatar_url: null,
        role: 'player',
        position: u.position,
        is_guest: false,
        stats: own.stats,
        overall_rating: own.overall_rating,
        matches_won: 0,
        matches_drawn: 0,
        matches_lost: 0,
        created_at: now,
        updated_at: now,
        seed: true,
      })
    );
    ops.push((b) => b.set(db.doc(`private_profiles/${u.profileId}`), { email: u.email, updated_at: now, seed: true }));

    const memberships = {};
    for (const li of u.leagues) {
      const l = LEAGUES[li];
      const leagueRole = ROLES[li][u.profileId] || 'PLAYER';
      const r = ratings(u.position); // every league rates its players on its own
      memberships[l.id] = { player_id: u.profileId, league_role: leagueRole, name: l.name };
      ops.push((b) =>
        b.set(db.doc(`leagues/${l.id}/players/${u.profileId}`), {
          id: u.profileId,
          user_id: u.uid,
          userId: u.uid,
          full_name: u.full_name,
          avatar_url: null,
          position: u.position,
          role: leagueRole === 'PLAYER' ? 'player' : 'admin',
          leagueRole,
          isActivePlayer: true,
          is_guest: false,
          stats: r.stats,
          overall_rating: r.overall_rating,
          ovr: r.ovr,
          matches_won: 0,
          matches_drawn: 0,
          matches_lost: 0,
          created_at: now,
          updated_at: now,
          seed: true,
        })
      );
      const s = summary[li];
      if (leagueRole === 'PLAYER') s.PLAYER++;
      else s[leagueRole].push(u.full_name);
    }
    ops.push((b) => b.set(db.doc(`memberships/${u.uid}`), { leagues: memberships, updated_at: now, seed: true }));
  }

  // Real accounts that will try the app: their own card in both test leagues, membership merged (never replaced)
  const testers = [];
  for (const email of memberEmails) {
    const m = await realMember(email);
    if (!m) continue;
    const memberships = {};
    LEAGUES.forEach((l, li) => {
      const leagueRole = MEMBER_ROLES[li];
      const r = ratings(m.position);
      memberships[l.id] = { player_id: m.profileId, league_role: leagueRole, name: l.name };
      ops.push((b) =>
        b.set(db.doc(`leagues/${l.id}/players/${m.profileId}`), {
          id: m.profileId,
          user_id: m.uid,
          userId: m.uid,
          full_name: m.full_name,
          avatar_url: m.avatar_url,
          position: m.position,
          role: leagueRole === 'PLAYER' ? 'player' : 'admin',
          leagueRole,
          isActivePlayer: true,
          is_guest: false,
          stats: r.stats,
          overall_rating: r.overall_rating,
          matches_won: 0,
          matches_drawn: 0,
          matches_lost: 0,
          created_at: now,
          updated_at: now,
          seed_member: true,
        })
      );
    });
    ops.push((b) => b.set(db.doc(`memberships/${m.uid}`), { leagues: memberships, updated_at: now }, { merge: true }));
    testers.push(m.full_name);
  }

  await commitAll(ops);

  console.log(`\nDatabase: ${target}`);
  console.log(`Scritture: ${ops.length} documenti in ${Math.ceil(ops.length / 450)} batch\n`);
  console.log(`Account globali: ${USERS.length} (profiles + private_profiles + memberships)`);
  console.log(`  in entrambe le leghe: ${USERS.filter((u) => u.leagues.length === 2).length}`);
  for (const s of summary) {
    console.log(`\n${s.name}  [leagues/${s.id}]`);
    console.log(`  membri:        ${s.PRESIDENT.length + s.COLLABORATOR.length + s.PLAYER}`);
    console.log(`  presidente:    ${s.PRESIDENT.join(', ')}`);
    console.log(`  collaboratori: ${s.COLLABORATOR.join(', ')}`);
    console.log(`  giocatori:     ${s.PLAYER}`);
  }
  console.log(`\nIncroci: ${USERS[0].full_name} è presidente in Socco Academy e giocatore nell'altra; ${USERS[1].full_name} il contrario.`);
  for (const name of testers) console.log(`Tester reale: ${name} → presidente in ${LEAGUES[0].name}, giocatore in ${LEAGUES[1].name}`);
  console.log('Per togliere tutto: stesso comando con --remove');
}

/** An existing account of the app, by email: its uid (Firebase Auth) and its global profile. */
async function realMember(email) {
  let user;
  try {
    user = await getAuth().getUserByEmail(email);
  } catch {
    console.error(`✗ ${email}: nessun account con questa email. Deve prima registrarsi nell'app.`);
    return null;
  }
  if (!user.emailVerified) console.warn(`! ${email}: email non ancora verificata, finché non la conferma l'app non gli mostra i dati della lega.`);
  const byUser = await db.collection('profiles').where('user_id', '==', user.uid).limit(1).get();
  const profile = byUser.docs[0] || (await db.doc(`profiles/${user.uid}`).get());
  if (!profile.exists) {
    console.error(`✗ ${email}: account senza profilo. Deve aprire l'app almeno una volta dopo la registrazione.`);
    return null;
  }
  const d = profile.data();
  return { uid: user.uid, profileId: profile.id, full_name: d.full_name || email, avatar_url: d.avatar_url || null, position: d.position || 'Esterno' };
}

async function remove() {
  let count = 0;
  for (const l of LEAGUES) {
    const ref = db.doc(`leagues/${l.id}`);
    const snap = await ref.get();
    if (snap.exists && snap.data().seed !== true) throw new Error(`leagues/${l.id} non è un dato di test: non lo tocco`);
    // Real accounts added with --member: only this league leaves their memberships
    const real = await ref.collection('players').where('seed_member', '==', true).get();
    for (const card of real.docs) {
      const uid = card.data().userId;
      if (uid) await db.doc(`memberships/${uid}`).update({ [`leagues.${l.id}`]: FieldValue.delete() }).catch(() => {});
    }
    await db.recursiveDelete(ref); // the league and all its subcollections
    count++;
  }
  const ops = [];
  for (const u of USERS) {
    for (const path of [`profiles/${u.profileId}`, `private_profiles/${u.profileId}`, `memberships/${u.uid}`]) {
      const snap = await db.doc(path).get();
      if (snap.exists && snap.data().seed === true) ops.push((b) => b.delete(snap.ref));
    }
  }
  await commitAll(ops);
  console.log(`\nDatabase: ${target}`);
  console.log(`Tolte ${count} leghe di test (con giocatori e parametri) e ${ops.length} documenti degli account di test.`);
}

await (flag('--remove') ? remove() : seed());
