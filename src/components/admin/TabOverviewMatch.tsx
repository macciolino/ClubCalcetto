'use client';

import { notify, askConfirm } from '@/components/ui/Feedback';

import { useFormSettings } from '@/lib/hooks/useForms';
import { MatchResultFields, MatchResultValue, validateScorers } from '@/components/MatchResultFields';
import { reconcileTeams, toTeamPlayer } from '@/lib/utils/teamUtils';
import { firstToTenByWeek as computeFirstToTen } from '@/lib/utils/presenceRanking';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Profile, Presence, Match, GeneratedTeamRecord, SportField } from '@/types/database';

const EMPTY_RESULT: MatchResultValue = { scoreWhite: 0, scoreBlack: 0, mvpPlayerId: '', scorers: [] };
import { useAuth } from '@/lib/context/AuthContext';
import { effectiveMatchCost, fieldCostFor } from '@/lib/utils/matchUtils';
import { subscribeMatch, subscribeMatches, saveMatchResult, subscribeMvpVotes, countMvpVotes, subscribeGeneratedTeams, subscribeTeamDatesSince } from '@/lib/firebase/firestoreService';
import { CalendarDay, formatItalianDate, toDateString } from '@/lib/utils/dateUtils';
import { 
  getMatchPayments, 
  togglePlayerPayment, 
  setAllPayments, 
  resetMatchPayments,
  subscribeMatchPayments 
} from '@/lib/services/paymentService';
import { 
  Trophy, 
  Users, 
  CheckCircle2, 
  Sparkles, 
  Coins, 
  Clock, 
  Check, 
  AlertCircle, 
  ChevronRight, 
  Star, 
  ArrowRight, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Loader2,
  Calendar,
  DollarSign,
  ChevronDown
} from 'lucide-react';

interface TabOverviewMatchProps {
  days: CalendarDay[];
  activeDate: string;
  onSelectDate: (dateString: string) => void;
  players: Profile[];
  presences: Presence[];
  generatedTeamRecord?: GeneratedTeamRecord | null;
  totalMatchCost?: number;
  /** Fields of the club and the default one: a field can have its own cost */
  fields?: SportField[];
  defaultFieldId?: string;
}

