'use client';

import { useForms } from '@/lib/hooks/useForms';
import { withForm, formatForm } from '@/lib/utils/formUtils';
import { NumberInput } from '@/components/NumberInput';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { Profile, Presence, Match, GeneratedTeamRecord, SportField, MatchTeamPlayer } from '@/types/database';
import { reconcileTeams, profileForTeamPlayer, splitKey, toTeamPlayer, slotLabel } from '@/lib/utils/teamUtils';
import { notifyMatchPlayers } from '@/lib/services/notificationService';
import { TeamSwapEditor } from '@/components/TeamSwapEditor';
import { MvpVoteCard } from '@/components/MvpVoteCard';
import { getStoredFields, subscribeSportFields } from '@/lib/services/fieldService';
import { effectiveMatchCost, effectiveMatchTime, effectiveMatchLocation, fieldLabel } from '@/lib/utils/matchUtils';
import { 
  subscribeMatch, 
  saveMatchFields,
  subscribeAppSettings,
  subscribeGeneratedTeams, 
  saveTeams,
  confirmTeams,
  applyTeamSubstitutions,
  subscribePresences, 
  subscribeProfiles 
} from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { getStoredPlayers } from '@/lib/services/playerService';
import { getOfficialMatchDate } from '@/lib/services/presenceService';
import { balanceTeams, BalancedTeamsResult, summarizeTeams } from '@/lib/algorithm/teamBalancer';
import { VirtualPitch } from '@/components/VirtualPitch';
import { StatBadge } from '@/components/StatBadge';
import { formatItalianDate } from '@/lib/utils/dateUtils';
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
  Bot,
  Lock,
  BadgeCheck,
  Pencil,
  ArrowLeftRight
} from 'lucide-react';


