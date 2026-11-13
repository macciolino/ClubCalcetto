'use client';

import React, { useState } from 'react';
import { SportField } from '@/types/database';
import { saveDayFormat } from '@/lib/firebase/firestoreService';
import { requestTeamsCheck } from '@/lib/services/notificationService';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { FORMAT_INFO, MATCH_FORMATS, MatchFormat, fieldHostsFormat } from '@/lib/utils/matchFormat';
import { formatLongDate } from '@/lib/utils/dateUtils';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Admins only: format (5vs5, 7vs7, 8vs8, 11vs11) and formation of ONE match day.
 * Changing the format changes the number of starters at once (the first N sign-ups are starters);
 * who moves up from the waitlist is notified by the server. Teams already made must be regenerated.
 */
export function MatchFormatPicker({
  date,
  format,
  formation,
  field,
  hasTeams = false,
  adminId,
}: {
  date: string;
  format: MatchFormat;
  formation: string;
  /** Field of the match: warns when it has no cost for the chosen format (= it does not host it) */
  field?: SportField;
  /** Teams already saved (not archived) for that day */
  hasTeams?: boolean;
  adminId: string;
}) {
  const [busy, setBusy] = useState(false);
  const info = FORMAT_INFO[format];
  const t = useTranslations('format');
  const { locale } = useLocaleSetting();
  const fmtDate = (d: string) => formatLongDate(d, locale);

  const change = async (next: MatchFormat, nextFormation?: string) => {
    if (busy || !date) return;
    const sameFormat = next === format;
    const target = nextFormation || (sameFormat ? formation : FORMAT_INFO[next].formations[0]);
    if (sameFormat && target === formation) return;
    if (!sameFormat) {
      const n = FORMAT_INFO[next].players;
      const more = n > info.players;
      const msg = [
        t('confirmSwitch', { label: FORMAT_INFO[next].label, date: fmtDate(date) }),
        more ? t('moreStarters', { n }) : t('fewerStarters', { n }),
        hasTeams ? t('regenerate') : '',
        field && !fieldHostsFormat(field, next) ? t('fieldMissing', { name: field.name, label: FORMAT_INFO[next].label }) : '',
      ]
        .filter(Boolean)
        .join('\n');
      if (!(await askConfirm(msg))) return;
    }
    setBusy(true);
    try {
      await saveDayFormat(date, next, target, adminId);
      if (!sameFormat) requestTeamsCheck(date); // titolari ricalcolati: notifiche a chi entra
      notify(sameFormat ? t('formationSaved', { formation: target }) : t('formatSaved', { label: FORMAT_INFO[next].label, date: fmtDate(date) }));
    } catch (err) {
      console.warn('[Formato] salvataggio non riuscito:', err);
      notify(t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-app/60 p-1" role="radiogroup" aria-label={t('radioAria')}>
        {MATCH_FORMATS.map((f) => {
          const active = f === format;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={busy}
              onClick={() => change(f)}
              className={`rounded-lg px-1 py-2 text-center transition-colors disabled:opacity-60 ${
                active ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-card-hover'
              }`}
            >
              <span className="block text-sm font-semibold">{FORMAT_INFO[f].label}</span>
              <span className={`block text-[10px] tabular-nums ${active ? 'text-slate-900' : 'text-muted'}`}>{t('players', { count: FORMAT_INFO[f].players })}</span>
            </button>
          );
        })}
      </div>

      {info.formations.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-secondary">{t('formation')}</span>
          {info.formations.map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => change(format, m)}
              aria-pressed={m === formation}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold tabular-nums transition-colors ${
                m === formation ? 'bg-line-strong text-primary' : 'border border-line-strong text-secondary hover:bg-card-hover'
              }`}
            >
              {m}
            </button>
          ))}
          {busy && <Loader2 className="h-4 w-4 animate-spin text-secondary" />}
        </div>
      )}

      {field && !fieldHostsFormat(field, format) && (
        <p className="flex items-start gap-2 text-xs text-warning">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning" />
          {t('fieldWarning', { name: field.name, label: info.label })}
        </p>
      )}
    </div>
  );
}
