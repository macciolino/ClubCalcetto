'use client';

import { notify, askConfirm } from '@/components/ui/Feedback';

import { callNotifyApi } from '@/lib/services/pushService';
import { firstToTenByWeek } from '@/lib/utils/presenceRanking';
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
  setPresenceOverride,
  clearPresencesForDate,
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
      notify('Profilo non ancora caricato, riprova tra un attimo.');
      return;
    }
    const existing = presences.find((p) => p.date === dateString && p.player_id === currentId);
    if (!existing && isDayLocked(dateString)) {
      notify('Le votazioni per questo giorno non sono ancora aperte.');
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
      notify('Operazione non riuscita. Controlla la connessione e riprova.');
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
      notify('Impossibile aggiungere il giocatore (forse è già iscritto).');
    }
  };

  // Azione Admin: forza un giocatore tra i titolari o in lista d'attesa
  const handleSetOverride = async (presenceId: string, override: 'starter' | 'waitlist') => {
    try {
      await setPresenceOverride(presenceId, override);
    } catch (err) {
      console.warn('[Presenze] override error:', err);
      notify('Impossibile spostare il giocatore.');
    }
  };

  // Azione Admin: toglie tutte le iscrizioni di un giorno
  const handleResetDay = async (dateString: string) => {
    if (!(await askConfirm(`Vuoi davvero azzerare tutte le presenze di ${formatItalianDate(dateString)}?`))) return;
    await clearPresencesForDate(dateString);
  };

  // Azione Admin: rimuovi una presenza (la prima riserva subentra da sola)
  const handleRemovePresence = async (presenceId: string) => {
    try {
      await leavePresence(presenceId);
    } catch (err) {
      console.warn('[Presenze] remove error:', err);
      notify('Impossibile rimuovere la presenza.');
    }
  };

  // Azione Admin: apri / chiudi le votazioni della settimana prossima
  const handleToggleNextWeek = async () => {
    const next = isNextWeekOpen ? '' : nextWeekEnd;
    const msg = isNextWeekOpen
      ? 'Richiudere le votazioni della settimana prossima? Chi è già iscritto resta iscritto.'
      : `Aprire le votazioni fino a ${formatItalianDate(nextWeekEnd)}?`;
    if (!(await askConfirm(msg))) return;
    setIsSavingCalendar(true);
    try {
      await saveCalendarOpenUntil(next, profile?.id || '');
      // Avvisa tutti i registrati che si possono iscrivere (il server lo manda una volta sola per apertura)
      if (next) callNotifyApi({ type: 'voting_open', until: next }).catch(() => undefined);
    } catch (err) {
      console.warn('[Presenze] calendar error:', err);
      notify('Impossibile aggiornare il calendario.');
    } finally {
      setIsSavingCalendar(false);
    }
  };

  // Controlla se la data selezionata ha 10 giocatori
  const selectedDayPresences = presences.filter((p) => p.date === selectedDayString);
  const selectedStarters = selectedDayPresences.filter((p) => p.status === 'confirmed');
  const isMatchReady = selectedStarters.length >= 10;

  // Giorni che hanno raggiunto il quorum dei 10 titolari
  // Il giorno arrivato per primo a 10 iscritti in ogni settimana (come in Admin → Match)
  const firstToTen = firstToTenByWeek(days, presences);

  const daysWithQuorum = days.filter((d) => {
    const dayP = presences.filter((p) => p.date === d.dateString);
    return dayP.filter((p) => p.status === 'confirmed').length >= 10;
  });

  const currentUserId = mounted ? profile?.id || (user as any)?.uid || (user as any)?.id : undefined;
  const cardProps = (day: (typeof days)[number]) => ({
    day,
    presences: presences.filter((p) => p.date === day.dateString),
    allProfiles: profiles,
    currentUserId,
    isAdmin: isStrictAdmin,
    onTogglePresence: handleTogglePresence,
    onAddGuestPresence: handleAddGuestPresence,
    onRemovePresence: handleRemovePresence,
    onSetOverride: handleSetOverride,
    onResetDay: handleResetDay,
    isLocked: isDayLocked(day.dateString),
    isFirstToTen: firstToTen.has(day.dateString),
    isToggling: busyDate === day.dateString,
  });
  const focusDay = days.find((d) => d.dateString === selectedDayString) || days[0];

  return (
    <div className="space-y-8 pb-12">
      {/* Titolo della pagina (senza riquadro) */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Presenze</h1>
          <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
            Segna i giorni in cui puoi giocare. I primi 10 sono titolari, gli altri vanno in lista d&apos;attesa e
            subentrano da soli.
          </p>
        </div>

        {isStrictAdmin && (
          <div className="flex flex-col items-stretch sm:items-end gap-1.5">
            <button
              type="button"
              onClick={handleToggleNextWeek}
              disabled={isSavingCalendar}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                isNextWeekOpen
                  ? 'border border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {isNextWeekOpen ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              {isNextWeekOpen ? 'Chiudi la settimana prossima' : 'Apri la settimana prossima'}
            </button>
            <span className="text-xs text-slate-400 text-center sm:text-right">
              {isNextWeekOpen ? `Iscrizioni aperte fino a ${formatItalianDate(openUntil)}` : 'Settimana prossima chiusa ai giocatori'}
            </span>
          </div>
        )}
      </header>

      {/* Admin: più giorni a 10, scegli quello ufficiale */}
      {daysWithQuorum.length > 1 && isStrictAdmin && (
        <section className="rounded-2xl bg-slate-900 border border-slate-800 border-l-4 border-l-amber-400 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Crown className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-white">Scegli il giorno ufficiale</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                {daysWithQuorum.length} giorni hanno 10 titolari. Il giorno scelto vale anche per Squadre e Admin.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {daysWithQuorum.map((day) => {
              const isOfficial = selectedDayString === day.dateString;
              return (
                <button
                  key={day.dateString}
                  type="button"
                  onClick={() => handleSelectDay(day.dateString)}
                  aria-pressed={isOfficial}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors capitalize ${
                    isOfficial ? 'bg-emerald-500 text-slate-950' : 'border border-slate-700 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {day.dayName} {day.dayNumber} {day.monthName}
                  {isOfficial && <span className="ml-1.5 text-xs font-bold">· ufficiale</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Giorno scelto al completo */}
      {isMatchReady && (
        <section className="rounded-2xl bg-slate-900 border border-slate-800 border-l-4 border-l-emerald-400 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Partita al completo</h2>
            <p className="text-sm text-slate-400 mt-0.5 capitalize">
              {formatItalianDate(selectedDayString)} · 10 titolari su 10
            </p>
          </div>
          <Link
            href={`/squadre?date=${selectedDayString}`}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-sm transition-colors"
          >
            Vai alle squadre
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      {/* Calendario: settimana corrente e prossima */}
      <section className="space-y-3" aria-labelledby="calendar-title">
        <h2 id="calendar-title" className="text-sm font-semibold text-slate-300">
          Calendario
        </h2>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
          {days.map((day) => {
            const confirmedCount = presences.filter((p) => p.date === day.dateString && p.status === 'confirmed').length;
            const isSelected = selectedDayString === day.dateString;
            const isFull = confirmedCount >= 10;
            const locked = isDayLocked(day.dateString);
            const startsNextWeek = day.dateString === nextWeekStart;
            const isFirstToTen = firstToTen.has(day.dateString);

            return (
              <React.Fragment key={day.dateString}>
                {startsNextWeek && <div className="flex-shrink-0 w-px bg-slate-800 mx-1" aria-hidden="true" />}
                <button
                  type="button"
                  onClick={() => handleSelectDay(day.dateString)}
                  aria-pressed={isSelected}
                  title={locked ? 'Iscrizioni non ancora aperte' : undefined}
                  className={`relative flex-shrink-0 flex flex-col items-center w-[4.5rem] sm:w-20 py-3 rounded-2xl transition-colors ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950'
                      : locked
                      ? 'bg-slate-900/60 text-slate-500'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isFirstToTen && (
                    <span
                      className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${isSelected ? 'bg-slate-950' : 'bg-amber-400'}`}
                      title="Primo a 10"
                      aria-label="Primo a 10"
                    />
                  )}
                  <span className={`text-xs font-medium capitalize ${isSelected ? 'text-slate-900' : 'text-slate-400'}`}>
                    {day.dayName.slice(0, 3)}
                  </span>
                  <span className="text-xl font-bold leading-tight mt-0.5">{day.dayNumber}</span>
                  <span
                    className={`mt-1 flex items-center gap-1 text-xs font-semibold tabular-nums ${
                      isSelected ? 'text-slate-900' : isFull ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {locked ? <Lock className="h-3 w-3" aria-label="Chiuso" /> : `${confirmedCount}/10`}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" /> primo giorno arrivato a 10 nella settimana
        </p>
      </section>

      {/* Schede dei giorni */}
      <section className="space-y-4" aria-labelledby="days-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="days-title" className="text-sm font-semibold text-slate-300">
            {viewMode === 'focus' ? 'Giorno scelto' : 'Tutti i giorni'}
          </h2>
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl text-xs" role="group" aria-label="Vista">
            {(
              [
                ['focus', 'Giorno scelto'],
                ['grid', 'Tutti i giorni'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  viewMode === mode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {viewMode === 'focus' ? (
          focusDay ? (
            <div className="max-w-xl mx-auto w-full animate-in fade-in duration-200">
              <PresenceCard {...cardProps(focusDay)} />
            </div>
          ) : null
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-200">
            {days.map((day) => (
              <PresenceCard key={day.dateString} {...cardProps(day)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