export function TabOverviewMatch({
  days,
  activeDate,
  onSelectDate,
  players,
  presences,
  generatedTeamRecord,
  totalMatchCost: standardMatchCost = 80,
  fields = [],
  defaultFieldId,
}: TabOverviewMatchProps) {
  const { profile } = useAuth();
  const fixedKeeper = Boolean(useFormSettings().fixedKeeper);

  // Partita salvata in Firestore per la data attiva (fonte unica per risultato e quota)
  const [savedMatch, setSavedMatch] = useState<Match | null>(null);
  useEffect(() => {
    setSavedMatch(null);
    const unsub = subscribeMatch(activeDate, (m) => setSavedMatch(m));
    return () => unsub();
  }, [activeDate]);

  // Partita da chiudere: di default il giorno ufficiale, ma si può scegliere una partita già giocata
  // (es. quella di ieri, che non è più nel calendario delle presenze)
  const [closingDate, setClosingDate] = useState(activeDate);
  useEffect(() => setClosingDate(activeDate), [activeDate]);
  const [closingMatch, setClosingMatch] = useState<Match | null>(null);
  const [closingTeams, setClosingTeams] = useState<GeneratedTeamRecord | null>(null);
  useEffect(() => {
    setClosingMatch(null);
    setClosingTeams(null);
    const u1 = subscribeMatch(closingDate, (m) => setClosingMatch(m));
    const u2 = subscribeGeneratedTeams(closingDate, (r) => setClosingTeams(r));
    return () => {
      u1();
      u2();
    };
  }, [closingDate]);
  const [recentDates, setRecentDates] = useState<string[]>([]);
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const from = toDateString(d);
    const unsub = subscribeTeamDatesSince(from, (dates) => setRecentDates(dates));
    return () => unsub();
  }, []);
  const closingOptions = Array.from(new Set([activeDate, ...recentDates])).sort().reverse();

  // Quota: quella della partita se impostata, altrimenti il costo standard dell'admin
  const totalMatchCost = effectiveMatchCost(savedMatch, standardMatchCost, fieldCostFor(savedMatch, fields, defaultFieldId));

  // Titolari confermati per la data attiva
  const dayPresences = presences.filter((p) => p.date === activeDate);
  const starterPresences = dayPresences
    .filter((p) => p.status === 'confirmed')
    .sort((a, b) => (a.order_index ?? 99) - (b.order_index ?? 99));
  const starterProfiles = starterPresences
    .map((pr) => players.find((p) => p.id === pr.player_id) || pr.profile)
    .filter((p): p is Profile => Boolean(p));

  const starterIds = starterProfiles.map((p) => p.id);

  // Stato Cassa e Pagamenti per la data attiva
  const [paymentsRecord, setPaymentsRecord] = useState(() =>
    getMatchPayments(activeDate, starterIds, totalMatchCost)
  );

  useEffect(() => {
    setPaymentsRecord(getMatchPayments(activeDate, starterIds, totalMatchCost));

    const unsub = subscribeMatchPayments(activeDate, (remote) => {
      if (remote) setPaymentsRecord(remote);
    });

    const handlePaymentsChanged = (e: any) => {
      if (e.detail?.date === activeDate) {
        setPaymentsRecord(e.detail);
      } else {
        setPaymentsRecord(getMatchPayments(activeDate, starterIds, totalMatchCost));
      }
    };

    window.addEventListener('clubcalcetto_payments_changed', handlePaymentsChanged);
    return () => {
      unsub();
      window.removeEventListener('clubcalcetto_payments_changed', handlePaymentsChanged);
    };
  }, [activeDate, starterIds.length, totalMatchCost]);

  // Conteggio Pagamenti
  const paidCount = starterProfiles.filter(
    (p) => paymentsRecord.payments[p.id] === true
  ).length;
  const costPerPlayer = Number((totalMatchCost / 10).toFixed(2));
  const totalCollected = Number((paidCount * costPerPlayer).toFixed(2));
  const progressPercent = Math.min(100, Math.round((paidCount / 10) * 100));

  // Modulo Chiusura Match Post-Partita
  const [result, setResult] = useState<MatchResultValue>(EMPTY_RESULT);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveSuccessMessage, setArchiveSuccessMessage] = useState('');
  const [cashOpen, setCashOpen] = useState(true);
  const [daysOpen, setDaysOpen] = useState(true);

  // Partite archiviate totali
  const [archivedMatchesCount, setArchivedMatchesCount] = useState(0);
  const [archivedDates, setArchivedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = subscribeMatches((list) =>
      {
        const done = list.filter((m) => m.status === 'completed');
        setArchivedMatchesCount(done.length);
        setArchivedDates(new Set(done.map((m) => m.match_date || m.id)));
      }
    );
    return () => unsub();
  }, []);

  // Ricarica nel modulo il tabellino già salvato (una volta per data, senza cancellare ciò che stai scrivendo)
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    // Cambio data: modulo vuoto, poi eventualmente ricaricato dalla partita salvata
    prefilledFor.current = null;
    setResult(EMPTY_RESULT);
  }, [closingDate]);
  useEffect(() => {
    if (
      closingMatch?.status === 'completed' &&
      closingMatch.match_date === closingDate &&
      prefilledFor.current !== closingDate
    ) {
      prefilledFor.current = closingDate;
      setResult({
        scoreWhite: closingMatch.score_white ?? 0,
        scoreBlack: closingMatch.score_black ?? 0,
        mvpPlayerId: closingMatch.mvp_player_id || '',
        scorers: closingMatch.scorers || [],
        penaltySaves: closingMatch.penalty_saves || [],
      });
    }
  }, [closingDate, closingMatch]);

  // Voti MVP dei giocatori per questa partita: il più votato viene proposto (l'admin può scegliere chiunque)
  const [mvpVotes, setMvpVotes] = useState<{ playerId: string; count: number }[]>([]);
  useEffect(() => {
    setMvpVotes([]);
    const unsub = subscribeMvpVotes(closingDate, (votes) => setMvpVotes(countMvpVotes(votes)));
    return () => unsub();
  }, [closingDate]);
  const proposedFor = useRef<string | null>(null);
  useEffect(() => {
    if (proposedFor.current === closingDate || closingMatch?.status === 'completed' || !mvpVotes[0]) return;
    proposedFor.current = closingDate;
    setResult((r) => (r.mvpPlayerId ? r : { ...r, mvpPlayerId: mvpVotes[0].playerId }));
  }, [closingDate, mvpVotes, closingMatch?.status]);

  // Per ogni settimana: il giorno che ha raggiunto PER PRIMO 10 iscritti
  const firstToTenByWeek = computeFirstToTen(days, presences);

  const isAlreadyClosed = closingMatch?.status === 'completed';

  // Handlers Cassa
  const handleTogglePayment = (playerId: string) => {
    const updated = togglePlayerPayment(activeDate, playerId, starterIds, totalMatchCost);
    setPaymentsRecord(updated);
  };

  const handleSetAllPaid = () => {
    const updated = setAllPayments(activeDate, starterIds, true, totalMatchCost);
    setPaymentsRecord(updated);
  };

  const handleResetPayments = () => {
    const updated = resetMatchPayments(activeDate, starterIds, totalMatchCost);
    setPaymentsRecord(updated);
  };

  // Squadre della partita: quelle archiviate (mai più cambiate da sole), altrimenti quelle generate in Squadre
  // con le eventuali sostituzioni (chi si è ritirato viene sostituito al suo posto). Mai "i primi 5 iscritti".
  const teams = (() => {
    if (closingMatch?.status === 'completed' && closingMatch.team_white?.length && closingMatch.team_black?.length) {
      return { white: closingMatch.team_white, black: closingMatch.team_black, fromArchive: true };
    }
    const record = closingDate === activeDate ? generatedTeamRecord || closingTeams : closingTeams;
    if (record?.team_white?.length && record?.team_black?.length) {
      // Giorno ufficiale: con le sostituzioni dalle presenze; partita passata: le squadre salvate così come sono
      if (closingDate !== activeDate) {
        return { white: record.team_white.map(toTeamPlayer), black: record.team_black.map(toTeamPlayer), fromArchive: false };
      }
      const r = reconcileTeams(record, starterProfiles.map(toTeamPlayer));
      if (r.white.length === 5 && r.black.length === 5) return { white: r.white, black: r.black, fromArchive: false };
    }
    return null;
  })();
  const validation = teams ? validateScorers(result, teams.white, teams.black) : { error: null, warnings: [] };
  const canArchive = Boolean(teams) && !validation.error;

  const handleArchiveMatch = async () => {
    if (!teams) {
      notify('Prima genera le squadre nella sezione Squadre: il risultato viene salvato sulle squadre generate.');
      return;
    }
    if (validation.error) {
      notify(validation.error);
      return;
    }
    if (isAlreadyClosed && !(await askConfirm('Questa partita è già archiviata. Vuoi aggiornare il risultato? Le squadre restano quelle archiviate; vittorie/pareggi/sconfitte vengono corretti, non sommati di nuovo.'))) {
      return;
    }

    setIsArchiving(true);
    setArchiveSuccessMessage('');
    try {
      await saveMatchResult({
        date: closingDate,
        scoreWhite: result.scoreWhite,
        scoreBlack: result.scoreBlack,
        teamWhite: teams.white,
        teamBlack: teams.black,
        mvpPlayerId: result.mvpPlayerId || null,
        scorers: result.scorers,
        penaltySaves: result.penaltySaves || [],
        totalCost: effectiveMatchCost(closingMatch, standardMatchCost, fieldCostFor(closingMatch, fields, defaultFieldId)),
        closedBy: profile?.id || '',
      });
      setArchiveSuccessMessage(
        `Partita del ${formatItalianDate(closingDate)} salvata! V/P/S aggiornati nei profili. La trovi nella pagina Storico.`
      );
      setTimeout(() => setArchiveSuccessMessage(''), 8000);
    } catch (err) {
      console.error('Archiviazione fallita:', err);
      notify('Errore durante il salvataggio della partita. Controlla la connessione e riprova.');
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 2. ELEZIONE GIORNO UFFICIALE (a tendina) & CTA GENERATORE SQUADRE */}
      <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDaysOpen((o) => !o)}
            aria-expanded={daysOpen}
            className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
          >
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Calendar className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                Giorno ufficiale
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Ufficiale: <strong className="text-emerald-300">{formatItalianDate(activeDate)}</strong>
                {firstToTenByWeek.size > 0 && (
                  <>
                    {' '}· 🥇 primo a 10:{' '}
                    <strong className="text-amber-300">
                      {Array.from(firstToTenByWeek).map((d) => formatItalianDate(d)).join(', ')}
                    </strong>
                  </>
                )}
              </p>
            </div>
            <ChevronDown className={`h-5 w-5 text-slate-400 flex-shrink-0 transition-transform ${daysOpen ? 'rotate-180' : ''}`} />
          </button>

          <Link
            href={`/squadre?date=${activeDate}`}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Vai a squadre</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {daysOpen && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <p className="text-xs text-slate-400">
              Tocca un giorno per impostarlo come partita ufficiale. In evidenza (🥇) il giorno che per primo ha raggiunto 10 iscritti nella settimana.
            </p>
        {/* Card Selettore Orizzontale a Radio Button per i Giorni */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
          {days.map((day) => {
            const isOfficial = activeDate === day.dateString;
            const count = presences.filter(
              (p) => p.date === day.dateString && p.status === 'confirmed'
            ).length;
            const hasQuorum = count >= 10;
            const isFirstToTen = firstToTenByWeek.has(day.dateString);

            return (
              <button
                key={day.dateString}
                type="button"
                onClick={() => onSelectDate(day.dateString)}
                className={`flex flex-col items-center justify-between p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                  isOfficial
                    ? 'bg-emerald-500/15 border-emerald-500 text-white ring-2 ring-emerald-500/60'
                    : isFirstToTen
                    ? 'bg-amber-500/10 border-amber-400 text-white ring-2 ring-amber-400/50'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    {day.dayName.slice(0, 3)}
                  </span>
                  {isOfficial && (
                    <span className="text-[10px] text-amber-400 font-bold">★</span>
                  )}
                </div>

                <div className="text-xl font-bold my-1 text-white">{day.dayNumber}</div>
                <div className="text-[10px] text-slate-400">{day.monthName}</div>

                <div className="mt-2 w-full pt-1.5 border-t border-slate-800 flex items-center justify-center gap-1 font-mono text-[10px]">
                  <span className={`font-bold ${hasQuorum ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {count}/10
                  </span>
                  {hasQuorum && (
                    <span className="text-[9px] bg-emerald-500 text-slate-950 px-1 rounded font-bold">
                      OK
                    </span>
                  )}
                </div>
                {isFirstToTen && (
                  <div className="mt-1 text-[9px] font-bold uppercase text-amber-300 leading-tight">🥇 Primo a 10</div>
                )}
              </button>
            );
          })}
        </div>
          </div>
        )}
      </div>

      {/* 3. TRACCIAMENTO CASSA & PAGAMENTI QUOTA CAMPO (a tendina) */}
      <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl space-y-4">
        <button
          type="button"
          onClick={() => setCashOpen((o) => !o)}
          aria-expanded={cashOpen}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Coins className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              Cassa
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              €{totalCollected.toFixed(2)} di €{totalMatchCost} · {paidCount}/10 pagati · €{costPerPlayer.toFixed(2)} a testa
            </p>
          </div>
          <ChevronDown className={`h-5 w-5 text-slate-400 flex-shrink-0 transition-transform ${cashOpen ? 'rotate-180' : ''}`} />
        </button>

        {cashOpen && (
          <>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={handleSetAllPaid}
                className="flex items-center gap-1 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-bold rounded-xl text-xs border border-emerald-500/30 transition-all cursor-pointer"
              >
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Segna Tutti Pagati</span>
              </button>
              <button
                type="button"
                onClick={handleResetPayments}
                className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Cassa</span>
              </button>
            </div>

        {/* Progress Bar Finanziaria */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">
              Incassato: <strong className="text-white">€{totalCollected.toFixed(2)}</strong> di €{totalMatchCost}.00
            </span>
            <span className="text-emerald-400 font-bold">{progressPercent}% saldato</span>
          </div>
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Griglia 10 Titolari con Badge Toggle Pagato/Da Saldare */}
        {starterProfiles.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/50 rounded-2xl border border-dashed border-slate-800">
            Nessun titolare iscritto per questa giornata. Le quote appariranno man mano che i giocatori si iscrivono.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {starterProfiles.map((player, idx) => {
              const isPaid = Boolean(paymentsRecord.payments[player.id]);
              return (
                <div
                  key={player.id}
                  onClick={() => handleTogglePayment(player.id)}
                  className={`p-3 rounded-2xl border flex flex-col justify-between gap-2 transition-all cursor-pointer select-none ${
                    isPaid
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-[10px] text-slate-500 w-4">{idx + 1}.</span>
                    <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-emerald-400">
                      {player.full_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold text-xs truncate flex-1">{player.full_name}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                    <span className="text-[11px] font-mono text-slate-400">€{costPerPlayer.toFixed(2)}</span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                        isPaid
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {isPaid ? (
                        <>
                          <Check className="h-3 w-3" /> Pagato
                        </>
                      ) : (
                        <>
                          <Clock className="h-3 w-3" /> Da Saldare
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>

      {/* 4. MODULO CHIUSURA MATCH POST-PARTITA */}
      <div className="bg-slate-900 p-4 sm:p-5 rounded-2xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400 flex-shrink-0" /> Chiusura partita
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Risultato, marcatori e MVP: al salvataggio si aggiornano vittorie, pareggi e sconfitte.
            </p>
          </div>
        </div>

        {/* Quale partita chiudere: pillole con la data e lo stato (ultimi 30 giorni + giorno ufficiale) */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-300">Partita</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none" role="radiogroup" aria-label="Partita da chiudere">
            {closingOptions.map((d) => {
              const [y, m, dd] = d.split('-').map(Number);
              const dt = new Date(y, m - 1, dd);
              const selected = d === closingDate;
              const archived = archivedDates.has(d);
              const status = archived ? 'Archiviata' : d === activeDate ? 'Ufficiale' : 'Da chiudere';
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setClosingDate(d)}
                  className={`flex-shrink-0 flex flex-col items-center w-[4.75rem] py-2.5 rounded-2xl transition-colors ${
                    selected ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className={`text-xs font-medium capitalize ${selected ? 'text-slate-900' : 'text-slate-400'}`}>
                    {dt.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '')}
                  </span>
                  <span className="text-xl font-bold leading-tight">{dd}</span>
                  <span className={`text-[11px] ${selected ? 'text-slate-900' : 'text-slate-400'}`}>
                    {dt.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')}
                  </span>
                  <span
                    className={`mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      selected
                        ? 'bg-slate-950/15 text-slate-950'
                        : archived
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : d === activeDate
                        ? 'bg-slate-700 text-white'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {status}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">Il giorno ufficiale e le partite degli ultimi 30 giorni con squadre salvate.</p>
        </div>

        {isAlreadyClosed && !archiveSuccessMessage && (
          <div className="p-3 bg-slate-800/60 border border-slate-700 text-slate-300 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>
              Partita già archiviata ({closingMatch?.score_white ?? 0} - {closingMatch?.score_black ?? 0}). Puoi correggere i dati e risalvare.{' '}
              <Link href="/history" className="text-emerald-400 underline">Vai allo Storico</Link>
            </span>
          </div>
        )}

        {archiveSuccessMessage && (
          <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>{archiveSuccessMessage}</span>
          </div>
        )}

        {teams ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {([['⚪ Bianchi', teams.white], ['⚫ Neri', teams.black]] as const).map(([title, list]) => (
                <div key={title} className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-1">
                  <div className="text-xs font-bold text-slate-300">{title}</div>
                  {list.map((p) => (
                    <div key={p.id} className="truncate text-slate-200">{p.name}</div>
                  ))}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              {teams.fromArchive ? (
                <>Squadre archiviate: per correggerle usa la matita nello <Link href="/history" className="text-emerald-400 underline">Storico</Link>.</>
              ) : (
                <>Squadre prese dalla sezione <Link href={`/squadre?date=${closingDate}`} className="text-emerald-400 underline">Squadre</Link>: se sono sbagliate correggile lì prima di salvare.</>
              )}
            </p>
            <MatchResultFields fixedKeeper={fixedKeeper} value={result} onChange={setResult} white={teams.white} black={teams.black} mvpVotes={mvpVotes} />
          </>
        ) : (
          <div className="rounded-2xl bg-slate-950/60 py-8 px-4 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-200">Squadre non ancora pronte</p>
            <p className="text-sm text-slate-400 max-w-sm mx-auto">
              Il risultato si salva sulle squadre: prima generale (5 contro 5) per questa partita.
            </p>
            <Link
              href={`/squadre?date=${closingDate}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-sm"
            >
              Vai a squadre
            </Link>
          </div>
        )}

        {/* CTA Salva & Archivia Partita (solo quando le squadre ci sono) */}
        {teams && (
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={handleArchiveMatch}
            disabled={isArchiving || !canArchive}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-sm transition-colors disabled:opacity-40 cursor-pointer"
          >
            {isArchiving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trophy className="h-4 w-4" />
            )}
            <span>{isAlreadyClosed ? 'Aggiorna risultato' : 'Salva e archivia partita'}</span>
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
