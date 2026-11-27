'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Check, Lock, Mail, Pencil, Star, UserMinus } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { surface } from '@/components/ui/surfaces';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import {
  cancelMatchNotice,
  closeMatchNotice,
  inviteNoticeApplicant,
  removeNoticeApplicant,
  subscribeApplicants,
} from '@/lib/services/matchNoticeService';
import type { MatchNotice, NoticeApplicant } from '@/types/matchNotice';
import type { Match } from '@/types/database';
import { externalPlayerId, outcomeFor } from '@/lib/utils/externalPlayers';
import { ExternalRatingSheet } from './ExternalRatingSheet';
import { NoticeFacts, NoticePrice, noticeStatusKey, noticeWhen } from './NoticeCard';

/**
 * Who took a spot on a notice (managers): name and time; after the match, "Invita nella lega" sends that person
 * the league's invite link (they decide whether to join). Used by the managers' sheet and the match panel.
 */
export function ApplicantsList({ notice }: { notice: MatchNotice }) {
  const t = useTranslations('board.manage');
  const tb = useTranslations('board');
  const { locale } = useLocaleSetting();
  // null = names still loading (the count on the notice can already say someone took a spot)
  const [applicants, setApplicants] = useState<NoticeApplicant[] | null>(null);
  // The clock is read once (not while rendering): enough to know whether the match has been played
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState('');
  const tr = useTranslations('board.rating');
  // The report of the match: once archived, the external players who played can get a quick, optional rating
  const [report, setReport] = useState<Match | null>(null);
  const [rating, setRating] = useState<NoticeApplicant | null>(null);
  useEffect(() => subscribeApplicants(notice.id, setApplicants), [notice.id]);
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'leagues', notice.leagueId, 'matches', notice.matchId),
        (snap) => setReport(snap.exists() ? (snap.data() as Match) : null),
        () => setReport(null)
      ),
    [notice.leagueId, notice.matchId]
  );
  const played = Date.parse(notice.dateTime) <= now && notice.status !== 'CANCELLED';

  // Before the match a manager can take someone out: the spot is freed (the notice reopens if it was full)
  const remove = async (a: NoticeApplicant) => {
    if (!(await askConfirm(t('confirmRemove', { name: a.displayName })))) return;
    setBusy(a.profileId);
    const res = await removeNoticeApplicant(notice.id, a.profileId);
    setBusy('');
    notify(res === 'ok' ? t('removed', { name: a.displayName }) : tb(`errors.${res}`), res === 'ok' ? 'success' : 'error');
  };

  const invite = async (a: NoticeApplicant) => {
    if (!(await askConfirm(t('confirmInvite', { name: a.displayName, league: notice.leagueName })))) return;
    setBusy(a.profileId);
    const res = await inviteNoticeApplicant(notice.id, a.profileId);
    setBusy('');
    notify(res === 'ok' ? t('invited', { name: a.displayName }) : tb(`errors.${res}`), res === 'ok' ? 'success' : 'error');
  };

  if (applicants === null) return <p className="text-xs text-muted">{notice.spotsFilled > 0 ? t('loadingApplicants') : t('noApplicants')}</p>;
  if (applicants.length === 0) return <p className="text-xs text-muted">{t('noApplicants')}</p>;
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {applicants.map((a) => (
          <li key={a.profileId} className={`${surface.inset} px-3 py-2 space-y-2`}>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-medium text-primary truncate">{a.displayName}</span>
                <span className="block text-xs text-muted">{noticeWhen(a.joinedAt, locale)}</span>
              </span>
              {!played && notice.status !== 'CANCELLED' && (
                <button
                  type="button"
                  onClick={() => remove(a)}
                  disabled={busy === a.profileId}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-rose-500/10 disabled:opacity-50"
                >
                  <UserMinus className="h-3.5 w-3.5" aria-hidden="true" /> {t('remove')}
                </button>
              )}
              {played &&
                (a.invitedAt ? (
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs text-accent-text">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t('inviteSent')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => invite(a)}
                    disabled={busy === a.profileId}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-card-hover disabled:opacity-50"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {t('invite')}
                  </button>
                ))}
            </div>
            {played && report?.status === 'completed' && outcomeFor(report, externalPlayerId(a.profileId)) && (
              <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
                <span className="min-w-0 text-xs text-secondary flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                  {report.external_ratings?.[externalPlayerId(a.profileId)]
                    ? tr('rated', { ovr: Math.round(report.external_ratings[externalPlayerId(a.profileId)].overall_rating * 10) })
                    : tr('optional')}
                </span>
                <button
                  type="button"
                  onClick={() => setRating(a)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-card-hover"
                >
                  {report.external_ratings?.[externalPlayerId(a.profileId)] ? tr('edit') : tr('action')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{played ? t('inviteHint') : t('applicantsHint')}</p>
      {rating && (
        <ExternalRatingSheet
          notice={notice}
          person={{ profileId: rating.profileId, name: rating.displayName }}
          initial={report?.external_ratings?.[externalPlayerId(rating.profileId)]?.stats}
          onClose={() => setRating(null)}
        />
      )}
    </div>
  );
}

/** Close or cancel a notice, with its confirmation. */
export async function closeOrCancel(notice: MatchNotice, kind: 'close' | 'cancel', t: ReturnType<typeof useTranslations>) {
  if (!(await askConfirm(t(kind === 'close' ? 'manage.confirmClose' : 'manage.confirmCancel')))) return false;
  const res = kind === 'close' ? await closeMatchNotice(notice.id) : await cancelMatchNotice(notice.id);
  if (res !== 'ok') {
    notify(t(`errors.${res}`), 'error');
    return false;
  }
  notify(t(kind === 'close' ? 'manage.closed' : 'manage.cancelled'), 'success');
  return true;
}

/** A notice of the league seen by its managers: details, who took a spot, edit / close / cancel. */
export function NoticeManageSheet({ notice, onEdit, onClose }: { notice: MatchNotice; onEdit: () => void; onClose: () => void }) {
  const t = useTranslations('board');
  const { locale } = useLocaleSetting();
  const act = async (kind: 'close' | 'cancel') => {
    if (await closeOrCancel(notice, kind, t)) onClose();
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
        <NoticePrice notice={notice} />
        {notice.notes && <p className="text-secondary whitespace-pre-line">{notice.notes}</p>}
        <section aria-labelledby="notice-applicants">
          <h3 id="notice-applicants" className="text-sm font-semibold text-primary mb-2">
            {t('manage.applicants', { filled: notice.spotsFilled, total: notice.spotsNeeded })}
          </h3>
          <ApplicantsList notice={notice} />
        </section>
      </div>
    </Sheet>
  );
}
