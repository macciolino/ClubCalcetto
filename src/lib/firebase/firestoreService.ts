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
import { Profile, Presence, StatCategory, Match, GeneratedTeamRecord, AppSettings } from '@/types/database';

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

/**
 * Esegue in modo atomico (Firestore Batch Write) la rimozione di un titolare
 * e il subentro automatico della prima riserva in Wishlist a titolare confermato.
 */
export async function executeAtomicPresenceSubstitution(
  deletedPresenceId: string,
  promotedPresences: Presence[] = []
): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const batch = writeBatch(db);

    // 1. Eliminazione atomica della presenza rimossa
    if (deletedPresenceId) {
      const delRef = doc(db, 'presences', deletedPresenceId);
      batch.delete(delRef);
    }

    // 2. Aggiornamento atomico delle riserve promosse a confermati
    for (const p of promotedPresences) {
      const pRef = doc(db, 'presences', p.id);
      batch.set(
        pRef,
        {
          id: p.id,
          date: p.date,
          player_id: p.player_id,
          status: p.status,
          order_index: p.order_index,
          created_at: p.created_at,
        },
        { merge: true }
      );
    }

    await batch.commit();
  } catch (err) {
    console.warn('[Firestore] executeAtomicPresenceSubstitution error:', err);
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

