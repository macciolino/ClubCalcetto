import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  onSnapshot,
  Unsubscribe,
  writeBatch,
  updateDoc,
  serverTimestamp,
  QueryDocumentSnapshot,
  DocumentData,
  runTransaction,
  increment,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './config';
import { Profile, Presence, StatCategory, Match, GeneratedTeamRecord, AppSettings, CalendarSettings, MatchOutcome, MatchScorer, MatchTeamPlayer } from '@/types/database';
import { rankDayPresences, rankPresencesByDate } from '@/lib/services/presenceService';
import { normalizeCategories } from '@/lib/utils/statUtils';

// ==========================================
// 1. PROFILI & GIOCATORI (Collection: 'profiles')
// ==========================================

export function subscribeProfiles(
  callback: (profiles: Profile[]) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }

  try {
    const colRef = collection(db, 'profiles');
    return onSnapshot(
      colRef,
      (snapshot) => {
        // NOTE: no automatic seeding of demo players into the real database
        if (!snapshot.empty) {
          const list: Profile[] = [];
          snapshot.forEach((docSnap) => {
            list.push(docSnap.data() as Profile);
          });
          callback(list);
        }
      },
      (err) => {
        console.warn('[Firestore] subscribeProfiles warning:', err.message);
      }
    );
  } catch (err) {
    console.warn('[Firestore] subscribeProfiles exception:', err);
    return () => {};
  }
}

export async function fetchProfiles(): Promise<Profile[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const snap = await getDocs(collection(db, 'profiles'));
    const list: Profile[] = [];
    snap.forEach((d) => list.push(d.data() as Profile));
    return list;
  } catch (err) {
    console.warn('[Firestore] fetchProfiles error:', err);
    return [];
  }
}

export async function saveProfileDoc(profile: Profile): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await setDoc(doc(db, 'profiles', profile.id), profile, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveProfileDoc error:', err);
  }
}

export async function deleteProfileDoc(id: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await deleteDoc(doc(db, 'profiles', id));
  } catch (err) {
    console.warn('[Firestore] deleteProfileDoc error:', err);
  }
}

// ==========================================
// 2. PRESENZE (Collection: 'presences')
// ==========================================

/** Firestore doc -> Presence, converting the server timestamp joined_at into joined_ms. */
function toPresence(docSnap: QueryDocumentSnapshot<DocumentData>): Presence {
  // 'estimate' gives a local time for our own just-written (still pending) sign-up
  const data = docSnap.data({ serverTimestamps: 'estimate' }) as Presence & { joined_at?: { toMillis?: () => number } };
  const { joined_at, ...rest } = data;
  const joined_ms = joined_at && typeof joined_at.toMillis === 'function' ? joined_at.toMillis() : undefined;
  return { ...rest, id: rest.id || docSnap.id, joined_ms };
}

/** Realtime presences of ONE day, already ranked (titolari 1..10, then waitlist). Always calls back, also with []. */
export function subscribePresences(
  date: string,
  callback: (presences: Presence[]) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined' || !date) {
    return () => {};
  }
  try {
    const q = query(collection(db, 'presences'), where('date', '==', date));
    return onSnapshot(
      q,
      (snapshot) => callback(rankDayPresences(snapshot.docs.map(toPresence))),
      (err) => console.warn('[Firestore] subscribePresences warning:', err.message)
    );
  } catch (err) {
    console.warn('[Firestore] subscribePresences exception:', err);
    return () => {};
  }
}

/** Realtime presences between two dates (inclusive), each day ranked. Always calls back, also with []. */
export function subscribePresencesRange(
  fromDate: string,
  toDate: string,
  callback: (presences: Presence[]) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }
  try {
    const q = query(collection(db, 'presences'), where('date', '>=', fromDate), where('date', '<=', toDate));
    return onSnapshot(
      q,
      (snapshot) => callback(rankPresencesByDate(snapshot.docs.map(toPresence))),
      (err) => console.warn('[Firestore] subscribePresencesRange warning:', err.message)
    );
  } catch (err) {
    console.warn('[Firestore] subscribePresencesRange exception:', err);
    return () => {};
  }
}

