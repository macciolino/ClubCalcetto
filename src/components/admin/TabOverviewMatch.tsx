'use client';

import { NumberInput } from '@/components/NumberInput';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Profile, Presence, Match, GeneratedTeamRecord, MatchScorer, MatchTeamPlayer } from '@/types/database';
import { useAuth } from '@/lib/context/AuthContext';
import { effectiveMatchCost } from '@/lib/utils/matchUtils';
import { subscribeMatch, subscribeMatches, saveMatchResult } from '@/lib/firebase/firestoreService';
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
  DollarSign
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
  const [scoreWhite, setScoreWhite] = useState<number>(0);
  const [scoreBlack, setScoreBlack] = useState<number>(0);
  const [mvpPlayerId, setMvpPlayerId] = useState<string>('');
  const [scorers, setScorers] = useState<MatchScorer[]>([]);
  const [newScorerId, setNewScorerId] = useState<string>('');
  const [newScorerGoals, setNewScorerGoals] = useState<number>(1);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveSuccessMessage, setArchiveSuccessMessage] = useState('');

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
    setScoreWhite(0);
    setScoreBlack(0);
    setMvpPlayerId('');
    setScorers([]);
  }, [activeDate]);
  useEffect(() => {
    if (
      savedMatch?.status === 'completed' &&
      savedMatch.match_date === activeDate &&
      prefilledFor.current !== activeDate
    ) {
      prefilledFor.current = activeDate;
      setScoreWhite(savedMatch.score_white ?? 0);
      setScoreBlack(savedMatch.score_black ?? 0);
      setMvpPlayerId(savedMatch.mvp_player_id || '');
      setScorers(savedMatch.scorers || []);
    }
  }, [activeDate, savedMatch]);

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

  // Handlers Marcatori
  const handleAddScorer = () => {
    if (!newScorerId) return;
    const player = players.find((p) => p.id === newScorerId);
    setScorers((prev) => {
      const existing = prev.find((s) => s.player_id === newScorerId);
      if (existing) {
        return prev.map((s) =>
          s.player_id === newScorerId ? { ...s, goals: s.goals + newScorerGoals } : s
        );
      }
      return [
        ...prev,
        {
          player_id: newScorerId,
          player_name: player?.full_name || 'Giocatore',
          goals: newScorerGoals,
        },
      ];
    });
    setNewScorerId('');
    setNewScorerGoals(1);
  };

  const handleRemoveScorer = (playerId: string) => {
    setScorers((prev) => prev.filter((s) => s.player_id !== playerId));
  };

  // Chiusura & Archiviazione Partita (si può risalvare per correggere: nulla viene contato due volte)
  const toTeam = (list: Profile[]): MatchTeamPlayer[] => list.map((p) => ({ id: p.id, name: p.full_name }));
  const resolveTeams = (): { white: MatchTeamPlayer[]; black: MatchTeamPlayer[] } | null => {
    if (savedMatch?.team_white?.length && savedMatch?.team_black?.length) {
      return { white: savedMatch.team_white, black: savedMatch.team_black };
    }
    if (generatedTeamRecord?.team_white?.length && generatedTeamRecord?.team_black?.length) {
      return { white: toTeam(generatedTeamRecord.team_white), black: toTeam(generatedTeamRecord.team_black) };
    }
    if (starterProfiles.length >= 10) {
      return { white: toTeam(starterProfiles.slice(0, 5)), black: toTeam(starterProfiles.slice(5, 10)) };
    }
    return null;
  };
  const canArchive = Boolean(resolveTeams());

  const handleArchiveMatch = async () => {
    const teams = resolveTeams();
    if (!teams) {
      alert('Servono 10 convocati confermati (o le squadre generate) per archiviare la partita.');
      return;
    }
    if (isAlreadyClosed && !confirm('Questa partita è già archiviata. Vuoi aggiornare il risultato? Vittorie/pareggi/sconfitte verranno corretti, non sommati di nuovo.')) {
      return;
    }

    setIsArchiving(true);
    setArchiveSuccessMessage('');
    try {
      await saveMatchResult({
        date: activeDate,
        scoreWhite,
        scoreBlack,
        teamWhite: teams.white,
        teamBlack: teams.black,
        mvpPlayerId: mvpPlayerId || null,
        scorers,
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

      {/* 2. ELEZIONE GIORNO UFFICIALE & CTA GENERATORE SQUADRE */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-400" />
              Elezione Giorno Ufficiale Partita
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Clicca su uno dei giorni con quorum per impostarlo come match ufficiale della settimana.
            </p>
          </div>

          <Link
            href={`/squadre?date=${activeDate}`}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Generatore Squadre 5v5</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Card Selettore Orizzontale a Radio Button per i Giorni */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
          {days.map((day) => {
            const isOfficial = activeDate === day.dateString;
            const count = presences.filter(
              (p) => p.date === day.dateString && p.status === 'confirmed'
            ).length;
            const hasQuorum = count >= 10;

            return (
              <button
                key={day.dateString}
                type="button"
                onClick={() => onSelectDate(day.dateString)}
                className={`flex flex-col items-center justify-between p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                  isOfficial
                    ? 'bg-emerald-500/15 border-emerald-500 text-white ring-2 ring-emerald-500/60 shadow-lg'
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
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. TRACCIAMENTO CASSA & PAGAMENTI QUOTA CAMPO */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Coins className="h-4 w-4 text-emerald-400" />
              Cassa & Pagamenti Quota Campo ({formatItalianDate(activeDate)})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tieni traccia delle quote pagate dai 10 titolari in tempo reale (€{costPerPlayer.toFixed(2)} a testa).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSetAllPaid}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-bold rounded-xl text-xs border border-emerald-500/30 transition-all cursor-pointer"
            >
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span>Segna Tutti Pagati</span>
            </button>
            <button
              type="button"
              onClick={handleResetPayments}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-rose-400 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Cassa</span>
            </button>
          </div>
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
            Inserisci il tabellino finale (risultato, marcatori e MVP). Al salvataggio, i record di vittoria, pareggio e sconfitta (V/P/S) verranno aggiornati nei profili.
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Risultato Finale: Bianca vs Nera */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>⚽ Risultato Finale 5v5</span>
            </h3>

            <div className="flex items-center justify-around gap-3 pt-2">
              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-white block">⚪ Bianca</span>
                <NumberInput
                  min={0}
                  max={50}
                  value={scoreWhite}
                  onValueChange={setScoreWhite}
                  className="w-16 h-14 bg-slate-900 border-2 border-slate-700 text-center text-2xl font-black text-white rounded-xl focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <span className="text-xl font-black text-slate-600">-</span>

              <div className="text-center space-y-1">
                <span className="text-xs font-bold text-white block">⚫ Nera</span>
                <NumberInput
                  min={0}
                  max={50}
                  value={scoreBlack}
                  onValueChange={setScoreBlack}
                  className="w-16 h-14 bg-slate-900 border-2 border-slate-700 text-center text-2xl font-black text-white rounded-xl focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="text-center pt-2">
              <span className="text-[11px] font-mono text-emerald-400 font-bold uppercase">
                {scoreWhite > scoreBlack
                  ? 'Vittoria Squadra Bianca'
                  : scoreBlack > scoreWhite
                  ? 'Vittoria Squadra Nera'
                  : 'Pareggio'}
              </span>
            </div>
          </div>

          {/* MVP Partita */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Star className="h-4 w-4 text-amber-400" />
              <span>MVP (Miglior Giocatore)</span>
            </h3>

            <p className="text-[11px] text-slate-400">
              Seleziona il calciatore che ha fatto la differenza durante il match:
            </p>

            <select
              value={mvpPlayerId}
              onChange={(e) => setMvpPlayerId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-amber-400"
            >
              <option value="">-- Seleziona MVP --</option>
              {starterProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  ★ {p.full_name} ({p.overall_rating})
                </option>
              ))}
            </select>

            {mvpPlayerId && (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                <span>
                  {starterProfiles.find((p) => p.id === mvpPlayerId)?.full_name} premiato come Man of the Match!
                </span>
              </div>
            )}
          </div>

          {/* Tabellino Marcatori */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Marcatori
            </h3>

            {/* Aggiunta Marcatore */}
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <select
                  value={newScorerId}
                  onChange={(e) => setNewScorerId(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-800 text-slate-300 rounded-lg text-xs"
                >
                  <option value="">Aggiungi marcatore...</option>
                  {starterProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
                <NumberInput
                  min={1}
                  max={15}
                  value={newScorerGoals}
                  onValueChange={setNewScorerGoals}
                  className="w-12 px-1.5 py-1.5 bg-slate-900 border border-slate-800 text-white rounded-lg text-xs text-center"
                />
                <button
                  type="button"
                  onClick={handleAddScorer}
                  className="px-2.5 py-1.5 bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Lista Marcatori Aggiunti */}
              {scorers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {scorers.map((s) => (
                    <span
                      key={s.player_id}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-900 border border-slate-800 text-emerald-300 text-[10px] rounded-lg font-bold"
                    >
                      ⚽ {s.player_name} ({s.goals})
                      <button
                        type="button"
                        onClick={() => handleRemoveScorer(s.player_id)}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

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
