import { NextResponse } from 'next/server';
import { adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { callerFrom } from '@/lib/server/adminRequests';
import { STAT_DETAILS } from '@/types/database';

export const runtime = 'nodejs';

/**
 * POST { stats } — a NEW player rates their own parameters once (1–10 each), right after signing up.
 * Saved as the profile's stats (and a copy in `self_stats`, so the admin sees what the player chose).
 * `needs_stat_review` stays true: after the first match an admin checks and corrects the values.
 * Only possible while `self_rating_pending` is true (set by the server at sign-up).
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    const db = adminDb();
    const ref = db.doc(`profiles/${caller.profileId}`);
    const profile = (await ref.get()).data();
    if (!profile?.self_rating_pending) return NextResponse.json({ ok: false, error: 'not_pending' }, { status: 409 });

    const body = (await request.json()) as { stats?: Record<string, unknown> };
    const cats = await db.collection('stat_categories').get();
    // Parametri del club (se non ancora salvati su Firestore, quelli di base dell'app)
    const names = cats.empty ? Object.keys(STAT_DETAILS) : cats.docs.map((c) => String(c.data().name));
    const stats: Record<string, number> = {};
    for (const name of names) {
      const v = Number(body.stats?.[name]);
      if (!Number.isInteger(v) || v < 1 || v > 10) return NextResponse.json({ ok: false, error: 'bad_value', name }, { status: 400 });
      stats[name] = v;
    }
    const values = Object.values(stats);
    const ovr = values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : 6;
    const now = new Date().toISOString();
    await ref.update({
      stats,
      self_stats: stats,
      overall_rating: ovr,
      self_rating_pending: false,
      self_rated_at: now,
      updated_at: now,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[account/self-rating] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
