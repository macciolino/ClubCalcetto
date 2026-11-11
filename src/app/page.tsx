'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { GeneratedTeamRecord, Match, Presence, Profile, SportField } from '@/types/database';
import {
  joinPresence,
  leavePresence,
  subscribeAppSettings,
  subscribeCalendarSettings,
  subscribeGeneratedTeams,
  subscribeMatch,
  subscribeOfficialMatchDate,
  subscribePresences,
  subscribeProfiles,
} from '@/lib/firebase/firestoreService';
import { subscribeSportFields } from '@/lib/services/fieldService';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { getOfficialMatchDate, isTimelockActive } from '@/lib/services/presenceService';
import { formatItalianDate, isDateOpenForPlayers, toDateString } from '@/lib/utils/dateUtils';
import { effectiveMatchCost, effectiveMatchLocation, effectiveMatchTime } from '@/lib/utils/matchUtils';
import { reconcileTeams } from '@/lib/utils/teamUtils';
import { CountRing } from '@/components/PresenceCard';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { notify } from '@/components/ui/Feedback';
import { ArrowRight, CalendarDays, Check, Clock, History, Lock, MapPin, Trophy, Users } from 'lucide-react';

/**
 * Home: "Prossima partita". The first thing a player wants to know: when and where, whether they play,
 * how many places are left and, once generated, in which team. Everything else is one tap away.
 */
