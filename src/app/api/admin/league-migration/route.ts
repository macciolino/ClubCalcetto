import { NextResponse } from 'next/server';
import { adminAuth, isAdminConfigured } from '@/lib/firebase/admin';
import { isSuperAdminEmail } from '@/lib/superAdmin';
import { migrateToCalcettari } from '@/lib/server/leagueMigration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Super admin only (multi-league step 1A): POST { dryRun?: boolean } copies the single-group data into the
 * league "I Calcettari". dryRun (default true) only counts. Repeatable: never overwrites, never deletes.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const caller = await adminAuth()
      .verifyIdToken(idToken)
      .catch(() => null);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    if (!(isSuperAdminEmail(caller.email) && caller.email_verified === true)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
    const dryRun = body.dryRun !== false;
    const result = await migrateToCalcettari(dryRun);
    return NextResponse.json({ ok: true, dryRun, ...result });
  } catch (err) {
    console.error('[admin/league-migration] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
