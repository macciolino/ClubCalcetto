import { adminDb } from '@/lib/firebase/admin';
import { deliver, deliverToAdmins, italianDate } from '@/lib/server/push';
import { rankDayPresences } from '@/lib/utils/presenceRanking';
import { DayFormats, FORMAT_INFO, MatchFormat, dayFormat, proposedFormat } from '@/lib/utils/matchFormat';
import { openRequest } from '@/lib/server/adminRequests';

/** Format of a day as saved by the admins (5vs5 when nothing was chosen). */
export async function loadDayFormat(date: string): Promise<{ format: MatchFormat; formation: string; players: number }> {
  const snap = await adminDb().doc('settings/match_formats').get();
  const f = dayFormat((snap.data()?.days as DayFormats) || {}, date);
  return { ...f, players: FORMAT_INFO[f.format].players };
}
import { Presence } from '@/types/database';

/** Presences of a day ranked exactly like the app (starters = players of the day's format, then waitlist). */
export async function loadRankedPresences(
  date: string
): Promise<{ starterIds: string[]; waitlistIds: string[]; players: number; format: MatchFormat }> {
  const fmt = await loadDayFormat(date);
  const snap = await adminDb().collection('presences').where('date', '==', date).get();
  const presences: Presence[] = snap.docs.map((d) => {
    const data = d.data() as Presence & { joined_at?: { toMillis?: () => number } };
    const { joined_at, ...rest } = data;
    const joined_ms = joined_at && typeof joined_at.toMillis === 'function' ? joined_at.toMillis() : undefined;
    return { ...rest, id: rest.id || d.id, joined_ms };
  });
  const ranked = rankDayPresences(presences, fmt.players);
  return {
    starterIds: ranked.filter((p) => p.status === 'confirmed').map((p) => p.player_id),
    waitlistIds: ranked.filter((p) => p.status === 'waitlist').map((p) => p.player_id),
    players: fmt.players,
    format: fmt.format,
  };
}

/**
 * Compares starters / waitlist with the last saved state of that day (collection notify_state, server only:
 * the Firestore rules deny it to every app user). Who moved from the waitlist to the starters is notified once.
 * The first time a day is seen only the state is saved (no notification).
 */
async function notifyPromoted(date: string, starterIds: string[], waitlistIds: string[], players: number) {
  const db = adminDb();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const stateRef = db.doc(`notify_state/${date}`);
  const { promoted, tenReached } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const prevWaitlist = new Set<string>(snap.exists ? (snap.data()?.waitlist as string[]) || [] : []);
    const full = starterIds.length >= players;
    const alreadyAlerted = Boolean(snap.data()?.ten_alert_sent);
    const isFuture = date >= today;
    // Avviso "partita al completo" una volta; se si scende sotto e si torna al completo, gli admin vengono avvisati di nuovo
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
      title: `✅ Raggiunti ${players} iscritti`,
      body: `La partita di ${italianDate(date)} ha ${players} titolari: potete generare e confermare le squadre.`,
      url: `/teams?date=${date}`,
    });
  }
  if (promoted.length === 0) return;
  await deliver(promoted, {
    title: '✅ Sei titolare!',
    body: `Si è liberato un posto: sei tra i ${players} titolari della partita di ${italianDate(date)}.`,
    url: '/attendance?da=notifica',
  });
}


/**
 * "Sei entrato tra i titolari": called after every sign-up / withdrawal and by the 10-minute scheduler,
 * so a promotion is never missed (and never notified twice).
 */
export async function checkPromotions(date: string) {
  const state = await loadRankedPresences(date);
  await notifyPromoted(date, state.starterIds, state.waitlistIds, state.players);
  await proposeBiggerFormat(date, state.format, state.starterIds.length + state.waitlistIds.length).catch((err) =>
    console.warn('[formato] proposta non riuscita:', err instanceof Error ? err.message : err)
  );
  return state;
}

/**
 * Many sign-ups (starters + waitlist) for a future day: the admins get a proposal to switch to the biggest format
 * the sign-ups can fill (5vs5 → 7vs7 from 14, → 8vs8 from 16, → 11vs11 from 22). In the bell AND as a push,
 * admins only. Each day + format is proposed ONCE (request id `format_<date>_<format>`, kept even when answered),
 * so more sign-ups do not repeat it.
 */
async function proposeBiggerFormat(date: string, current: MatchFormat, signedUp: number) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  if (date < today) return;
  const next = proposedFormat(current, signedUp);
  if (!next) return;
  const id = `format_${date}_${next}`;
  if ((await adminDb().doc(`admin_requests/${id}`).get()).exists) return;
  const info = FORMAT_INFO[next];
  await openRequest(
    id,
    { type: 'format_proposal', profile_id: '', name: '', date, format: next, from_format: current, count: signedUp },
    {
      title: `💡 ${signedUp} iscritti: passare al ${info.label}?`,
      body: `La partita di ${italianDate(date)} ha ${signedUp} iscritti. Con il ${info.label} giocano in ${info.players}: apri l'app per decidere.`,
    }
  );
}
