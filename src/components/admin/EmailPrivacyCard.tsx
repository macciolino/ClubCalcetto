'use client';

import React, { useState } from 'react';
import { EmailPrivacyResult, runEmailPrivacy } from '@/lib/services/accountService';
import { askConfirm } from '@/components/ui/Feedback';
import { btn } from '@/components/ui/buttons';
import { Lock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Super admin only (Impostazioni → Admin e account), C2: moves the players' emails out of the public profiles
 * into private_profiles. "Controlla" only counts; "Sposta" asks for confirmation. Both can be repeated safely.
 */
export function EmailPrivacyCard() {
  const t = useTranslations('emailPrivacy');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EmailPrivacyResult | null>(null);
  const [error, setError] = useState('');

  const run = async (dryRun: boolean) => {
    if (!dryRun) {
      const preview = result?.dryRun ? result : await runEmailPrivacy(true);
      if (!preview) return setError(t('failed'));
      if (!(await askConfirm(t('confirm', { count: preview.withEmail })))) return;
    }
    setBusy(true);
    setError('');
    const res = await runEmailPrivacy(dryRun).catch(() => null);
    setBusy(false);
    if (!res) return setError(t('failed'));
    setResult(res);
  };

  return (
    <div className="bg-card border border-line-strong dark:border-line-strong/60 p-4 sm:p-5 rounded-2xl space-y-3">
      <div>
        <h2 className="text-sm font-bold text-primary flex items-center gap-2">
          <Lock className="h-5 w-5 text-accent-text" /> {t('title')}
        </h2>
        <p className="text-xs text-secondary mt-0.5">{t('intro')}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" disabled={busy} onClick={() => run(true)} className={btn.secondary}>
          {t('check')}
        </button>
        <button type="button" disabled={busy} onClick={() => run(false)} className={btn.primary}>
          <Lock className="h-4 w-4" /> {t('move')}
        </button>
      </div>
      {busy && (
        <p className="text-xs text-secondary flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('working')}
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {result && !busy && (
        <div className="text-xs text-secondary space-y-1">
          <p>
            {result.dryRun
              ? t('dryResult', { count: result.withEmail })
              : result.copied + result.removed === 0
                ? t('nothing')
                : t('done', { copied: result.copied, removed: result.removed })}
          </p>
          {result.mismatched.length > 0 && <p className="text-warning">{t('mismatched', { ids: result.mismatched.join(', ') })}</p>}
        </div>
      )}
    </div>
  );
}
