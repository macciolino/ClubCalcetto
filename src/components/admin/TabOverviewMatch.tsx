'use client';

import { useFormSettings } from '@/lib/hooks/useForms';
import { MatchResultFields, MatchResultValue, validateScorers } from '@/components/MatchResultFields';
import { reconcileTeams, toTeamPlayer } from '@/lib/utils/teamUtils';
import { firstToTenByWeek as computeFirstToTen } from '@/lib/utils/presenceRanking';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Profile, Presence, Match, GeneratedTeamRecord } from '@/types/database';

const EMPTY_RESULT: MatchResultValue = { scoreWhite: 0, scoreBlack: 0, mvpPlayerId: '', scorers: [] };
import { useAuth } from '@/lib/context/AuthContext';
import { effectiveMatchCost } from '@/lib/utils/matchUtils';
import { subscribeMatch, subscribeMatches, saveMatchResult, subscribeMvpVotes, countMvpVotes } from '@/lib/firebase/firestoreService';
import { CalendarDay, formatItalianDate } from '@/lib/utils/dateUtils';
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
}

export function TabOverviewMatch({
  days,
  activeDate,
  onSelectDate,
  players,
  presences,
  generatedTeamRecord,
  totalMatchCost: standardMatchCost = 80,
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

  // Quota: quella della partita se impostata, altrimenti il costo standard dell'admin
  const totalMatchCost = effectiveMatchCost(savedMatch, standardMatchCost);

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
  const [cashOpen, setCashOpen] = useState(false);
  const [daysOpen, setDaysOpen] = useState(false);

  // Partite archiviate totali
  const [archivedMatchesCount, setArchivedMatchesCount] = useState(0);

  useEffect(() => {
    const unsub = subscribeMatches((list) =>
      setArchivedMatchesCount(list.filter((m) => m.status === 'completed').length)
    );
    return () => unsub();
  }, []);

  // Ricarica nel modulo il tabellino già salvato (una volta per data, senza cancellare ciò che stai scrivendo)
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    // Cambio data: modulo vuoto, poi eventualmente ricaricato dalla partita salvata
    prefilledFor.current = null;
    setResult(EMPTY_RESULT);
  }, [activeDate]);
  useEffect(() => {
    if (
      savedMatch?.status === 'completed' &&
      savedMatch.match_date === activeDate &&
      prefilledFor.current !== activeDate
    ) {
      prefilledFor.current = activeDate;
      setResult({
        scoreWhite: savedMatch.score_white ?? 0,
        scoreBlack: savedMatch.score_black ?? 0,
        mvpPlayerId: savedMatch.mvp_player_id || '',
        scorers: savedMatch.scorers || [],
        penaltySaves: savedMatch.penalty_saves || [],
      });
    }
  }, [activeDate, savedMatch]);

  // Voti MVP dei giocatori per questa partita: il più votato viene proposto (l'admin può scegliere chiunque)
  const [mvpVotes, setMvpVotes] = useState<{ playerId: string; count: number }[]>([]);
  useEffect(() => {
    setMvpVotes([]);
    const unsub = subscribeMvpVotes(activeDate, (votes) => setMvpVotes(countMvpVotes(votes)));
    return () => unsub();
  }, [activeDate]);
  const proposedFor = useRef<string | null>(null);
  useEffect(() => {
    if (proposedFor.current === activeDate || savedMatch?.status === 'completed' || !mvpVotes[0]) return;
    proposedFor.current = activeDate;
    setResult((r) => (r.mvpPlayerId ? r : { ...r, mvpPlayerId: mvpVotes[0].playerId }));
  }, [activeDate, mvpVotes, savedMatch?.status]);

  // Per ogni settimana: il giorno che ha raggiunto PER PRIMO 10 iscritti
  const firstToTenByWeek = computeFirstToTen(days, presences);

  const isAlreadyClosed = savedMatch?.status === 'completed';

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
    if (savedMatch?.status === 'completed' && savedMatch.team_white?.length && savedMatch.team_black?.length) {
      return { white: savedMatch.team_white, black: savedMatch.team_black, fromArchive: true };
    }
    if (generatedTeamRecord?.team_white?.length && generatedTeamRecord?.team_black?.length) {
      const r = reconcileTeams(generatedTeamRecord, starterProfiles.map(toTeamPlayer));
      if (r.white.length === 5 && r.black.length === 5) return { white: r.white, black: r.black, fromArchive: false };
    }
    return null;
  })();
  const validation = teams ? validateScorers(result, teams.white, teams.black) : { error: null, warnings: [] };
  const canArchive = Boolean(teams) && !validation.error;

  const handleArchiveMatch = async () => {
    if (!teams) {
      alert('Prima genera le squadre nella sezione Squadre: il risultato viene salvato sulle squadre generate.');
      return;
    }
    if (validation.error) {
      alert(validation.error);
      return;
    }
    if (isAlreadyClosed && !confirm('Questa partita è già archiviata. Vuoi aggiornare il risultato? Le squadre restano quelle archiviate; vittorie/pareggi/sconfitte vengono corretti, non sommati di nuovo.')) {
      return;
    }

    setIsArchiving(true);
    setArchiveSuccessMessage('');
    try {
      await saveMatchResult({
        date: activeDate,
        scoreWhite: result.scoreWhite,
        scoreBlack: result.scoreBlack,
        teamWhite: teams.white,
        teamBlack: teams.black,
        mvpPlayerId: result.mvpPlayerId || null,
        scorers: result.scorers,
        penaltySaves: result.penaltySaves || [],
        totalCost: totalMatchCost,
        closedBy: profile?.id || '',
      });
      setArchiveSuccessMessage(
        `Partita del ${formatItalianDate(activeDate)} salvata! V/P/S aggiornati nei profili. La trovi nella pagina Storico.`
      );
      setTimeout(() => setArchiveSuccessMessage(''), 8000);
    } catch (err) {
      console.error('Archiviazione fallita:', err);
      alert('Errore durante il salvataggio della partita. Controlla la connessione e riprova.');
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. KPI CARDS IN EVIDENZA */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Iscritti Totali */}
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Iscritti Rosa
            </span>
            <div className="text-2xl sm:text-3xl font-black text-white">{players.length}</div>
            <span className="text-[10px] text-slate-500 font-medium">Giocatori censiti</span>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-2xl ring-1 ring-blue-500/30">
            <Users className="h-6 w-6" />
          </div>
        </div>

        {/* Titolari Pronti Oggi */}
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Quorum Titolari
            </span>
            <div
              className={`text-2xl sm:text-3xl font-black ${
                starterProfiles.length >= 10 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {starterProfiles.length}/10
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              {starterProfiles.length >= 10 ? 'Quorum Raggiunto!' : 'In attesa convocati'}
            </span>
          </div>
          <div
            className={`p-3 rounded-2xl ring-1 ${
              starterProfiles.length >= 10
                ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 ring-amber-500/30'
            }`}
          >
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>

        {/* Cassa & Incasso Quote */}
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Cassa Campo
            </span>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">
              €{totalCollected.toFixed(0)} <span className="text-slate-500 text-sm">/ €{totalMatchCost}</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold">{paidCount}/10 Pagati</span>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl ring-1 ring-emerald-500/30">
            <Coins className="h-6 w-6" />
          </div>
        </div>

        {/* Partite Archiviate */}
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Partite Concluse
            </span>
            <div className="text-2xl sm:text-3xl font-black text-white">{archivedMatchesCount}</div>
            <span className="text-[10px] text-slate-500 font-medium">Storico archiviato</span>
          </div>
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-2xl ring-1 ring-purple-500/30">
            <Trophy className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* 2. ELEZIONE GIORNO UFFICIALE (a tendina) & CTA GENERATORE SQUADRE */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDaysOpen((o) => !o)}
            aria-expanded={daysOpen}
            className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
          >
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Calendar className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                Elezione Giorno Ufficiale Partita
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
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Generatore Squadre 5v5</span>
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
                    ? 'bg-emerald-500/15 border-emerald-500 text-white ring-2 ring-emerald-500/60 shadow-lg'
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
                    <span className="text-[10px] text-amber-400 font-black">★</span>
                  )}
                </div>

                <div className="text-xl font-black my-1 text-white">{day.dayNumber}</div>
                <div className="text-[10px] text-slate-400">{day.monthName}</div>

                <div className="mt-2 w-full pt-1.5 border-t border-slate-800 flex items-center justify-center gap-1 font-mono text-[10px]">
                  <span className={`font-black ${hasQuorum ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {count}/10
                  </span>
                  {hasQuorum && (
                    <span className="text-[9px] bg-emerald-500 text-slate-950 px-1 rounded font-black">
                      OK
                    </span>
                  )}
                </div>
                {isFirstToTen && (
                  <div className="mt-1 text-[9px] font-black uppercase text-amber-300 leading-tight">🥇 Primo a 10</div>
                )}
              </button>
            );
          })}
        </div>
          </div>
        )}
      </div>

      {/* 3. TRACCIAMENTO CASSA & PAGAMENTI QUOTA CAMPO (a tendina) */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
        <button
          type="button"
          onClick={() => setCashOpen((o) => !o)}
          aria-expanded={cashOpen}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Coins className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              Cassa & Pagamenti ({formatItalianDate(activeDate)})
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
              className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-500 shadow-md"
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
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-white shadow-emerald-500/10'
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
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${
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
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-5">
        <div className="border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-wider">
              Chiusura Match Post-Partita & Aggiornamento Palmarès
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Inserisci risultato, marcatori e MVP. Al salvataggio vittorie, pareggi e sconfitte vengono aggiornati nei profili.
          </p>
        </div>

        {isAlreadyClosed && !archiveSuccessMessage && (
          <div className="p-3 bg-slate-800/60 border border-slate-700 text-slate-300 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>
              Partita già archiviata ({savedMatch?.score_white ?? 0} - {savedMatch?.score_black ?? 0}). Puoi correggere i dati e risalvare.{' '}
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
                  <div className="text-xs font-black uppercase tracking-wider text-slate-300">{title}</div>
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
                <>Squadre prese dalla sezione <Link href={`/squadre?date=${activeDate}`} className="text-emerald-400 underline">Squadre</Link>: se sono sbagliate correggile lì prima di salvare.</>
              )}
            </p>
            <MatchResultFields fixedKeeper={fixedKeeper} value={result} onChange={setResult} white={teams.white} black={teams.black} mvpVotes={mvpVotes} />
          </>
        ) : (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-2xl text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              Per salvare il risultato servono le squadre complete (5 contro 5) generate nella sezione{' '}
              <Link href={`/squadre?date=${activeDate}`} className="underline font-bold">Squadre</Link>.
            </span>
          </div>
        )}

        {/* CTA Salva & Archivia Partita */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={handleArchiveMatch}
            disabled={isArchiving || !canArchive}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 disabled:opacity-40 cursor-pointer"
          >
            {isArchiving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trophy className="h-4 w-4" />
            )}
            <span>{isAlreadyClosed ? 'Aggiorna Risultato' : 'Salva e Archivia Partita'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
