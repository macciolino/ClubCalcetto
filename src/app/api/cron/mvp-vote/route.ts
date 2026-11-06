import { NextResponse } from 'next/server';
import { adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { deliver, italianDate, registeredProfileIds, romeDateTime, romeTimeLabel } from '@/lib/server/push';
import { MATCH_DURATION_MIN, MVP_VOTE_DELAY_MIN, MVP_VOTE_OPEN_HOURS } from '@/lib/utils/matchUtils';
import { GeneratedTeamRecord, Match } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Called every few minutes by a scheduler (GitHub Actions, see .github/workflows/mvp-vote-notify.yml).
 * When the MVP vote of a match opens (start time + 1h match + 45 min) everyone registered gets ONE
 * notification. Only confirmed or archived matches count. Protected by CRON_SECRET.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });

  const db = adminDb();
  const now = new Date();
  // Oggi e ieri (ora italiana): una partita alle 23 apre il voto dopo mezzanotte
  const romeDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const dates = Array.from(new Set([romeDay(now), romeDay(new Date(now.getTime() - 24 * 3600 * 1000))]));

  const settings = (await db.doc('settings/app_config').get()).data() || {};
  const standardTime: string = settings.standard_match_time || '20:30';
  const report: Record<string, string> = {};

  for (const date of dates) {
    const teamsRef = db.doc(`generated_teams/${date}`);
    const teamsSnap = await teamsRef.get();
    const match = (await db.doc(`matches/${date}`).get()).data() as Match | undefined;
    const record = teamsSnap.data() as GeneratedTeamRecord | undefined;
    if (!record && match?.status !== 'completed') {
      report[date] = 'nessuna partita';
      continue;
    }
    if (!record?.confirmed && match?.status !== 'completed') {
      report[date] = 'partita non confermata';
      continue;
    }
    if (record?.mvp_vote_notified_at) {
      report[date] = 'già avvisati';
      continue;
    }
    const time = match?.time_override && match.match_time ? match.match_time.slice(0, 5) : standardTime;
    const opensAt = new Date(romeDateTime(date, time).getTime() + (MATCH_DURATION_MIN + MVP_VOTE_DELAY_MIN) * 60000);
    const closesAt = new Date(opensAt.getTime() + MVP_VOTE_OPEN_HOURS * 3600000);
    if (now < opensAt) {
      report[date] = `voto alle ${romeTimeLabel(opensAt)}`;
      continue;
    }
    if (now >= closesAt) {
      report[date] = 'voto già chiuso';
      continue;
    }

    // Segna "avvisati" PRIMA di inviare: se lo scheduler parte due volte, la notifica parte una volta sola
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(teamsRef);
      if (fresh.exists && fresh.data()?.mvp_vote_notified_at) return false;
      tx.set(teamsRef, { mvp_vote_notified_at: now.toISOString() }, { merge: true });
      return true;
    });
    if (!claimed) {
      report[date] = 'già avvisati';
      continue;
    }
    const result = await deliver(await registeredProfileIds(), {
      title: '⭐ Vota l’MVP',
      body: `La partita di ${italianDate(date)} è finita: vota il migliore in campo entro le ${romeTimeLabel(closesAt)} di domani.`,
      url: `/squadre?date=${date}`,
    });
    report[date] = `inviata (${result.mode}, ${result.sent} dispositivi)`;
  }
  return NextResponse.json({ ok: true, report });
}

export const GET = run;
export const POST = run;
