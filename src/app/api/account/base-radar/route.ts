import { NextResponse } from 'next/server';
import { adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { callerFrom } from '@/lib/server/adminRequests';
import { cleanBaseRadar } from '@/lib/utils/baseRadar';

export const runtime = 'nodejs';

/**
 * POST { radar } — a NEW account sets its Radar Base (self-assessment) once, right after signing up and before any league:
 * an integer 1–10 for every base parameter (the app starts them all at 6). Saved on the global profile
 * (`baseRadar`); `base_radar_pending` is cleared. It is the starting point of every league card the person joins, where
 * the values stay UNCONFIRMED until a president or collaborator approves them. Only while `base_radar_pending` is true
 * (set by the server at sign-up); clients cannot write these fields themselves (rules).
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    const ref = adminDb().doc(`profiles/${caller.profileId}`);
    const profile = (await ref.get()).data();
    if (!profile) return NextResponse.json({ ok: false, error: 'no_profile' }, { status: 404 });
    if (profile.base_radar_pending !== true) return NextResponse.json({ ok: false, error: 'not_pending' }, { status: 409 });

    const body = (await request.json().catch(() => ({}))) as { radar?: unknown };
    const radar = cleanBaseRadar(body.radar);
    if (!radar) return NextResponse.json({ ok: false, error: 'bad_value' }, { status: 400 });
    const now = new Date().toISOString();
    await ref.update({ baseRadar: radar, baseRadarAt: now, base_radar_pending: false, updated_at: now });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[account/base-radar] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
