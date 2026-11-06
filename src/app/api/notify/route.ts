import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, adminMessaging, isAdminConfigured } from '@/lib/firebase/admin';
import { rankDayPresences } from '@/lib/utils/presenceRanking';
import { reconcileTeams } from '@/lib/utils/teamUtils';
import { GeneratedTeamRecord, Presence } from '@/types/database';

export const runtime = 'nodejs';

const SUPER_ADMIN_EMAIL = 'macciolino84@gmail.com';
const SUPER_ADMIN_PROFILE_ID = 'p-1';

/** Who receives notifications: 'off' nobody, 'admins' only admins (test), 'all' the players concerned. */
type NotifyMode = 'off' | 'admins' | 'all';

type NotifyRequest =
  | { type: 'test' }
  | { type: 'match_confirmed' | 'teams_changed'; date: string; playerIds: string[] }
  | { type: 'substitution'; date: string; playerIds: string[]; outName: string; inName: string }
  /** Anyone signed in: after a sign-up / withdrawal the server checks if someone takes a place in the teams */
  | { type: 'reconcile'; date: string };

interface Message {
  title: string;
  body: string;
  url: string;
}

const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

function italianDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  });
}

async function getMode(): Promise<NotifyMode> {
  const snap = await adminDb().doc('settings/notifications').get();
  const mode = snap.exists ? (snap.data()?.mode as NotifyMode) : undefined;
  return mode === 'off' || mode === 'all' ? mode : 'admins';
}

async function adminProfileIds(): Promise<string[]> {
  const snap = await adminDb().collection('profiles').where('role', '==', 'admin').get();
  return Array.from(new Set([SUPER_ADMIN_PROFILE_ID, ...snap.docs.map((d) => d.id)]));
}

/** Sends to every device registered by these profiles; removes tokens that no longer work. */
async function sendToProfiles(profileIds: string[], msg: Message): Promise<number> {
  const ids = Array.from(new Set(profileIds.filter(Boolean)));
  const tokens: string[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await adminDb().collection('push_tokens').where('profile_id', 'in', ids.slice(i, i + 30)).get();
    snap.docs.forEach((d) => tokens.push(d.id));
  }
  return sendToTokens(tokens, msg);
}

async function sendToTokens(tokens: string[], msg: Message): Promise<number> {
  if (tokens.length === 0) return 0;
  let sent = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const res = await adminMessaging().sendEachForMulticast({
      tokens: chunk,
      data: { title: msg.title, body: msg.body, url: msg.url },
      webpush: { headers: { Urgency: 'high', TTL: String(24 * 3600) } },
    });
    sent += res.successCount;
    const dead = res.responses
      .map((r, idx) => (!r.success && /registration-token-not-registered|invalid-argument|invalid-registration-token/.test(r.error?.code || '') ? chunk[idx] : null))
      .filter((t): t is string => Boolean(t));
    await Promise.all(dead.map((t) => adminDb().doc(`push_tokens/${t}`).delete().catch(() => undefined)));
  }
  return sent;
}

/** Applies the mode: 'all' → the players concerned; 'admins' → all admins, marked as a test. */
async function deliver(playerIds: string[], msg: Message): Promise<{ sent: number; mode: NotifyMode }> {
  const mode = await getMode();
  if (mode === 'off') return { sent: 0, mode };
  if (mode === 'all') return { sent: await sendToProfiles(playerIds, msg), mode };
  const sent = await sendToProfiles(await adminProfileIds(), {
    ...msg,
    title: `[PROVA] ${msg.title}`,
    body: `${msg.body} (in modalità prova arriva solo agli admin; destinatari reali: ${playerIds.length} giocatori)`,
  });
  return { sent, mode };
}

function buildMessage(req: Exclude<NotifyRequest, { type: 'test' } | { type: 'reconcile' }>): Message {
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
