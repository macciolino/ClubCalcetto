import { NextResponse } from 'next/server';
import { adminAuth, adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { SUPER_ADMIN_EMAIL, SUPER_ADMIN_PROFILE_ID } from '@/lib/server/accountDeletion';

export const runtime = 'nodejs';

/**
 * Logout from every device.
 * POST (Authorization: Bearer <idToken>):
 *  1. revokes the user's refresh tokens → no device can renew its session any more;
 *  2. writes `sessions_revoked_at` (ms) on the user's profile → every open device sees it in real time
 *     (AuthContext) and goes back to /login at once.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!idToken) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    // Token scaduto o falso: non autorizzato (non "errore del server")
    const caller = await adminAuth()
      .verifyIdToken(idToken)
      .catch(() => null);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    const isSuper = caller.email === SUPER_ADMIN_EMAIL && caller.email_verified === true;
    const profileId = isSuper ? SUPER_ADMIN_PROFILE_ID : caller.uid;

    await adminAuth().revokeRefreshTokens(caller.uid);
    const ref = adminDb().doc(`profiles/${profileId}`);
    if ((await ref.get()).exists) await ref.set({ sessions_revoked_at: Date.now() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn('[signout-all] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'failed' }, { status: 500 });
  }
}
