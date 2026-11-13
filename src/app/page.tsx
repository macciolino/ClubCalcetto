'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { AppSettings, GeneratedTeamRecord, Match, MvpVote, Presence, Profile, SportField } from '@/types/database';
import {
  joinPresence,
  leavePresence,
  subscribeAppSettings,
  subscribeCalendarSettings,
  subscribeGeneratedTeams,
  subscribeMatch,
  subscribeMatches,
  subscribeMvpVotes,
  subscribeOfficialMatchDate,
  subscribePresences,
  subscribeProfiles,
} from '@/lib/firebase/firestoreService';
import { subscribeSportFields } from '@/lib/services/fieldService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { getOfficialMatchDate, isTimelockActive } from '@/lib/services/presenceService';
import { formatLongDate, isDateOpenForPlayers, toDateString } from '@/lib/utils/dateUtils';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { effectiveMatchLocation, effectiveMatchTime, matchCostFor, mvpVotingWindow } from '@/lib/utils/matchUtils';
import { useDayFormat } from '@/lib/hooks/useMatchFormats';
import { perHead } from '@/lib/utils/matchFormat';
import { computeMatchStats } from '@/lib/utils/statUtils';
import { FormDots, lastCompletedMatches } from '@/components/FormDots';
import { useForms } from '@/lib/hooks/useForms';
import { formatForm } from '@/lib/utils/formUtils';
import { reconcileTeams } from '@/lib/utils/teamUtils';
import { CountRing } from '@/components/PresenceCard';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { notify, askConfirm } from '@/components/ui/Feedback';
import { ArrowRight, Check, Clock, Lock, LogOut, MapPin } from 'lucide-react';
import { btn, presenceBtn, textLink } from '@/components/ui/buttons';

const tag = (locale: string) => (locale === 'en' ? 'en-GB' : 'it-IT');

