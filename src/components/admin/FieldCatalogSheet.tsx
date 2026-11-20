'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Globe2, Loader2, MapPin, Plus, Search } from 'lucide-react';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { notify } from '@/components/ui/Feedback';
import { addCatalogField, fetchCatalog, type CatalogEntry } from '@/lib/services/fieldCatalogService';
import { matchesCatalogSearch } from '@/lib/utils/fieldCatalog';
import type { SportField } from '@/types/database';

const euro = (n: number) => `€${Number(n).toFixed(Number(n) % 1 ? 2 : 0).replace('.', ',')}`;

/**
 * Impostazioni → Campi → "Aggiungi campo": search the global catalog and add a pitch to the league (linked),
 * or — not found — propose a new one to the catalog, or keep a field only for this league.
 */
export function FieldCatalogSheet({
  fields,
  onClose,
  onPropose,
  onPrivate,
}: {
  fields: SportField[];
  onClose: () => void;
  onPropose: () => void;
  onPrivate: () => void;
}) {
  const t = useTranslations('fieldCatalog');
  const [catalog, setCatalog] = useState<{ approved: CatalogEntry[]; mine: CatalogEntry[] } | null | 'loading'>('loading');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCatalog().then((res) => alive && setCatalog(res));
    return () => {
      alive = false;
    };
  }, []);

  const linked = useMemo(() => new Set(fields.map((f) => f.catalog_id).filter(Boolean)), [fields]);
  const shown = catalog && catalog !== 'loading' ? catalog.approved.filter((c) => matchesCatalogSearch(c, query)) : [];

  const add = async (c: CatalogEntry) => {
    if (busy) return;
    setBusy(c.id);
    const res = await addCatalogField(c.id);
    setBusy(null);
    if (res !== 'ok') return notify(t(`errors.${res}`));
    notify(t('added', { name: c.name }));
    onClose();
  };

  return (
    <Sheet
      onClose={onClose}
      title={t('title')}
      subtitle={t('subtitle')}
      height="tall"
      footer={
        <>
          <button type="button" onClick={onPropose} className={sheetBtn.primary}>
            <Globe2 className="h-4 w-4" aria-hidden="true" /> {t('propose')}
          </button>
          <button type="button" onClick={onPrivate} className={sheetBtn.secondary}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t('private')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="relative block">
          <span className="sr-only">{t('search')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-xl border border-line bg-app py-2.5 pl-9 pr-3 text-sm text-primary focus:outline-none focus:border-accent"
          />
        </label>

        {catalog === 'loading' && (
          <p className="text-sm text-secondary flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t('loading')}
          </p>
        )}
        {catalog === null && <p className="text-sm text-danger">{t('loadFailed')}</p>}
        {catalog !== 'loading' && catalog !== null && shown.length === 0 && (
          <p className="text-sm text-secondary">{query ? t('noResults') : t('empty')}</p>
        )}

        {shown.length > 0 && (
          <ul className="divide-y divide-line rounded-xl bg-app/50" aria-label={t('listLabel')}>
            {shown.map((c) => {
              const inLeague = linked.has(c.id);
              return (
                <li key={c.id} className="flex items-start gap-3 px-3.5 py-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-semibold text-primary">{c.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-secondary">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      <span className="truncate">{c.address}</span>
                    </p>
                    <p className="text-xs text-muted tabular-nums">
                      {c.default_cost ? t('from5', { amount: euro(c.default_cost) }) : t('noPrice')}
                      {c.leagues > 0 && ` · ${t('usedBy', { count: c.leagues })}`}
                    </p>
                  </div>
                  {inLeague ? (
                    <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-accent-text">
                      <Check className="h-4 w-4" aria-hidden="true" /> {t('inLeague')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => add(c)}
                      disabled={busy !== null}
                      aria-label={t('addAria', { name: c.name })}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent-text hover:bg-accent/25 disabled:opacity-50"
                    >
                      {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                      {t('add')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {catalog && catalog !== 'loading' && catalog.mine.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted">{t('mine')}</p>
            <ul className="space-y-1 text-xs text-secondary">
              {catalog.mine.map((c) => (
                <li key={c.id}>
                  {c.name} · {c.status === 'pending' ? t('statusPending') : t('statusRejected')}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted">{t('footerHint')}</p>
      </div>
    </Sheet>
  );
}

/** Before proposing: pitches that look the same. "Use this one" adds it; "Propose anyway" goes on. */
export function SimilarFieldsSheet({
  similar,
  fields,
  onUse,
  onProposeAnyway,
  onClose,
}: {
  similar: CatalogEntry[];
  fields: SportField[];
  onUse: (c: CatalogEntry) => void;
  onProposeAnyway: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('fieldCatalog');
  const linked = new Set(fields.map((f) => f.catalog_id).filter(Boolean));
  return (
    <Sheet
      onClose={onClose}
      title={t('similarTitle')}
      subtitle={t('similarSubtitle')}
      footer={
        <>
          <button type="button" onClick={onProposeAnyway} className={sheetBtn.secondary}>
            {t('proposeAnyway')}
          </button>
          <button type="button" onClick={onClose} className={sheetBtn.secondary}>
            {t('cancel')}
          </button>
        </>
      }
    >
      <ul className="divide-y divide-line rounded-xl bg-app/50">
        {similar.map((c) => (
          <li key={c.id} className="flex items-start gap-3 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary">{c.name}</p>
              <p className="text-xs text-secondary">{c.address}</p>
              {c.status === 'pending' && <p className="text-xs text-warning">{t('statusPending')}</p>}
            </div>
            {c.status === 'approved' && !linked.has(c.id) && (
              <button type="button" onClick={() => onUse(c)} className="flex-shrink-0 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent-text hover:bg-accent/25">
                {t('useThis')}
              </button>
            )}
            {linked.has(c.id) && <span className="flex-shrink-0 text-xs font-semibold text-accent-text">{t('inLeague')}</span>}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