/** One presence per player per day: the doc id makes double sign-ups impossible. */
export function presenceDocId(date: string, playerId: string): string {
  return `${date}_${playerId}`;
}

/**
 * Signs a player up for a day. The position in the queue comes from the SERVER time (joined_at),
 * so it cannot be faked and simultaneous sign-ups are ordered correctly.
 * Throws if the security rules refuse it (e.g. day not open yet).
 */
export async function joinPresence(date: string, playerId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  const id = presenceDocId(date, playerId);
  await setDoc(doc(db, 'presences', id), {
    id,
    date,
    player_id: playerId,
    status: 'waitlist', // hint only, the real status is computed on read
    order_index: 0, // hint only
    created_at: new Date().toISOString(),
    joined_at: serverTimestamp(),
  });
}

/** Withdraws a presence (own, or anyone's for admins). The waitlist moves up automatically. */
export async function leavePresence(presenceId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await deleteDoc(doc(db, 'presences', presenceId));
}

/** Admin only: force a player into the starters / onto the waitlist, or clear the override (null). */
export async function setPresenceOverride(
  presenceId: string,
  override: 'starter' | 'waitlist' | null
): Promise<void> {
  if (!isFirebaseConfigured) return;
  await updateDoc(doc(db, 'presences', presenceId), { admin_override: override });
}

export async function clearPresencesForDate(date: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const q = query(collection(db, 'presences'), where('date', '==', date));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.warn('[Firestore] clearPresencesForDate error:', err);
  }
}

// ==========================================
// 3. CATEGORIE STATISTICHE (Collection: 'stat_categories')
// ==========================================

export function subscribeStatCategories(
  callback: (categories: StatCategory[]) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }

  try {
    const colRef = collection(db, 'stat_categories');
    return onSnapshot(
      colRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: StatCategory[] = [];
          snapshot.forEach((docSnap) => {
            list.push(docSnap.data() as StatCategory);
          });
          callback(normalizeCategories(list));
        }
        // NOTE: no automatic seeding; the admin can use "Ripristina Default 8" 
      },
      (err) => {
        console.warn('[Firestore] subscribeStatCategories warning:', err.message);
      }
    );
  } catch (err) {
    console.warn('[Firestore] subscribeStatCategories exception:', err);
    return () => {};
  }
}

export async function saveStatCategoryDoc(cat: StatCategory): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await setDoc(doc(db, 'stat_categories', cat.id), cat, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveStatCategoryDoc error:', err);
  }
}

export async function deleteStatCategoryDoc(id: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await deleteDoc(doc(db, 'stat_categories', id));
  } catch (err) {
    console.warn('[Firestore] deleteStatCategoryDoc error:', err);
  }
}

// ==========================================
// 4. IMPOSTAZIONI & GIORNO UFFICIALE (Collection: 'settings')
// ==========================================

export function subscribeOfficialMatchDate(
  callback: (date: string) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }

  try {
    const docRef = doc(db, 'settings', 'official_match');
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          if (d?.date) callback(d.date);
        }
      },
      (err) => {
        console.warn('[Firestore] subscribeOfficialMatchDate warning:', err.message);
      }
    );
  } catch (err) {
    console.warn('[Firestore] subscribeOfficialMatchDate exception:', err);
    return () => {};
  }
}

export async function saveOfficialMatchDateDoc(date: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await setDoc(doc(db, 'settings', 'official_match'), { date, updated_at: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveOfficialMatchDateDoc error:', err);
  }
}

/** Calendar lock: which days beyond the current week players may sign up for. */
export function subscribeCalendarSettings(
  callback: (settings: CalendarSettings) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }
  try {
    return onSnapshot(
      doc(db, 'settings', 'calendar'),
      (snap) => callback(snap.exists() ? (snap.data() as CalendarSettings) : {}),
      (err) => console.warn('[Firestore] subscribeCalendarSettings warning:', err.message)
    );
  } catch (err) {
    console.warn('[Firestore] subscribeCalendarSettings exception:', err);
    return () => {};
  }
}

/** Admin only. openUntil = '' locks next week again. Throws if refused. */
export async function saveCalendarOpenUntil(openUntil: string, updatedBy: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await setDoc(
    doc(db, 'settings', 'calendar'),
    { open_until: openUntil, updated_at: new Date().toISOString(), updated_by: updatedBy },
    { merge: true }
  );
}

