'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Star } from 'lucide-react';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { notify } from '@/components/ui/Feedback';
import { Skeleton } from '@/components/ui/Skeleton';
import { fetchExternalMatch, voteExternalMvp, type ExternalMatchView } from '@/lib/services/matchNoticeService';
import type { MySpot } from '@/types/matchNotice';

/**
 * MVP vote of an external player (board "Spot"): they cannot read the league, so the server shows them the teams
 * of that match and records the vote in the league's usual place (one per person, changeable while open).
 */
export function ExternalMvpSheet({ spot, onClose }: { spot: MySpot; onClose: () => void }) {
  const t = useTranslations('board.mvp');
  const tb = useTranslations('board');
  const [view, setView] = useState<ExternalMatchView | null | undefined>(undefined);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchExternalMatch(spot.noticeId).then((v) => {
      if (!alive) return;
      setView(v);
      setChoice(v?.myVote || '');
    });
    return () => {
      alive = false;
    };
  }, [spot.noticeId]);

  const vote = async () => {
    if (!choice) return;
    setBusy(true);
    const res = await voteExternalMvp(spot.noticeId, choice);
    setBusy(false);
    notify(res === 'ok' ? t('saved') : tb(`errors.${res}`), res === 'ok' ? 'success' : 'error');
    if (res === 'ok') onClose();
  };

  const team = (label: string, list: { id: string; name: string }[]) => (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-semibold text-secondary mb-1">{label}</legend>
      {list.map((p) => (
        <label key={p.id} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 cursor-pointer ${choice === p.id ? 'bg-accent/15' : 'bg-app'}`}>
          <span className="text-sm font-medium text-primary truncate">{p.name}</span>
          <input type="radio" name="mvp" value={p.id} checked={choice === p.id} onChange={() => setChoice(p.id)} className="accent-emerald-500" />
        </label>
      ))}
    </fieldset>
  );

  return (
    <Sheet
      onClose={onClose}
      title={t('title')}
      subtitle={t('subtitle', { league: spot.leagueName })}
      footer={
        <>
          <button type="button" onClick={onClose} className={sheetBtn.secondary}>
            {tb('form.cancel')}
          </button>
          <button type="button" onClick={vote} disabled={!choice || busy} className={sheetBtn.primary}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t('vote')}
          </button>
        </>
      }
    >
      {view === undefined ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !view || view.teams.white.length + view.teams.black.length === 0 ? (
        <p className="text-sm text-secondary">{t('noTeams')}</p>
      ) : (
        <div className="space-y-4">
          {view.score && (
            <p className="flex items-center gap-2 text-sm text-secondary">
              <Star className="h-4 w-4 text-warning" aria-hidden="true" /> {t('score', { white: view.score.white, black: view.score.black })}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {team(t('white'), view.teams.white)}
            {team(t('black'), view.teams.black)}
          </div>
        </div>
      )}
    </Sheet>
  );
}