function SquadreContent() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const { user, profile, isAdmin } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isStrictAdmin = Boolean(mounted && user && (profile?.role === 'admin' || isAdmin));
  const isClientAdmin = isStrictAdmin;

  const [fields, setFields] = useState<SportField[]>(() => getStoredFields());
  const [defaultFieldId, setDefaultFieldId] = useState<string | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<string>(
    dateParam || getOfficialMatchDate()
  );
  const [matchTime, setMatchTime] = useState('20:30');
  const [matchLocation, setMatchLocation] = useState('');
  const [totalCost, setTotalCost] = useState(80.0);
  // Valori standard decisi dall'admin (Admin > Campi & Parametri) e partita salvata per la data
  const [standardCost, setStandardCost] = useState(80);
  const [standardTime, setStandardTime] = useState('20:30');
  const [savedMatch, setSavedMatch] = useState<Match | null>(null);
  // Campi modificati dall'admin e non ancora salvati sulla partita
  const dirtyFields = useRef<Set<'cost' | 'time' | 'location'>>(new Set());
  const markDirty = (f: 'cost' | 'time' | 'location') => dirtyFields.current.add(f);

  const [presences, setPresences] = useState<Presence[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  // Stato forma (ultime 3 partite, se attivato in Admin): conta nel bilanciamento e sul campo
  const { forms, settings: formSettings } = useForms();
  const fixedKeeper = Boolean(formSettings.fixedKeeper);
  const formProfiles = React.useMemo(
    () => profiles.map((p) => withForm(p, forms.get(p.id))),
    [profiles, forms]
  );
  const [teamRecord, setTeamRecord] = useState<GeneratedTeamRecord | null>(null);
  const [tab, setTab] = useState<'pitch' | 'manual'>('pitch');
  const [manualDraft, setManualDraft] = useState<{ white: MatchTeamPlayer[]; black: MatchTeamPlayer[] } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [infoMsg, setInfoMsg] = useState('');

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

  // Profili: realtime da Firestore (la copia locale serve solo per il primo render)
  useEffect(() => {
    setProfiles(getStoredPlayers());
    if (!isFirebaseConfigured) return;
    const unsubProfiles = subscribeProfiles((list) => setProfiles(list || []));
    return () => unsubProfiles();
  }, []);

  // Dettagli partita e presenze (già ordinate: titolari 1..10, poi waitlist) per la data selezionata
  useEffect(() => {
    if (!isFirebaseConfigured || !selectedDate) return;
    setPresences([]);
    setSavedMatch(null);
    setTeamRecord(null);
    setTab('pitch');
    dirtyFields.current.clear();
    const unsubMatch = subscribeMatch(selectedDate, (m) => setSavedMatch(m));
    const unsubPres = subscribePresences(selectedDate, (pres) => setPresences(pres));
    const unsubTeams = subscribeGeneratedTeams(selectedDate, (rec) => setTeamRecord(rec));
    return () => {
      unsubMatch();
      unsubPres();
      unsubTeams();
    };
  }, [selectedDate]);

  // Valori standard dell'admin (Admin > Campi & Parametri) e campi sportivi, in tempo reale
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsubSettings = subscribeAppSettings((st) => {
      if (st.standard_total_cost) setStandardCost(Number(st.standard_total_cost));
      if (st.standard_match_time) setStandardTime(st.standard_match_time);
      setDefaultFieldId(st.default_field_id);
    });
    const unsubFields = subscribeSportFields((list) => {
      if (list && list.length > 0) setFields(list);
    });
    return () => {
      unsubSettings();
      unsubFields();
    };
  }, []);

  // Valori mostrati: personalizzati per questa partita dall'admin, altrimenti gli standard
  useEffect(() => {
    const dirty = dirtyFields.current;
    if (!dirty.has('cost')) setTotalCost(effectiveMatchCost(savedMatch, standardCost));
    if (!dirty.has('time')) setMatchTime(effectiveMatchTime(savedMatch, standardTime));
    if (!dirty.has('location')) setMatchLocation(effectiveMatchLocation(savedMatch, fields, defaultFieldId));
  }, [savedMatch, standardCost, standardTime, fields, defaultFieldId]);

  // Salvataggio automatico (solo admin) dei valori personalizzati per questa partita
  useEffect(() => {
    const dirty = dirtyFields.current;
    if (dirty.size === 0 || !isClientAdmin || !selectedDate) return;
    const t = setTimeout(() => {
      const patch: Partial<Match> = {};
      if (dirty.has('cost')) {
        patch.total_cost = Number(totalCost) || standardCost;
        patch.cost_override = true;
      }
      if (dirty.has('time')) {
        patch.match_time = matchTime;
        patch.time_override = true;
      }
      if (dirty.has('location')) patch.location = matchLocation;
      const saving = new Set(dirty);
      saveMatchFields(selectedDate, patch)
        .then(() => saving.forEach((f) => dirty.delete(f)))
        .catch((err) => console.warn('[Squadre] salvataggio partita non riuscito:', err));
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchTime, matchLocation, totalCost]);

  // L'admin torna ai valori standard per questa partita
  const handleResetToStandard = async () => {
    dirtyFields.current.clear();
    try {
      await saveMatchFields(selectedDate, { cost_override: false, time_override: false });
    } catch (err) {
      console.warn('[Squadre] reset valori standard non riuscito:', err);
    }
  };
  const hasCustomValues = Boolean(savedMatch?.cost_override || savedMatch?.time_override);

  // Calcola i 10 titolari specifici per la data selezionata (già in ordine di iscrizione)
  const confirmedPresences = presences.filter((p) => p.date === selectedDate && p.status === 'confirmed');
  const starterProfiles: Profile[] = confirmedPresences
    .map((p) => formProfiles.find((prof) => prof.id === p.player_id || prof.user_id === p.player_id))
    .filter((prof): prof is Profile => prof !== undefined)
    .slice(0, 10);
  const starters = starterProfiles.map(toTeamPlayer);

  // Squadre: si generano UNA volta e restano quelle. Cambiano solo se qualcuno subentra
  // (prende esattamente il posto di chi si è ritirato), con una modifica manuale o con "Ribilancia".
  const isCompleted = savedMatch?.status === 'completed';
  const reconciled = teamRecord ? reconcileTeams(teamRecord, starters) : null;
  const teams: { white: MatchTeamPlayer[]; black: MatchTeamPlayer[] } | null =
    isCompleted && savedMatch?.team_white?.length && savedMatch?.team_black?.length
      ? { white: savedMatch.team_white, black: savedMatch.team_black }
      : reconciled
      ? { white: reconciled.white, black: reconciled.black }
      : null;
  const balancedResult: BalancedTeamsResult | null = teams
    ? summarizeTeams(
        teams.white.map((p) => profileForTeamPlayer(p, formProfiles)),
        teams.black.map((p) => profileForTeamPlayer(p, formProfiles))
      )
    : null;
  const isConfirmed = Boolean(teamRecord?.confirmed);
  const teamsComplete = Boolean(teams && teams.white.length === 5 && teams.black.length === 5);
  const allTeamIds = teams ? [...teams.white, ...teams.black].map((p) => p.id) : [];

  // Sostituzioni: quando un admin apre la pagina vengono salvate (una sola volta) e si avvisano i giocatori
  const savingSubs = useRef<string>('');
  const subsKey = reconciled ? reconciled.substitutions.map((x) => `${x.out_id}>${x.in_id}`).join(',') : '';
  useEffect(() => {
    if (!isClientAdmin || isCompleted || !teamRecord || !reconciled || reconciled.substitutions.length === 0) return;
    const key = `${selectedDate}:${subsKey}`;
    if (savingSubs.current === key) return;
    savingSubs.current = key;
    applyTeamSubstitutions(
      selectedDate,
      { white: teamRecord.team_white, black: teamRecord.team_black },
      { white: reconciled.white, black: reconciled.black },
      reconciled.substitutions
    )
      .then((wrote) => {
        if (!wrote) return;
        reconciled.substitutions.forEach((sub) =>
          notifyMatchPlayers({
            type: 'substitution',
            date: selectedDate,
            playerIds: [...reconciled.white, ...reconciled.black].map((p) => p.id),
            outName: sub.out_name,
            inName: sub.in_name,
          })
        );
      })
      .catch((err) => console.warn('[Squadre] salvataggio sostituzione non riuscito:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClientAdmin, isCompleted, teamRecord, subsKey, selectedDate]);

  const flash = (msg: string) => {
    setInfoMsg(msg);
    setTimeout(() => setInfoMsg(''), 6000);
  };

  // Genera (prima volta) o Ribilancia (squadre diverse, comunque equilibrate)
  const handleGenerateTeams = async () => {
    setErrorMsg('');
    if (!isStrictAdmin) {
      setErrorMsg('La generazione delle squadre è riservata esclusivamente agli amministratori.');
      return;
    }
    if (starterProfiles.length < 10) {
      setErrorMsg(`Servono 10 titolari per generare le squadre. Attualmente: ${starterProfiles.length}/10.`);
      return;
    }
    const isRebalance = Boolean(teamRecord);
    if (isRebalance && isConfirmed && !confirm('La partita è già confermata con queste squadre. Vuoi davvero rimescolarle? I giocatori verranno avvisati.')) {
      return;
    }

    setIsGenerating(true);
    try {
      const current = teams ? splitKey(teams.white.map((p) => p.id), teams.black.map((p) => p.id)) : undefined;
      const result = balanceTeams(starterProfiles, isRebalance ? { excludeSplitKey: current, fixedKeeper } : { fixedKeeper });
      await saveTeams(selectedDate, result.teamWhite.map(toTeamPlayer), result.teamBlack.map(toTeamPlayer), {
        manual: false,
        whiteAvg: result.whiteStats.overallAvg,
        blackAvg: result.blackStats.overallAvg,
      });
      if (isRebalance && isConfirmed) {
        notifyMatchPlayers({ type: 'teams_changed', date: selectedDate, playerIds: starters.map((p) => p.id) });
      }
      setTab('pitch');
      flash(isRebalance ? 'Squadre ribilanciate e salvate.' : 'Squadre generate e salvate: restano queste finché non le cambi tu.');
    } catch (err: unknown) {
      console.error('Generazione fallita:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Generazione non riuscita. Riprova.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Conferma partita: da qui in poi queste sono le squadre (i giocatori vengono avvisati)
  const handleConfirmMatch = async () => {
    if (!teamRecord || !teamsComplete) return;
    if (!confirm(`Confermi la partita del ${formatItalianDate(selectedDate)} con queste squadre?`)) return;
    setIsConfirming(true);
    try {
      await confirmTeams(selectedDate, profile?.id || '');
      notifyMatchPlayers({ type: 'match_confirmed', date: selectedDate, playerIds: allTeamIds });
      flash('Partita confermata. Le squadre restano queste salvo sostituzioni, modifiche manuali o Ribilancia.');
    } catch (err) {
      console.warn('[Squadre] conferma non riuscita:', err);
      setErrorMsg('Conferma non riuscita. Riprova.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleUnconfirmMatch = async () => {
    if (!confirm('Annullare la conferma della partita?')) return;
    try {
      await confirmTeams(selectedDate, profile?.id || '', false);
    } catch (err) {
      console.warn('[Squadre] annullamento conferma non riuscito:', err);
    }
  };

  // Modifica manuale (tab a parte, solo admin)
  const openManualTab = () => {
    if (teams) setManualDraft({ white: [...teams.white], black: [...teams.black] });
    setTab('manual');
  };

  const handleSaveManual = async () => {
    if (!manualDraft) return;
    setIsSavingManual(true);
    try {
      const sum = summarizeTeams(
        manualDraft.white.map((p) => profileForTeamPlayer(p, formProfiles)),
        manualDraft.black.map((p) => profileForTeamPlayer(p, formProfiles))
      );
      await saveTeams(selectedDate, manualDraft.white, manualDraft.black, {
        manual: true,
        whiteAvg: sum.whiteStats.overallAvg,
        blackAvg: sum.blackStats.overallAvg,
      });
      if (isConfirmed) {
        notifyMatchPlayers({ type: 'teams_changed', date: selectedDate, playerIds: allTeamIds });
      }
      setTab('pitch');
      flash('Squadre modificate e salvate.');
    } catch (err) {
      console.warn('[Squadre] salvataggio manuale non riuscito:', err);
      setErrorMsg('Salvataggio non riuscito. Riprova.');
    } finally {
      setIsSavingManual(false);
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
            style: { margin: '0' },
          });

          // Scarica automaticamente l'immagine per permettere all'admin di allegarla
          const link = document.createElement('a');
          link.download = `ClubSoccer-${selectedDate}-Squadre.png`;
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
        style: { margin: '0' },
      });
      const link = document.createElement('a');
      link.download = `ClubSoccer-${selectedDate}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const costPerPerson = (Number(totalCost || 80) / 10).toFixed(2);
  const selectedField = fields.find((f) => fieldLabel(f) === matchLocation || f.name === matchLocation);

  return (
    <div className="space-y-6 pb-16">
      {/* Intestazione */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Trophy className="h-6 w-6 text-emerald-400" />
              Squadre della Partita
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Bianchi contro Neri per la data scelta: l&apos;app divide i 10 titolari in due squadre equilibrate, poi un admin le conferma.
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
              onChange={(e) => {
                markDirty('time');
                setMatchTime(e.target.value);
              }}
              disabled={!isClientAdmin}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-70"
            />
          </div>

          {/* Luogo Campo con Dropdown Centri Censiti */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Luogo / Campo</label>
            {fields.length > 0 ? (
              <select
                value={matchLocation}
                onChange={(e) => {
                  markDirty('location');
                  setMatchLocation(e.target.value);
                }}
                disabled={!isClientAdmin}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-70 text-xs"
              >
                {matchLocation && !fields.some((f) => fieldLabel(f) === matchLocation) && (
                  <option value={matchLocation}>{matchLocation}</option>
                )}
                {fields.map((f) => (
                  <option key={f.id} value={fieldLabel(f)}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={matchLocation}
                onChange={(e) => {
                  markDirty('location');
                  setMatchLocation(e.target.value);
                }}
                disabled={!isClientAdmin}
                placeholder="Es. Centro Sportivo"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-70 text-xs"
              />
            )}
            {selectedField?.address && (
              <a
                href={
                  selectedField.maps_url ||
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedField.name} ${selectedField.address}`)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-start gap-1 text-[11px] text-emerald-300 hover:underline"
              >
                <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
                <span>{selectedField.address}</span>
              </a>
            )}
          </div>

          {/* Costo Totale */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Costo Totale (€)</label>
            <NumberInput
              value={totalCost}
              onValueChange={(v) => {
                markDirty('cost');
                setTotalCost(v);
              }}
              decimal
              disabled={!isClientAdmin}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-70"
            />
          </div>
        </div>

        {isClientAdmin && (
          <p className="text-xs text-slate-400">
            {hasCustomValues ? (
              <>
                Questa partita ha costo/orario personalizzati.{' '}
                <button
                  type="button"
                  onClick={handleResetToStandard}
                  className="text-emerald-400 underline font-semibold"
                >
                  Usa valori standard
                </button>
              </>
            ) : (
              'Costo e orario seguono i valori standard (Admin → Campi & Parametri). Se li modifichi qui valgono solo per questa partita.'
            )}
          </p>
        )}

        {/* Stato squadre + pulsanti admin */}
        <div className="pt-2 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            {starterProfiles.length >= 10 ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <Check className="h-4 w-4" /> 10 titolari per il {formatItalianDate(selectedDate)}
              </span>
            ) : (
              <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Mancano {10 - starterProfiles.length} giocatori per arrivare a 10
              </span>
            )}
            {isCompleted ? (
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-slate-400" /> Partita archiviata: squadre bloccate
              </span>
            ) : isConfirmed ? (
              <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                <BadgeCheck className="h-4 w-4" /> Partita confermata
                {isClientAdmin && (
                  <button type="button" onClick={handleUnconfirmMatch} className="ml-1 text-slate-400 underline font-normal">
                    annulla
                  </button>
                )}
              </span>
            ) : teamRecord ? (
              <span className="text-slate-400 flex items-center gap-1.5">
                <Shield className="h-4 w-4" /> Squadre salvate, partita non ancora confermata
              </span>
            ) : null}
          </div>

          {isClientAdmin && !isCompleted ? (
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={handleGenerateTeams}
                disabled={isGenerating || starterProfiles.length < 10}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-xl text-xs uppercase tracking-wider border border-slate-700 transition-all disabled:opacity-40 cursor-pointer"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
                {teamRecord ? 'Ribilancia Squadre' : 'Genera Squadre Bilanciate'}
              </button>
              {teamRecord && !isConfirmed && (
                <button
                  type="button"
                  onClick={handleConfirmMatch}
                  disabled={isConfirming || !teamsComplete}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-40 cursor-pointer"
                >
                  {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                  Conferma Partita
                </button>
              )}
            </div>
          ) : !isClientAdmin && !teamRecord ? (
            <p className="text-xs text-slate-500 italic">Le squadre vengono generate e confermate dagli amministratori.</p>
          ) : null}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 text-xs bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-2xl flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {infoMsg && (
        <div className="p-3 text-xs bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 rounded-2xl flex items-center gap-2">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span>{infoMsg}</span>
        </div>
      )}

      {/* Sostituzioni avvenute (chi si è ritirato e chi ha preso il posto) */}
      {!isCompleted && (teamRecord?.substitutions?.length || reconciled?.substitutions.length) ? (
        <div className="p-3 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-2xl space-y-1">
          {[...(teamRecord?.substitutions || []), ...(reconciled?.substitutions || [])].slice(-4).map((sub, i) => (
            <div key={`${sub.out_id}-${sub.in_id}-${i}`} className="flex items-center gap-1.5">
              <ArrowLeftRight className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                <strong>{sub.in_name}</strong> subentra al posto di {sub.out_name}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {reconciled && reconciled.emptySlots > 0 && !isCompleted && (
        <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-200 rounded-2xl flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>
            {reconciled.emptySlots === 1 ? 'Manca 1 giocatore' : `Mancano ${reconciled.emptySlots} giocatori`}: il posto verrà preso dal primo che si iscrive.
          </span>
        </div>
      )}

      {/* Tab: campo / modifica manuale (solo admin) */}
      {isClientAdmin && teams && !isCompleted && (
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-sm">
          <button
            type="button"
            onClick={() => setTab('pitch')}
            aria-pressed={tab === 'pitch'}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-bold transition-all ${
              tab === 'pitch' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="h-4 w-4" /> Campo
          </button>
          <button
            type="button"
            onClick={openManualTab}
            aria-pressed={tab === 'manual'}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-bold transition-all ${
              tab === 'manual' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Pencil className="h-4 w-4" /> Modifica manuale
          </button>
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
      {tab === 'manual' && manualDraft && isClientAdmin && !isCompleted ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Pencil className="h-4 w-4 text-emerald-400" /> Modifica manuale squadre
          </h3>
          <TeamSwapEditor
            fixedKeeper={fixedKeeper}
            white={manualDraft.white}
            black={manualDraft.black}
            onChange={(white, black) => setManualDraft({ white, black })}
          />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setTab('pitch')}
              className="w-full sm:w-auto px-5 py-3 rounded-xl text-xs font-bold text-slate-300 border border-slate-700 hover:bg-slate-800"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleSaveManual}
              disabled={isSavingManual}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider disabled:opacity-40"
            >
              {isSavingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salva squadre
            </button>
          </div>
        </div>
      ) : balancedResult ? (
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
                <ul className="pt-2 border-t border-slate-800 space-y-1 text-xs">
                  {balancedResult.teamWhite.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-2 text-slate-200">
                      <span className="w-11 flex-shrink-0 font-mono text-[10px] font-bold text-emerald-400">{slotLabel(i, fixedKeeper)}</span>
                      <span className="truncate">{p.full_name}</span>
                      {forms.get(p.id) ? (
                        <span className={`ml-auto flex-shrink-0 text-[10px] font-black ${(forms.get(p.id) || 0) > 0 ? 'text-orange-300' : 'text-sky-300'}`}>
                          {(forms.get(p.id) || 0) > 0 ? '🔥' : '❄️'}
                          {formatForm(forms.get(p.id) || 0)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
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
                <ul className="pt-2 border-t border-slate-800 space-y-1 text-xs">
                  {balancedResult.teamBlack.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-2 text-slate-200">
                      <span className="w-11 flex-shrink-0 font-mono text-[10px] font-bold text-emerald-400">{slotLabel(i, fixedKeeper)}</span>
                      <span className="truncate">{p.full_name}</span>
                      {forms.get(p.id) ? (
                        <span className={`ml-auto flex-shrink-0 text-[10px] font-black ${(forms.get(p.id) || 0) > 0 ? 'text-orange-300' : 'text-sky-300'}`}>
                          {(forms.get(p.id) || 0) > 0 ? '🔥' : '❄️'}
                          {formatForm(forms.get(p.id) || 0)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
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

              {isClientAdmin && (
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
              fixedKeeper={fixedKeeper}
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
      ) : null}

      {/* Voto MVP aperto a tutti, 45 minuti dopo la fine della partita */}
      {teams && teamsComplete && tab === 'pitch' && (
        <MvpVoteCard
          date={selectedDate}
          matchTime={matchTime}
          white={teams.white}
          black={teams.black}
          voterUid={user?.uid || null}
          isAdmin={isClientAdmin}
          testMode={teamRecord?.mvp_vote_test === 'all' ? 'all' : teamRecord?.mvp_vote_test ? 'admins' : false}
        />
      )}

      {!balancedResult && !(tab === 'manual' && manualDraft) && (
        /* Placeholder quando non ancora generato */
        <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-10 text-center space-y-3">
          <div className="inline-flex p-3 bg-slate-800 text-emerald-400 rounded-2xl">
            <Trophy className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-white">Nessuna squadra generata per questa data</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Quando ci sono 10 titolari un amministratore genera le squadre: da quel momento restano quelle (cambiano solo se qualcuno subentra, con la modifica manuale o con &quot;Ribilancia&quot;).
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
