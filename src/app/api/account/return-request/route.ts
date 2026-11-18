import { NextResponse } from 'next/server';
import { adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { openRequest } from '@/lib/server/adminRequests';
import { profileIdsByEmail } from '@/lib/server/emailPrivacy';

export const runtime = 'nodejs';

/**
 * POST { email } (public): someone whose account was closed (deactivated, data kept) tries to sign in or sign up again.
 * The account goes "waiting for restore" and the admins get a request: restore profile and history, or start from zero.
 * The player does not choose. Answers { pending: true } only for a closed account with that email.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const { email } = (await request.json()) as { email?: string };
    const clean = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 200) return NextResponse.json({ ok: true, pending: false });

    const db = adminDb();
    // C2: the email is in private_profiles (or still in the profile, before the move)
    const ids = await profileIdsByEmail(clean);
    const docs = (await Promise.all(ids.map((id) => db.doc(`profiles/${id}`).get()))).filter((d) => d.exists);
    const closed = docs.find((d) => d.data()?.deactivated_at && !d.data()?.archived_at);
    if (!closed) return NextResponse.json({ ok: true, pending: false });

    const data = closed.data() || {};
    const name = String(data.full_name || 'Giocatore');
    if (!data.restore_requested_at) await closed.ref.update({ restore_requested_at: new Date().toISOString() });
    await openRequest(
      `restore_${closed.id}`,
      { type: 'restore', profile_id: closed.id, name, email: clean },
      { title: '↩️ Richiesta di rientro', body: `${name} vuole tornare nel club: scegli se ripristinare il profilo o ripartire da zero.` }
    );
    return NextResponse.json({ ok: true, pending: true, name: name.split(' ')[0] });
  } catch (err) {
    console.error('[account/return-request] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
