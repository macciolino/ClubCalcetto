import { NextResponse } from 'next/server';
import { isAdminConfigured } from '@/lib/firebase/admin';
import { platformStaffCaller } from '@/lib/server/platformAdmin';
import { approveField, deleteCatalogField, editField, listForStaff, mergeField, rejectField } from '@/lib/server/fieldCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Global fields catalog, platform staff (SUPER_ADMIN, GLOBAL_ADMIN). See docs/ARCHITECTURE.md §3.3.
 * GET  → { fields }: pending first, then approved.
 * POST { id, action: 'approve', field? } | { id, action: 'edit', field } | { id, action: 'reject' }
 *      | { id, action: 'merge', intoId } | { id, action: 'delete' }
 */
export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    if (!(await platformStaffCaller(request))) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ ok: true, fields: await listForStaff() });
  } catch (err) {
    console.error('[super-admin/fields] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await platformStaffCaller(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { id?: string; action?: string; field?: unknown; intoId?: string };
    const id = String(body.id || '');
    let res: { ok: boolean; error?: string };
    switch (body.action) {
      case 'approve':
        res = await approveField(id, caller.profileId, body.field);
        break;
      case 'edit':
        res = await editField(id, body.field);
        break;
      case 'reject':
        res = await rejectField(id, caller.profileId);
        break;
      case 'merge':
        res = await mergeField(id, String(body.intoId || ''));
        break;
      case 'delete':
        res = await deleteCatalogField(id);
        break;
      default:
        return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
    }
    if (res.ok) return NextResponse.json(res);
    return NextResponse.json(res, { status: res.error === 'not_found' ? 404 : 400 });
  } catch (err) {
    console.error('[super-admin/fields] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
