'use client';

import { PageSkeleton } from '@/components/ui/Skeleton';
import { askConfirm } from '@/components/ui/Feedback';

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
import { effectiveMatchCost, effectiveMatchTime, effectiveMatchLocation, fieldLabel, fieldCostFor, standardCostFor } from '@/lib/utils/matchUtils';
import { useMatchFormats } from '@/lib/hooks/useMatchFormats';
import { FORMAT_INFO, dayFormat, formationSlots, maxPlayersFor } from '@/lib/utils/matchFormat';
import { MatchFormatPicker } from '@/components/MatchFormatPicker';
import { AppSettings } from '@/types/database';
import { 
  subscribeMatch, 
  saveMatchFields,
  subscribeAppSettings,
  subscribeGeneratedTeams, 
  saveTeams,
  confirmTeams,
  applyTeamSubstitutions,
  subscribePresences, 
  subscribePresencesRange,
  subscribeProfiles 
} from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { getStoredPlayers } from '@/lib/services/playerService';
import { getOfficialMatchDate, getStoredOfficialMatchDate } from '@/lib/services/presenceService';
import { balanceTeams, BalancedTeamsResult, summarizeTeams } from '@/lib/algorithm/teamBalancer';
import { VirtualPitch } from '@/components/VirtualPitch';
import { formatLongDate, shortDayParts, getCalendarDays } from '@/lib/utils/dateUtils';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { usePlayerLabels } from '@/i18n/usePlayerLabels';
import Link from 'next/link';
import { CollapsibleCard } from '@/components/CollapsibleCard';
import { generateWhatsAppMessage, getWhatsAppShareUrl, copyToClipboard } from '@/lib/utils/whatsapp';
import { toPng } from 'html-to-image';
import { 
  Trophy, 
  Share2, 
  Download, 
  MapPin, 
  Check, 
  AlertCircle,
  Shuffle,
  Shield,
  Loader2,
  Lock,
  BadgeCheck,
  Pencil,
  ArrowLeftRight,
  ArrowRight,
  Users
} from 'lucide-react';
import { btn, textLink } from '@/components/ui/buttons';

