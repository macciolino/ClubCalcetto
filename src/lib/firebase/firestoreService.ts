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
  FieldPath,
  deleteField,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './config';
import { Profile, Presence, StatCategory, Match, GeneratedTeamRecord, AppSettings, CalendarSettings, MatchOutcome, MatchScorer, MatchTeamPlayer, TeamSubstitution, MvpVote, MatchPenaltySave } from '@/types/database';
import { rankDayPresences, rankPresencesByDate } from '@/lib/services/presenceService';
import { DayFormats, MatchFormat, maxPlayersFor } from '@/lib/utils/matchFormat';
import { requestTeamsCheck, requestFirstMatchCheck } from '@/lib/services/notificationService';

// ==========================================
// 1. PROFILI & GIOCATORI (Collection: 'profiles')
// ==========================================

export function subscribeProfiles(
  callback: (profiles: Profile[]) => void,
  /** 'active' (default): deactivated accounts are hidden. 'deactivated': only those (super admin, Anagrafica). */
  which: 'active' | 'deactivated' = 'active'
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
            const p = docSnap.data() as Profile;
            if (Boolean(p.deactivated_at) === (which === 'deactivated')) list.push(p);
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

// ---------- formato di ogni giorno di partita (settings/match_formats, `days[date]`) ----------

/** Realtime formats of the match days (admins choose them; a day without a choice is 5vs5). */
export function subscribeMatchFormats(callback: (days: DayFormats) => void): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') return () => {};
  try {
    return onSnapshot(
      doc(db, 'settings', 'match_formats'),
      (snap) => callback(((snap.data()?.days as DayFormats) || {}) as DayFormats),
      (err) => {
        console.warn('[Firestore] subscribeMatchFormats warning:', err.message);
        callback({});
      }
    );
  } catch {
    return () => {};
  }
}

/** Admin: format (and formation) of a match day. */
export async function saveDayFormat(date: string, format: MatchFormat, formation: string, by: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await setDoc(
    doc(db, 'settings', 'match_formats'),
    { days: { [date]: { format, formation, updated_at: new Date().toISOString(), updated_by: by } } },
    { merge: true }
  );
}

/**
 * Presences + formats together: the ranking (starters vs waitlist) depends on the day's format, so it is
 * recomputed when either changes. `rank` gets the presences and the formats.
 */
function subscribeRanked(
  q: ReturnType<typeof query>,
  rank: (list: Presence[], formats: DayFormats) => Presence[],
  callback: (presences: Presence[]) => void,
  label: string
): () => void {
  let docs: Presence[] | null = null;
  let formats: DayFormats | null = null;
  const emit = () => {
    if (docs !== null && formats !== null) callback(rank(docs, formats));
  };
  const unsubP = onSnapshot(
    q,
    (snapshot) => {
      docs = snapshot.docs.map((d) => toPresence(d as QueryDocumentSnapshot<DocumentData>));
      emit();
    },
    (err) => console.warn(`[Firestore] ${label} warning:`, err.message)
  );
  const unsubF = subscribeMatchFormats((f) => {
    formats = f;
    emit();
  });
  return () => {
    unsubP();
    unsubF();
  };
}

/** Realtime presences of ONE day, already ranked (starters = players of the day's format, then waitlist). */
export function subscribePresences(
  date: string,
  callback: (presences: Presence[]) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined' || !date) {
    return () => {};
  }
  try {
    const q = query(collection(db, 'presences'), where('date', '==', date));
    return subscribeRanked(q, (list, f) => rankDayPresences(list, maxPlayersFor(f, date)), callback, 'subscribePresences');
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
    return subscribeRanked(
      q,
      (list, f) => rankPresencesByDate(list, (d) => maxPlayersFor(f, d)),
      callback,
      'subscribePresencesRange'
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
  requestTeamsCheck(date);
}

/** Presence ids are `${date}_${playerId}`: after a change the server checks substitutions for that day. */
function checkTeamsForPresence(presenceId: string) {
  const date = presenceId.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) requestTeamsCheck(date);
}

/** Withdraws a presence (own, or anyone's for admins). The waitlist moves up automatically. */
export async function leavePresence(presenceId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await deleteDoc(doc(db, 'presences', presenceId));
  checkTeamsForPresence(presenceId);
}

