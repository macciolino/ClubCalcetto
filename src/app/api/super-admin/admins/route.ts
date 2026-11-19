import { NextResponse } from 'next/server';
import { isAdminConfigured } from '@/lib/firebase/admin';
import { listPlatformStaff, platformCaller, setPlatformRole } from '@/lib/server/platformAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Platform admins, super admin only:
 * GET  → who has a platform role;
 * POST { email, role: 'GLOBAL_ADMIN' } appoints a platform admin; { email | profileId, role: 'USER' } revokes (never the super admin).
 */
export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    if (!(await platformCaller(request))) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ ok: true, staff: await listPlatformStaff() });
  } catch (err) {
    console.error('[super-admin/admins] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    if (!(await platformCaller(request))) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { email?: string; profileId?: string; role?: string };
    const res = await setPlatformRole({ email: body.email, profileId: body.profileId }, body.role);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === 'not_found' ? 404 : 400 });
    return NextResponse.json({ ok: true, name: res.name });
  } catch (err) {
    console.error('[super-admin/admins] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
