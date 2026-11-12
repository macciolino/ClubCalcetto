import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { adminCaller, closeRequest } from '@/lib/server/adminRequests';
import { reactivateAccount } from '@/lib/server/accountDeletion';
import { archiveAndReset, claimGuest } from '@/lib/server/profileMerge';

export const runtime = 'nodejs';

/**
 * POST { id, action, guestId? } (admins): resolves a request of the admins' notification centre.
 *  new_signup:     'link' (with guestId: the guest's history goes to the new account) | 'new' (new player, nothing to link)
 *  restore:        'restore' (profile and history back) | 'reset' (old record archived, account starts from zero)
 *  account_closed: 'dismiss' (read)
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await adminCaller(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    const { id, action, guestId } = (await request.json()) as { id?: string; action?: string; guestId?: string };
    if (!id) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
    const db = adminDb();
    const req = (await db.doc(`admin_requests/${id}`).get()).data();
    if (!req || req.status !== 'open') return NextResponse.json({ ok: false, error: 'already_done' }, { status: 409 });
    const by = caller.profileId;
    const profileId = String(req.profile_id);

    if (req.type === 'new_signup' && action === 'link' && guestId) {
      const { guestName } = await claimGuest(guestId, profileId);
      await closeRequest(id, by, `linked:${guestId}`);
      return NextResponse.json({ ok: true, guestName });
    }
    if (req.type === 'new_signup' && action === 'new') {
      await closeRequest(id, by, 'new_player');
      return NextResponse.json({ ok: true });
    }
    if (req.type === 'restore' && action === 'restore') {
      await reactivateAccount(profileId);
      await db.doc(`profiles/${profileId}`).update({ restore_requested_at: FieldValue.delete() });
      await closeRequest(id, by, 'restored');
      return NextResponse.json({ ok: true });
    }
    if (req.type === 'restore' && action === 'reset') {
      await archiveAndReset(profileId);
      await closeRequest(id, by, 'reset');
      return NextResponse.json({ ok: true });
    }
    if (req.type === 'account_closed' && action === 'dismiss') {
      await closeRequest(id, by, 'read');
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: 'bad_action' }, { status: 400 });
  } catch (err) {
    console.error('[admin/requests] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
