import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { adminCaller } from '@/lib/server/adminRequests';

export const runtime = 'nodejs';

/** Invite links are valid for 30 days and only once (collection `invites`, server only). */
const DAYS = 30;

/**
 * POST { guestId } (admin) → { token }: invite link for a guest (reuses the guest's still-valid link).
 * GET ?token=… (public)    → { name }: who the link belongs to, for the banner on the sign-up page.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await adminCaller(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    const { guestId } = (await request.json()) as { guestId?: string };
    const db = adminDb();
    const guest = guestId ? await db.doc(`profiles/${guestId}`).get() : null;
    if (!guest?.exists || !guest.data()?.is_guest || guest.data()?.archived_at) {
      return NextResponse.json({ ok: false, error: 'not_a_guest' }, { status: 400 });
    }
    const now = new Date();
    const existing = await db.collection('invites').where('guest_id', '==', guestId).get();
    const valid = existing.docs.find((d) => !d.data().used_at && String(d.data().expires_at) > now.toISOString());
    if (valid) return NextResponse.json({ ok: true, token: valid.id });

    const token = randomBytes(24).toString('base64url');
    await db.doc(`invites/${token}`).set({
      guest_id: guestId,
      guest_name: guest.data()?.full_name || 'Ospite',
      created_by: caller.profileId,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + DAYS * 864e5).toISOString(),
      used_at: null,
    });
    return NextResponse.json({ ok: true, token });
  } catch (err) {
    console.error('[invite] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 404 });
  const snap = await adminDb().doc(`invites/${token}`).get();
  const d = snap.data();
  if (!d || d.used_at || String(d.expires_at) <= new Date().toISOString()) {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, name: d.guest_name });
}
