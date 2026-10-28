'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { Profile, Presence, Match, GeneratedTeamRecord } from '@/types/database';
import { 
  subscribeMatch, 
  saveMatchDoc, 
  subscribeGeneratedTeams, 
  saveGeneratedTeamsDoc, 
  subscribePresences, 
  subscribeProfiles 
} from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { getStoredPlayers } from '@/lib/services/playerService';
import { 
  getStoredPresences, 
  saveStoredPresences, 
  getOfficialMatchDate, 
  setOfficialMatchDate 
} from '@/lib/services/presenceService';
import { balanceTeams, BalancedTeamsResult, getPlayerOverallRating } from '@/lib/algorithm/teamBalancer';
import { VirtualPitch } from '@/components/VirtualPitch';
import { StatBadge } from '@/components/StatBadge';
import { getUpcomingDays, formatItalianDate } from '@/lib/utils/dateUtils';
import { generateWhatsAppMessage, getWhatsAppShareUrl, copyToClipboard } from '@/lib/utils/whatsapp';
import { toPng } from 'html-to-image';
import { TacticalAnalysisResult } from '@/lib/gemini/client';
import { 
  Trophy, 
  Sparkles, 
  Share2, 
  Copy, 
  Download, 
  MapPin, 
  Clock, 
  Coins, 
  Check, 
  AlertCircle,
  Shuffle,
  Shield,
  Zap,
  Loader2,
  Bot
} from 'lucide-react';