function SquadreContent() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const { user, profile, isAdmin } = useAuth();
  const [mounted, setMounted] = useState(false);
  const t = useTranslations('teams');
  const tc = useTranslations('common');
  const { locale } = useLocaleSetting();
  const labels = usePlayerLabels();
  const fmtDate = (d: string) => formatLongDate(d, locale);

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
  const [standardCosts, setStandardCosts] = useState<AppSettings['standard_costs']>(undefined);
  // Formato di ogni giorno (5vs5, 7vs7, 8vs8, 11vs11) e modulo
  const matchFormats = useMatchFormats();
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

  const pitchRef = useRef<HTMLDivElement>(null);

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
      setStandardCosts(st.standard_costs);
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
    const loc = dirty.has('location') ? matchLocation : effectiveMatchLocation(savedMatch, fields, defaultFieldId);
    const f = dayFormat(matchFormats, selectedDate).format;
    const std = standardCostFor({ standard_total_cost: standardCost, standard_costs: standardCosts }, f);
    if (!dirty.has('cost')) setTotalCost(effectiveMatchCost(savedMatch, std, fieldCostFor(savedMatch, fields, defaultFieldId, loc, f)));
    if (!dirty.has('time')) setMatchTime(effectiveMatchTime(savedMatch, standardTime));
    if (!dirty.has('location')) setMatchLocation(loc);
     
  }, [savedMatch, standardCost, standardCosts, standardTime, fields, defaultFieldId, matchLocation, matchFormats, selectedDate]);

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

  // Formato della partita: quanti titolari, quanti per squadra, quale modulo
  const fmtDay = dayFormat(matchFormats, selectedDate);
  const fmt = { ...fmtDay, ...FORMAT_INFO[fmtDay.format] };
  const slots = formationSlots(fmt.format, fmt.formation);

  // I titolari della data selezionata (già in ordine di iscrizione), tanti quanti ne chiede il formato
  const confirmedPresences = presences.filter((p) => p.date === selectedDate && p.status === 'confirmed');
  const starterProfiles: Profile[] = confirmedPresences
    .map((p) => formProfiles.find((prof) => prof.id === p.player_id || prof.user_id === p.player_id))
    .filter((prof): prof is Profile => prof !== undefined)
    .slice(0, fmt.players);
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
  const teamsComplete = Boolean(teams && teams.white.length === fmt.perTeam && teams.black.length === fmt.perTeam);
  // Squadre salvate per un altro formato (es. fatte in 5vs5, ora la partita è 7vs7): vanno rigenerate
  const teamsWrongFormat = Boolean(
    !isCompleted && teamRecord && (teamRecord.team_white?.length || 0) > 0 && (teamRecord.team_white?.length || 0) !== fmt.perTeam
  );
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
      setErrorMsg(t('adminOnly'));
      return;
    }
    if (starterProfiles.length < fmt.players) {
      setErrorMsg(t('needStarters', { n: fmt.players, label: fmt.label, count: starterProfiles.length }));
      return;
    }
    const isRebalance = Boolean(teamRecord);
    if (isRebalance && isConfirmed && !(await askConfirm(t('confirmReshuffle')))) {
      return;
    }

    setIsGenerating(true);
    try {
      const current = teams ? splitKey(teams.white.map((p) => p.id), teams.black.map((p) => p.id)) : undefined;
      const shape = fmt.perTeam === 5 ? {} : { slots };
      const result = balanceTeams(
        starterProfiles,
        isRebalance && !teamsWrongFormat ? { excludeSplitKey: current, fixedKeeper, ...shape } : { fixedKeeper, ...shape }
      );
      await saveTeams(selectedDate, result.teamWhite.map(toTeamPlayer), result.teamBlack.map(toTeamPlayer), {
        manual: false,
        whiteAvg: result.whiteStats.overallAvg,
        blackAvg: result.blackStats.overallAvg,
      });
      if (isRebalance && isConfirmed) {
        notifyMatchPlayers({ type: 'teams_changed', date: selectedDate, playerIds: starters.map((p) => p.id) });
      }
      setTab('pitch');
      flash(isRebalance ? t('rebalanced') : t('generated'));
    } catch (err: unknown) {
      console.error('Generazione fallita:', err);
      setErrorMsg(err instanceof Error ? err.message : t('generateFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

  // Conferma partita: da qui in poi queste sono le squadre (i giocatori vengono avvisati)
  const handleConfirmMatch = async () => {
    if (!teamRecord || !teamsComplete) return;
    if (!(await askConfirm(t('confirmMatchQ', { date: fmtDate(selectedDate) })))) return;
    setIsConfirming(true);
    try {
      await confirmTeams(selectedDate, profile?.id || '');
      notifyMatchPlayers({ type: 'match_confirmed', date: selectedDate, playerIds: allTeamIds });
      flash(t('matchConfirmedMsg'));
    } catch (err) {
      console.warn('[Squadre] conferma non riuscita:', err);
      setErrorMsg(t('confirmFailed'));
    } finally {
      setIsConfirming(false);
    }
  };

  const handleUnconfirmMatch = async () => {
    if (!(await askConfirm(t('unconfirmQ')))) return;
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
      flash(t('manualSaved'));
    } catch (err) {
      console.warn('[Squadre] salvataggio manuale non riuscito:', err);
      setErrorMsg(t('saveFailed'));
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
        players: fmt.players,
        formatLabel: fmt.label,
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

  // Pillole delle date: i giorni del calendario presenze (+ la data aperta), con i titolari di ciascuno
  const calendarDays = React.useMemo(() => getCalendarDays(), []);
  const [dayCounts, setDayCounts] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!isFirebaseConfigured || calendarDays.length === 0) return;
    const unsub = subscribePresencesRange(calendarDays[0].dateString, calendarDays[calendarDays.length - 1].dateString, (list) => {
      const m = new Map<string, number>();
      list.forEach((pr) => pr.status === 'confirmed' && m.set(pr.date, (m.get(pr.date) || 0) + 1));
      setDayCounts(m);
    });
    return () => unsub();
  }, [calendarDays]);
  const officialDate = mounted ? getStoredOfficialMatchDate() : '';
  const pillDays = Array.from(new Set([...calendarDays.map((d) => d.dateString), ...(selectedDate ? [selectedDate] : [])])).sort();

  const costPerPerson = (Number(totalCost || 80) / fmt.players).toFixed(2);
  const selectedField = fields.find((f) => fieldLabel(f) === matchLocation || f.name === matchLocation);

  // Stato della partita in una frase (barra di stato)
  const status: { tone: 'done' | 'ok' | 'wait' | 'todo'; title: string; detail: string } = isCompleted
    ? { tone: 'done', title: t('stArchived'), detail: t('stArchivedDetail') }
    : isConfirmed
    ? { tone: 'ok', title: t('stConfirmed'), detail: t('stConfirmedDetail') }
    : teamRecord
    ? {
        tone: 'todo',
        title: isClientAdmin ? t('stReadyAdmin') : t('stReady'),
        detail: isClientAdmin ? t('stReadyAdminDetail') : t('stReadyDetail'),
      }
    : starterProfiles.length >= fmt.players
    ? {
        tone: 'todo',
        title: isClientAdmin ? t('stCanGenAdmin') : t('stCanGen'),
        detail: isClientAdmin
          ? t('stCanGenAdminDetail', { n: fmt.players, label: fmt.label })
          : t('stCanGenDetail', { n: fmt.players }),
      }
    : {
        tone: 'wait',
        title: t('stWaiting', { count: starterProfiles.length, n: fmt.players }),
        detail: t('stWaitingDetail', { missing: fmt.players - starterProfiles.length, label: fmt.label, n: fmt.players }),
      };
  const statusIcon =
    status.tone === 'done' ? (
      <Lock className="h-5 w-5 text-secondary" />
    ) : status.tone === 'ok' ? (
      <BadgeCheck className="h-5 w-5 text-accent-text" />
    ) : status.tone === 'todo' ? (
      <Shield className="h-5 w-5 text-warning" />
    ) : (
      <AlertCircle className="h-5 w-5 text-secondary" />
    );

  const generateLabel = teamRecord && !teamsWrongFormat ? t('rebalance') : t('generate', { label: fmt.label });
  const primaryBtn = btn.primary;
  const secondaryBtn = btn.secondary;

  // Barre di confronto Bianchi / Neri
  const compareRows = balancedResult
    ? ([
        [t('avg'), balancedResult.whiteStats.overallAvg, balancedResult.blackStats.overallAvg],
        [t('defense'), balancedResult.whiteStats.defenseAvg, balancedResult.blackStats.defenseAvg],
        [t('attack'), balancedResult.whiteStats.attackAvg, balancedResult.blackStats.attackAvg],
        [t('stamina'), balancedResult.whiteStats.staminaAvg, balancedResult.blackStats.staminaAvg],
        [t('technique'), balancedResult.whiteStats.techniqueAvg, balancedResult.blackStats.techniqueAvg],
      ] as const)
    : [];
  const fmtNum = (n: number) => String(n).replace('.', ',');

  const teamList = (team: Profile[], label: string, dot: string) => (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-semibold text-primary flex items-center gap-1.5 min-w-0">
          <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${dot}`} aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
      </div>
      <ul className="space-y-1.5 text-sm">
        {team.map((p, i) => {
          const f = forms.get(p.id) || 0;
          return (
            <li key={p.id} className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0">
              <span className="sm:w-12 flex-shrink-0 text-[10px] font-semibold text-muted">
                {labels.slot(slotLabel(i, fixedKeeper, team.length === slots.length ? slots : undefined))}
              </span>
              <span className="truncate text-primary">
                {p.full_name}
                {f ? (
                  <span className={`ml-1.5 text-[11px] font-semibold ${f > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-sky-700 dark:text-sky-300'}`}>
                    {f > 0 ? '🔥' : '❄️'}
                    {formatForm(f)}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Titolo + riepilogo della partita in una riga */}
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">{t('title')}</h1>
        <p className="text-sm text-secondary flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="capitalize">{fmtDate(selectedDate)}</span>
          <span className="text-muted" aria-hidden="true">·</span>
          <span className="tabular-nums">{matchTime}</span>
          {matchLocation && (
            <>
              <span className="text-muted" aria-hidden="true">·</span>
              <span>{selectedField?.name || matchLocation}</span>
            </>
          )}
          <span className="text-muted" aria-hidden="true">·</span>
          <span className="font-semibold text-primary">{fmt.label}</span>
          <span className="text-muted" aria-hidden="true">·</span>
          <span className="text-accent-text font-semibold tabular-nums">{t('perHead', { amount: locale === 'en' ? costPerPerson : costPerPerson.replace('.', ',') })}</span>
        </p>
        {selectedField?.address && (
          <a
            href={
              selectedField.maps_url ||
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedField.name} ${selectedField.address}`)}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-1 text-xs text-secondary hover:text-accent-text"
          >
            <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
            <span>{selectedField.address}</span>
          </a>
        )}
      </header>

      {/* 2. Scelta della data: pillole come in Presenze */}
      <section aria-label={t('dateAria')} className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {pillDays.map((d) => {
            const dd = Number(d.slice(8, 10));
            const selected = d === selectedDate;
            const count = d === selectedDate ? confirmedPresences.length : dayCounts.get(d) || 0;
            const dayMax = maxPlayersFor(matchFormats, d);
            const official = d === officialDate;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                aria-pressed={selected}
                className={`relative flex-shrink-0 flex flex-col items-center w-[4.5rem] py-2.5 rounded-2xl transition-colors ${
                  selected ? 'bg-accent text-on-accent' : 'bg-card text-secondary hover:bg-card-hover'
                }`}
              >
                {official && (
                  <span
                    className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${selected ? 'bg-app' : 'bg-accent/90'}`}
                    title={t('officialDay')}
                    aria-label={t('officialDay')}
                  />
                )}
                <span className={`text-xs font-medium capitalize ${selected ? 'text-slate-900' : 'text-secondary'}`}>
                  {shortDayParts(d, locale).weekday}
                </span>
                <span className="text-xl font-bold leading-tight">{dd}</span>
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    selected ? 'text-slate-900' : count >= dayMax ? 'text-accent-text' : 'text-muted'
                  }`}
                >
                  {Math.min(count, dayMax)}/{dayMax}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent/90" aria-hidden="true" /> {t('officialDayLegend')}
          </span>
          <label className="flex items-center gap-2">
            <span>{t('otherDate')}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="px-2 py-1 bg-app border border-line rounded-lg text-primary focus:outline-none focus:border-accent"
            />
          </label>
        </div>
      </section>

      {/* 3. Stato della partita + un solo pulsante principale */}
      <section className="rounded-2xl bg-card border border-line p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 flex-shrink-0">{statusIcon}</span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-primary">{status.title}</h2>
            <p className="text-sm text-secondary mt-0.5">
              {status.detail}
              {isConfirmed && !isCompleted && isClientAdmin && (
                <>
                  {' '}
                  <button type="button" onClick={handleUnconfirmMatch} className="text-secondary underline">
                    {t('unconfirm')}
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
        {isClientAdmin && !isCompleted && (
          <div className="flex flex-col-reverse sm:flex-row gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleGenerateTeams}
              disabled={isGenerating || starterProfiles.length < fmt.players}
              className={teamRecord && !teamsWrongFormat ? secondaryBtn : primaryBtn}
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
              {generateLabel}
            </button>
            {teamRecord && !isConfirmed && (
              <button type="button" onClick={handleConfirmMatch} disabled={isConfirming || !teamsComplete} className={primaryBtn}>
                {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                {t('confirmMatch')}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Squadre fatte per un altro formato: vanno rigenerate */}
      {teamsWrongFormat && (
        <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex items-start gap-2" role="status">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-warning" />
          <span>
            {t('wrongFormat', { size: teamRecord?.team_white?.length || 0, label: fmt.label })}
            {isClientAdmin ? t('wrongFormatAdmin', { label: fmt.label }) : t('wrongFormatPlayer')}
          </span>
        </div>
      )}

      {/* Formato e modulo della partita: solo admin */}
      {isClientAdmin && !isCompleted && (
        <CollapsibleCard
          title={t('formatTitle', { label: fmt.label, formation: fmt.formation })}
          icon={<Users className="h-4 w-4 text-secondary" />}
          summary={t('formatSummary', { players: fmt.players, perTeam: fmt.perTeam })}
        >
          <MatchFormatPicker
            date={selectedDate}
            format={fmt.format}
            formation={fmt.formation}
            field={selectedField}
            hasTeams={Boolean(teamRecord)}
            adminId={profile?.id || ''}
          />
        </CollapsibleCard>
      )}

      {/* 2. Dettagli modificabili: solo admin, chiusi di default */}
      {isClientAdmin && (
        <CollapsibleCard
          title={t('editDetails')}
          icon={<Pencil className="h-4 w-4 text-secondary" />}
          summary={hasCustomValues ? t('customSummary') : t('defaultSummary')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <label className="block">
              <span className="block text-xs text-secondary font-semibold mb-1">{t('startTime')}</span>
              <input
                type="time"
                value={matchTime}
                onChange={(e) => {
                  markDirty('time');
                  setMatchTime(e.target.value);
                }}
                className="w-full px-3 py-2.5 bg-app border border-line rounded-xl text-primary focus:outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-secondary font-semibold mb-1">{t('field')}</span>
              {fields.length > 0 ? (
                <select
                  value={matchLocation}
                  onChange={(e) => {
                    markDirty('location');
                    setMatchLocation(e.target.value);
                  }}
                  className="w-full px-3 py-2.5 bg-app border border-line rounded-xl text-primary focus:outline-none focus:border-accent"
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
                  placeholder={t('fieldPlaceholder')}
                  className="w-full px-3 py-2.5 bg-app border border-line rounded-xl text-primary focus:outline-none focus:border-accent"
                />
              )}
            </label>
            <label className="block">
              <span className="block text-xs text-secondary font-semibold mb-1">{t('totalCost')}</span>
              <NumberInput
                value={totalCost}
                onValueChange={(v) => {
                  markDirty('cost');
                  setTotalCost(v);
                }}
                decimal
                className="w-full px-3 py-2.5 bg-app border border-line rounded-xl text-primary focus:outline-none focus:border-accent"
              />
            </label>
          </div>
          <p className="text-xs text-secondary">
            {hasCustomValues ? (
              <>
                {t('customNote')}{' '}
                <button type="button" onClick={handleResetToStandard} className="text-accent-text underline font-semibold">
                  {t('useStandard')}
                </button>
              </>
            ) : (
              t('standardNote')
            )}
          </p>
        </CollapsibleCard>
      )}

      {/* 7. Messaggi */}
      {errorMsg && (
        <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-danger flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
      {infoMsg && (
        <div className="rounded-xl bg-accent/10 px-4 py-3 text-sm text-accent-text flex items-start gap-2">
          <Check className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{infoMsg}</span>
        </div>
      )}
      {copySuccess && (
        <div className="rounded-xl bg-accent/10 px-4 py-3 text-sm text-accent-text flex items-start gap-2">
          <Check className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{t('copied')}</span>
        </div>
      )}
      {!isCompleted && (teamRecord?.substitutions?.length || reconciled?.substitutions.length) ? (
        <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-100 space-y-1">
          {[...(teamRecord?.substitutions || []), ...(reconciled?.substitutions || [])].slice(-4).map((sub, i) => (
            <div key={`${sub.out_id}-${sub.in_id}-${i}`} className="flex items-start gap-2">
              <ArrowLeftRight className="h-4 w-4 flex-shrink-0 mt-0.5 text-warning" />
              <span>
                {t.rich('subIn', { inName: sub.in_name, outName: sub.out_name, b: (c) => <span className="font-semibold">{c}</span> })}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {reconciled && reconciled.emptySlots > 0 && !isCompleted && (
        <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-danger flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {t('missing', { n: reconciled.emptySlots })}
          </span>
        </div>
      )}

      {/* Campo / modifica manuale (solo admin) */}
      {isClientAdmin && teams && !isCompleted && (
        <div className="flex items-center gap-1 bg-card border border-line p-1 rounded-xl text-sm" role="tablist">
          {(
            [
              ['pitch', t('tabPitch'), <Trophy key="t" className="h-4 w-4" />],
              ['manual', t('tabManual'), <Pencil key="p" className="h-4 w-4" />],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => (key === 'manual' ? openManualTab() : setTab('pitch'))}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-semibold transition-colors ${
                tab === key ? 'bg-line-strong text-primary' : 'text-secondary hover:text-primary'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'manual' && manualDraft && isClientAdmin && !isCompleted ? (
        <div className="bg-card border border-line rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-primary">{t('manualTitle')}</h3>
            <p className="text-sm text-secondary mt-0.5">{t('manualHint')}</p>
          </div>
          <TeamSwapEditor
            fixedKeeper={fixedKeeper}
            formation={fmt.formation}
            white={manualDraft.white}
            black={manualDraft.black}
            onChange={(white, black) => setManualDraft({ white, black })}
          />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-line">
            <button type="button" onClick={() => setTab('pitch')} className={secondaryBtn}>
              {tc('cancel')}
            </button>
            <button type="button" onClick={handleSaveManual} disabled={isSavingManual} className={primaryBtn}>
              {isSavingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t('saveTeams')}
            </button>
          </div>
        </div>
      ) : balancedResult ? (
        <div className="space-y-6 animate-in">
          {/* 4. Prima il campo */}
          <section className="space-y-3">
            <VirtualPitch
              fixedKeeper={fixedKeeper}
              slots={balancedResult.teamWhite.length === slots.length ? slots : undefined}
              formatLabel={balancedResult.teamWhite.length === fmt.perTeam ? fmt.label : undefined}
              players={balancedResult.teamWhite.length === fmt.perTeam ? fmt.players : undefined}
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

            {/* 6. Condivisione in una riga */}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              {isClientAdmin && (
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  disabled={isSharing}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba59] text-on-accent font-semibold rounded-xl text-sm transition-colors disabled:opacity-40"
                >
                  {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                  {t('shareWhatsapp')}
                </button>
              )}
              <button type="button" onClick={handleDownloadPitchImage} className={secondaryBtn}>
                <Download className="h-4 w-4" />
                {t('downloadImage')}
              </button>
            </div>
          </section>

          {/* 5. Confronto Bianchi / Neri */}
          <section className="bg-card border border-line rounded-2xl p-5 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-primary">{t('balance')}</h3>
                <p className="text-sm text-secondary mt-0.5">{t('balanceHint')}</p>
              </div>
              <div className="text-right">
                <span className="block text-2xl font-bold text-accent-text tabular-nums leading-none">
                  {balancedResult.fairnessScore}%
                </span>
                <span className="text-xs text-secondary">{t('balanceLower')}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-xs font-semibold text-secondary">
                <span>{t('white')}</span>
                <span>{t('black')}</span>
              </div>
              {compareRows.map(([label, w, b]) => {
                const total = w + b || 1;
                return (
                  <div key={label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className={`tabular-nums font-semibold ${w > b ? 'text-primary' : 'text-secondary'}`}>{fmtNum(w)}</span>
                      <span className="text-xs text-secondary">{label}</span>
                      <span className={`tabular-nums font-semibold ${b > w ? 'text-primary' : 'text-secondary'}`}>{fmtNum(b)}</span>
                    </div>
                    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                      <span className="bg-slate-200 rounded-l-full" style={{ width: `${(w / total) * 100}%` }} />
                      <span className="bg-slate-600 rounded-r-full" style={{ width: `${(b / total) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-line">
              {teamList(balancedResult.teamWhite, t('white'), 'bg-white ring-1 ring-line-strong')}
              {teamList(balancedResult.teamBlack, t('black'), 'bg-slate-950 border border-slate-500')}
            </div>
          </section>

          {/* Voto MVP aperto a tutti, 45 minuti dopo la fine della partita */}
          {teams && teamsComplete && (
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

        </div>
      ) : (
        /* 8. Nessuna squadra: cosa succede adesso */
        <div className="rounded-2xl bg-card/60 border border-dashed border-line p-8 sm:p-10 text-center space-y-3">
          <div className="inline-flex p-3 bg-card-hover text-accent-text rounded-2xl">
            <Trophy className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-primary">{t('noTeams')}</h3>
          {isClientAdmin && starterProfiles.length >= fmt.players ? (
            <>
              <p className="text-sm text-secondary max-w-md mx-auto">
                {t('canGenerate', { n: fmt.players, label: fmt.label })}
              </p>
              <button
                type="button"
                onClick={handleGenerateTeams}
                disabled={isGenerating}
                className={`${primaryBtn} mx-auto`}
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
                {t('generate', { label: fmt.label })}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-secondary max-w-md mx-auto">
                {t('teamsArrive', { label: fmt.label, n: fmt.players, count: starterProfiles.length })}
              </p>
              <Link
                href="/attendance"
                className={textLink}
              >
                {t('goAttendance')} <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>
      )}

    </div>
  );
}

export default function SquadrePage() {
  return (
    <Suspense
      fallback={<PageSkeleton />}
    >
      <SquadreContent />
    </Suspense>
  );
}
