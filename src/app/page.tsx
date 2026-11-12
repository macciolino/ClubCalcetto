'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { GeneratedTeamRecord, Match, MvpVote, Presence, Profile, SportField } from '@/types/database';
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
import { formatItalianDate, isDateOpenForPlayers, toDateString } from '@/lib/utils/dateUtils';
import { effectiveMatchCost, effectiveMatchLocation, effectiveMatchTime, fieldCostFor, mvpVotingWindow } from '@/lib/utils/matchUtils';
import { computeMatchStats } from '@/lib/utils/statUtils';
import { FormDots, lastCompletedMatches } from '@/components/FormDots';
import { useForms } from '@/lib/hooks/useForms';
import { formatForm } from '@/lib/utils/formUtils';
import { reconcileTeams } from '@/lib/utils/teamUtils';
import { CountRing } from '@/components/PresenceCard';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { notify, askConfirm } from '@/components/ui/Feedback';
import { ArrowRight, Check, Clock, Lock, LogOut, MapPin } from 'lucide-react';

/** "oggi", "domani", the weekday within a week ("mercoledì"), otherwise "mer 18 nov". */
function dayLabel(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const diff = Math.round((dt.getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000);
  if (diff === 0) return 'oggi';
  if (diff === 1) return 'domani';
  if (diff > 1 && diff < 7) return dt.toLocaleDateString('it-IT', { weekday: 'long' });
  return shortDate(date);
}
function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
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
  const [standard, setStandard] = useState<{ cost?: number; time?: string; fieldId?: string }>({});
  const [openUntil, setOpenUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [completedMatches, setCompletedMatches] = useState<Match[]>([]);
  const [votes, setVotes] = useState<MvpVote[]>([]);
  const { forms } = useForms();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsubs = [
      subscribeOfficialMatchDate((d) => d && setDate(d)),
      subscribeProfiles((list) => setProfiles(list || [])),
      subscribeSportFields((list) => setFields(list || [])),
      subscribeAppSettings((s) =>
        setStandard({ cost: s.standard_total_cost, time: s.standard_match_time, fieldId: s.default_field_id })
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
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name || 'Giocatore';
  const starters = useMemo(() => (presences || []).filter((p) => p.status === 'confirmed'), [presences]);
  const waitlist = useMemo(() => (presences || []).filter((p) => p.status === 'waitlist'), [presences]);
  const mine = profile ? (presences || []).find((p) => p.player_id === profile.id) : undefined;
  const myStarterIdx = mine ? starters.findIndex((p) => p.id === mine.id) : -1;
  const myWaitIdx = mine ? waitlist.findIndex((p) => p.id === mine.id) : -1;
  const isFull = starters.length >= 10;
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
        notify('Ti sei ritirato dalla partita.');
      } else {
        await joinPresence(date, profile.id);
        notify(isFull ? 'Sei in lista d’attesa.' : 'Presenza segnata: ci sei!');
      }
    } catch {
      notify('Operazione non riuscita. Controlla la connessione e riprova.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !user || !profile) return <PageSkeleton />;

  const firstName = profile.full_name.trim().split(/\s+/)[0];
  const hasMatch = date >= today;
  const time = effectiveMatchTime(match, standard.time);
  const location = effectiveMatchLocation(match, fields, standard.fieldId);
  const cost = effectiveMatchCost(match, standard.cost, fieldCostFor(match, fields, standard.fieldId));

  // Intestazione: stato della partita in una frase (la prima condizione vera vince)
  const day = dayLabel(date, today);
  const isArchived = match?.status === 'completed';
  const { opensAt, closesAt } = mvpVotingWindow(date, time);
  const voteOpen = !isArchived && now >= opensAt.getTime() && now < closesAt.getTime();
  const hasVoted = votes.some((v) => v.voter_id === user.uid);
  const playedRecently = date < today && date >= toDateString(new Date(Date.now() - 7 * 86400000));
  const closedForPlayers = !isDateOpenForPlayers(date, openUntil);
  const amStarter = myStarterIdx >= 0;
  const closesLabel = `${closesAt.toDateString() === new Date(now).toDateString() ? 'oggi' : 'domani'} alle ${closesAt
    .toTimeString()
    .slice(0, 5)}`;
  type Head = { title: string; detail: string; action?: { href: string; label: string } };
  const head: Head = (() => {
    const squadre = `/squadre?date=${date}`;
    if (isArchived)
      return { title: `Partita del ${shortDate(date)} conclusa`, detail: 'Risultato, marcatori e MVP sono nello Storico.', action: { href: '/history', label: 'Vai allo Storico' } };
    if (voteOpen)
      return hasVoted
        ? { title: 'Votazione MVP aperta', detail: `Hai già votato. Si chiude ${closesLabel}.` }
        : { title: 'Votazione MVP aperta', detail: `Hai tempo fino a ${closesLabel} per votare.`, action: { href: squadre, label: 'Vota l’MVP' } };
    if (playedRecently)
      return {
        title: `Partita del ${shortDate(date)} giocata`,
        detail: 'Il risultato sarà pubblicato a breve.',
        action: admin ? { href: '/impostazioni?sezione=partita', label: 'Chiudi la partita' } : undefined,
      };
    if (!hasMatch)
      return {
        title: 'Nessuna partita in programma',
        detail: 'Il calendario delle presenze si apre a breve.',
        action: admin ? { href: '/presenze', label: 'Apri le iscrizioni' } : undefined,
      };
    if (teamRecord?.confirmed)
      return amStarter
        ? {
            title: `Si gioca ${day} alle ${time}`,
            detail: `Partita confermata${myTeam === 'white' ? ' · Giochi con i Bianchi.' : myTeam === 'black' ? ' · Giochi con i Neri.' : '.'}`,
          }
        : {
            title: `Partita confermata per ${day}`,
            detail: mine ? `Sei in lista d’attesa (n° ${myWaitIdx + 1}).` : 'Rosa completa: puoi entrare in lista d’attesa.',
          };
    if (teamRecord)
      return {
        title: `Squadre pronte per ${day}`,
        detail: admin ? 'Controlla le squadre e conferma la partita.' : 'In attesa della conferma.',
        action: admin ? { href: squadre, label: 'Conferma la partita' } : undefined,
      };
    if (isFull)
      return amStarter
        ? {
            title: `Rosa al completo per ${day}`,
            detail: 'Le squadre saranno pubblicate a breve.',
            action: admin ? { href: squadre, label: 'Genera le squadre' } : undefined,
          }
        : {
            title: `Posti esauriti per ${day}`,
            detail: mine ? `Sei in lista d’attesa (n° ${myWaitIdx + 1}).` : 'Puoi entrare in lista d’attesa.',
            action: admin ? { href: squadre, label: 'Genera le squadre' } : undefined,
          };
    if (closedForPlayers)
      return {
        title: 'Iscrizioni non ancora aperte',
        detail: admin ? 'I giocatori non possono ancora iscriversi.' : `La partita di ${day} sarà disponibile a breve.`,
        action: admin ? { href: '/presenze', label: 'Apri la settimana' } : undefined,
      };
    const missing = 10 - starters.length;
    return mine
      ? { title: `Sei iscritto per ${day}`, detail: `Siamo ${starters.length} su 10: ${missing === 1 ? 'manca 1 giocatore' : `mancano ${missing} giocatori`}.` }
      : { title: `Iscrizioni aperte per ${day}`, detail: `Siamo ${starters.length} su 10. Conferma la tua presenza.` };
  })();

  return (
    <div className="space-y-8 pb-12 animate-in">
      <header className="space-y-1.5">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">Ciao {firstName}</h1>
        <p className="pt-1 text-lg sm:text-xl font-semibold text-slate-100 first-letter:uppercase">{presences === null ? '\u00a0' : head.title}</p>
        <p className="text-sm text-slate-400">{presences === null ? '\u00a0' : head.detail}</p>
        {presences !== null && head.action && (
          <Link
            href={head.action.href}
            className="inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-emerald-300 hover:text-emerald-200"
          >
            {head.action.label} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2">
      {hasMatch ? (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6" aria-labelledby="next-match">
          {/* Quando e dove */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-semibold text-emerald-400">Prossima partita</p>
              <h2 id="next-match" className="text-xl sm:text-2xl font-bold text-white">
                {formatItalianDate(date)}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-400" /> Ore {time}
                </span>
                <span className="flex items-start gap-1.5 min-w-0">
                  <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="break-words">{location}</span>
                </span>
                <span className="text-slate-400">€{(cost / 10).toFixed(2)} a testa</span>
              </div>
            </div>
            {teamRecord?.confirmed && (
              <span className="self-start bg-emerald-500/15 text-emerald-300 text-xs font-medium px-2.5 py-1 rounded-full">
                Partita confermata
              </span>
            )}
          </div>

          {/* Il tuo stato */}
          {presences === null ? (
            <div className="h-14 rounded-xl bg-slate-800/70 animate-pulse" aria-hidden="true" />
          ) : mine ? (
            <div
              className={`rounded-xl border px-4 py-3.5 flex items-center justify-between gap-3 ${
                myStarterIdx >= 0 ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-amber-500/10 border-amber-500/40'
              }`}
            >
              <span className={`text-base font-semibold flex items-center gap-2 ${myStarterIdx >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                <Check className="h-5 w-5" />
                {myStarterIdx >= 0 ? `Sei titolare (n° ${myStarterIdx + 1})` : `In attesa (${myWaitIdx + 1}°)`}
              </span>
              {cancelLocked ? (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" /> Ritiri bloccati
                </span>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const msg =
                      myStarterIdx >= 0
                        ? "Vuoi ritirarti dalla partita? Il tuo posto passa al primo in lista d'attesa."
                        : "Vuoi uscire dalla lista d'attesa?";
                    if (await askConfirm(msg)) handleToggle();
                  }}
                  disabled={busy}
                  className="flex-shrink-0 flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-slate-700 text-sm font-medium text-slate-300 hover:text-rose-300 hover:border-rose-500/40 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" /> Ritirati
                </button>
              )}
            </div>
          ) : locked ? (
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3.5 text-center">
              <span className="text-base font-semibold text-slate-300 flex items-center justify-center gap-2">
                <Lock className="h-4 w-4" /> Iscrizioni chiuse
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleToggle}
              disabled={busy}
              className={`w-full py-4 rounded-xl font-semibold text-base transition-colors active:scale-[0.99] disabled:opacity-50 ${
                isFull ? 'bg-amber-400 hover:bg-amber-300 text-slate-950' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {isFull ? 'Mettimi in attesa' : 'Ci sono'}
            </button>
          )}

          {/* Posti e squadra */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-4 rounded-xl bg-slate-950/50 p-4">
              <CountRing count={starters.length} />
              <div className="text-sm">
                <p className="font-semibold text-white">{isFull ? 'Al completo' : `${10 - starters.length} posti liberi`}</p>
                <p className="text-slate-400">{waitlist.length > 0 ? `${waitlist.length} in lista d’attesa` : 'Nessuno in attesa'}</p>
              </div>
            </div>
            <div className="rounded-xl bg-slate-950/50 p-4 text-sm flex flex-col justify-center gap-1">
              {teams && teams.white.length > 0 ? (
                <>
                  <p className="font-semibold text-white">
                    {myTeam === 'white' ? 'Giochi con i Bianchi ⚪' : myTeam === 'black' ? 'Giochi con i Neri ⚫' : 'Squadre pronte'}
                  </p>
                  <Link href={`/squadre?date=${date}`} className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                    Vedi le squadre <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <>
                  <p className="font-semibold text-white">Squadre non ancora fatte</p>
                  <p className="text-slate-400">Le prepara un admin quando ci sono 10 titolari.</p>
                </>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm text-slate-300">Segna i giorni in cui puoi giocare: la partita si decide quando si arriva a 10.</p>
          <Link href="/presenze" className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-sm">
            Vai alle presenze <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      </div>

      {/* Colonna destra (sotto su telefono): rendimento personale e ultima partita */}
      <aside className="space-y-4">
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4" aria-labelledby="my-form">
          <h2 id="my-form" className="text-base font-semibold text-white">Il tuo rendimento</h2>
          {myStats && myStats.played > 0 ? (
            <>
              <div className="grid grid-cols-3 text-center">
                {(
                  [
                    ['Partite', myStats.played],
                    ['Gol', myStats.goals],
                    ['MVP', myStats.mvp],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label}>
                    <span className="block text-2xl font-bold text-white tabular-nums leading-none">{v}</span>
                    <span className="block text-xs text-slate-400 mt-1">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 text-sm pt-3 border-t border-slate-800">
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Ultime 5</span>
                  <FormDots playerId={profile.id} matches={recentMatches} size="sm" />
                </span>
                {forms.get(profile.id) ? (
                  <span className={`text-xs font-semibold ${(forms.get(profile.id) || 0) > 0 ? 'text-orange-300' : 'text-sky-300'}`}>
                    Forma {(forms.get(profile.id) || 0) > 0 ? '🔥' : '❄️'} {formatForm(forms.get(profile.id) || 0)}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">Le tue statistiche compaiono dopo la prima partita archiviata.</p>
          )}
        </section>

        {lastMatch && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3" aria-labelledby="last-match">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="last-match" className="text-base font-semibold text-white">Ultima partita</h2>
              <span className="text-xs text-slate-400 capitalize">{shortDate(lastMatch.match_date || lastMatch.id)}</span>
            </div>
            <div className="flex items-center justify-center gap-4 py-1">
              <span className="text-sm text-slate-300">Bianchi</span>
              <span className="text-2xl font-bold text-white tabular-nums">
                {lastMatch.score_white ?? 0} – {lastMatch.score_black ?? 0}
              </span>
              <span className="text-sm text-slate-300">Neri</span>
            </div>
            {(() => {
              const inWhite = lastMatch.team_white?.some((p) => p.id === profile.id);
              const inBlack = lastMatch.team_black?.some((p) => p.id === profile.id);
              const w = lastMatch.score_white ?? 0;
              const b = lastMatch.score_black ?? 0;
              const mineRes = !inWhite && !inBlack ? null : w === b ? 'Pareggiata' : (inWhite ? w > b : b > w) ? 'Vinta' : 'Persa';
              return (
                <p className="text-sm text-slate-400 text-center">
                  {lastMatch.mvp_player_id ? <>MVP <span className="text-white font-medium">{nameOf(lastMatch.mvp_player_id)}</span></> : 'MVP non assegnato'}
                  {mineRes && <> · La tua: <span className={mineRes === 'Vinta' ? 'text-emerald-300' : mineRes === 'Persa' ? 'text-rose-300' : 'text-slate-300'}>{mineRes.toLowerCase()}</span></>}
                </p>
              );
            })()}
            <Link href="/history" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-300 hover:text-emerald-200 pt-1">
              Vai allo Storico <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        )}
      </aside>
      </div>
    </div>
  );
}