const DEMO_10_PLAYERS: Profile[] = [
  {
    id: 'p-1',
    user_id: 'u-1',
    email: 'macciolino84@gmail.com',
    full_name: 'Marco B.',
    avatar_url: null,
    role: 'admin',
    is_guest: false,
    stats: { Resistenza: 8, Velocità: 8, Difesa: 7, Tiro: 8, Passaggio: 8, Tecnica: 9, Fisico: 7, Dribbling: 8 },
    overall_rating: 7.9,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-2',
    user_id: null,
    email: null,
    full_name: 'Luca B.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 9, Velocità: 8, Difesa: 8, Tiro: 7, Passaggio: 7, Tecnica: 7, Fisico: 8, Dribbling: 7 },
    overall_rating: 7.8,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-3',
    user_id: null,
    email: null,
    full_name: 'Andrea M.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 7, Velocità: 9, Difesa: 6, Tiro: 8, Passaggio: 8, Tecnica: 9, Fisico: 6, Dribbling: 9 },
    overall_rating: 7.6,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-4',
    user_id: null,
    email: null,
    full_name: 'Giovanni R.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 6, Velocità: 6, Difesa: 9, Tiro: 6, Passaggio: 7, Tecnica: 6, Fisico: 9, Dribbling: 6 },
    overall_rating: 6.9,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-5',
    user_id: null,
    email: null,
    full_name: 'Davide P.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 8, Velocità: 7, Difesa: 7, Tiro: 8, Passaggio: 7, Tecnica: 7, Fisico: 7, Dribbling: 7 },
    overall_rating: 7.3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-6',
    user_id: null,
    email: null,
    full_name: 'Matteo C.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 7, Velocità: 7, Difesa: 8, Tiro: 6, Passaggio: 8, Tecnica: 8, Fisico: 7, Dribbling: 7 },
    overall_rating: 7.3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-7',
    user_id: null,
    email: null,
    full_name: 'Francesco L.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 6, Velocità: 7, Difesa: 6, Tiro: 9, Passaggio: 7, Tecnica: 8, Fisico: 6, Dribbling: 8 },
    overall_rating: 7.1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-8',
    user_id: null,
    email: null,
    full_name: 'Alessandro S.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 9, Velocità: 8, Difesa: 7, Tiro: 7, Passaggio: 8, Tecnica: 8, Fisico: 8, Dribbling: 8 },
    overall_rating: 7.9,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-9',
    user_id: null,
    email: null,
    full_name: 'Simone T.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 8, Velocità: 6, Difesa: 8, Tiro: 6, Passaggio: 7, Tecnica: 7, Fisico: 8, Dribbling: 6 },
    overall_rating: 7.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'p-10',
    user_id: null,
    email: null,
    full_name: 'Federico N.',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 7, Velocità: 8, Difesa: 7, Tiro: 8, Passaggio: 8, Tecnica: 8, Fisico: 7, Dribbling: 7 },
    overall_rating: 7.5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function SquadreContent() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const { user, profile, isAdmin } = useAuth();

  const [selectedDate, setSelectedDate] = useState<string>(() =>
    dateParam || getOfficialMatchDate()
  );
  const [matchTime, setMatchTime] = useState('20:30');
  const [matchLocation, setMatchLocation] = useState('Centro Sportivo Calcetto - Campo 3');
  const [totalCost, setTotalCost] = useState(80.0);

  const [presences, setPresences] = useState<Presence[]>(() =>
    getStoredPresences(dateParam || getUpcomingDays(7)[0]?.dateString)
  );
  const [profiles, setProfiles] = useState<Profile[]>(() => getStoredPlayers());
  const [balancedResult, setBalancedResult] = useState<BalancedTeamsResult | null>(() => {
    const p = getStoredPlayers();
    return p.length >= 10 ? balanceTeams(p.slice(0, 10)) : null;
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<TacticalAnalysisResult | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const pitchRef = useRef<HTMLDivElement>(null);

  const handleGenerateAiAnalysis = async () => {
    if (!balancedResult) return;
    setIsAiLoading(true);
    try {
      const res = await fetch('/api/ai/tactical-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamWhite: balancedResult.teamWhite,
          teamBlack: balancedResult.teamBlack,
          matchInfo: {
            date: selectedDate,
            time: matchTime,
            location: matchLocation,
            totalCost,
          },
        }),
      });
      const data = await res.json();
      setAiAnalysis(data);
    } catch (err) {
      console.error('AI preview error:', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Inizializza data di default se non impostata da query param
  useEffect(() => {
    if (!selectedDate) {
      const defaultDate = getOfficialMatchDate();
      setSelectedDate(defaultDate);
    }
  }, [selectedDate]);

  // Sincronizzazione in tempo reale con la data selezionata in Presenze o Admin
  useEffect(() => {
    const handleMatchDateChange = (e: any) => {
      const newDate = e.detail?.date || getOfficialMatchDate();
      if (newDate && newDate !== selectedDate) {
        setSelectedDate(newDate);
      }
    };
    window.addEventListener('clubcalcetto_match_date_changed', handleMatchDateChange);
    return () => {
      window.removeEventListener('clubcalcetto_match_date_changed', handleMatchDateChange);
    };
  }, [selectedDate]);

  // Caricamento presenze e profili per la data
  useEffect(() => {
    function loadMatchAndPresenceData() {
      try {
        // Carica tutti i profili dallo store
        const currentProfs = getStoredPlayers();
        setProfiles(currentProfs);

        // Carica presenze per la data
        const currentPres = getStoredPresences(selectedDate);
        setPresences(currentPres);

        // Calcola i 10 titolari
        const confirmed = currentPres.filter((p) => p.status === 'confirmed');
        const starters = confirmed
          .map((p) => currentProfs.find((prof) => prof.id === p.player_id || prof.user_id === p.player_id))
          .filter((prof): prof is Profile => prof !== undefined);

        if (starters.length >= 10) {
          // AUTO-GENERA SUBITO LE SQUADRE BILANCIATE QUANDO CI SONO 10 TITOLARI!
          const autoRes = balanceTeams(starters.slice(0, 10));
          setBalancedResult(autoRes);
        } else {
          setBalancedResult(null);
        }
      } catch (err) {
        console.warn('Load match error:', err);
      }
    }

    if (selectedDate) {
      loadMatchAndPresenceData();
    }

    // Sottoscrizioni Firestore opzionali
    let unsubMatch = () => {};
    let unsubTeams = () => {};
    let unsubPres = () => {};

    if (isFirebaseConfigured && selectedDate) {
      unsubMatch = subscribeMatch(selectedDate, (m) => {
        if (m) {
          setMatchTime(m.match_time?.slice(0, 5) || '20:30');
          setMatchLocation(m.location || 'Centro Sportivo Calcetto');
          setTotalCost(Number(m.total_cost || 80.0));
        }
      });

      unsubPres = subscribePresences(selectedDate, (pres) => {
        if (pres && pres.length > 0) {
          setPresences(pres);
          const currentProfs = getStoredPlayers();
          const confirmed = pres.filter((p) => p.status === 'confirmed');
          const starters = confirmed
            .map((p) => currentProfs.find((prof) => prof.id === p.player_id || prof.user_id === p.player_id))
            .filter((prof): prof is Profile => prof !== undefined);

          if (starters.length >= 10) {
            setBalancedResult(balanceTeams(starters.slice(0, 10)));
          }
        }
      });
    }

    const handlePresChange = () => {
      loadMatchAndPresenceData();
    };

    window.addEventListener('clubcalcetto_presences_changed', handlePresChange);
    window.addEventListener('clubcalcetto_players_changed', handlePresChange);
    return () => {
      window.removeEventListener('clubcalcetto_presences_changed', handlePresChange);
      window.removeEventListener('clubcalcetto_players_changed', handlePresChange);
      unsubMatch();
      unsubTeams();
      unsubPres();
    };
  }, [selectedDate]);

  // Calcola i 10 titolari
  const confirmedPresences = presences.filter((p) => p.status === 'confirmed');
  const starterProfiles: Profile[] = confirmedPresences
    .map((p) => profiles.find((prof) => prof.id === p.player_id || prof.user_id === p.player_id))
    .filter((prof): prof is Profile => prof !== undefined);

  // Helper per l'Admin: completa i 10 titolari con 1-click per questa data
  const handleFillDemoStarters = () => {
    const storedProfs = getStoredPlayers();
    const ten = storedProfs.slice(0, 10);
    const newPresences: Presence[] = ten.map((p, idx) => ({
      id: `pres-${p.id}-${Date.now()}`,
      date: selectedDate,
      player_id: p.id,
      status: 'confirmed',
      order_index: idx + 1,
      created_at: new Date().toISOString(),
    }));
    const allPres = getStoredPresences();
    const otherDates = allPres.filter((p) => p.date !== selectedDate);
    const updated = [...otherDates, ...newPresences];
    saveStoredPresences(updated);
    setPresences(newPresences);
    const res = balanceTeams(ten);
    setBalancedResult(res);
  };

  // Esecuzione Algoritmo di Bilanciamento Squadre
  const handleGenerateTeams = () => {
    setErrorMsg('');
    if (starterProfiles.length < 10) {
      setErrorMsg(`Sono necessari esattamente 10 giocatori confermati per generare le squadre. Attualmente: ${starterProfiles.length}/10.`);
      return;
    }

    setIsGenerating(true);
    try {
      // Esegui algoritmo deterministico sui primi 10 titolari
      const tenStarters = starterProfiles.slice(0, 10);
      const result = balanceTeams(tenStarters);
      setBalancedResult(result);

      // Salva match e squadre generate su Firebase Firestore se connesso
      saveMatchDoc({
        id: selectedDate,
        match_date: selectedDate,
        match_time: matchTime,
        location: matchLocation,
        total_cost: totalCost,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      saveGeneratedTeamsDoc({
        id: selectedDate,
        date: selectedDate,
        team_white: result.teamWhite,
        team_black: result.teamBlack,
        white_score_avg: result.whiteStats.overallAvg,
        black_score_avg: result.blackStats.overallAvg,
        created_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      console.error('Generazione fallita:', err);
      const msg = err instanceof Error ? err.message : 'Errore algoritmo';
      setErrorMsg(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Condivisione su WhatsApp + Generazione Screenshot del Campo
  const handleShareWhatsApp = async () => {
    if (!balancedResult) return;

    setIsSharing(true);
    try {
      // 1. Genera testo formattato
      const msg = generateWhatsAppMessage({
        date: selectedDate,
        time: matchTime,
        location: matchLocation,
        totalCost,
        teamWhite: balancedResult.teamWhite,
        teamBlack: balancedResult.teamBlack,
        whiteAvg: balancedResult.whiteStats.overallAvg,
        blackAvg: balancedResult.blackStats.overallAvg,
      });

      // 2. Copia negli appunti
      const copied = await copyToClipboard(msg);
      if (copied) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 4000);
      }

      // 3. Genera screenshot PNG del campo con html-to-image
      if (pitchRef.current) {
        try {
          const dataUrl = await toPng(pitchRef.current, {
            quality: 0.95,
            pixelRatio: 2,
            cacheBust: true,
          });

          // Scarica automaticamente l'immagine per permettere all'admin di allegarla
          const link = document.createElement('a');
          link.download = `ClubCalcetto-${selectedDate}-Squadre.png`;
          link.href = dataUrl;
          link.click();
        } catch (imgErr) {
          console.warn('Screenshot capture failed:', imgErr);
        }
      }

      // 4. Apri WhatsApp con il messaggio precompilato
      const waUrl = getWhatsAppShareUrl(msg);
      window.open(waUrl, '_blank');
    } catch (err) {
      console.error('Errore share WhatsApp:', err);
    } finally {
      setIsSharing(false);
    }
  };

  // Download solo immagine
  const handleDownloadPitchImage = async () => {
    if (!pitchRef.current) return;
    try {
      const dataUrl = await toPng(pitchRef.current, {
        quality: 0.95,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `ClubCalcetto-${selectedDate}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const costPerPerson = (Number(totalCost || 80) / 10).toFixed(2);

  return (
    <div className="space-y-6 pb-16">
      {/* Intestazione */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Trophy className="h-6 w-6 text-emerald-400" />
              Generatore Squadre Bilanciate 5v5
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Algoritmo combinatorio che distribuisce i 10 presenti tra Squadra Bianca e Nera minimizzando lo scarto delle abilità.
          </p>
        </div>

        {/* Status Quorum */}
        <div className="flex items-center gap-2.5 bg-slate-950 px-3.5 py-2 rounded-2xl border border-slate-800">
          <div className="text-right">
            <div className="text-[10px] text-slate-500 font-bold uppercase">Quorum Titolari</div>
            <div
              className={`font-mono font-black text-sm ${
                starterProfiles.length >= 10 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {starterProfiles.length}/10 Pronti
            </div>
          </div>
        </div>
      </div>

      {/* Form Impostazioni Evento (Admin & Match Info) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-400" />
            Configurazione Partita & Luogo
          </h2>
          <span className="text-xs font-mono text-emerald-400 font-bold">
            €{costPerPerson} a testa
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Selezione Data */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Data Partita</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setOfficialMatchDate(e.target.value);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Orario */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Ora Inizio</label>
            <input
              type="time"
              value={matchTime}
              onChange={(e) => setMatchTime(e.target.value)}
              disabled={!isAdmin}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-70"
            />
          </div>

          {/* Luogo Campo */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Luogo / Campo</label>
            <input
              type="text"
              value={matchLocation}
              onChange={(e) => setMatchLocation(e.target.value)}
              disabled={!isAdmin}
              placeholder="Es. Centro Sportivo"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-70"
            />
          </div>

          {/* Costo Totale */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Costo Totale (€)</label>
            <input
              type="number"
              step="5"
              value={totalCost}
              onChange={(e) => setTotalCost(parseFloat(e.target.value) || 0)}
              disabled={!isAdmin}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-70"
            />
          </div>
        </div>

        {/* Pulsante di Calcolo / Generazione Squadre */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            {starterProfiles.length >= 10 ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <Check className="h-4 w-4" /> 10 titolari confermati per il {formatItalianDate(selectedDate)}
              </span>
            ) : (
              <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Mancano ancora {10 - starterProfiles.length} giocatori per raggiungere 10
              </span>
            )}

            {isAdmin && starterProfiles.length < 10 && (
              <button
                type="button"
                onClick={handleFillDemoStarters}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>Completa 10 titolari per oggi</span>
              </button>
            )}
          </div>

          {isAdmin ? (
            <button
              type="button"
              onClick={handleGenerateTeams}
              disabled={isGenerating || starterProfiles.length < 10}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-40 hover:scale-105 cursor-pointer"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shuffle className="h-4 w-4" />
              )}
              {balancedResult ? 'Ribilancia Squadre' : 'Genera Squadre Bilanciate'}
            </button>
          ) : (
            <div className="text-xs text-slate-500 italic">
              La generazione è riservata agli amministratori.
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 text-xs bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-2xl flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* FEEDBACK COPIA WHATSAPP */}
      {copySuccess && (
        <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-2xl text-xs font-bold flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>Testo convocazioni copiato negli appunti e apertura WhatsApp in corso!</span>
          </div>
          <span className="text-[10px] bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full uppercase">
            Copiato
          </span>
        </div>
      )}

      {/* RISULTATO: CAMPO VIRTUALE & CONDIVISIONE */}
      {balancedResult ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Card Bilanciamento e Statistiche a Confronto */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Equilibrio Squadre Generato
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">Indice di Equità:</span>
                <span className="font-mono text-xs font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                  {balancedResult.fairnessScore}% Fair
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  (Delta OVR: {balancedResult.difference})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Bianca */}
              <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-white flex items-center gap-1.5">
                    ⚪ SQUADRA BIANCA
                  </span>
                  <StatBadge score={balancedResult.whiteStats.overallAvg} size="md" />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[11px] font-mono text-center text-slate-400">
                  <div className="bg-slate-900/90 p-1 rounded">
                    <span className="block text-[9px] text-slate-500">DIF</span>
                    {balancedResult.whiteStats.defenseAvg}
                  </div>
                  <div className="bg-slate-900/90 p-1 rounded">
                    <span className="block text-[9px] text-slate-500">ATT</span>
                    {balancedResult.whiteStats.attackAvg}
                  </div>
                  <div className="bg-slate-900/90 p-1 rounded">
                    <span className="block text-[9px] text-slate-500">RES</span>
                    {balancedResult.whiteStats.staminaAvg}
                  </div>
                  <div className="bg-slate-900/90 p-1 rounded">
                    <span className="block text-[9px] text-slate-500">TEC</span>
                    {balancedResult.whiteStats.techniqueAvg}
                  </div>
                </div>
              </div>

              {/* Nera */}
              <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs text-white flex items-center gap-1.5">
                    ⚫ SQUADRA NERA
                  </span>
                  <StatBadge score={balancedResult.blackStats.overallAvg} size="md" />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[11px] font-mono text-center text-slate-400">
                  <div className="bg-slate-900/90 p-1 rounded">
                    <span className="block text-[9px] text-slate-500">DIF</span>
                    {balancedResult.blackStats.defenseAvg}
                  </div>
                  <div className="bg-slate-900/90 p-1 rounded">
                    <span className="block text-[9px] text-slate-500">ATT</span>
                    {balancedResult.blackStats.attackAvg}
                  </div>
                  <div className="bg-slate-900/90 p-1 rounded">
                    <span className="block text-[9px] text-slate-500">RES</span>
                    {balancedResult.blackStats.staminaAvg}
                  </div>
                  <div className="bg-slate-900/90 p-1 rounded">
                    <span className="block text-[9px] text-slate-500">TEC</span>
                    {balancedResult.blackStats.techniqueAvg}
                  </div>
                </div>
              </div>
            </div>

            {/* BOTTONI CONDIVISIONE WHATSAPP & GOOGLE AI STUDIO */}
            <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPitchImage}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs transition-colors border border-slate-700"
                >
                  <Download className="h-4 w-4 text-emerald-400" />
                  Scarica Campo
                </button>

                <button
                  type="button"
                  onClick={handleGenerateAiAnalysis}
                  disabled={isAiLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-blue-500/20"
                >
                  {isAiLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <Bot className="h-4 w-4 text-amber-300" />
                  )}
                  <span>Analisi AI (Google AI Studio)</span>
                </button>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  disabled={isSharing}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba59] text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-[#25D366]/25 transition-all hover:scale-105"
                >
                  {isSharing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Share2 className="h-4 w-4" />
                  )}
                  Condividi su WhatsApp
                </button>
              )}
            </div>

            {/* SCHEDA ANALISI TATTICA GOOGLE AI STUDIO (GEMINI) */}
            {aiAnalysis && (
              <div className="mt-4 p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/40 shadow-2xl space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-indigo-500/30 pb-3">
                  <div className="flex items-center gap-2 text-indigo-400 font-black text-xs uppercase tracking-wider">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    <span>Report Tattico Ufficiale Google Gemini</span>
                  </div>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-mono">
                    AI Studio
                  </span>
                </div>

                <div>
                  <h4 className="text-base font-black text-white leading-snug">
                    {aiAnalysis.headline}
                  </h4>
                  <p className="text-xs text-amber-300 font-semibold mt-1">
                    {aiAnalysis.prediction}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                    <span className="font-bold text-white block mb-1">⚪ Chiave Tattica Bianca:</span>
                    <p className="text-slate-300 leading-relaxed">{aiAnalysis.whiteTactics}</p>
                  </div>
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                    <span className="font-bold text-white block mb-1">⚫ Chiave Tattica Nera:</span>
                    <p className="text-slate-300 leading-relaxed">{aiAnalysis.blackTactics}</p>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-indigo-500/20 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-emerald-400 block">{aiAnalysis.keyDuel}</span>
                    <p className="text-slate-400 italic text-[11px] mt-0.5">{aiAnalysis.funnyLockerRoomQuote}</p>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      await copyToClipboard(aiAnalysis.epicWhatsAppText);
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 3000);
                      window.open(getWhatsAppShareUrl(aiAnalysis.epicWhatsAppText), '_blank');
                    }}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#20ba59] text-slate-950 font-bold rounded-lg text-xs"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Copia Commento AI su WhatsApp
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* VIRTUAL PITCH RENDERING */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Campo da Calcetto Virtuale (Formazione 5v5)
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">
                Screenshot automatico incluso
              </span>
            </div>

            <VirtualPitch
              ref={pitchRef}
              teamWhite={balancedResult.teamWhite}
              teamBlack={balancedResult.teamBlack}
              whiteAvg={balancedResult.whiteStats.overallAvg}
              blackAvg={balancedResult.blackStats.overallAvg}
              matchInfo={{
                date: selectedDate,
                time: matchTime,
                location: matchLocation,
                totalCost,
              }}
            />
          </div>
        </div>
      ) : (
        /* Placeholder quando non ancora generato */
        <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-10 text-center space-y-3">
          <div className="inline-flex p-3 bg-slate-800 text-emerald-400 rounded-2xl">
            <Trophy className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-white">Nessuna squadra generata per questa data</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Quando 10 giocatori confermano la presenza per la giornata selezionata, l'Admin può cliccare su &quot;Genera Squadre Bilanciate&quot; per visualizzare il campo virtuale e condividere le convocazioni.
          </p>
        </div>
      )}
    </div>
  );
}

export default function SquadrePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Caricamento generatore squadre...
          </div>
        </div>
      }
    >
      <SquadreContent />
    </Suspense>
  );
}
