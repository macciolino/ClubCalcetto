import { NextResponse } from 'next/server';
import { isAdminConfigured } from '@/lib/firebase/admin';
import { listPlatformLeagues, platformCaller, platformStaffCaller, setLeagueStatus } from '@/lib/server/platformAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Platform governance:
 * GET  → every league with members, status and creation date (super admin and platform admins);
 * POST { leagueId, status: 'active' | 'suspended' } → super admin only.
 */
export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    if (!(await platformStaffCaller(request))) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ ok: true, leagues: await listPlatformLeagues() });
  } catch (err) {
    console.error('[super-admin/leagues] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await platformCaller(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { leagueId?: string; status?: string };
    const res = await setLeagueStatus(String(body.leagueId || ''), body.status, caller.profileId);
    if (res !== 'ok') return NextResponse.json({ ok: false, error: res }, { status: res === 'not_found' ? 404 : 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[super-admin/leagues] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
