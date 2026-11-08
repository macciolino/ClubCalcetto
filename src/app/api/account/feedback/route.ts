import { NextResponse } from 'next/server';
import { adminAuth, adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { SUPER_ADMIN_EMAIL } from '@/lib/server/accountDeletion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Super admin only: reasons given by players who deleted their account (newest first). */
export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const caller = await adminAuth().verifyIdToken(idToken);
    if (!(caller.email === SUPER_ADMIN_EMAIL && caller.email_verified === true)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }
    const snap = await adminDb().collection('account_feedback').orderBy('at', 'desc').limit(100).get();
    return NextResponse.json({ ok: true, items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