// ==========================================
// 5. DETTAGLI PARTITA (Collection: 'matches')
// ==========================================

export function subscribeMatch(
  date: string,
  callback: (match: Match | null) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }

  try {
    const docRef = doc(db, 'matches', date);
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          callback(snap.data() as Match);
        } else {
          callback(null);
        }
      },
      (err) => {
        console.warn('[Firestore] subscribeMatch warning:', err.message);
      }
    );
  } catch (err) {
    console.warn('[Firestore] subscribeMatch exception:', err);
    return () => {};
  }
}

export async function saveMatchDoc(match: Match): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await setDoc(doc(db, 'matches', match.match_date), match, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveMatchDoc error:', err);
  }
}

/**
 * Saves only the given fields of a match (merge). Never touches status/result unless passed.
 * Throws if refused (only admins can write matches).
 */
export async function saveMatchFields(date: string, fields: Partial<Match>): Promise<void> {
  if (!isFirebaseConfigured) return;
  const now = new Date().toISOString();
  await setDoc(
    doc(db, 'matches', date),
    { ...fields, id: date, match_date: date, updated_at: now },
    { merge: true }
  );
}

/** Realtime list of all matches, most recent first. */
export function subscribeMatches(callback: (matches: Match[]) => void): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }
  try {
    return onSnapshot(
      collection(db, 'matches'),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ ...(d.data() as Match), id: d.id }));
        list.sort((a, b) => (b.match_date || b.id).localeCompare(a.match_date || a.id));
        callback(list);
      },
      (err) => console.warn('[Firestore] subscribeMatches warning:', err.message)
    );
  } catch (err) {
    console.warn('[Firestore] subscribeMatches exception:', err);
    return () => {};
  }
}

export interface MatchResultInput {
  date: string;
  scoreWhite: number;
  scoreBlack: number;
  teamWhite: MatchTeamPlayer[];
  teamBlack: MatchTeamPlayer[];
  mvpPlayerId: string | null;
  scorers: MatchScorer[];
  totalCost: number;
  closedBy: string;
}

const OUTCOME_FIELD: Record<MatchOutcome, 'matches_won' | 'matches_drawn' | 'matches_lost'> = {
  won: 'matches_won',
  drawn: 'matches_drawn',
  lost: 'matches_lost',
};

/**
 * Saves (or corrects) the result of a match and updates players' W/D/L in ONE transaction.
 * Idempotent: the match remembers what it already added to each profile (profile_effects),
 * so saving the same match again only applies the difference — nothing is counted twice.
 * Profiles are changed only with increment() on the W/D/L counters, never rewritten.
 */
