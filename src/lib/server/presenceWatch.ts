import { adminDb } from '@/lib/firebase/admin';
import { deliver, deliverToAdmins, italianDate } from '@/lib/server/push';
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
  const { promoted, tenReached } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const prevWaitlist = new Set<string>(snap.exists ? (snap.data()?.waitlist as string[]) || [] : []);
    const full = starterIds.length >= 10;
    const alreadyAlerted = Boolean(snap.data()?.ten_alert_sent);
    const isFuture = date >= today;
    // Avviso "10 iscritti" una volta; se si scende sotto 10 e si torna a 10, gli admin vengono avvisati di nuovo
    const sendTen = full && !alreadyAlerted && isFuture;
    tx.set(stateRef, {
      starters: starterIds,
      waitlist: waitlistIds,
      ten_alert_sent: full ? alreadyAlerted || sendTen : false,
      updated_at: new Date().toISOString(),
    });
    return {
      promoted: !snap.exists || !isFuture ? [] : starterIds.filter((id) => prevWaitlist.has(id)),
      tenReached: sendTen,
    };
  });
  if (tenReached) {
    await deliverToAdmins({
      title: '🔟 Raggiunti 10 iscritti',
      body: `La partita di ${italianDate(date)} ha 10 titolari: potete generare e confermare le squadre.`,
      url: `/squadre?date=${date}`,
    });
  }
  if (promoted.length === 0) return;
  await deliver(promoted, {
    title: '✅ Sei titolare!',
    body: `Si è liberato un posto: sei tra i 10 titolari della partita di ${italianDate(date)}.`,
    url: '/presenze?da=notifica',
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
