import { adminDb } from '@/lib/firebase/admin';
import { deliver, italianDate } from '@/lib/server/push';
import { rankDayPresences } from '@/lib/utils/presenceRanking';
import { Presence } from '@/types/database';

/** Presences of a day ranked exactly like the app (starters 1..10, then waitlist). */
export async function loadRankedPresences(date: string): Promise<{ starterIds: string[]; waitlistIds: string[] }> {
  const snap = await adminDb().collection('presences').where('date', '==', date).get();
  const presences: Presence[] = snap.docs.map((d) => {
    const data = d.data() as Presence & { joined_at?: { toMillis?: () => number } };
    const { joined_at, ...rest } = data;
    const joined_ms = joined_at && typeof joined_at.toMillis === 'function' ? joined_at.toMillis() : undefined;
    return { ...rest, id: rest.id || d.id, joined_ms };
  });
  const ranked = rankDayPresences(presences);
  return {
    starterIds: ranked.filter((p) => p.status === 'confirmed').map((p) => p.player_id),
    waitlistIds: ranked.filter((p) => p.status === 'waitlist').map((p) => p.player_id),
  };
}

/**
 * Compares starters / waitlist with the last saved state of that day (collection notify_state, server only:
 * the Firestore rules deny it to every app user). Who moved from the waitlist to the starters is notified once.
 * The first time a day is seen only the state is saved (no notification).
 */
async function notifyPromoted(date: string, starterIds: string[], waitlistIds: string[]) {
  const db = adminDb();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const stateRef = db.doc(`notify_state/${date}`);
  const promoted = await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const prevWaitlist = new Set<string>(snap.exists ? (snap.data()?.waitlist as string[]) || [] : []);
    tx.set(stateRef, { starters: starterIds, waitlist: waitlistIds, updated_at: new Date().toISOString() });
    if (!snap.exists || date < today) return [];
    return starterIds.filter((id) => prevWaitlist.has(id));
  });
  if (promoted.length === 0) return;
  await deliver(promoted, {
    title: '✅ Sei titolare!',
    body: `Si è liberato un posto: sei tra i 10 titolari della partita di ${italianDate(date)}.`,
    url: '/presenze',
  });
}


/**
 * "Sei entrato tra i titolari": called after every sign-up / withdrawal and by the 10-minute scheduler,
 * so a promotion is never missed (and never notified twice).
 */
export async function checkPromotions(date: string) {
  const state = await loadRankedPresences(date);
  await notifyPromoted(date, state.starterIds, state.waitlistIds);
  return state;
}
