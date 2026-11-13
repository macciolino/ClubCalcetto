'use client';

import { askConfirm } from '@/components/ui/Feedback';

import React, { useEffect, useState } from 'react';
import { MatchTeamPlayer, MvpVote } from '@/types/database';
import { castMvpVote, countMvpVotes, subscribeMvpVotes, setMvpVoteTest, clearMvpVotes } from '@/lib/firebase/firestoreService';
import { mvpVotingWindow } from '@/lib/utils/matchUtils';
import { formatLongDate } from '@/lib/utils/dateUtils';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { Star, Clock, Check, Loader2, FlaskConical, Trash2 } from 'lucide-react';

interface MvpVoteCardProps {
  date: string;
  matchTime: string;
  white: MatchTeamPlayer[];
  black: MatchTeamPlayer[];
  /** Firebase uid of who is looking (null = not signed in) */
  voterUid: string | null;
  isAdmin?: boolean;
  /** Test mode saved on the teams of that day: 'admins' = only admins, 'all' = everyone can vote now */
  testMode?: 'admins' | 'all' | false;
}

const timeLabel = (d: Date, locale: string) => d.toLocaleTimeString(locale === 'en' ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit' });
const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** MVP of the day voted by everyone. Opens 45 minutes after the end of the match (start time + 1h45). */
export function MvpVoteCard({ date, matchTime, white, black, voterUid, isAdmin = false, testMode = false }: MvpVoteCardProps) {
  const [votes, setVotes] = useState<MvpVote[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const t = useTranslations('mvpVote');
  const { locale } = useLocaleSetting();
  const when = (d: Date) => t('dateAt', { date: formatLongDate(toYmd(d), locale), time: timeLabel(d, locale) });

  useEffect(() => {
    setVotes([]);
    const unsub = subscribeMvpVotes(date, setVotes);
    return () => unsub();
  }, [date]);

  // Aggiorna l'orologio ogni 30 secondi: il voto si apre da solo all'orario giusto
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const { opensAt, closesAt } = mvpVotingWindow(date, matchTime);
  const isTesting = testMode === 'all' || (isAdmin && testMode === 'admins');
  const isOpen = isTesting || (now >= opensAt && now < closesAt);
  const isClosed = !isTesting && now >= closesAt;
  const myVote = voterUid ? votes.find((v) => v.voter_id === voterUid)?.player_id : undefined;
  const tally = countMvpVotes(votes);
  const countOf = (id: string) => tally.find((t) => t.playerId === id)?.count || 0;
  const players = [...white, ...black];
  const leader = tally[0] ? players.find((p) => p.id === tally[0].playerId) : undefined;

  const changeTest = async (mode: 'admins' | 'all' | false) => {
    if (mode === 'all' && !(await askConfirm(t('confirmTestAll')))) return;
    try {
      await setMvpVoteTest(date, mode);
    } catch (err) {
      console.warn('[MVP] modalità test non aggiornata:', err);
      setError(t('testFailed'));
    }
  };

  const handleClearVotes = async () => {
    if (!(await askConfirm(t('confirmClear', { count: votes.length })))) return;
    try {
      await clearMvpVotes(date);
    } catch (err) {
      console.warn('[MVP] cancellazione voti non riuscita:', err);
      setError(t('clearFailed'));
    }
  };

  const handleVote = async (playerId: string) => {
    if (!voterUid || !isOpen) return;
    setSaving(playerId);
    setError('');
    try {
      await castMvpVote(date, voterUid, playerId);
    } catch (err) {
      console.warn('[MVP] voto non riuscito:', err);
      setError(t('voteFailed'));
    } finally {
      setSaving(null);
    }
  };

  const opensLabel = when(opensAt);

  return (
    <section className="bg-card border border-line rounded-2xl p-5 space-y-4" aria-labelledby="mvp-vote-title">
      <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
        <h3 id="mvp-vote-title" className="text-sm font-bold text-primary flex items-center gap-2">
          <Star className="h-4 w-4 text-warning" /> {t('title')}
        </h3>
        <span className="text-xs font-mono text-secondary">{t('votes', { count: votes.length })}</span>
      </div>

      {isAdmin && (
        <div className={`rounded-2xl border p-3 space-y-2 ${testMode ? 'border-violet-400/50 bg-violet-500/10' : 'border-line bg-app/60'}`}>
          <p className="text-xs text-secondary flex items-start gap-1.5">
            <FlaskConical className="h-4 w-4 text-violet-700 dark:text-violet-300 flex-shrink-0" />
            {testMode === 'all'
              ? t('testAllOn')
              : testMode
              ? t('testAdminsOn')
              : t('testOff')}
          </p>
          <div className="flex flex-wrap gap-2">
            {testMode !== 'admins' && (
              <button
                type="button"
                onClick={() => changeTest('admins')}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-violet-400/50 text-violet-200 hover:bg-violet-500/20"
              >
                {t('testAdmins')}
              </button>
            )}
            {testMode !== 'all' && (
              <button
                type="button"
                onClick={() => changeTest('all')}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-violet-400/50 text-violet-200 hover:bg-violet-500/20"
              >
                {t('testAll')}
              </button>
            )}
            {testMode && (
              <button
                type="button"
                onClick={() => changeTest(false)}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-600 text-primary hover:bg-card-hover"
              >
                {t('endTest')}
              </button>
            )}
            {votes.length > 0 && (
              <button
                type="button"
                onClick={handleClearVotes}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border border-rose-500/40 text-danger hover:bg-rose-500/15"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t('clearVotes')}
              </button>
            )}
          </div>
        </div>
      )}

      {!isAdmin && testMode === 'all' && (
        <p className="text-xs text-violet-200 bg-violet-500/10 border border-violet-400/40 rounded-xl p-3 flex items-start gap-1.5">
          <FlaskConical className="h-4 w-4 flex-shrink-0" />
          {t('testNotice')}
        </p>
      )}

      {!isOpen && !isClosed && (
        <p className="text-sm text-secondary flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent-text flex-shrink-0" />
          {t('opensAt', { when: opensLabel })}
        </p>
      )}

      {isClosed && (
        <p className="text-sm text-secondary">
          {t('closed')}{' '}
          {leader
            ? t.rich('topVoted', { name: leader.name, count: tally[0].count, b: (c) => <strong className="text-warning">{c}</strong> })
            : t('noVotes')}
        </p>
      )}

      {isOpen && (
        <>
          <p className="text-xs text-secondary">
            {voterUid
              ? myVote
                ? t('voted')
                : t('tapToVote')
              : t('signIn')}{' '}
            {t('closesAt', { when: when(closesAt) })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([[t('white'), white], [t('black'), black]] as const).map(([title, list]) => (
              <div key={title} className="space-y-1.5">
                <div className="text-xs font-bold text-secondary">{title}</div>
                {list.map((p) => {
                  const mine = myVote === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleVote(p.id)}
                      disabled={!voterUid || saving !== null}
                      aria-pressed={mine}
                      className={`w-full min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-sm font-semibold transition-all disabled:opacity-70 ${
                        mine
                          ? 'border-amber-400 bg-amber-400/15 text-primary'
                          : 'border-line bg-app text-primary hover:border-slate-600'
                      }`}
                    >
                      {saving === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-warning" />
                      ) : mine ? (
                        <Check className="h-4 w-4 text-warning" />
                      ) : (
                        <Star className="h-4 w-4 text-muted" />
                      )}
                      <span className="flex-1 truncate">{p.name}</span>
                      {countOf(p.id) > 0 && (
                        <span className="text-xs font-mono font-bold text-warning">{countOf(p.id)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
