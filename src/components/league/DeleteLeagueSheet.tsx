'use client';

import React, { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { btn, btnInline } from '@/components/ui/buttons';

/** Same rule as the server (src/lib/server/leagueDeletion.ts): spaces at the ends and repeated spaces ignored. */
const normalise = (s: string) => s.trim().replace(/\s+/g, ' ');

/**
 * Deleting a league for good: the president (or the platform super admin) types the EXACT league name.
 * `onDelete(typed)` gets what was typed (the server checks it again) and returns 'ok' or an error key of `league.delete.errors`.
 */
export function DeleteLeagueSheet({
  leagueName,
  onDelete,
  onClose,
}: {
  leagueName: string;
  onDelete: (typedName: string) => Promise<string>;
  onClose: () => void;
}) {
  const t = useTranslations('league.delete');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = normalise(typed) === normalise(leagueName) && leagueName.length > 0;

  const confirm = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError('');
    const res = await onDelete(typed);
    setBusy(false);
    if (res !== 'ok') setError(t(`errors.${['name_mismatch', 'protected', 'forbidden', 'not_found'].includes(res) ? res : 'failed'}`));
  };

  return (
    <Sheet
      onClose={onClose}
      locked={busy}
      title={t('title', { name: leagueName })}
      footer={
        <div className="flex flex-col gap-2">
          <button type="button" onClick={confirm} disabled={!matches || busy} className={`w-full ${btnInline.dangerSolid} disabled:opacity-50`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            {t('confirm')}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={btn.secondary}>
            {t('cancel')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-secondary">{t('warning')}</p>
        <label htmlFor="delete-league-name" className="block text-sm font-medium text-primary">
          {t('typeName', { name: leagueName })}
        </label>
        <input
          id="delete-league-name"
          type="text"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full rounded-xl border border-line bg-app px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-rose-500/40"
        />
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
