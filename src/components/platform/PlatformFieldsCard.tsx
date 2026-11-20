'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Edit3, GitMerge, Loader2, MapPin, Trash2, X } from 'lucide-react';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { btnInline } from '@/components/ui/buttons';
import { FieldModal } from '@/components/admin/FieldModal';
import { fetchStaffCatalog, reviewCatalogField, type CatalogEntry, type FieldDraft } from '@/lib/services/fieldCatalogService';
import { looksLikeSameField } from '@/lib/utils/fieldCatalog';
import type { SportField } from '@/types/database';

const euro = (n: number) => `€${Number(n).toFixed(Number(n) % 1 ? 2 : 0).replace('.', ',')}`;

/** Catalog entry → the field form (same form the leagues use) and back. */
const asField = (c: CatalogEntry): SportField => ({
  id: c.id,
  name: c.name,
  address: c.address,
  maps_url: c.maps_url,
  phone: c.phone,
  court_type: c.court_type,
  notes: c.notes,
  cost: c.default_cost,
  costs: c.default_costs,
});
const asDraft = (f: Omit<SportField, 'id'> | SportField): FieldDraft => ({
  name: f.name,
  address: f.address,
  maps_url: f.maps_url,
  phone: f.phone,
  court_type: f.court_type,
  notes: f.notes,
  cost: f.cost,
  costs: f.costs,
});

/**
 * Console piattaforma → "Campi del catalogo" (SUPER_ADMIN, GLOBAL_ADMIN): pitches proposed by the leagues
 * (approve, correct and approve, reject, merge into an existing one) and the approved catalog (correct, delete).
 */
