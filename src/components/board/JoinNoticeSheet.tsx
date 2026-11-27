'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, Check, Info, Loader2, MapPin, Shield } from 'lucide-react';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { surface } from '@/components/ui/surfaces';
import { notify } from '@/components/ui/Feedback';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { takeNoticeSpot } from '@/lib/services/matchNoticeService';
import type { MatchNotice } from '@/types/matchNotice';
import { NoticeFacts, NoticePrice, noticeWhen } from './NoticeCard';

/**
 * "Partecipa alla partita": a summary of what the person is signing up for (league, when, where, role, shirt,
 * quota) and a clear note that they do not join the league. Confirm → the server takes the spot (transaction).
 */
export function JoinNoticeSheet({ notice, onClose }: { notice: MatchNotice; onClose: () => void }) {
  const t = useTranslations('board');
  const { locale } = useLocaleSetting();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    const res = await takeNoticeSpot(notice.id);
    setBusy(false);
    notify(res === 'ok' ? t('tookIt') : t(`errors.${res}`), res === 'ok' ? 'success' : 'error');
    if (res === 'ok' || res === 'full' || res === 'not_open' || res === 'cancelled') onClose();
  };

  const row = 'flex items-start gap-3';
  return (
    <Sheet
      onClose={onClose}
      title={t('joinTitle')}
      subtitle={t('joinSubtitle', { league: notice.leagueName })}
      footer={
        <>
          <button type="button" onClick={onClose} className={sheetBtn.secondary}>
            {t('form.cancel')}
          </button>
          <button type="button" onClick={confirm} disabled={busy} className={sheetBtn.primary}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t('joinConfirm')}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className={row}>
          <CalendarDays className="h-4 w-4 mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <span className="font-semibold text-primary">{noticeWhen(notice.dateTime, locale)}</span>
        </p>
        <p className={row}>
          <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <span>
            <span className="block font-medium text-primary">{notice.locationName}</span>
            <span className="block text-xs text-secondary">{notice.address}</span>
          </span>
        </p>
        <NoticeFacts notice={notice} />
        <NoticePrice notice={notice} />
        {notice.notes && <p className="text-secondary whitespace-pre-line">{notice.notes}</p>}
        <p className={`${row} ${surface.inset} px-3 py-2.5 text-xs text-secondary`}>
          <Shield className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" /> {t('joinIsolation')}
        </p>
        <p className={`${row} text-xs text-muted`}>
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" /> {t('joinManagersTold')}
        </p>
      </div>
    </Sheet>
  );
}
