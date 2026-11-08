import { NextResponse } from 'next/server';
import { adminAuth, adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import {
  DELETE_REASONS,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PROFILE_ID,
  deleteAccount,
  saveDeletionFeedback,
} from '@/lib/server/accountDeletion';
import { checkPromotions } from '@/lib/server/presenceWatch';

/** After removing sign-ups: who moves up from the waitlist is notified (teams are updated when an admin opens Squadre). */
async function recheck(dates: string[]) {
  for (const d of dates) await checkPromotions(d).catch(() => undefined);
}

export const runtime = 'nodejs';

/**
 * POST { reason, details? }            → the signed-in player deletes their OWN account (reason required)
 * POST { targetProfileId, reason? }    → the super admin deletes someone else's account
 * The super admin account (p-1) can never be deleted.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!idToken) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    const caller = await adminAuth().verifyIdToken(idToken);
    const isSuper = caller.email === SUPER_ADMIN_EMAIL && caller.email_verified === true;
    const body = (await request.json()) as { reason?: string; details?: string; targetProfileId?: string };
    const details = String(body.details || '').trim().slice(0, 500);

    // Eliminazione di un altro account: solo il super admin
    if (body.targetProfileId && body.targetProfileId !== caller.uid) {
      if (!isSuper) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
      if (body.targetProfileId === SUPER_ADMIN_PROFILE_ID) {
        return NextResponse.json({ ok: false, error: 'super_admin' }, { status: 400 });
      }
      const exists = await adminDb().doc(`profiles/${body.targetProfileId}`).get();
      if (!exists.exists) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
      const res = await deleteAccount(body.targetProfileId);
      await recheck(res.dates);
      if (!exists.data()?.is_guest) {
        await saveDeletionFeedback({ name: res.name, reason: body.reason || 'Eliminato dal super admin', details, deletedBy: 'super_admin' });
      }
      return NextResponse.json({ ok: true, dates: res.dates });
    }

    // Il proprio account
    if (isSuper) return NextResponse.json({ ok: false, error: 'super_admin' }, { status: 400 });
    const reason = DELETE_REASONS.find((r) => r === body.reason);
    if (!reason) return NextResponse.json({ ok: false, error: 'reason_required' }, { status: 400 });
    const res = await deleteAccount(caller.uid);
    await recheck(res.dates);
    await saveDeletionFeedback({ name: res.name, reason, details, deletedBy: 'self' });
    return NextResponse.json({ ok: true, dates: res.dates });
  } catch (err) {
    console.error('[account/delete] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