export function PlatformFieldsCard() {
  const t = useTranslations('fieldCatalog.staff');
  const [list, setList] = useState<CatalogEntry[] | null | 'loading'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ entry: CatalogEntry; approve: boolean } | null>(null);
  const [mergeInto, setMergeInto] = useState<Record<string, string>>({});
  const [showApproved, setShowApproved] = useState(false);

  const load = useCallback(async () => setList(await fetchStaffCatalog()), []);
  useEffect(() => {
    let alive = true;
    fetchStaffCatalog().then((res) => alive && setList(res));
    return () => {
      alive = false;
    };
  }, []);

  if (list === 'loading')
    return (
      <p className="text-sm text-secondary flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t('loading')}
      </p>
    );
  if (list === null) return <p className="text-sm text-danger">{t('failed')}</p>;

  const pending = list.filter((c) => c.status === 'pending');
  const approved = list.filter((c) => c.status === 'approved');

  const run = async (key: string, fn: () => Promise<string>, done: string) => {
    if (busy) return;
    setBusy(key);
    const res = await fn();
    setBusy(null);
    notify(res === 'ok' ? done : t(`errors.${res}`));
    if (res === 'ok') await load();
  };

  const approve = (c: CatalogEntry) => run(`${c.id}:approve`, () => reviewCatalogField(c.id, 'approve'), t('approved', { name: c.name }));
  const reject = async (c: CatalogEntry) => {
    if (!(await askConfirm(t('confirmReject', { name: c.name, league: c.proposed_by.leagueName || '' })))) return;
    await run(`${c.id}:reject`, () => reviewCatalogField(c.id, 'reject'), t('rejected', { name: c.name }));
  };
  const merge = async (c: CatalogEntry, intoId: string) => {
    const into = approved.find((a) => a.id === intoId);
    if (!into) return notify(t('pickMerge'));
    if (!(await askConfirm(t('confirmMerge', { name: c.name, into: into.name })))) return;
    await run(`${c.id}:merge`, () => reviewCatalogField(c.id, 'merge', { intoId: into.id }), t('merged', { name: c.name, into: into.name }));
  };
  const remove = async (c: CatalogEntry) => {
    if (!(await askConfirm(t('confirmDelete', { name: c.name, count: c.leagues })))) return;
    await run(`${c.id}:delete`, () => reviewCatalogField(c.id, 'delete'), t('deleted', { name: c.name }));
  };
  const saveEdit = (f: Omit<SportField, 'id'> | SportField) => {
    if (!editing) return;
    const { entry, approve: andApprove } = editing;
    void run(
      `${entry.id}:edit`,
      () => reviewCatalogField(entry.id, andApprove ? 'approve' : 'edit', { field: asDraft(f) }),
      andApprove ? t('approved', { name: f.name }) : t('edited', { name: f.name })
    );
  };

  const prices = (c: CatalogEntry) =>
    [c.default_cost ? `5vs5 ${euro(c.default_cost)}` : null, ...Object.entries(c.default_costs || {}).map(([f, v]) => `${f.replace('v', 'vs')} ${euro(Number(v))}`)]
      .filter(Boolean)
      .join(' · ');

  return (
    <section className="bg-card rounded-2xl p-4 sm:p-5 space-y-4" aria-labelledby="catalog-title">
      <div>
        <h2 id="catalog-title" className="text-base font-bold text-primary flex items-center gap-2">
          <MapPin className="h-5 w-5 text-accent-text" aria-hidden="true" /> {t('title')}
        </h2>
        <p className="text-xs text-secondary mt-0.5">{t('intro')}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted">{t('pendingCount', { count: pending.length })}</p>
        {pending.length === 0 && <p className="text-sm text-secondary">{t('nonePending')}</p>}
        <ul className="space-y-3">
          {pending.map((c) => {
            const twins = approved.filter((a) => looksLikeSameField(a, c));
            return (
              <li key={c.id} className="rounded-xl bg-app/50 p-3.5 space-y-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-primary">{c.name}</p>
                  <p className="text-xs text-secondary">{c.address}</p>
                  <p className="text-xs text-muted">
                    {t('proposedBy', { league: c.proposed_by.leagueName || c.proposed_by.leagueId })}
                    {prices(c) && ` · ${prices(c)}`}
                  </p>
                  {twins.length > 0 && <p className="text-xs text-warning">{t('possibleDuplicate', { names: twins.map((x) => x.name).join(', ') })}</p>}
                </div>
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                  <button type="button" onClick={() => approve(c)} disabled={busy !== null} className={btnInline.primary}>
                    {busy === `${c.id}:approve` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                    {t('approve')}
                  </button>
                  <button type="button" onClick={() => setEditing({ entry: c, approve: true })} disabled={busy !== null} className={btnInline.secondary}>
                    <Edit3 className="h-4 w-4" aria-hidden="true" /> {t('editApprove')}
                  </button>
                  <button type="button" onClick={() => reject(c)} disabled={busy !== null} className={btnInline.danger}>
                    <X className="h-4 w-4" aria-hidden="true" /> {t('reject')}
                  </button>
                </div>
                {approved.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={mergeInto[c.id] || twins[0]?.id || ''}
                      onChange={(e) => setMergeInto((m) => ({ ...m, [c.id]: e.target.value }))}
                      aria-label={t('mergeInto', { name: c.name })}
                      className="flex-1 min-w-0 rounded-lg border border-line bg-app px-2 py-2 text-xs text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="">{t('mergePlaceholder')}</option>
                      {approved.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} — {a.address}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => merge(c, mergeInto[c.id] || twins[0]?.id || '')}
                      disabled={busy !== null}
                      className={btnInline.secondary}
                    >
                      <GitMerge className="h-4 w-4" aria-hidden="true" /> {t('merge')}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowApproved((v) => !v)}
          aria-expanded={showApproved}
          className="flex w-full items-center justify-between text-xs font-semibold text-muted"
        >
          {t('approvedCount', { count: approved.length })}
          <ChevronDown className={`h-4 w-4 transition-transform ${showApproved ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {showApproved && (
          <ul className="divide-y divide-line rounded-xl bg-app/50">
            {approved.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary">{c.name}</p>
                  <p className="text-xs text-secondary">{c.address}</p>
                  <p className="text-xs text-muted">{t('usedBy', { count: c.leagues })}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing({ entry: c, approve: false })}
                  className="p-2 rounded-lg text-muted hover:text-primary hover:bg-card-hover"
                  aria-label={t('editAria', { name: c.name })}
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(c)}
                  disabled={busy !== null}
                  className="p-2 rounded-lg text-muted hover:text-danger hover:bg-card-hover"
                  aria-label={t('deleteAria', { name: c.name })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FieldModal isOpen={editing !== null} onClose={() => setEditing(null)} fieldToEdit={editing ? asField(editing.entry) : null} onSave={saveEdit} />
    </section>
  );
}