/** Admin only: force a player into the starters / onto the waitlist, or clear the override (null). */
export async function setPresenceOverride(
  presenceId: string,
  override: 'starter' | 'waitlist' | null
): Promise<void> {
  if (!isFirebaseConfigured) return;
  await updateDoc(doc(db, 'presences', presenceId), { admin_override: override });
  checkTeamsForPresence(presenceId);
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
        // Names exactly as saved by the admin (no automatic renaming); also called with [] if all were removed
        const list: StatCategory[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as StatCategory), id: docSnap.id });
        });
        list.sort((a, b) => (a.created_at || a.id).localeCompare(b.created_at || b.id));
        callback(list);
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

/**
 * Adds a player parameter (admin, Admin → Campi & Parametri).
 * Every player WITHOUT a value for it gets the default value (e.g. 6); players who already had one
 * (parameter removed and added again) keep their old value. The OVR is NOT recalculated:
 * it changes only when an admin edits that player. Returns how many players were updated.
 */
export async function addStatParameter(name: string, defaultValue: number): Promise<number> {
  if (!isFirebaseConfigured) return 0;
  const clean = name.trim();
  const id = `cat-${Date.now()}`;
  await setDoc(doc(db, 'stat_categories', id), {
    id,
    name: clean,
    label: clean,
    default_value: defaultValue,
    created_at: new Date().toISOString(),
  });
  const profiles = await getDocs(collection(db, 'profiles'));
  const missing = profiles.docs.filter((d) => typeof (d.data().stats || {})[clean] !== 'number');
  for (let i = 0; i < missing.length; i += 400) {
    const batch = writeBatch(db);
    missing.slice(i, i + 400).forEach((d) =>
      batch.update(d.ref, new FieldPath('stats', clean), defaultValue, 'updated_at', new Date().toISOString())
    );
    await batch.commit();
  }
  return missing.length;
}

/** Removes a parameter from the app. Players' values stay saved (hidden): adding it again brings them back. */
export async function removeStatParameter(id: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await deleteDoc(doc(db, 'stat_categories', id));
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
  /** Penalties saved by the goalkeeper (fixed goalkeeper only) */
  penaltySaves?: MatchPenaltySave[];
  totalCost: number;
  /** Players of the match (10 for 5vs5, 14 for 7vs7…): quota a testa = totalCost / players */
  players?: number;
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
        penalty_saves: (input.penaltySaves || []).filter((p) => p.count > 0),
        total_cost: input.totalCost,
        cost_per_player: Number((input.totalCost / (input.players || teamWhite.length + teamBlack.length || 10)).toFixed(2)),
        profile_effects: appliedEffects,
        closed_at: existing?.closed_at || now,
        closed_by: input.closedBy,
        created_at: existing?.created_at || now,
        updated_at: now,
      },
      { merge: true }
    );
  });
  // Nuovi giocatori alla prima partita: notifica agli admin per rivedere i parametri
  requestFirstMatchCheck(date);
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

const teamIdsKey = (white: { id: string }[] = [], black: { id: string }[] = []) =>
  `${white.map((p) => p.id).join(',')}|${black.map((p) => p.id).join(',')}`;

/**
 * Saves the teams of a match day (generate, "Ribilancia" or manual edit by an admin).
 * A confirmed match stays confirmed: the new teams become the official ones.
 */
/** Dates (YYYY-MM-DD) that have saved teams from `fromDate` on, in real time (used to close past matches). */
export function subscribeTeamDatesSince(fromDate: string, callback: (dates: string[]) => void): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') return () => {};
  try {
    return onSnapshot(
      query(collection(db, 'generated_teams'), where('date', '>=', fromDate)),
      (snap) => callback(snap.docs.map((d) => (d.data() as GeneratedTeamRecord).date).filter(Boolean)),
      (err) => console.warn('[Firestore] subscribeTeamDatesSince warning:', err.message)
    );
  } catch (err) {
    console.warn('[Firestore] subscribeTeamDatesSince exception:', err);
    return () => {};
  }
}

export async function saveTeams(
  date: string,
  white: MatchTeamPlayer[],
  black: MatchTeamPlayer[],
  extra: { manual: boolean; whiteAvg?: number; blackAvg?: number }
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const now = new Date().toISOString();
  const ref = doc(db, 'generated_teams', date);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as GeneratedTeamRecord) : null;
  const record: GeneratedTeamRecord = {
    id: date,
    date,
    team_white: white,
    team_black: black,
    created_at: existing?.created_at || now,
    updated_at: now,
    manual: extra.manual,
    confirmed: existing?.confirmed || false,
    substitutions: existing?.substitutions || [],
  };
  if (existing?.confirmed_at) record.confirmed_at = existing.confirmed_at;
  if (existing?.confirmed_by) record.confirmed_by = existing.confirmed_by;
  if (typeof extra.whiteAvg === 'number') record.white_score_avg = extra.whiteAvg;
  if (typeof extra.blackAvg === 'number') record.black_score_avg = extra.blackAvg;
  // Riscrive l'intero documento: le vecchie squadre salvate come profili completi spariscono
  await setDoc(ref, record);
}

