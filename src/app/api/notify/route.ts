import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { Message, adminProfileIds, deliver, italianDate, registeredProfileIds, sendToProfiles, sendToTokens } from '@/lib/server/push';
import { checkPromotions } from '@/lib/server/presenceWatch';
import { reconcileTeams } from '@/lib/utils/teamUtils';
import { GeneratedTeamRecord } from '@/types/database';

export const runtime = 'nodejs';

const SUPER_ADMIN_EMAIL = 'macciolino84@gmail.com';


type NotifyRequest =
  | { type: 'test' }
  | { type: 'match_confirmed' | 'teams_changed'; date: string; playerIds: string[] }
  | { type: 'substitution'; date: string; playerIds: string[]; outName: string; inName: string }
  /** Anyone signed in: after a sign-up / withdrawal the server checks if someone takes a place in the teams */
  | { type: 'reconcile'; date: string }
  /** Admin opened next week's sign-ups (Presenze): everyone registered is told, once per opening */
  | { type: 'voting_open'; until: string }
  /** Admin diagnostics: which admins have a device registered for notifications */
  | { type: 'admin_devices' }
  /** Test notification to every admin's devices */
  | { type: 'test_admins' }
  /** Admin archived a match: new players who just played their FIRST match → the admins review their parameters */
  | { type: 'first_match'; date: string };


const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

function buildMessage(
  req: Exclude<NotifyRequest, { type: 'test' } | { type: 'reconcile' } | { type: 'voting_open' } | { type: 'admin_devices' } | { type: 'test_admins' }>
): Message {
  const when = italianDate(req.date);
  const url = `/squadre?date=${req.date}`;
  if (req.type === 'match_confirmed') {
    return { title: '⚽ Partita confermata', body: `La partita di ${when} è confermata: guarda le squadre!`, url };
  }
  if (req.type === 'teams_changed') {
    return { title: '🔁 Squadre aggiornate', body: `Le squadre di ${when} sono cambiate: controlla in quale giochi.`, url };
  }
  if (req.type !== 'substitution') return { title: 'Club Soccer', body: when, url };
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
  const { starterIds, players } = await checkPromotions(date);

  const profileSnaps = starterIds.length ? await db.getAll(...starterIds.map((id) => db.doc(`profiles/${id}`))) : [];
  // Come nell'app: solo presenze con un profilo esistente, al massimo i giocatori del formato
  const starters = starterIds
    .map((id, i) => (profileSnaps[i]?.exists ? { id, name: (profileSnaps[i].data()?.full_name as string) || 'Giocatore' } : null))
    .filter((p): p is { id: string; name: string } => p !== null)
    .slice(0, players);

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
        { title: '🔔 Notifica di prova', body: 'Se leggi questo messaggio le notifiche di Club Soccer funzionano!', url: '/profilo' }
      );
      return NextResponse.json({ ok: true, sent, devices: tokens.size });
    }

    if (body.type === 'admin_devices' || body.type === 'test_admins') {
      const ids = await adminProfileIds();
      const profiles = await adminDb().getAll(...ids.map((id) => adminDb().doc(`profiles/${id}`)));
      const devices: { name: string; count: number; platforms: string[]; last: string | null }[] = [];
      let sent = 0;
      for (let i = 0; i < ids.length; i++) {
        if (!profiles[i].exists) continue;
        const tokens = await adminDb().collection('push_tokens').where('profile_id', '==', ids[i]).get();
        const list = tokens.docs.map((d) => d.data());
        const last = list
          .map((t) => (t.updated_at?.toDate ? (t.updated_at.toDate() as Date).toISOString() : null))
          .filter((x): x is string => Boolean(x))
          .sort()
          .pop() || null;
        devices.push({
          name: (profiles[i].data()?.full_name as string) || 'Admin',
          count: tokens.size,
          platforms: Array.from(new Set(list.map((t) => String(t.platform || '?')))),
          last,
        });
        if (body.type === 'test_admins' && tokens.size > 0) {
          sent += await sendToTokens(
            tokens.docs.map((d) => d.id),
            { title: '🔔 Prova per gli admin', body: 'Notifica di prova inviata a tutti gli amministratori.', url: '/impostazioni?sezione=notifiche-club' }
          );
        }
      }
      return NextResponse.json({ ok: true, devices, sent });
    }

    if (body.type === 'first_match') {
      if (!isDate(body.date)) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
      const match = (await adminDb().doc(`matches/${body.date}`).get()).data();
      if (!match || match.status !== 'completed') return NextResponse.json({ ok: true, sent: 0 });
      const ids = Array.from(
        new Set([...(match.team_white || []), ...(match.team_black || [])].map((p: { id?: string }) => String(p?.id || '')).filter(Boolean))
      );
      if (ids.length === 0) return NextResponse.json({ ok: true, sent: 0 });
      const snaps = await adminDb().getAll(...ids.map((id) => adminDb().doc(`profiles/${id}`)));
      // Una sola notifica per giocatore (stat_review_notified_at), anche se il risultato viene risalvato
      const fresh = snaps.filter((s) => {
        const d = s.data();
        const played = Number(d?.matches_won || 0) + Number(d?.matches_drawn || 0) + Number(d?.matches_lost || 0);
        return d && d.needs_stat_review === true && !d.is_guest && played >= 1 && !d.stat_review_notified_at;
      });
      if (fresh.length === 0) return NextResponse.json({ ok: true, sent: 0 });
      const now = new Date().toISOString();
      const batch = adminDb().batch();
      fresh.forEach((s) => batch.update(s.ref, { stat_review_notified_at: now }));
      await batch.commit();
      const names = fresh.map((s) => String(s.data()?.full_name || 'Giocatore'));
      const sent = await sendToProfiles(await adminProfileIds(), {
        title: '📋 Valutazione da rivedere',
        body:
          names.length === 1
            ? `${names[0]} ha giocato la sua prima partita: controlla e conferma i suoi parametri.`
            : `${names.join(', ')} hanno giocato la loro prima partita: controlla e conferma i loro parametri.`,
        url: '/?richieste=1',
      }).catch(() => 0);
      return NextResponse.json({ ok: true, sent });
    }

    if (body.type === 'voting_open') {
      if (!isDate(body.until)) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
      const calRef = adminDb().doc('settings/calendar');
      const cal = await calRef.get();
      // Solo se le iscrizioni sono davvero aperte fino a quella data. Ogni (ri)apertura avvisa di nuovo:
      // si salta solo un secondo invio entro 2 minuti (doppio clic).
      if (cal.data()?.open_until !== body.until) return NextResponse.json({ ok: true, skipped: 'not_open' });
      const lastAt = Date.parse(cal.data()?.voting_notified_at || '') || 0;
      if (cal.data()?.voting_notified_for === body.until && Date.now() - lastAt < 2 * 60 * 1000) {
        return NextResponse.json({ ok: true, skipped: 'just_sent' });
      }
      await calRef.set({ voting_notified_for: body.until, voting_notified_at: new Date().toISOString() }, { merge: true });
      const result = await deliver(await registeredProfileIds(), {
        title: '📅 Iscrizioni aperte',
        body: `Sono aperte le iscrizioni della settimana prossima (fino a ${italianDate(body.until)}): segna le tue presenze!`,
        url: '/presenze?da=notifica',
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
