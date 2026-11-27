'use client';

import React, { useRef, useState } from 'react';
import { LeagueMigrationResult, runLeagueMigration } from '@/lib/services/accountService';
import { askConfirm } from '@/components/ui/Feedback';
import { btn } from '@/components/ui/buttons';
import { Layers, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Super admin only (Impostazioni → Admin e account), multi-league 1A: copies the single-group data into the
 * league "I Calcettari". "Controlla" only counts; "Crea la lega" asks for confirmation. Both can be repeated safely.
 */
export function LeagueMigrationCard() {
  const t = useTranslations('leagueMigration');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [result, setResult] = useState<LeagueMigrationResult | null>(null);
  const [error, setError] = useState('');

  const run = async (dryRun: boolean) => {
    if (running.current) return;
    running.current = true;
    setError('');
    try {
      if (!dryRun) {
        const preview = result?.dryRun ? result : await runLeagueMigration(true).catch(() => null);
        if (!preview) return setError(t('failed'));
        if (preview.writes === 0) return setResult(preview);
        if (!(await askConfirm(t('confirm', { writes: preview.writes })))) return;
      }
      setBusy(true);
      const res = await runLeagueMigration(dryRun).catch(() => null);
      if (!res) return setError(t('failed'));
      setResult(res);
    } finally {
      setBusy(false);
      running.current = false;
    }
  };

  return (
    <div className="bg-card border border-line-strong dark:border-line-strong/60 p-4 sm:p-5 rounded-2xl space-y-3">
      <div>
        <h2 className="text-sm font-bold text-primary flex items-center gap-2">
          <Layers className="h-5 w-5 text-accent-text" /> {t('title')}
        </h2>
        <p className="text-xs text-secondary mt-0.5">{t('intro')}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" disabled={busy} onClick={() => run(true)} className={btn.secondary}>
          {t('check')}
        </button>
        <button type="button" disabled={busy} onClick={() => run(false)} className={btn.primary}>
          <Layers className="h-4 w-4" /> {t('run')}
        </button>
      </div>
      {busy && (
        <p className="text-xs text-secondary flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('working')}
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {result && !busy && (
        <p className="text-xs text-secondary">
          {result.writes === 0
            ? t('nothing')
            : result.dryRun
              ? t('dryResult', { writes: result.writes, players: result.players.toCreate, presidents: result.presidents })
              : t('done', { writes: result.writes })}
        </p>
      )}
    </div>
  );
}