/** Admin confirms the match: from now on these are the teams (players get notified). */
export async function confirmTeams(date: string, confirmedBy: string, confirmed = true): Promise<void> {
  if (!isFirebaseConfigured) return;
  await updateDoc(doc(db, 'generated_teams', date), {
    confirmed,
    confirmed_at: confirmed ? new Date().toISOString() : null,
    confirmed_by: confirmed ? confirmedBy : null,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Saves the substitutions computed by reconcileTeams (a starter withdrew, the first of the
 * waitlist takes exactly that place). Written only if the teams did not change in the meantime,
 * so two admins with the page open cannot apply it twice. Returns true if this call wrote it.
 */
export async function applyTeamSubstitutions(
  date: string,
  expected: { white: { id: string }[]; black: { id: string }[] },
  next: { white: MatchTeamPlayer[]; black: MatchTeamPlayer[] },
  substitutions: Omit<TeamSubstitution, 'at'>[]
): Promise<boolean> {
  if (!isFirebaseConfigured || substitutions.length === 0) return false;
  const ref = doc(db, 'generated_teams', date);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const current = snap.data() as GeneratedTeamRecord;
    if (teamIdsKey(current.team_white, current.team_black) !== teamIdsKey(expected.white, expected.black)) {
      return false;
    }
    const now = new Date().toISOString();
    tx.update(ref, {
      team_white: next.white,
      team_black: next.black,
      substitutions: [...(current.substitutions || []), ...substitutions.map((s) => ({ ...s, at: now }))],
      updated_at: now,
    });
    return true;
  });
}

// ==========================================
// 7. VOTO MVP (Collection: 'mvp_votes', doc id = date_uid)
// ==========================================

export function subscribeMvpVotes(date: string, callback: (votes: MvpVote[]) => void): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined' || !date) return () => {};
  try {
    return onSnapshot(
      query(collection(db, 'mvp_votes'), where('date', '==', date)),
      (snap) => callback(snap.docs.map((d) => d.data() as MvpVote)),
      (err) => console.warn('[Firestore] subscribeMvpVotes warning:', err.message)
    );
  } catch (err) {
    console.warn('[Firestore] subscribeMvpVotes exception:', err);
    return () => {};
  }
}

/** One vote per person per match: voting again replaces the previous choice. */
export async function castMvpVote(date: string, voterUid: string, playerId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  await setDoc(doc(db, 'mvp_votes', `${date}_${voterUid}`), {
    date,
    voter_id: voterUid,
    player_id: playerId,
    updated_at: serverTimestamp(),
  });
}

/** Admin test mode of the MVP vote for a match day (only admins see it open early). */
export async function setMvpVoteTest(date: string, mode: 'admins' | 'all' | false): Promise<void> {
  if (!isFirebaseConfigured) return;
  await updateDoc(doc(db, 'generated_teams', date), { mvp_vote_test: mode, updated_at: new Date().toISOString() });
}

/** Deletes all MVP votes of a match day (admins, e.g. after a test). */
export async function clearMvpVotes(date: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  const snap = await getDocs(query(collection(db, 'mvp_votes'), where('date', '==', date)));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/** Votes per player, most voted first. */
export function countMvpVotes(votes: MvpVote[]): { playerId: string; count: number }[] {
  const counts = new Map<string, number>();
  votes.forEach((v) => counts.set(v.player_id, (counts.get(v.player_id) || 0) + 1));
  return Array.from(counts.entries())
    .map(([playerId, count]) => ({ playerId, count }))
    .sort((a, b) => b.count - a.count);
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

/** Club standard cost of 7vs7 / 8vs8 / 11vs11 (empty = proportional to the 5vs5 standard). Emptied values are removed. */
export async function saveStandardCostsDoc(costs: AppSettings['standard_costs']): Promise<void> {
  if (!isFirebaseConfigured) return;
  const out: Record<string, unknown> = {};
  (['7v7', '8v8', '11v11'] as const).forEach((f) => {
    const v = costs?.[f];
    out[f] = Number(v) > 0 ? Number(v) : deleteField();
  });
  await setDoc(doc(db, 'settings', 'app_config'), { standard_costs: out }, { merge: true });
}

export async function saveAppSettingsDoc(settings: Partial<AppSettings>): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await setDoc(doc(db, 'settings', 'app_config'), settings, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveAppSettingsDoc error:', err);
  }
}

