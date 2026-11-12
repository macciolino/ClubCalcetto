import { NextResponse } from 'next/server';
import { adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { callerFrom, closeRequest, openRequest } from '@/lib/server/adminRequests';
import { claimGuest } from '@/lib/server/profileMerge';

export const runtime = 'nodejs';

/**
 * Called by the app right after a NEW profile is created (first sign-in).
 *  - with { invite }: the account takes over the guest's profile (matches, stats, sign-ups); the link is then used up.
 *  - without: if there are guests without an account, the admins get a "new sign-up" request to link it by hand.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    const db = adminDb();
    const profile = (await db.doc(`profiles/${caller.profileId}`).get()).data();
    if (!profile) return NextResponse.json({ ok: false, error: 'no_profile' }, { status: 404 });
    const { invite } = (await request.json().catch(() => ({}))) as { invite?: string };

    if (invite && /^[A-Za-z0-9_-]{20,64}$/.test(invite)) {
      const ref = db.doc(`invites/${invite}`);
      // Il link si usa una volta sola, anche con due richieste insieme
      const inv = await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(ref)).data();
        if (!fresh || fresh.used_at || String(fresh.expires_at) <= new Date().toISOString()) return null;
        tx.update(ref, { used_at: new Date().toISOString(), used_by: caller.profileId });
        return fresh;
      });
      if (!inv) return NextResponse.json({ ok: false, error: 'invite_invalid' }, { status: 400 });
      try {
        const { guestName } = await claimGuest(String(inv.guest_id), caller.profileId);
        await closeRequest(`signup_${caller.profileId}`, 'invite', `linked:${inv.guest_id}`).catch(() => undefined);
        return NextResponse.json({ ok: true, claimed: true, guestName });
      } catch (err) {
        await ref.update({ used_at: null, used_by: null }); // non riuscito: il link resta valido
        throw err;
      }
    }

    // Solo per profili appena creati (non si riapre la richiesta a ogni accesso)
    const createdMs = Date.parse(String(profile.created_at || ''));
    if (!createdMs || Date.now() - createdMs > 30 * 60 * 1000) return NextResponse.json({ ok: true, claimed: false });

    // Nuovo giocatore: si autovaluta (una volta) e dopo la prima partita un admin rivede i valori
    const played = Number(profile.matches_won || 0) + Number(profile.matches_drawn || 0) + Number(profile.matches_lost || 0);
    if (profile.needs_stat_review === undefined && played === 0 && !profile.is_guest) {
      await db.doc(`profiles/${caller.profileId}`).update({ needs_stat_review: true, self_rating_pending: true });
    }
    if ((await db.doc(`admin_requests/signup_${caller.profileId}`).get()).exists) return NextResponse.json({ ok: true, claimed: false });

    const guests = await db.collection('profiles').where('is_guest', '==', true).get();
    const unlinked = guests.docs.filter((d) => !d.data().deactivated_at && !d.data().archived_at);
    if (unlinked.length > 0) {
      const name = String(profile.full_name || 'Nuovo giocatore');
      await openRequest(
        `signup_${caller.profileId}`,
        { type: 'new_signup', profile_id: caller.profileId, name, email: profile.email || null },
        { title: '🆕 Nuovo iscritto', body: `${name} si è registrato. È uno degli ospiti già in rosa?` }
      );
    }
    return NextResponse.json({ ok: true, claimed: false });
  } catch (err) {
    console.error('[account/registered] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
