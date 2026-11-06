import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { Message, deliver, italianDate, registeredProfileIds, sendToTokens } from '@/lib/server/push';
import { rankDayPresences } from '@/lib/utils/presenceRanking';
import { reconcileTeams } from '@/lib/utils/teamUtils';
import { GeneratedTeamRecord, Presence } from '@/types/database';

export const runtime = 'nodejs';

const SUPER_ADMIN_EMAIL = 'macciolino84@gmail.com';


type NotifyRequest =
  | { type: 'test' }
  | { type: 'match_confirmed' | 'teams_changed'; date: string; playerIds: string[] }
  | { type: 'substitution'; date: string; playerIds: string[]; outName: string; inName: string }
  /** Anyone signed in: after a sign-up / withdrawal the server checks if someone takes a place in the teams */
  | { type: 'reconcile'; date: string }
  /** Admin opened next week's sign-ups (Presenze): everyone registered is told, once per opening */
  | { type: 'voting_open'; until: string };


const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

function buildMessage(req: Exclude<NotifyRequest, { type: 'test' } | { type: 'reconcile' } | { type: 'voting_open' }>): Message {
  const when = italianDate(req.date);
  const url = `/squadre?date=${req.date}`;
  if (req.type === 'match_confirmed') {
    return { title: '⚽ Partita confermata', body: `La partita di ${when} è confermata: guarda le squadre!`, url };
  }
  if (req.type === 'teams_changed') {
    return { title: '🔁 Squadre aggiornate', body: `Le squadre di ${when} sono cambiate: controlla in quale giochi.`, url };
  }
  if (req.type !== 'substitution') return { title: 'ClubCalcetto', body: when, url };
  return {
    title: '🔄 Cambio in squadra',
    body: `${req.inName} prende il posto di ${req.outName} nella partita di ${when}.`,
    url,
  };
}

/**
 * After a sign-up/withdrawal: if a starter left and someone from the waitlist took the place,
 * the newcomer gets exactly that slot in the saved teams (same logic as the app) and players are notified.
 */
async function reconcile(date: string) {
  const db = adminDb();
  const teamsRef = db.doc(`generated_teams/${date}`);
  const presSnap = await db.collection('presences').where('date', '==', date).get();
  const presences: Presence[] = presSnap.docs.map((d) => {
    const data = d.data() as Presence & { joined_at?: { toMillis?: () => number } };
    const { joined_at, ...rest } = data;
    const joined_ms = joined_at && typeof joined_at.toMillis === 'function' ? joined_at.toMillis() : undefined;
    return { ...rest, id: rest.id || d.id, joined_ms };
  });
  const starterIds = rankDayPresences(presences)
    .filter((p) => p.status === 'confirmed')
    .map((p) => p.player_id);
  const profileSnaps = starterIds.length ? await db.getAll(...starterIds.map((id) => db.doc(`profiles/${id}`))) : [];
  // Come nell'app: solo presenze con un profilo esistente, massimo 10
  const starters = starterIds
    .map((id, i) => (profileSnaps[i]?.exists ? { id, name: (profileSnaps[i].data()?.full_name as string) || 'Giocatore' } : null))
    .filter((p): p is { id: string; name: string } => p !== null)
    .slice(0, 10);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(teamsRef);
    if (!snap.exists) return null;
    const matchSnap = await tx.get(db.doc(`matches/${date}`));
    if (matchSnap.exists && matchSnap.data()?.status === 'completed') return null;
    const record = snap.data() as GeneratedTeamRecord;
    const r = reconcileTeams(record, starters);
    if (r.substitutions.length === 0) return null;
    const now = new Date().toISOString();
    tx.update(teamsRef, {
      team_white: r.white,
      team_black: r.black,
      substitutions: FieldValue.arrayUnion(...r.substitutions.map((s) => ({ ...s, at: now }))),
      updated_at: now,
    });
    return r;
  });
  if (!result) return { substitutions: 0 };
  const playerIds = [...result.white, ...result.black].map((p) => p.id);
  for (const s of result.substitutions) {
    await deliver(playerIds, buildMessage({ type: 'substitution', date, playerIds, outName: s.out_name, inName: s.in_name }));
  }
  return { substitutions: result.substitutions.length };
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }
  try {
    const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!idToken) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    const caller = await adminAuth().verifyIdToken(idToken);
    const body = (await request.json()) as NotifyRequest;

    // Chiunque abbia fatto l'accesso può chiedere il controllo sostituzioni (il server decide da solo)
    if (body.type === 'reconcile') {
      if (!isDate(body.date)) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
      return NextResponse.json({ ok: true, ...(await reconcile(body.date)) });
    }

    // Tutto il resto solo per gli admin
    const isSuper = caller.email === SUPER_ADMIN_EMAIL && caller.email_verified === true;
    const profile = await adminDb().doc(`profiles/${caller.uid}`).get();
    if (!isSuper && profile.data()?.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    if (body.type === 'test') {
      const tokens = await adminDb().collection('push_tokens').where('uid', '==', caller.uid).get();
      const sent = await sendToTokens(
        tokens.docs.map((d) => d.id),
        { title: '🔔 Notifica di prova', body: 'Se leggi questo messaggio le notifiche di ClubCalcetto funzionano!', url: '/profilo' }
      );
      return NextResponse.json({ ok: true, sent, devices: tokens.size });
    }

    if (body.type === 'voting_open') {
      if (!isDate(body.until)) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
      const calRef = adminDb().doc('settings/calendar');
      const cal = await calRef.get();
      // Solo se le iscrizioni sono davvero aperte fino a quella data, e una volta sola per apertura
      if (cal.data()?.open_until !== body.until) return NextResponse.json({ ok: true, skipped: 'not_open' });
      if (cal.data()?.voting_notified_for === body.until) return NextResponse.json({ ok: true, skipped: 'already_sent' });
      await calRef.set({ voting_notified_for: body.until }, { merge: true });
      const result = await deliver(await registeredProfileIds(), {
        title: '📅 Iscrizioni aperte',
        body: `Sono aperte le iscrizioni della settimana prossima (fino a ${italianDate(body.until)}): segna le tue presenze!`,
        url: '/presenze',
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (!isDate(body.date) || !Array.isArray(body.playerIds)) {
      return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
    }
    const result = await deliver(body.playerIds.slice(0, 30), buildMessage(body));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[notify] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
