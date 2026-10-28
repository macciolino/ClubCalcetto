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
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './config';
import { Profile, Presence, StatCategory, Match, GeneratedTeamRecord } from '@/types/database';
import { DEFAULT_PLAYERS } from '@/lib/services/playerService';
import { DEFAULT_PRESENCES, getOfficialMatchDate } from '@/lib/services/presenceService';
import { DEFAULT_BASE_CATEGORIES } from '@/lib/services/statCategoryService';

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
        if (!snapshot.empty) {
          const list: Profile[] = [];
          snapshot.forEach((docSnap) => {
            list.push(docSnap.data() as Profile);
          });
          callback(list);
        } else {
          // Se la collezione è vuota (primo avvio), inizializzala con i giocatori di default
          seedInitialProfiles();
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

async function seedInitialProfiles() {
  try {
    for (const player of DEFAULT_PLAYERS) {
      await setDoc(doc(db, 'profiles', player.id), player, { merge: true });
    }
  } catch (e) {
    console.warn('[Firestore] Error seeding profiles:', e);
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

export function subscribePresences(
  date: string,
  callback: (presences: Presence[]) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }

  try {
    const colRef = collection(db, 'presences');
    const q = query(colRef, where('date', '==', date));

    return onSnapshot(
      q,
      (snapshot) => {
        const list: Presence[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as Presence);
        });
        // Ordina per order_index
        list.sort((a, b) => a.order_index - b.order_index);
        callback(list);
      },
      (err) => {
        console.warn('[Firestore] subscribePresences warning:', err.message);
      }
    );
  } catch (err) {
    console.warn('[Firestore] subscribePresences exception:', err);
    return () => {};
  }
}

export async function savePresenceDoc(presence: Presence): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await setDoc(doc(db, 'presences', presence.id), presence, { merge: true });
  } catch (err) {
    console.warn('[Firestore] savePresenceDoc error:', err);
  }
}

export async function deletePresenceDoc(presenceId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    await deleteDoc(doc(db, 'presences', presenceId));
  } catch (err) {
    console.warn('[Firestore] deletePresenceDoc error:', err);
  }
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
          callback(list);
        } else {
          // Inizializza categorie di default
          seedInitialCategories();
        }
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

async function seedInitialCategories() {
  try {
    for (const cat of DEFAULT_BASE_CATEGORIES) {
      await setDoc(doc(db, 'stat_categories', cat.id), cat, { merge: true });
    }
  } catch (e) {
    console.warn('[Firestore] Error seeding categories:', e);
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