export async function saveMatchResult(input: MatchResultInput): Promise<void> {
  if (!isFirebaseConfigured) return;
  const { date, scoreWhite, scoreBlack, teamWhite, teamBlack } = input;
  const outcomeFor = (team: 'white' | 'black'): MatchOutcome => {
    if (scoreWhite === scoreBlack) return 'drawn';
    const whiteWins = scoreWhite > scoreBlack;
    return (team === 'white') === whiteWins ? 'won' : 'lost';
  };
  const newEffects: Record<string, MatchOutcome> = {};
  teamWhite.forEach((p) => (newEffects[p.id] = outcomeFor('white')));
  teamBlack.forEach((p) => (newEffects[p.id] = outcomeFor('black')));

  await runTransaction(db, async (tx) => {
    const matchRef = doc(db, 'matches', date);
    const matchSnap = await tx.get(matchRef);
    const oldEffects: Record<string, MatchOutcome> =
      (matchSnap.exists() && (matchSnap.data() as Match).profile_effects) || {};

    // Per-player delta between what was applied before and what applies now
    const deltas = new Map<string, Record<string, number>>();
    const add = (id: string, outcome: MatchOutcome, n: number) => {
      const d = deltas.get(id) || {};
      d[OUTCOME_FIELD[outcome]] = (d[OUTCOME_FIELD[outcome]] || 0) + n;
      deltas.set(id, d);
    };
    Object.entries(oldEffects).forEach(([id, o]) => add(id, o, -1));
    Object.entries(newEffects).forEach(([id, o]) => add(id, o, +1));

    // Reads first (transaction rule), then writes. Deleted profiles are skipped.
    const ids = Array.from(deltas.keys()).filter((id) =>
      Object.values(deltas.get(id) || {}).some((n) => n !== 0)
    );
    const snaps = await Promise.all(ids.map((id) => tx.get(doc(db, 'profiles', id))));
    const appliedEffects: Record<string, MatchOutcome> = { ...newEffects };

    snaps.forEach((snap, i) => {
      const id = ids[i];
      if (!snap.exists()) {
        delete appliedEffects[id];
        return;
      }
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      Object.entries(deltas.get(id) || {}).forEach(([field, n]) => {
        if (n !== 0) update[field] = increment(n);
      });
      tx.update(snap.ref, update);
    });

    const now = new Date().toISOString();
    const existing = matchSnap.exists() ? (matchSnap.data() as Match) : null;
    tx.set(
      matchRef,
      {
        id: date,
        match_date: date,
        status: 'completed',
        score_white: scoreWhite,
        score_black: scoreBlack,
        team_white: teamWhite,
        team_black: teamBlack,
        mvp_player_id: input.mvpPlayerId || null,
        scorers: input.scorers,
        total_cost: input.totalCost,
        cost_per_player: Number((input.totalCost / 10).toFixed(2)),
        profile_effects: appliedEffects,
        closed_at: existing?.closed_at || now,
        closed_by: input.closedBy,
        created_at: existing?.created_at || now,
        updated_at: now,
      },
      { merge: true }
    );
  });
}

/**
 * Deletes an archived match from the history and UNDOES what it added to players' W/D/L
 * (using the profile_effects saved with the match), in one transaction.
 * Presences, payments and generated teams of that day are not touched.
 */
export async function deleteMatchResult(date: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await runTransaction(db, async (tx) => {
    const matchRef = doc(db, 'matches', date);
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists()) return;
    const effects: Record<string, MatchOutcome> = (matchSnap.data() as Match).profile_effects || {};
    const ids = Object.keys(effects);
    const snaps = await Promise.all(ids.map((id) => tx.get(doc(db, 'profiles', id))));
    snaps.forEach((snap, i) => {
      if (!snap.exists()) return;
      tx.update(snap.ref, {
        [OUTCOME_FIELD[effects[ids[i]]]]: increment(-1),
        updated_at: new Date().toISOString(),
      });
    });
    tx.delete(matchRef);
  });
}

// ==========================================
// 6. SQUADRE GENERATE (Collection: 'generated_teams')
// ==========================================

export function subscribeGeneratedTeams(
  date: string,
  callback: (record: GeneratedTeamRecord | null) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }

  try {
    const docRef = doc(db, 'generated_teams', date);
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          callback(snap.data() as GeneratedTeamRecord);
        } else {
          callback(null);
        }
      },
      (err) => {
        console.warn('[Firestore] subscribeGeneratedTeams warning:', err.message);
      }
    );
  } catch (err) {
    console.warn('[Firestore] subscribeGeneratedTeams exception:', err);
    return () => {};
  }
}

export async function saveGeneratedTeamsDoc(record: GeneratedTeamRecord): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await setDoc(doc(db, 'generated_teams', record.date), record, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveGeneratedTeamsDoc error:', err);
  }
}


// ==========================================
// 8. APP SETTINGS (Collection: 'settings', Doc: 'app_config')
// ==========================================

export function subscribeAppSettings(
  callback: (settings: AppSettings) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }

  try {
    const docRef = doc(db, 'settings', 'app_config');
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          callback(snap.data() as AppSettings);
        }
      },
      (err) => {
        console.warn('[Firestore] subscribeAppSettings warning:', err.message);
      }
    );
  } catch (err) {
    console.warn('[Firestore] subscribeAppSettings exception:', err);
    return () => {};
  }
}

export async function saveAppSettingsDoc(settings: Partial<AppSettings>): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await setDoc(doc(db, 'settings', 'app_config'), settings, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveAppSettingsDoc error:', err);
  }
}

