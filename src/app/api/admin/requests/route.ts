import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { adminCaller, closeRequest } from '@/lib/server/adminRequests';
import { reactivateAccount } from '@/lib/server/accountDeletion';
import { archiveAndReset, claimGuest } from '@/lib/server/profileMerge';
import { checkPromotions } from '@/lib/server/presenceWatch';
import { FORMAT_INFO, isMatchFormat } from '@/lib/utils/matchFormat';

export const runtime = 'nodejs';

/**
 * POST { id, action, guestId? } (admins): resolves a request of the admins' notification centre.
 *  new_signup:     'link' (with guestId: the guest's history goes to the new account) | 'new' (new player, nothing to link)
 *  restore:        'restore' (profile and history back) | 'reset' (old record archived, account starts from zero)
 *  account_closed: 'dismiss' (read)
 *  format_proposal: 'apply_format' (the day switches to the proposed format) | 'dismiss' (keep the current one)
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
    if (req.type === 'format_proposal' && action === 'apply_format' && isMatchFormat(req.format) && req.date) {
      const date = String(req.date);
      await db.doc('settings/match_formats').set(
        {
          days: {
            [date]: { format: req.format, formation: FORMAT_INFO[req.format].formations[0], updated_at: new Date().toISOString(), updated_by: by },
          },
        },
        { merge: true }
      );
      await closeRequest(id, by, `format:${req.format}`);
      // Titolari ricalcolati: chi entra dalla lista d'attesa riceve la notifica
      await checkPromotions(date).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }
    if ((req.type === 'account_closed' || req.type === 'format_proposal') && action === 'dismiss') {
      await closeRequest(id, by, 'read');
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: 'bad_action' }, { status: 400 });
  } catch (err) {
    console.error('[admin/requests] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
