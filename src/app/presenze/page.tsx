'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { Presence, Profile } from '@/types/database';
import {
  subscribePresencesRange,
  subscribeProfiles,
  subscribeOfficialMatchDate,
  subscribeCalendarSettings,
  saveCalendarOpenUntil,
  joinPresence,
  leavePresence,
  saveOfficialMatchDateDoc,
} from '@/lib/firebase/firestoreService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { getOfficialMatchDate, setOfficialMatchDate } from '@/lib/services/presenceService';
import {
  getCalendarDays,
  getWeekEndDateString,
  getNextWeekEndDateString,
  isDateOpenForPlayers,
  toDateString,
  formatItalianDate,
} from '@/lib/utils/dateUtils';
import { PresenceCard } from '@/components/PresenceCard';
import {
  CalendarDays,
  Trophy,
  Users,
  Sparkles,
  ArrowRight,
  Crown,
  Lock,
  Unlock,
} from 'lucide-react';

export default function PresenzePage() {
  const { user, profile, isAdmin } = useAuth();
  const [mounted, setMounted] = useState(false);
  const days = useMemo(() => getCalendarDays(), []);
  const [presences, setPresences] = useState<Presence[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [openUntil, setOpenUntil] = useState<string>('');
  const [selectedDayString, setSelectedDayString] = useState<string>(days[0]?.dateString || '');
  const [viewMode, setViewMode] = useState<'focus' | 'grid'>('focus');
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);

  const firstDay = days[0]?.dateString || '';
  const lastDay = days[days.length - 1]?.dateString || '';
  const nextWeekEnd = getNextWeekEndDateString();
  const isNextWeekOpen = Boolean(openUntil && openUntil >= nextWeekEnd);
  const nextWeekStart = (() => {
    const [y, m, d] = getWeekEndDateString().split('-').map(Number);
    return toDateString(new Date(y, m - 1, d + 1)); // lunedì della settimana prossima
  })();

  // Isolamento Rigido Permessi Admin
  const isStrictAdmin = Boolean(mounted && user && (profile?.role === 'admin' || isAdmin));

  // Mount: data ufficiale, profili, calendario (solo una volta)
  useEffect(() => {
    setMounted(true);
    const clientDate = getOfficialMatchDate();
    if (clientDate && clientDate >= firstDay && clientDate <= lastDay) {
      setSelectedDayString(clientDate);
    }

    if (!isFirebaseConfigured) return;
    const unsubProfiles = subscribeProfiles((remoteProfiles) => setProfiles(remoteProfiles || []));
    const unsubMatchDate = subscribeOfficialMatchDate((remoteDate) => {
      if (remoteDate) {
        setOfficialMatchDate(remoteDate);
        if (remoteDate >= firstDay && remoteDate <= lastDay) setSelectedDayString(remoteDate);
      }
    });
    const unsubCalendar = subscribeCalendarSettings((cal) => setOpenUntil(cal.open_until || ''));
    // Presenze di tutto il calendario visibile, in tempo reale (fonte unica: Firestore)
    const unsubPres = subscribePresencesRange(firstDay, lastDay, (list) => setPresences(list));

    return () => {
      unsubProfiles();
      unsubMatchDate();
      unsubCalendar();
      unsubPres();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDayLocked = (dateString: string) => !isStrictAdmin && !isDateOpenForPlayers(dateString, openUntil);

  // Selezione giorno. Solo gli admin cambiano la data ufficiale della partita (per tutti)
  const handleSelectDay = (dateString: string) => {
    setSelectedDayString(dateString);
    if (isStrictAdmin) {
      setOfficialMatchDate(dateString);
      saveOfficialMatchDateDoc(dateString);
    }
  };

  // Iscrizione / ritiro dell'utente corrente
  const handleTogglePresence = async (dateString: string) => {
    const currentId = profile?.id;
    if (!currentId) {
      alert('Profilo non ancora caricato, riprova tra un attimo.');
      return;
    }
    const existing = presences.find((p) => p.date === dateString && p.player_id === currentId);
    if (!existing && isDayLocked(dateString)) {
      alert('Le votazioni per questo giorno non sono ancora aperte.');
      return;
    }
    setBusyDate(dateString);
    try {
      if (existing) {
        await leavePresence(existing.id); // la prima riserva sale da sola
      } else {
        await joinPresence(dateString, currentId);
      }
    } catch (err) {
      console.warn('[Presenze] toggle error:', err);
      alert('Operazione non riuscita. Controlla la connessione e riprova.');
    } finally {
      setBusyDate(null);
    }
  };

  // Azione Admin: aggiungi un giocatore (anche ospite) al giorno
  const handleAddGuestPresence = async (dateString: string, guestId: string) => {
    try {
      await joinPresence(dateString, guestId);
    } catch (err) {
      console.warn('[Presenze] add guest error:', err);
      alert('Impossibile aggiungere il giocatore (forse è già iscritto).');
    }
  };

  // Azione Admin: rimuovi una presenza (la prima riserva subentra da sola)
  const handleRemovePresence = async (presenceId: string) => {
    try {
      await leavePresence(presenceId);
    } catch (err) {
      console.warn('[Presenze] remove error:', err);
      alert('Impossibile rimuovere la presenza.');
    }
  };

  // Azione Admin: apri / chiudi le votazioni della settimana prossima
  const handleToggleNextWeek = async () => {
    const next = isNextWeekOpen ? '' : nextWeekEnd;
    const msg = isNextWeekOpen
      ? 'Richiudere le votazioni della settimana prossima? Chi è già iscritto resta iscritto.'
      : `Aprire le votazioni fino a ${formatItalianDate(nextWeekEnd)}?`;
    if (!confirm(msg)) return;
    setIsSavingCalendar(true);
    try {
      await saveCalendarOpenUntil(next, profile?.id || '');
    } catch (err) {
      console.warn('[Presenze] calendar error:', err);
      alert('Impossibile aggiornare il calendario.');
    } finally {
      setIsSavingCalendar(false);
    }
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
            Iscriviti ai giorni in cui puoi giocare. I primi 10 iscritti sono titolari, dall&apos;11° in waitlist con subentro automatico. La settimana prossima si apre quando l&apos;admin avvia le votazioni.
          </p>
        </div>

        {isStrictAdmin && (
          <div className="flex flex-col items-stretch sm:items-end gap-1">
            <button
              type="button"
              onClick={handleToggleNextWeek}
              disabled={isSavingCalendar}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 ${
                isNextWeekOpen
                  ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {isNextWeekOpen ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              {isNextWeekOpen ? 'Chiudi votazioni settimana prossima' : 'Apri votazioni settimana prossima'}
            </button>
            <span className="text-[11px] text-slate-400 text-center sm:text-right">
              {isNextWeekOpen
                ? `Aperte fino a ${formatItalianDate(openUntil)}`
                : 'Settimana prossima bloccata per i giocatori'}
            </span>
          </div>
        )}
      </div>

      {/* BANNER DECISIONE ADMIN: SE CI SONO PIÙ GIORNI CON 10 GIOCATORI */}
      {daysWithQuorum.length > 1 && isStrictAdmin && (
        <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-500/70 rounded-3xl p-5 shadow-2xl space-y-3.5 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl ring-1 ring-amber-500/40">
                <Crown className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                    Decisione Amministratore
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

          {isStrictAdmin && (
            <Link
              href={`/squadre?date=${selectedDayString}`}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/30 transition-all hover:scale-105"
            >
              <Sparkles className="h-4 w-4" />
              Genera Squadre 5v5
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}

      {/* Calendario Orizzontale a Scorrimento della Prossima Settimana */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-emerald-400" />
            Calendario (settimana corrente e prossima)
          </h2>
          <span className="text-[11px] text-slate-500">Seleziona un giorno per focalizzare</span>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
          {days.map((day) => {
            const dayPresences = presences.filter((p) => p.date === day.dateString);
            const confirmedCount = dayPresences.filter((p) => p.status === 'confirmed').length;
            const isSelected = selectedDayString === day.dateString;
            const isFull = confirmedCount >= 10;
            const locked = isDayLocked(day.dateString);
            const startsNextWeek = day.dateString === nextWeekStart;

            return (
              <React.Fragment key={day.dateString}>
              {startsNextWeek && (
                <div className="flex-shrink-0 w-px bg-slate-700 mx-1" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={() => handleSelectDay(day.dateString)}
                aria-pressed={isSelected}
                title={locked ? 'Votazioni non ancora aperte' : undefined}
                className={`flex-shrink-0 flex flex-col items-center justify-between w-24 sm:w-28 p-3 rounded-2xl border transition-all ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg ring-2 ring-emerald-500/60'
                    : locked
                    ? 'bg-slate-950 border-slate-800 text-slate-500 opacity-60'
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
                  {locked && <Lock className="h-3 w-3 text-slate-500" aria-label="Bloccato" />}
                </div>
              </button>
              </React.Fragment>
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
              Tutti i Giorni
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
                  currentUserId={mounted ? (profile?.id || (user as any)?.uid || (user as any)?.id) : undefined}
                  isAdmin={isStrictAdmin}
                  onTogglePresence={handleTogglePresence}
                  onAddGuestPresence={handleAddGuestPresence}
                  onRemovePresence={handleRemovePresence}
                  isLocked={isDayLocked(currentDay.dateString)}
                  isToggling={busyDate === currentDay.dateString}
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
                  currentUserId={mounted ? (profile?.id || (user as any)?.uid || (user as any)?.id) : undefined}
                  isAdmin={isStrictAdmin}
                  onTogglePresence={handleTogglePresence}
                  onAddGuestPresence={handleAddGuestPresence}
                  onRemovePresence={handleRemovePresence}
                  isLocked={isDayLocked(day.dateString)}
                  isToggling={busyDate === day.dateString}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
