'use client';

import { leagueFetch } from '@/lib/services/leagueService';
import type { CatalogField, SportField } from '@/types/database';

/** A catalog entry as the server shows it (no list of linked leagues, only how many use it). */
export type CatalogEntry = Omit<CatalogField, 'linked'> & { leagues: number };

export type FieldDraft = Pick<SportField, 'name' | 'address' | 'maps_url' | 'phone' | 'court_type' | 'notes' | 'cost' | 'costs'>;

type Result = 'ok' | 'forbidden' | 'not_found' | 'bad_request' | 'not_approved' | 'already_linked' | 'not_pending' | 'failed';
const result = (status: number, data: Record<string, unknown>): Result =>
  data.ok ? 'ok' : status === 403 ? 'forbidden' : typeof data.error === 'string' && data.error !== 'server_error' ? (data.error as Result) : 'failed';

/** Approved pitches of the platform + the ones this league proposed (pending / rejected). */
export async function fetchCatalog(): Promise<{ approved: CatalogEntry[]; mine: CatalogEntry[] } | null> {
  const { data } = await leagueFetch('/api/field-catalog');
  return data.ok ? { approved: (data.approved as CatalogEntry[]) || [], mine: (data.mine as CatalogEntry[]) || [] } : null;
}

const post = (body: Record<string, unknown>) => leagueFetch('/api/field-catalog', { method: 'POST', body: JSON.stringify(body) });

/** Pitches that look like this one (asked before proposing a new one). */
export async function findSimilarFields(field: FieldDraft): Promise<CatalogEntry[]> {
  const { data } = await post({ action: 'similar', field });
  return data.ok ? (data.similar as CatalogEntry[]) || [] : [];
}

export async function proposeCatalogField(field: FieldDraft): Promise<Result> {
  const { status, data } = await post({ action: 'propose', field });
  return result(status, data);
}

export async function proposeExistingField(fieldId: string): Promise<Result> {
  const { status, data } = await post({ action: 'propose_existing', fieldId });
  return result(status, data);
}

export async function addCatalogField(catalogId: string): Promise<Result> {
  const { status, data } = await post({ action: 'add', catalogId });
  return result(status, data);
}

export async function unlinkCatalogField(fieldId: string): Promise<Result> {
  const { status, data } = await post({ action: 'unlink', fieldId });
  return result(status, data);
}

export async function resetFieldPrice(fieldId: string): Promise<Result> {
  const { status, data } = await post({ action: 'reset_price', fieldId });
  return result(status, data);
}

// ---------- platform staff (Console piattaforma) ----------

export async function fetchStaffCatalog(): Promise<CatalogEntry[] | null> {
  const { data } = await leagueFetch('/api/super-admin/fields');
  return data.ok ? (data.fields as CatalogEntry[]) || [] : null;
}

export async function reviewCatalogField(
  id: string,
  action: 'approve' | 'edit' | 'reject' | 'merge' | 'delete',
  extra: { field?: FieldDraft; intoId?: string } = {}
): Promise<Result> {
  const { status, data } = await leagueFetch('/api/super-admin/fields', { method: 'POST', body: JSON.stringify({ id, action, ...extra }) });
  return result(status, data);
}
