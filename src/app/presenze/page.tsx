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
  CheckCircle2,
} from 'lucide-react';
import { btn } from '@/components/ui/buttons';

export default function PresenzePage() {
  const { user, profile, isAdmin } = useAuth();
  const [mounted, setMounted] = useState(false);
  const days = useMemo(() => getCalendarDays(), []);
  const [presences, setPresences] = useState<Presence[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [openUntil, setOpenUntil] = useState<string>('');
  const [selectedDayString, setSelectedDayString] = useState<string>(days[0]?.dateString || '');
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
              className={isNextWeekOpen ? btn.secondary : btn.primary}
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
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
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
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
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
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" /> Partita al completo
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {formatItalianDate(selectedDayString)} · 10 titolari su 10
            </p>
          </div>
          <Link
            href={`/squadre?date=${selectedDayString}`}
            className={btn.primary}
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
                  aria-label={`${day.dayName} ${day.dayNumber} ${day.monthName}: ${locked ? 'chiuso' : `${confirmedCount} su 10`}${isFirstToTen ? ', primo a 10' : ''}`}
                  title={locked ? 'Iscrizioni non ancora aperte' : `${confirmedCount}/10`}
                  className={`flex-shrink-0 flex flex-col items-center w-14 sm:w-16 py-2.5 rounded-2xl transition-colors ${
                    isSelected ? 'bg-emerald-500 text-slate-950' : locked ? 'text-slate-600' : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <span className={`text-xs font-medium capitalize ${isSelected ? 'text-slate-900' : locked ? 'text-slate-600' : 'text-slate-400'}`}>
                    {day.dayName.slice(0, 3)}
                  </span>
                  <span className="text-xl font-bold leading-tight mt-0.5">{day.dayNumber}</span>
                  {/* Pallino di stato: ambra = primo a 10, verde = completo, grigio = qualcuno iscritto */}
                  <span className="mt-1.5 h-1.5 flex items-center" aria-hidden="true">
                    {locked ? (
                      <Lock className="h-3 w-3" />
                    ) : isFirstToTen || isFull || confirmedCount > 0 ? (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSelected ? 'bg-slate-950' : isFirstToTen ? 'bg-amber-500' : isFull ? 'bg-emerald-500' : 'bg-slate-500'
                        }`}
                      />
                    ) : null}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" aria-hidden="true" /> iscritti
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> completo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" /> primo a 10 della settimana
          </span>
        </p>
      </section>

      {/* Scheda del giorno scelto nel calendario */}
      {focusDay && (
        <section aria-label="Giorno scelto" className="max-w-xl mx-auto w-full animate-in" key={focusDay.dateString}>
          <PresenceCard {...cardProps(focusDay)} />
        </section>
      )}
    </div>
  );
}
