'use client';

import React from 'react';
import { Profile } from '@/types/database';
import { Trash2 } from 'lucide-react';
import { btnInline } from '@/components/ui/buttons';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';

interface DeactivatedAccountsListProps {
  deactivatedPlayers: Profile[];
  onReactivatePlayer: (player: Profile) => void;
  onDeleteDeactivatedPlayer: (player: Profile) => void;
}

/** Admins (Impostazioni → Admin e account): deactivated accounts, data kept, with reactivate / delete for good.
 *  Those who asked to come back (`restore_requested_at`) come first, marked "Vuole rientrare". */
export function DeactivatedAccountsList({
  deactivatedPlayers,
  onReactivatePlayer,
  onDeleteDeactivatedPlayer,
}: DeactivatedAccountsListProps) {
  const t = useTranslations('deactivated');
  const { locale } = useLocaleSetting();
  return (
      <ul className="space-y-2">
        {[...deactivatedPlayers]
          .sort((a, b) => Number(Boolean(b.restore_requested_at)) - Number(Boolean(a.restore_requested_at)))
          .map((p) => (
          <li
            key={p.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card rounded-2xl p-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-sm text-primary truncate">{p.full_name}</span>
                {p.restore_requested_at && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-warning">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" /> {t('wantsBack')}
                  </span>
                )}
              </div>
              <div className="text-xs text-secondary truncate">{p.email || t('noEmail')}</div>
              <div className="text-[11px] text-muted mt-0.5">
                {p.deactivated_by === 'self' ? t('byPlayer') : t('byAdmin')}
                {p.deactivated_at ? t('on', { date: new Date(p.deactivated_at).toLocaleDateString(locale === 'en' ? 'en-GB' : 'it-IT') }) : ''} · OVR{' '}
                {p.overall_rating} · {t('record', { w: p.matches_won ?? 0, d: p.matches_drawn ?? 0, l: p.matches_lost ?? 0 })}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onReactivatePlayer(p)}
                className={`${btnInline.primary} flex-1 sm:flex-none`}
              >
                {t('reactivate')}
              </button>
              <button
                type="button"
                onClick={() => onDeleteDeactivatedPlayer(p)}
                aria-label={t('deleteAria', { name: p.full_name })}
                title={t('delete')}
                className="px-3 py-2.5 rounded-xl text-danger border border-rose-500/40 hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
        {deactivatedPlayers.length === 0 && <li className="text-xs text-secondary">{t('none')}</li>}
      </ul>
  );
}
