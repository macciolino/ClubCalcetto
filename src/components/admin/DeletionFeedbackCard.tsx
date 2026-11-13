'use client';

import React, { useEffect, useState } from 'react';
import { DeletionFeedback, fetchDeletionFeedback } from '@/lib/services/accountService';
import { MessageSquareWarning, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';

/** Super admin only (Impostazioni → Admin e account): why players deleted their account. Collapsible. */
export function DeletionFeedbackCard() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DeletionFeedback[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const t = useTranslations('deletionFeedback');
  const { locale } = useLocaleSetting();

  useEffect(() => {
    if (!open || items) return;
    setLoading(true);
    fetchDeletionFeedback()
      .then((list) => (list ? setItems(list) : setError(t('loadFailed'))))
      .catch(() => setError(t('loadFailed')))
      .finally(() => setLoading(false));
  }, [open, items]);

  return (
    <div className="bg-card p-4 sm:p-5 rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-sm font-bold text-primary flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5 text-danger" /> {t('title')}
          </h2>
          <p className="text-xs text-secondary mt-0.5">{t('intro')}</p>
        </div>
        <span className="text-xs text-secondary">{open ? t('close') : t('open')}</span>
      </button>
      {open && (
        <div className="mt-4 pt-4 border-t border-line space-y-2">
          {loading && (
            <p className="text-xs text-secondary flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          {items && items.length === 0 && <p className="text-xs text-secondary">{t('none')}</p>}
          {items?.map((f) => (
            <div key={f.id} className="p-3 rounded-2xl bg-app border border-line text-xs space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-primary">{f.name}</span>
                <span className="text-muted">
                  {new Date(f.at).toLocaleString(locale === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {f.mode === 'deactivate' ? t('deactivated') : t('deleted')}
                  {f.deletedBy === 'super_admin' ? t('byYou') : ''}
                </span>
              </div>
              <div className="text-danger">{t('reason', { reason: f.reason })}</div>
              {f.details && <div className="text-secondary italic">&quot;{f.details}&quot;</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
