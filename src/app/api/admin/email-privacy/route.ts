import { NextResponse } from 'next/server';
import { adminAuth, isAdminConfigured } from '@/lib/firebase/admin';
import { SUPER_ADMIN_EMAIL } from '@/lib/server/accountDeletion';
import { migrateProfileEmails } from '@/lib/server/emailPrivacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Super admin only (C2): POST { dryRun?: boolean } moves the players' emails from `profiles` to `private_profiles`.
 * dryRun (default true) only counts. Repeatable: profiles already moved are skipped.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const caller = await adminAuth()
      .verifyIdToken(idToken)
      .catch(() => null);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    if (!(caller.email === SUPER_ADMIN_EMAIL && caller.email_verified === true)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
    const result = await migrateProfileEmails(body.dryRun !== false);
    return NextResponse.json({ ok: true, dryRun: body.dryRun !== false, ...result });
  } catch (err) {
    console.error('[admin/email-privacy] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