export default function HomePage() {
  const { user, profile, isAdmin, isLoading } = useAuth();
  const [date, setDate] = useState<string>(() => getOfficialMatchDate());
  const [presences, setPresences] = useState<Presence[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [match, setMatch] = useState<Match | null>(null);
  const [teamRecord, setTeamRecord] = useState<GeneratedTeamRecord | null>(null);
  const [fields, setFields] = useState<SportField[]>([]);
  const [standard, setStandard] = useState<{ cost?: number; time?: string; fieldId?: string }>({});
  const [openUntil, setOpenUntil] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsubs = [
      subscribeOfficialMatchDate((d) => d && setDate(d)),
      subscribeProfiles((list) => setProfiles(list || [])),
      subscribeSportFields((list) => setFields(list || [])),
      subscribeAppSettings((s) =>
        setStandard({ cost: s.standard_total_cost, time: s.standard_match_time, fieldId: s.default_field_id })
      ),
      subscribeCalendarSettings((cal) => setOpenUntil(cal.open_until || '')),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !date) return;
    setPresences(null);
    const unsubs = [
      subscribePresences(date, (list) => setPresences(list)),
      subscribeMatch(date, (m) => setMatch(m)),
      subscribeGeneratedTeams(date, (r) => setTeamRecord(r)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [date]);

  const today = toDateString(new Date());
  const admin = Boolean(isAdmin || profile?.role === 'admin');
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name || 'Giocatore';
  const starters = useMemo(() => (presences || []).filter((p) => p.status === 'confirmed'), [presences]);
  const waitlist = useMemo(() => (presences || []).filter((p) => p.status === 'waitlist'), [presences]);
  const mine = profile ? (presences || []).find((p) => p.player_id === profile.id) : undefined;
  const myStarterIdx = mine ? starters.findIndex((p) => p.id === mine.id) : -1;
  const myWaitIdx = mine ? waitlist.findIndex((p) => p.id === mine.id) : -1;
  const isFull = starters.length >= 10;
  const locked = !admin && !isDateOpenForPlayers(date, openUntil);
  const cancelLocked = Boolean(mine) && !admin && isTimelockActive(date).locked;

  // Squadre: quelle salvate, con le eventuali sostituzioni (come in Squadre)
  const teams = useMemo(() => {
    if (match?.status === 'completed' && match.team_white?.length) return { white: match.team_white, black: match.team_black || [] };
    if (!teamRecord) return null;
    const r = reconcileTeams(teamRecord, starters.map((p) => ({ id: p.player_id, name: nameOf(p.player_id) })));
    return { white: r.white, black: r.black };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamRecord, match, starters, profiles]);
  const myTeam = profile && teams ? (teams.white.some((p) => p.id === profile.id) ? 'white' : teams.black.some((p) => p.id === profile.id) ? 'black' : null) : null;

  const handleToggle = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      if (mine) {
        await leavePresence(mine.id);
        notify('Ti sei ritirato dalla partita.');
      } else {
        await joinPresence(date, profile.id);
        notify(isFull ? 'Sei in lista d’attesa.' : 'Presenza segnata: ci sei!');
      }
    } catch {
      notify('Operazione non riuscita. Controlla la connessione e riprova.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !user || !profile) return <PageSkeleton />;

  const firstName = profile.full_name.trim().split(/\s+/)[0];
  const hasMatch = date >= today;
  const time = effectiveMatchTime(match, standard.time);
  const location = effectiveMatchLocation(match, fields, standard.fieldId);
  const cost = effectiveMatchCost(match, standard.cost);

  return (
    <div className="space-y-8 pb-12 animate-in">
      <header className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Ciao {firstName}</h1>
        <p className="text-sm text-slate-400">{hasMatch ? 'Ecco la prossima partita.' : 'Nessuna partita in programma per ora.'}</p>
      </header>

      {hasMatch ? (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6" aria-labelledby="next-match">
          {/* Quando e dove */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-semibold text-emerald-400">Prossima partita</p>
              <h2 id="next-match" className="text-xl sm:text-2xl font-bold text-white capitalize">
                {formatItalianDate(date)}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-400" /> Ore {time}
                </span>
                <span className="flex items-start gap-1.5 min-w-0">
                  <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="break-words">{location}</span>
                </span>
                <span className="text-slate-400">€{(cost / 10).toFixed(2)} a testa</span>
              </div>
            </div>
            {teamRecord?.confirmed && (
              <span className="self-start bg-emerald-500/15 text-emerald-300 text-xs font-medium px-2.5 py-1 rounded-full">
                Partita confermata
              </span>
            )}
          </div>

          {/* Il tuo stato */}
          {presences === null ? (
            <div className="h-14 rounded-xl bg-slate-800/70 animate-pulse" aria-hidden="true" />
          ) : mine ? (
            <div
              className={`rounded-xl border px-4 py-3.5 flex items-center justify-between gap-3 ${
                myStarterIdx >= 0 ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-amber-500/10 border-amber-500/40'
              }`}
            >
              <span className={`text-base font-semibold flex items-center gap-2 ${myStarterIdx >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                <Check className="h-5 w-5" />
                {myStarterIdx >= 0 ? `Sei titolare (n° ${myStarterIdx + 1})` : `In attesa (${myWaitIdx + 1}°)`}
              </span>
              {cancelLocked ? (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" /> Ritiri bloccati
                </span>
              ) : (
                <button type="button" onClick={handleToggle} disabled={busy} className="text-sm text-slate-400 hover:text-rose-300 underline disabled:opacity-50">
                  Ritirati
                </button>
              )}
            </div>
          ) : locked ? (
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3.5 text-center">
              <span className="text-base font-semibold text-slate-300 flex items-center justify-center gap-2">
                <Lock className="h-4 w-4" /> Iscrizioni chiuse
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleToggle}
              disabled={busy}
              className={`w-full py-4 rounded-xl font-semibold text-base transition-colors active:scale-[0.99] disabled:opacity-50 ${
                isFull ? 'bg-amber-400 hover:bg-amber-300 text-slate-950' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {isFull ? 'Mettimi in attesa' : 'Ci sono'}
            </button>
          )}

          {/* Posti e squadra */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-4 rounded-xl bg-slate-950/50 p-4">
              <CountRing count={starters.length} />
              <div className="text-sm">
                <p className="font-semibold text-white">{isFull ? 'Al completo' : `${10 - starters.length} posti liberi`}</p>
                <p className="text-slate-400">{waitlist.length > 0 ? `${waitlist.length} in lista d’attesa` : 'Nessuno in attesa'}</p>
              </div>
            </div>
            <div className="rounded-xl bg-slate-950/50 p-4 text-sm flex flex-col justify-center gap-1">
              {teams && teams.white.length > 0 ? (
                <>
                  <p className="font-semibold text-white">
                    {myTeam === 'white' ? 'Giochi con i Bianchi ⚪' : myTeam === 'black' ? 'Giochi con i Neri ⚫' : 'Squadre pronte'}
                  </p>
                  <Link href={`/squadre?date=${date}`} className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                    Vedi le squadre <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <>
                  <p className="font-semibold text-white">Squadre non ancora fatte</p>
                  <p className="text-slate-400">Le prepara un admin quando ci sono 10 titolari.</p>
                </>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm text-slate-300">Segna i giorni in cui puoi giocare: la partita si decide quando si arriva a 10.</p>
          <Link href="/presenze" className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-sm">
            Vai alle presenze <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      {/* Scorciatoie */}
      <nav aria-label="Scorciatoie" className="grid grid-cols-3 gap-3">
        {[
          { href: '/presenze', label: 'Presenze', hint: 'Tutti i giorni', icon: CalendarDays },
          { href: `/squadre?date=${date}`, label: 'Squadre', hint: 'Campo e voto MVP', icon: Trophy },
          { href: '/history', label: 'Storico', hint: 'Classifica', icon: History },
        ].map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.label}
              href={l.href}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col gap-2 transition-colors"
            >
              <Icon className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-semibold text-white">{l.label}</span>
              <span className="text-xs text-slate-400 hidden sm:block">{l.hint}</span>
            </Link>
          );
        })}
      </nav>
      {admin && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Sei admin: il giorno ufficiale si sceglie in Presenze o in Impostazioni → Partita della settimana.
        </p>
      )}
    </div>
  );
}
