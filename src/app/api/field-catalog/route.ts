import { NextResponse } from 'next/server';
import { adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { adminCaller, callerFrom } from '@/lib/server/adminRequests';
import { currentLeague, memberCard, scoped } from '@/lib/server/leagueScope';
import {
  addFromCatalog,
  cleanFieldInput,
  listCatalog,
  proposeExistingField,
  proposeField,
  resetPrice,
  similarFields,
  unlinkField,
} from '@/lib/server/fieldCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Global fields catalog, seen from the ACTIVE league (header x-league-id). See docs/ARCHITECTURE.md §3.3.
 * GET  → { approved, mine } for members of the league (and platform staff).
 * POST (presidents, collaborators, platform staff of this league):
 *   { action: 'similar', field }            pitches that look the same (before proposing)
 *   { action: 'propose', field }            new pitch: pending in the catalog, usable at once in the league
 *   { action: 'propose_existing', fieldId } a private field of the league goes to the catalog
 *   { action: 'add', catalogId }            an approved pitch joins the league (linked)
 *   { action: 'unlink', fieldId }           the league field becomes private (a pending proposal is withdrawn)
 *   { action: 'reset_price', fieldId }      prices back to the catalog's starting prices
 */
async function handleGet(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    const leagueId = currentLeague();
    if (!caller.isPlatformStaff && !(caller.emailVerified && (await memberCard(caller.uid, leagueId)))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.json({ ok: true, ...(await listCatalog(leagueId)) });
  } catch (err) {
    console.error('[field-catalog] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

async function handlePost(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await adminCaller(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    const leagueId = currentLeague();
    if (!(await adminDb().doc(`leagues/${leagueId}`).get()).exists) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const by = { profileId: caller.profileId, name: String((await adminDb().doc(`profiles/${caller.profileId}`).get()).data()?.full_name || 'Un gestore') };
    const id = (k: string) => (typeof body[k] === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body[k] as string) ? (body[k] as string) : '');

    let res: { ok: boolean; error?: string; [k: string]: unknown };
    switch (body.action) {
      case 'similar': {
        const input = cleanFieldInput(body.field);
        if (!input) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
        return NextResponse.json({ ok: true, similar: await similarFields(input) });
      }
      case 'propose':
        res = await proposeField(leagueId, by, body.field);
        break;
      case 'propose_existing':
        res = await proposeExistingField(leagueId, id('fieldId'), by);
        break;
      case 'add':
        res = await addFromCatalog(leagueId, id('catalogId'));
        break;
      case 'unlink':
        res = await unlinkField(leagueId, id('fieldId'));
        break;
      case 'reset_price':
        res = await resetPrice(leagueId, id('fieldId'));
        break;
      default:
        return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
    }
    if (res.ok) return NextResponse.json(res);
    return NextResponse.json(res, { status: res.error === 'not_found' ? 404 : 400 });
  } catch (err) {
    console.error('[field-catalog] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

/** Multi-league: runs in the league the app is using (header x-league-id). */
export const GET = scoped(handleGet);
export const POST = scoped(handlePost);
