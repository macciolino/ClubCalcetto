'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Lock, Pencil } from 'lucide-react';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { cancelMatchNotice, closeMatchNotice, subscribeApplicants } from '@/lib/services/matchNoticeService';
import type { MatchNotice, NoticeApplicant } from '@/types/matchNotice';
import { NoticeFacts, noticeStatusKey, noticeWhen } from './NoticeCard';

/** A notice of the league seen by its managers: details, who took a spot, edit / close / cancel. */
export function NoticeManageSheet({ notice, onEdit, onClose }: { notice: MatchNotice; onEdit: () => void; onClose: () => void }) {
  const t = useTranslations('board');
  const { locale } = useLocaleSetting();
  const [applicants, setApplicants] = useState<NoticeApplicant[]>([]);
  useEffect(() => subscribeApplicants(notice.id, setApplicants), [notice.id]);

  const act = async (kind: 'close' | 'cancel') => {
    if (!(await askConfirm(t(kind === 'close' ? 'manage.confirmClose' : 'manage.confirmCancel')))) return;
    const res = kind === 'close' ? await closeMatchNotice(notice.id) : await cancelMatchNotice(notice.id);
    if (res !== 'ok') return notify(t(`errors.${res}`), 'error');
    notify(t(kind === 'close' ? 'manage.closed' : 'manage.cancelled'), 'success');
    onClose();
  };
  const cancelled = notice.status === 'CANCELLED';

  return (
    <Sheet
      onClose={onClose}
      title={noticeWhen(notice.dateTime, locale)}
      subtitle={`${notice.locationName} · ${t(`status.${noticeStatusKey(notice)}`)}`}
      footer={
        cancelled ? undefined : (
          <>
            <button type="button" onClick={onEdit} className={sheetBtn.secondary}>
              <Pencil className="h-4 w-4" /> {t('manage.edit')}
            </button>
            {notice.status === 'OPEN' && (
              <button type="button" onClick={() => act('close')} className={sheetBtn.secondary}>
                <Lock className="h-4 w-4" /> {t('manage.close')}
              </button>
            )}
            <button type="button" onClick={() => act('cancel')} className={sheetBtn.danger}>
              <Ban className="h-4 w-4" /> {t('manage.cancel')}
            </button>
          </>
        )
      }
    >
      <div className="space-y-4 text-sm">
        <NoticeFacts notice={notice} />
        {notice.notes && <p className="text-secondary whitespace-pre-line">{notice.notes}</p>}
        <section aria-labelledby="notice-applicants">
          <h3 id="notice-applicants" className="text-sm font-semibold text-primary mb-2">
            {t('manage.applicants', { filled: notice.spotsFilled, total: notice.spotsNeeded })}
          </h3>
          {applicants.length === 0 ? (
            <p className="text-xs text-muted">{t('manage.noApplicants')}</p>
          ) : (
            <ul className="space-y-1">
              {applicants.map((a) => (
                <li key={a.profileId} className="flex items-center justify-between gap-3 rounded-xl bg-app px-3 py-2">
                  <span className="font-medium text-primary truncate">{a.displayName}</span>
                  <span className="shrink-0 text-xs text-muted">{noticeWhen(a.joinedAt, locale)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">{t('manage.applicantsHint')}</p>
        </section>
      </div>
    </Sheet>
  );
}
