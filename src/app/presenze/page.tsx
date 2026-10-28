'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { Presence, Profile } from '@/types/database';
import { 
  subscribePresences, 
  subscribeProfiles, 
  subscribeOfficialMatchDate, 
  savePresenceDoc, 
  deletePresenceDoc,
  saveOfficialMatchDateDoc 
} from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { getStoredPlayers } from '@/lib/services/playerService';
import { 
  getStoredPresences, 
  saveStoredPresences, 
  getOfficialMatchDate, 
  setOfficialMatchDate 
} from '@/lib/services/presenceService';
import { getUpcomingDays, CalendarDay, formatItalianDate } from '@/lib/utils/dateUtils';
import { PresenceCard } from '@/components/PresenceCard';
import { 
  CalendarDays, 
  Trophy, 
  Users, 
  Sparkles, 
  RefreshCw, 
  ArrowRight,
  ShieldCheck,
  Crown,
  Star
} from 'lucide-react';

// Giocatori demo iniziali per popolare la visualizzazione se il DB è nuovo
const INITIAL_DEMO_PLAYERS: Profile[] = [
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
  {
    id: 'p-11',
    user_id: null,
    email: null,
    full_name: 'Gabriele E. (Waitlist)',
    avatar_url: null,
    role: 'user',
    is_guest: true,
    stats: { Resistenza: 6, Velocità: 7, Difesa: 6, Tiro: 7, Passaggio: 6, Tecnica: 6, Fisico: 6, Dribbling: 6 },
    overall_rating: 6.3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEFAULT_UPCOMING_DAYS = getUpcomingDays(7);
const DEFAULT_PRESENCES: Presence[] = INITIAL_DEMO_PLAYERS.map((p, idx) => ({
  id: `pres-${p.id}`,
  date: DEFAULT_UPCOMING_DAYS[0]?.dateString || '2026-10-28',
  player_id: p.id,
  status: idx < 10 ? 'confirmed' : 'waitlist',
  order_index: idx + 1,
  created_at: new Date().toISOString(),
}));

export default function PresenzePage() {
  const { user, profile, isAdmin } = useAuth();
  const [days, setDays] = useState<CalendarDay[]>(DEFAULT_UPCOMING_DAYS);
  const [presences, setPresences] = useState<Presence[]>(() => getStoredPresences());
  const [profiles, setProfiles] = useState<Profile[]>(() => getStoredPlayers());
  const [selectedDayString, setSelectedDayString] = useState<string>(() =>
    getOfficialMatchDate()
  );
  const [viewMode, setViewMode] = useState<'focus' | 'grid'>('focus');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, startTransition] = useTransition();

  // Sottoscrizione Real-Time a Firebase Firestore
  useEffect(() => {
    // 1. Carica dallo store locale
    setProfiles(getStoredPlayers());
    setPresences(getStoredPresences());

    const handlePresencesChange = () => {
      setPresences(getStoredPresences());
    };
    const handlePlayersChange = () => {
      setProfiles(getStoredPlayers());
    };
    const handleMatchDateChange = (e: any) => {
      const newDate = e.detail?.date || getOfficialMatchDate();
      if (newDate) {
        setSelectedDayString(newDate);
      }
    };

    window.addEventListener('clubcalcetto_presences_changed', handlePresencesChange);
    window.addEventListener('clubcalcetto_players_changed', handlePlayersChange);
    window.addEventListener('clubcalcetto_match_date_changed', handleMatchDateChange);

    // 2. Real-time Firestore Listeners
    let unsubProfiles = () => {};
    let unsubMatchDate = () => {};

    if (isFirebaseConfigured) {
      unsubProfiles = subscribeProfiles((remoteProfiles) => {
        if (remoteProfiles && remoteProfiles.length > 0) {
          setProfiles(remoteProfiles);
        }
      });

      unsubMatchDate = subscribeOfficialMatchDate((remoteDate) => {
        if (remoteDate) {
          setSelectedDayString(remoteDate);
          setOfficialMatchDate(remoteDate);
        }
      });
    }

    return () => {
      window.removeEventListener('clubcalcetto_presences_changed', handlePresencesChange);
      window.removeEventListener('clubcalcetto_players_changed', handlePlayersChange);
      window.removeEventListener('clubcalcetto_match_date_changed', handleMatchDateChange);
      unsubProfiles();
      unsubMatchDate();
    };
  }, []);

  // Sottoscrizione alle presenze per il giorno selezionato da Firestore
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsubPres = subscribePresences(selectedDayString, (dayPresences) => {
      if (dayPresences && dayPresences.length > 0) {
        setPresences((prev) => {
          const otherDays = prev.filter((p) => p.date !== selectedDayString);
          const merged = [...otherDays, ...dayPresences];
          saveStoredPresences(merged);
          return merged;
        });
      }
    });
    return () => {
      unsubPres();
    };
  }, [selectedDayString]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setProfiles(getStoredPlayers());
    setPresences(getStoredPresences());
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Selezione giorno che sincronizza istantaneamente anche Squadre e Admin
  const handleSelectDay = (dateString: string) => {
    setSelectedDayString(dateString);
    setOfficialMatchDate(dateString);
    saveOfficialMatchDateDoc(dateString);
  };

  // Toggle presenza utente corrente per un giorno
  const handleTogglePresence = async (dateString: string) => {
    const currentAuthId = (user as any)?.uid || (user as any)?.id;
    const currentId = profile?.id || currentAuthId || 'dev-admin-user';
    const currentName = profile?.full_name || 'Io';

    const existingIndex = presences.findIndex(
      (p) => p.date === dateString && p.player_id === currentId
    );

    if (existingIndex !== -1) {
      // 1. RIMOZIONE / ANNULLA PRESENZA
      const removed = presences[existingIndex];
      const remaining = presences.filter((p) => p.id !== removed.id);

      // Logica Waitlist: se era un titolare (order_index <= 10), promuovi il primo in attesa
      const updatedDayPresences = remaining
        .filter((p) => p.date === dateString)
        .sort((a, b) => a.order_index - b.order_index)
        .map((p, idx) => ({
          ...p,
          order_index: idx + 1,
          status: (idx < 10 ? 'confirmed' : 'waitlist') as 'confirmed' | 'waitlist',
        }));

      const newPresences = [
        ...remaining.filter((p) => p.date !== dateString),
        ...updatedDayPresences,
      ];

      saveStoredPresences(newPresences);
      startTransition(() => {
        setPresences(newPresences);
      });
      deletePresenceDoc(removed.id);
    } else {
      // 2. AGGIUNGI PRESENZA
      const dayExisting = presences.filter((p) => p.date === dateString);
      const newOrderIndex = dayExisting.length + 1;
      const status = newOrderIndex <= 10 ? 'confirmed' : 'waitlist';

      const newPresenceItem: Presence = {
        id: `pres-${Date.now()}`,
        date: dateString,
        player_id: currentId,
        status,
        order_index: newOrderIndex,
        created_at: new Date().toISOString(),
      };

      const updated = [...presences, newPresenceItem];
      saveStoredPresences(updated);
      startTransition(() => {
        setPresences(updated);
      });
      savePresenceDoc(newPresenceItem);
    }
  };

  // Azione Admin: Assegna un giocatore ospite/manuale
  const handleAddGuestPresence = (dateString: string, guestId: string) => {
    const dayExisting = presences.filter((p) => p.date === dateString);
    const newOrderIndex = dayExisting.length + 1;
    const status = newOrderIndex <= 10 ? 'confirmed' : 'waitlist';

    const newPresenceItem: Presence = {
      id: `pres-guest-${Date.now()}`,
      date: dateString,
      player_id: guestId,
      status,
      order_index: newOrderIndex,
      created_at: new Date().toISOString(),
    };

    const updated = [...presences, newPresenceItem];
    saveStoredPresences(updated);
    setPresences(updated);
    savePresenceDoc(newPresenceItem);
  };

  // Azione Admin: Rimuovi singola presenza
  const handleRemovePresence = (presenceId: string) => {
    const target = presences.find((p) => p.id === presenceId);
    if (!target) return;

    const remaining = presences.filter((p) => p.id !== presenceId);
    const updatedDayPresences = remaining
      .filter((p) => p.date === target.date)
      .sort((a, b) => a.order_index - b.order_index)
      .map((p, idx) => ({
        ...p,
        order_index: idx + 1,
        status: (idx < 10 ? 'confirmed' : 'waitlist') as 'confirmed' | 'waitlist',
      }));

    const newPres = [
      ...remaining.filter((p) => p.date !== target.date),
      ...updatedDayPresences,
    ];
    saveStoredPresences(newPres);
    setPresences(newPres);
    deletePresenceDoc(presenceId);
  };

  // Controlla se la data selezionata ha 10 giocatori
  const selectedDayPresences = presences.filter((p) => p.date === selectedDayString);
  const selectedStarters = selectedDayPresences.filter((p) => p.status === 'confirmed');
  const isMatchReady = selectedStarters.length >= 10;

  // Giorni che hanno raggiunto il quorum dei 10 titolari
  const daysWithQuorum = days.filter((d) => {
    const dayP = presences.filter((p) => p.date === d.dateString);
    return dayP.filter((p) => p.status === 'confirmed').length >= 10;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Intestazione Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Dashboard Presenze Settimanali
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Iscriviti ai giorni in cui puoi giocare. Primi 10 sono Titolari, dall&apos;11° in Waitlist con subentro in tempo reale.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Sincronizza
          </button>
        </div>
      </div>

      {/* BANNER DECISIONE ADMIN: SE CI SONO PIÙ GIORNI CON 10 GIOCATORI */}
      {daysWithQuorum.length > 1 && isAdmin && (
        <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-500/70 rounded-3xl p-5 shadow-2xl space-y-3.5 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl ring-1 ring-amber-500/40">
                <Crown className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                    Decisione Amministratore (Marco B.)
                  </span>
                  <span className="text-xs text-slate-400 font-bold">
                    {daysWithQuorum.length} date con Quorum 10/10 raggiunto
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-black text-white mt-1">
                  Ci sono più giorni disponibili: decidi tu il giorno ufficiale della partita
                </h3>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-300">
            Seleziona la data definitiva in cui giocare. La tua scelta aggiornerà istantaneamente anche le sezioni <strong className="text-emerald-400">Squadre</strong> e <strong className="text-emerald-400">Admin</strong> su quel giorno:
          </p>

          <div className="flex flex-wrap gap-2.5 pt-1">
            {daysWithQuorum.map((day) => {
              const isOfficial = selectedDayString === day.dateString;
              const count = presences.filter(
                (p) => p.date === day.dateString && p.status === 'confirmed'
              ).length;

              return (
                <button
                  key={day.dateString}
                  type="button"
                  onClick={() => handleSelectDay(day.dateString)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    isOfficial
                      ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25 scale-105 ring-2 ring-emerald-300'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700'
                  }`}
                >
                  <span>⚽ {day.dayName} {day.dayNumber} {day.monthName}</span>
                  <span className="font-mono text-[11px] opacity-80">({count} gioc.)</span>
                  {isOfficial ? (
                    <span className="text-[10px] bg-slate-950 text-emerald-400 px-2 py-0.5 rounded font-black">
                      ★ Giorno Ufficiale
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded font-bold">
                      Imposta come Ufficiale
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Banner Se 10 Titolari Raggiunti per il giorno selezionato */}
      {isMatchReady && (
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border-2 border-emerald-500/60 rounded-3xl p-5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-emerald-500/20 text-emerald-300 rounded-2xl ring-1 ring-emerald-500/40">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                  Match Completo! 10/10
                </span>
                <span className="text-xs text-slate-400">
                  {formatItalianDate(selectedDayString)}
                </span>
              </div>
              <p className="text-sm font-bold text-white mt-0.5">
                La partita ha raggiunto il quorum dei 10 titolari!
              </p>
            </div>
          </div>

          <Link
            href={`/squadre?date=${selectedDayString}`}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/30 transition-all hover:scale-105"
          >
            <Sparkles className="h-4 w-4" />
            Genera Squadre 5v5
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Calendario Orizzontale a Scorrimento della Prossima Settimana */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-emerald-400" />
            Calendario Prossima Settimana
          </h2>
          <span className="text-[11px] text-slate-500">Seleziona un giorno per focalizzare</span>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
          {days.map((day) => {
            const dayPresences = presences.filter((p) => p.date === day.dateString);
            const confirmedCount = dayPresences.filter((p) => p.status === 'confirmed').length;
            const isSelected = selectedDayString === day.dateString;
            const isFull = confirmedCount >= 10;

            return (
              <button
                key={day.dateString}
                type="button"
                onClick={() => handleSelectDay(day.dateString)}
                className={`flex-shrink-0 flex flex-col items-center justify-between w-24 sm:w-28 p-3 rounded-2xl border transition-all ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg ring-2 ring-emerald-500/60'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    {day.dayName.slice(0, 3)}
                  </span>
                  {isSelected && (
                    <span className="text-[11px] text-amber-400 font-black" title="Giorno Selezionato per la Partita">
                      ★
                    </span>
                  )}
                </div>
                <span className="text-xl font-black my-1 text-white">{day.dayNumber}</span>
                <span className="text-[10px] text-slate-400">{day.monthName}</span>

                <div className="mt-2 w-full pt-1.5 border-t border-slate-800/80 flex items-center justify-center gap-1 font-mono text-[10px]">
                  <span
                    className={`font-black ${
                      isFull ? 'text-emerald-400' : 'text-slate-300'
                    }`}
                  >
                    {confirmedCount}/10
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Schede Giornaliere */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Users className="h-4 w-4 text-emerald-400" />
            {viewMode === 'focus' ? 'Dettaglio Giorno Selezionato' : 'Panoramica Settimanale (Tutti i giorni)'}
          </h2>

          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setViewMode('focus')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                viewMode === 'focus'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Giorno Scelto
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                viewMode === 'grid'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tutti i 7 Giorni
            </button>
          </div>
        </div>

        {viewMode === 'focus' ? (
          (() => {
            const currentDay = days.find((d) => d.dateString === selectedDayString) || days[0];
            if (!currentDay) return null;
            const dayPresences = presences.filter((p) => p.date === currentDay.dateString);
            return (
              <div className="max-w-xl mx-auto w-full animate-in fade-in duration-200">
                <PresenceCard
                  day={currentDay}
                  presences={dayPresences}
                  allProfiles={profiles}
                  currentUserId={profile?.id || (user as any)?.uid || (user as any)?.id || 'dev-admin-user'}
                  isAdmin={isAdmin}
                  onTogglePresence={handleTogglePresence}
                  onAddGuestPresence={handleAddGuestPresence}
                  onRemovePresence={handleRemovePresence}
                />
              </div>
            );
          })()
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-in fade-in duration-200">
            {days.map((day) => {
              const dayPresences = presences.filter((p) => p.date === day.dateString);
              return (
                <PresenceCard
                  key={day.dateString}
                  day={day}
                  presences={dayPresences}
                  allProfiles={profiles}
                  currentUserId={profile?.id || (user as any)?.uid || (user as any)?.id || 'dev-admin-user'}
                  isAdmin={isAdmin}
                  onTogglePresence={handleTogglePresence}
                  onAddGuestPresence={handleAddGuestPresence}
                  onRemovePresence={handleRemovePresence}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