/** "oggi"/"today", "domani"/"tomorrow", the weekday within a week ("mercoledì"), otherwise "mer 18 nov". */
function dayLabel(date: string, today: string, locale: string, words: { today: string; tomorrow: string }): string {
  const [y, m, d] = date.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const diff = Math.round((dt.getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000);
  if (diff === 0) return words.today;
  if (diff === 1) return words.tomorrow;
  if (diff > 1 && diff < 7) return dt.toLocaleDateString(tag(locale), { weekday: 'long' });
  return shortDate(date, locale);
}
function shortDate(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(tag(locale), { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
}

/**
 * Home: "Prossima partita". The first thing a player wants to know: when and where, whether they play,
 * how many places are left and, once generated, in which team. Everything else is one tap away.
 */
export default function HomePage() {
  const { user, profile, isAdmin, isLoading } = useAuth();
  const [date, setDate] = useState<string>(() => getOfficialMatchDate());
  const [presences, setPresences] = useState<Presence[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [teamRecord, setTeamRecord] = useState<GeneratedTeamRecord | null>(null);
  const [fields, setFields] = useState<SportField[]>([]);
  const [standard, setStandard] = useState<{ cost?: number; costs?: AppSettings['standard_costs']; time?: string; fieldId?: string }>({});
  const [openUntil, setOpenUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [completedMatches, setCompletedMatches] = useState<Match[]>([]);
  const [votes, setVotes] = useState<MvpVote[]>([]);
  const { forms } = useForms();
  const t = useTranslations('home');
  const { locale } = useLocaleSetting();
  // Formato della partita (5vs5, 7vs7, 8vs8, 11vs11): titolari, posti liberi e quota
  const fmt = useDayFormat(date);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsubs = [
      // Senza giorno ufficiale (tolto da un admin) la Home mostra oggi
      subscribeOfficialMatchDate((d) => setDate(d || toDateString(new Date()))),
      subscribeProfiles((list) => setProfiles(list || [])),
      subscribeSportFields((list) => setFields(list || [])),
      subscribeAppSettings((s) =>
        setStandard({ cost: s.standard_total_cost, costs: s.standard_costs, time: s.standard_match_time, fieldId: s.default_field_id })
      ),
      subscribeCalendarSettings((cal) => setOpenUntil(cal.open_until || '')),
      subscribeMatches((list) => setCompletedMatches(list.filter((m) => m.status === 'completed'))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !date) return;
    setPresences(null);
    const unsubs = [
      subscribePresences(date, (list) => setPresences(list)),
      subscribeMatch(date, (m) => setMatch(m)),
      subscribeGeneratedTeams(date, (r) => setTeamRecord(r)),
      subscribeMvpVotes(date, (v) => setVotes(v)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [date]);

  const today = toDateString(new Date());
  const admin = Boolean(isAdmin || profile?.role === 'admin');
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name || t('playerFallback');
  const starters = useMemo(() => (presences || []).filter((p) => p.status === 'confirmed'), [presences]);
  const waitlist = useMemo(() => (presences || []).filter((p) => p.status === 'waitlist'), [presences]);
  const mine = profile ? (presences || []).find((p) => p.player_id === profile.id) : undefined;
  const myStarterIdx = mine ? starters.findIndex((p) => p.id === mine.id) : -1;
  const myWaitIdx = mine ? waitlist.findIndex((p) => p.id === mine.id) : -1;
  const isFull = starters.length >= fmt.players;
  const locked = !admin && !isDateOpenForPlayers(date, openUntil);
  const cancelLocked = Boolean(mine) && !admin && isTimelockActive(date).locked;

  // Squadre: quelle salvate, con le eventuali sostituzioni (come in Squadre)
  const teams = useMemo(() => {
    if (match?.status === 'completed' && match.team_white?.length) return { white: match.team_white, black: match.team_black || [] };
    if (!teamRecord) return null;
    const r = reconcileTeams(teamRecord, starters.map((p) => ({ id: p.player_id, name: nameOf(p.player_id) })));
    return { white: r.white, black: r.black };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamRecord, match, starters, profiles]);
  const myTeam = profile && teams ? (teams.white.some((p) => p.id === profile.id) ? 'white' : teams.black.some((p) => p.id === profile.id) ? 'black' : null) : null;

  // Rendimento personale e ultima partita archiviata
  const myStats = useMemo(() => (profile ? computeMatchStats(completedMatches).get(profile.id) : undefined), [completedMatches, profile]);
  const recentMatches = useMemo(() => lastCompletedMatches(completedMatches), [completedMatches]);
  const lastMatch = useMemo(
    () => [...completedMatches].sort((a, b) => (b.match_date || b.id).localeCompare(a.match_date || a.id))[0],
    [completedMatches]
  );

  const handleToggle = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      if (mine) {
        await leavePresence(mine.id);
        notify(t('withdrawn'));
      } else {
        await joinPresence(date, profile.id);
        notify(isFull ? t('onWaitlist') : t('joined'));
      }
    } catch {
      notify(t('failed'));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !user || !profile) return <PageSkeleton />;

  const firstName = profile.full_name.trim().split(/\s+/)[0];
  const hasMatch = date >= today;
  const time = effectiveMatchTime(match, standard.time);
  const location = effectiveMatchLocation(match, fields, standard.fieldId);
  const cost = matchCostFor(
    match,
    { standard_total_cost: standard.cost, standard_costs: standard.costs, default_field_id: standard.fieldId },
    fields,
    fmt.format
  );

  // Intestazione: stato della partita in una frase (la prima condizione vera vince)
  const day = dayLabel(date, today, locale, { today: t('today'), tomorrow: t('tomorrow') });
  const sd = (d: string) => shortDate(d, locale);
  const isArchived = match?.status === 'completed';
  const { opensAt, closesAt } = mvpVotingWindow(date, time);
  const voteOpen = !isArchived && now >= opensAt.getTime() && now < closesAt.getTime();
  const hasVoted = votes.some((v) => v.voter_id === user.uid);
  const playedRecently = date < today && date >= toDateString(new Date(now - 7 * 86400000));
  const closedForPlayers = !isDateOpenForPlayers(date, openUntil);
  const amStarter = myStarterIdx >= 0;
  const closesLabel = t('closesAt', {
    day: closesAt.toDateString() === new Date(now).toDateString() ? t('today') : t('tomorrow'),
    time: closesAt.toTimeString().slice(0, 5),
  });
  type Head = { title: string; detail: string; action?: { href: string; label: string } };
  const head: Head = (() => {
    const squadre = `/teams?date=${date}`;
    if (isArchived)
      return { title: t('hArchived', { date: sd(date) }), detail: t('hArchivedDetail'), action: { href: '/history', label: t('goHistory') } };
    if (voteOpen)
      return hasVoted
        ? { title: t('hVote'), detail: t('hVotedDetail', { when: closesLabel }) }
        : { title: t('hVote'), detail: t('hVoteDetail', { when: closesLabel }), action: { href: squadre, label: t('voteMvp') } };
    if (playedRecently)
      return {
        title: t('hPlayed', { date: sd(date) }),
        detail: t('hPlayedDetail'),
        action: admin ? { href: '/settings?sezione=partita', label: t('closeMatch') } : undefined,
      };
    if (!hasMatch)
      return {
        title: t('hNone'),
        detail: t('hNoneDetail'),
        action: admin ? { href: '/attendance', label: t('openSignups') } : undefined,
      };
    if (teamRecord?.confirmed)
      return amStarter
        ? {
            title: t('hPlaying', { day, time }),
            detail: myTeam === 'white' ? t('hPlayingWhite') : myTeam === 'black' ? t('hPlayingBlack') : t('hPlayingConfirmed'),
          }
        : {
            title: t('hConfirmedFor', { day }),
            detail: mine ? t('waitPos', { n: myWaitIdx + 1 }) : t('fullCanWait'),
          };
    if (teamRecord)
      return {
        title: t('hTeamsReady', { day }),
        detail: admin ? t('hTeamsReadyAdmin') : t('hTeamsReadyPlayer'),
        action: admin ? { href: squadre, label: t('confirmMatch') } : undefined,
      };
    if (isFull)
      return amStarter
        ? {
            title: t('hFull', { day }),
            detail: t('hFullDetail'),
            action: admin ? { href: squadre, label: t('generateTeams') } : undefined,
          }
        : {
            title: t('hSoldOut', { day }),
            detail: mine ? t('waitPos', { n: myWaitIdx + 1 }) : t('canWait'),
            action: admin ? { href: squadre, label: t('generateTeams') } : undefined,
          };
    if (closedForPlayers)
      return {
        title: t('hNotOpen'),
        detail: admin ? t('hNotOpenAdmin') : t('hNotOpenPlayer', { day }),
        action: admin ? { href: '/attendance', label: t('openWeek') } : undefined,
      };
    const missing = fmt.players - starters.length;
    return mine
      ? { title: t('hSignedUp', { day }), detail: t('hSignedUpDetail', { count: starters.length, max: fmt.players, missing }) }
      : { title: t('hOpen', { day }), detail: t('hOpenDetail', { count: starters.length, max: fmt.players }) };
  })();

  return (
    <div className="space-y-8 pb-12 animate-in">
      <header className="space-y-1.5">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-primary">{t('hello', { name: firstName })}</h1>
        <p className="pt-1 text-lg sm:text-xl font-semibold text-primary first-letter:uppercase">{presences === null ? '\u00a0' : head.title}</p>
        <p className="text-sm text-secondary">{presences === null ? '\u00a0' : head.detail}</p>
        {presences !== null && head.action && (
          <Link
            href={head.action.href}
            className={`${textLink} pt-1`}
          >
            {head.action.label} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2">
      {hasMatch ? (
        <section className="bg-card border border-line rounded-2xl p-5 sm:p-6 space-y-6" aria-labelledby="next-match">
          {/* Quando e dove */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-semibold text-accent-text">{t('nextMatch')}</p>
              <h2 id="next-match" className="text-xl sm:text-2xl font-bold text-primary">
                {formatLongDate(date, locale)}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-secondary">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-secondary" /> {t('at', { time })}
                </span>
                <span className="flex items-start gap-1.5 min-w-0">
                  <MapPin className="h-4 w-4 text-secondary flex-shrink-0 mt-0.5" />
                  <span className="break-words">{location}</span>
                </span>
                <span className="text-secondary">
                  {t('perHead', { format: fmt.label, amount: perHead(cost, fmt.players) })}
                </span>
              </div>
            </div>
            {teamRecord?.confirmed && (
              <span className="self-start bg-accent/15 text-accent-text text-xs font-medium px-2.5 py-1 rounded-full">
                {t('confirmed')}
              </span>
            )}
          </div>

          {/* Il tuo stato */}
          {presences === null ? (
            <div className="h-14 rounded-xl bg-card-hover/70 animate-pulse" aria-hidden="true" />
          ) : mine ? (
            <div
              className={`rounded-xl border px-4 py-3.5 flex items-center justify-between gap-3 ${
                myStarterIdx >= 0 ? 'bg-accent/10 border-accent/40' : 'bg-amber-500/10 border-amber-500/40'
              }`}
            >
              <span className={`text-base font-semibold flex items-center gap-2 ${myStarterIdx >= 0 ? 'text-accent-text' : 'text-warning'}`}>
                <Check className="h-5 w-5" />
                {myStarterIdx >= 0 ? t('starter', { n: myStarterIdx + 1 }) : t('waiting', { n: myWaitIdx + 1 })}
              </span>
              {cancelLocked ? (
                <span className="text-xs text-secondary flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" /> {t('withdrawLocked')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const msg =
                      myStarterIdx >= 0
                        ? t('confirmWithdraw')
                        : t('confirmLeaveWait');
                    if (await askConfirm(msg)) handleToggle();
                  }}
                  disabled={busy}
                  className="flex-shrink-0 flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-line-strong text-sm font-medium text-secondary hover:text-danger hover:border-rose-500/40 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" /> {t('withdraw')}
                </button>
              )}
            </div>
          ) : locked ? (
            <div className="rounded-xl border border-line-strong bg-card-hover/60 px-4 py-3.5 text-center">
              <span className="text-base font-semibold text-secondary flex items-center justify-center gap-2">
                <Lock className="h-4 w-4" /> {t('signupsClosed')}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleToggle}
              disabled={busy}
              className={presenceBtn(isFull)}
            >
              {isFull ? t('waitMe') : t('imIn')}
            </button>
          )}

          {/* Posti e squadra */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-4 rounded-xl bg-app/50 p-4">
              <CountRing count={starters.length} max={fmt.players} />
              <div className="text-sm">
                <p className="font-semibold text-primary">{isFull ? t('full') : t('freeSpots', { count: fmt.players - starters.length })}</p>
                <p className="text-secondary">{waitlist.length > 0 ? t('waitCount', { count: waitlist.length }) : t('noneWaiting')}</p>
              </div>
            </div>
            <div className="rounded-xl bg-app/50 p-4 text-sm flex flex-col justify-center gap-1">
              {teams && teams.white.length > 0 ? (
                <>
                  <p className="font-semibold text-primary">
                    {myTeam === 'white' ? t('playWhite') : myTeam === 'black' ? t('playBlack') : t('teamsReady')}
                  </p>
                  <Link href={`/teams?date=${date}`} className={textLink}>
                    {t('seeTeams')} <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <>
                  <p className="font-semibold text-primary">{t('noTeamsYet')}</p>
                  <p className="text-secondary">{t('noTeamsYetDetail', { n: fmt.players })}</p>
                </>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-card border border-line rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm text-secondary">{t('markDays')}</p>
          <Link href="/attendance" className={btn.primary}>
            {t('goAttendance')} <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      </div>

      {/* Colonna destra (sotto su telefono): rendimento personale e ultima partita */}
      <aside className="space-y-4">
        <section className="bg-card border border-line rounded-2xl p-5 space-y-4" aria-labelledby="my-form">
          <h2 id="my-form" className="text-base font-semibold text-primary">{t('myForm')}</h2>
          {myStats && myStats.played > 0 ? (
            <>
              <div className="grid grid-cols-3 text-center">
                {(
                  [
                    [t('matches'), myStats.played],
                    [t('goals'), myStats.goals],
                    [t('mvp'), myStats.mvp],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label}>
                    <span className="block text-2xl font-bold text-primary tabular-nums leading-none">{v}</span>
                    <span className="block text-xs text-secondary mt-1">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 text-sm pt-3 border-t border-line">
                <span className="flex items-center gap-2">
                  <span className="text-xs text-secondary">{t('last5')}</span>
                  <FormDots playerId={profile.id} matches={recentMatches} size="sm" />
                </span>
                {forms.get(profile.id) ? (
                  <span className={`text-xs font-semibold ${(forms.get(profile.id) || 0) > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-sky-700 dark:text-sky-300'}`}>
                    {t('form')} {(forms.get(profile.id) || 0) > 0 ? '🔥' : '❄️'} {formatForm(forms.get(profile.id) || 0)}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-secondary">{t('statsAfterFirst')}</p>
          )}
        </section>

        {lastMatch && (
          <section className="bg-card border border-line rounded-2xl p-5 space-y-3" aria-labelledby="last-match">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="last-match" className="text-base font-semibold text-primary">{t('lastMatch')}</h2>
              <span className="text-xs text-secondary capitalize">{sd(lastMatch.match_date || lastMatch.id)}</span>
            </div>
            <div className="flex items-center justify-center gap-4 py-1">
              <span className="text-sm text-secondary">{t('white')}</span>
              <span className="text-2xl font-bold text-primary tabular-nums">
                {lastMatch.score_white ?? 0} – {lastMatch.score_black ?? 0}
              </span>
              <span className="text-sm text-secondary">{t('black')}</span>
            </div>
            {(() => {
              const inWhite = lastMatch.team_white?.some((p) => p.id === profile.id);
              const inBlack = lastMatch.team_black?.some((p) => p.id === profile.id);
              const w = lastMatch.score_white ?? 0;
              const b = lastMatch.score_black ?? 0;
              const mineRes = !inWhite && !inBlack ? null : w === b ? 'drawn' : (inWhite ? w > b : b > w) ? 'won' : 'lost';
              return (
                <p className="text-sm text-secondary text-center">
                  {lastMatch.mvp_player_id ? <>MVP <span className="text-primary font-medium">{nameOf(lastMatch.mvp_player_id)}</span></> : t('mvpNone')}
                  {mineRes && <> · {t('yours')} <span className={mineRes === 'won' ? 'text-accent-text' : mineRes === 'lost' ? 'text-danger' : 'text-secondary'}>{t(mineRes)}</span></>}
                </p>
              );
            })()}
            <Link href="/history" className={`${textLink} w-full justify-center pt-1`}>
              {t('goHistory')} <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        )}
      </aside>
      </div>
    </div>
  );
}
