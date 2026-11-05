/**
 * Seeds FAKE test data into the LOCAL Firestore emulator.
 *
 * SAFETY: the project id is hard-coded to "demo-clubcalcetto" and the client is
 * connected to the emulator at 127.0.0.1:8080. Firebase treats "demo-*" projects
 * as offline-only, so this script cannot reach production even by mistake.
 * It does NOT read .env.local.
 *
 * Usage (with `npm run dev:emulators` already running): npm run seed:emulators
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, writeBatch } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';

const PROJECT_ID = 'demo-clubcalcetto';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8080;

// Abort if the emulator is not running (never fall back to anything else)
try {
  await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/`);
} catch {
  console.error('Firestore emulator not reachable on 127.0.0.1:8080. Start it first with: npm run dev:emulators');
  process.exit(1);
}

const app = initializeApp({ apiKey: 'emulator-local-key', projectId: PROJECT_ID, appId: '1:000000000000:web:emulator' });
const db = getFirestore(app);
connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORT);

// Sign in to the Auth EMULATOR as the (fake) super admin, so the security rules allow seeding.
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
await signInWithCredential(
  auth,
  GoogleAuthProvider.credential(
    JSON.stringify({ sub: 'emulator-super-admin', email: 'macciolino84@gmail.com', email_verified: true })
  )
);

const now = new Date().toISOString();
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const STAT_NAMES = ['Velocità', 'Fisico', 'Resistenza', 'Tiro', 'Passaggio', 'Dribbling', 'Difesa', 'Visione'];
const POSITIONS = ['Portiere', 'Difensore', 'Esterno', 'Esterno', 'Punta'];

function makeStats() {
  const s = {};
  for (const n of STAT_NAMES) s[n] = rand(4, 9);
  return s;
}
const ovr = (stats) => {
  const v = Object.values(stats);
  return Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(1));
};

// --- Profiles (all fake) ---
const FAKE_NAMES = [
  'Test Rossi', 'Test Bianchi', 'Test Verdi', 'Test Esposito', 'Test Romano', 'Test Colombo',
  'Test Ricci', 'Test Marino', 'Test Greco', 'Test Bruno', 'Test Gallo', 'Test Conti', 'Test Costa',
];

const profiles = [];
{
  // Super admin placeholder: log in locally with the fake Google account macciolino84@gmail.com
  const stats = makeStats();
  profiles.push({
    id: 'p-1', user_id: null, email: 'macciolino84@gmail.com', full_name: 'Marco B.', avatar_url: null,
    role: 'admin', position: 'Esterno', is_guest: false, stats, overall_rating: ovr(stats),
    matches_won: 0, matches_drawn: 0, matches_lost: 0, created_at: now, updated_at: now,
  });
}
FAKE_NAMES.forEach((name, i) => {
  const stats = makeStats();
  profiles.push({
    id: `test-${i + 1}`,
    user_id: null,
    email: `test${i + 1}@example.com`,
    full_name: name,
    avatar_url: null,
    role: 'player',
    position: POSITIONS[i % POSITIONS.length],
    is_guest: i >= 10,
    stats,
    overall_rating: ovr(stats),
    matches_won: rand(0, 10),
    matches_drawn: rand(0, 4),
    matches_lost: rand(0, 10),
    created_at: now,
    updated_at: now,
  });
});

// --- Stat categories ---
const categories = [
  ['Velocità', 'Velocità / Scatto breve'],
  ['Fisico', 'Fisico / Protezione palla e contrasti'],
  ['Resistenza', 'Resistenza / Fiato'],
  ['Tiro', 'Tiro / Conclusione'],
  ['Passaggio', 'Passaggio / Sponde'],
  ['Dribbling', 'Dribbling / Controllo nello stretto'],
  ['Difesa', 'Difesa / 1v1'],
  ['Visione', 'Visione di gioco / Tattica'],
].map(([name, label], i) => ({ id: String(i + 1), name, label, default_value: 7 }));

// --- Presences for today: 12 players -> 10 starters + 2 waitlist ---
const presences = profiles.slice(0, 12).map((p, i) => ({
  id: `pres-test-${i + 1}`,
  date: today,
  player_id: p.id,
  status: i < 10 ? 'confirmed' : 'waitlist',
  order_index: i + 1,
  created_at: new Date(Date.now() - (12 - i) * 60000).toISOString(),
}));

// --- Fields & settings ---
const fields = [
  { id: 'field-test-1', name: 'Campo Test Nord', address: 'Via di Prova 1', court_type: 'Sintetico', notes: 'Campo fittizio per i test', created_at: now },
  { id: 'field-test-2', name: 'Campo Test Sud', address: 'Via di Prova 2', court_type: 'Indoor', notes: 'Campo fittizio per i test', created_at: now },
];

const batch = writeBatch(db);
profiles.forEach((p) => batch.set(doc(db, 'profiles', p.id), p));
categories.forEach((c) => batch.set(doc(db, 'stat_categories', c.id), c));
presences.forEach((p) => batch.set(doc(db, 'presences', p.id), p));
fields.forEach((f) => batch.set(doc(db, 'sport_fields', f.id), f));
batch.set(doc(db, 'settings', 'official_match'), { date: today, updated_at: now });
batch.set(doc(db, 'settings', 'app_config'), {
  official_match_date: today, timelock_enabled: false, timelock_hours_before: 4,
  standard_match_time: '20:30', standard_total_cost: 80, default_field_id: 'field-test-1',
});
await batch.commit();

console.log(`Seeded emulator (${PROJECT_ID}): ${profiles.length} profiles, ${categories.length} categories, ${presences.length} presences (date ${today}), ${fields.length} fields.`);
process.exit(0);
