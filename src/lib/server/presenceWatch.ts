import { adminDb } from '@/lib/firebase/admin';
import { leagueDb } from '@/lib/server/leagueScope';
import { deliver, deliverToAdmins, italianDate } from '@/lib/server/push';
import { cardCanPlay, rankDayPresences } from '@/lib/utils/presenceRanking';
import { DayFormats, FORMAT_INFO, MatchFormat, dayFormat, proposedFormat } from '@/lib/utils/matchFormat';
import { openRequest } from '@/lib/server/adminRequests';

/** Format of a day as saved by the admins (5vs5 when nothing was chosen). */
export async function loadDayFormat(date: string): Promise<{ format: MatchFormat; formation: string; players: number }> {
  const snap = await leagueDb().doc('settings/match_formats').get();
  const f = dayFormat((snap.data()?.days as DayFormats) || {}, date);
  return { ...f, players: FORMAT_INFO[f.format].players };
}
import { GeneratedTeamRecord, Presence } from '@/types/database';


/** Presences of a day ranked exactly like the app (starters = players of the day's format, then waitlist). */
export async function loadRankedPresences(
  date: string
): Promise<{ starterIds: string[]; waitlistIds: string[]; players: number; format: MatchFormat }> {
  const fmt = await loadDayFormat(date);
  const snap = await leagueDb().collection('presences').where('date', '==', date).get();
  const all: Presence[] = snap.docs.map((d) => {
    const data = d.data() as Presence & { joined_at?: { toMillis?: () => number } };
    const { joined_at, ...rest } = data;
    const joined_ms = joined_at && typeof joined_at.toMillis === 'function' ? joined_at.toMillis() : undefined;
    return { ...rest, id: rest.id || d.id, joined_ms };
  });
  // Same as the app: sign-ups of cards that no longer play (e.g. a deleted guest) do not take a place
  const playable = new Set<string>();
  if (all.length) {
    (await leagueDb().collection('players').get()).docs
      .filter((d) => cardCanPlay(d.data()))
      // by card id, and by the account id for old sign-ups saved with it
      .forEach((d) => [d.id, d.data().user_id, d.data().userId].forEach((k) => typeof k === 'string' && k && playable.add(k)));
  }
  // External players (board "Spot", written only by the server) take their place without a card
  const presences = all.filter((p) => playable.has(p.player_id) || Boolean(p.external));
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
  const stateRef = leagueDb().doc(`notify_state/${date}`);
  const { promoted, tenReached, left, wasFull } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const prevWaitlist = new Set<string>(snap.exists ? (snap.data()?.waitlist as string[]) || [] : []);
    const prevStarters: string[] = snap.exists ? (snap.data()?.starters as string[]) || [] : [];
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
      // Starters who are no longer starters (withdrew, deleted, taken out): checked below for the managers
      left: !snap.exists || !isFuture ? [] : prevStarters.filter((id) => !starterIds.includes(id) && !waitlistIds.includes(id)),
      wasFull: snap.exists && prevStarters.length >= players,
    };
  });
  if (left.length) await alertMissingPlayers(date, left, starterIds, players, wasFull).catch((err) =>
    console.warn('[avvisi] giocatore mancante non segnalato:', err instanceof Error ? err.message : err)
  );
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
 * Presidents and collaborators (bell + push) are told when a match loses players: it was full and is not any more,
 * or the saved teams have a place nobody can take (no one on the waiting list). Teams saved for another format
 * (the format just changed) are left to the regeneration in Squadre.
 */
async function alertMissingPlayers(date: string, left: string[], starterIds: string[], players: number, wasFull: boolean) {
  const teamsSnap = await leagueDb().doc(`generated_teams/${date}`).get();
  const record = teamsSnap.exists ? (teamsSnap.data() as GeneratedTeamRecord) : null;
  const teamPlayers = record ? [...(record.team_white || []), ...(record.team_black || [])] : [];
  const sameFormat = teamPlayers.length === players;
  const teamIds = new Set(teamPlayers.map((p) => p.id));
  const missing = sameFormat ? teamPlayers.filter((p) => !starterIds.includes(p.id)).length : 0;
  const newcomers = sameFormat ? starterIds.filter((id) => !teamIds.has(id)).length : 0;
  const unfilled = Math.max(0, missing - newcomers);
  const full = starterIds.length >= players;
  if (!(wasFull && !full) && unfilled === 0) return;

  // Names: the card, or the saved teams (a deleted guest has no card any more)
  const cards = await adminDb().getAll(...left.map((id) => leagueDb().doc(`players/${id}`)));
  const names = left.map((id, i) => String(cards[i]?.data()?.full_name || teamPlayers.find((p) => p.id === id)?.name || 'Un giocatore'));
  const short = players - starterIds.length;
  const count = Math.max(short, unfilled, 1);
  await deliverToAdmins({
    title: count === 1 ? '⚠️ Manca un giocatore' : `⚠️ Mancano ${count} giocatori`,
    body: `${names.join(', ')} ${names.length === 1 ? 'non è più' : 'non sono più'} tra i titolari di ${italianDate(date)}: ${starterIds.length}/${players} titolari${
      unfilled > 0 ? `, ${unfilled === 1 ? 'un posto libero' : `${unfilled} posti liberi`} nelle squadre` : ''
    }.`,
    url: `/teams?date=${date}`,
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
  if ((await leagueDb().doc(`admin_requests/${id}`).get()).exists) return;
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
