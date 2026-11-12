'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import { notify, askConfirm } from '@/components/ui/Feedback';

import React, { useEffect, useMemo, useState } from 'react';
import { Match, Profile } from '@/types/database';
import { subscribeMatches, subscribeProfiles, deleteMatchResult } from '@/lib/firebase/firestoreService';
import { useAuth } from '@/lib/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { formatItalianDate, getVisibleHistoryYear } from '@/lib/utils/dateUtils';
import { Trophy, ListOrdered, CalendarDays, Trash2, Loader2, MoreHorizontal } from 'lucide-react';
import { MatchDetailSheet } from '@/components/MatchDetailSheet';
import { PlayerDetailSheet } from '@/components/PlayerCardFifa';
import { lastCompletedMatches } from '@/components/FormDots';
import { useStatCategories } from '@/lib/hooks/useStatCategories';
import { useForms } from '@/lib/hooks/useForms';
import { computeMatchStats } from '@/lib/utils/statUtils';
import { MatchEditModal } from '@/components/MatchEditModal';
import { HistoryCalendar } from '@/components/HistoryCalendar';

interface PlayerLine {
  id: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals: number;
  mvp: number;
}

type SortKey = 'played' | 'won' | 'drawn' | 'lost' | 'goals' | 'mvp';

/** Sortable columns of the leaderboard, in table order */
const SORT_COLUMNS: { key: SortKey; label: string; title: string; cell: string }[] = [
  { key: 'played', label: 'PG', title: 'Presenze', cell: '' },
  { key: 'won', label: 'V', title: 'Partite vinte', cell: 'text-emerald-400' },
  { key: 'drawn', label: 'P', title: 'Pareggi', cell: 'text-amber-400' },
  { key: 'lost', label: 'S', title: 'Sconfitte', cell: 'text-red-400' },
  { key: 'goals', label: 'Gol', title: 'Gol segnati', cell: '' },
  { key: 'mvp', label: 'MVP', title: 'Premi MVP', cell: '' },
];

/** Builds the leaderboard ONLY from archived matches (nothing is stored on the profiles). */
function buildLeaderboard(matches: Match[], nameOf: (id: string, fallback?: string) => string): PlayerLine[] {
  const lines = new Map<string, PlayerLine>();
  const line = (id: string, fallbackName?: string) => {
    let l = lines.get(id);
    if (!l) {
      l = { id, name: nameOf(id, fallbackName), played: 0, won: 0, drawn: 0, lost: 0, goals: 0, mvp: 0 };
      lines.set(id, l);
    }
    return l;
  };

  for (const m of matches) {
    const w = m.score_white ?? 0;
    const b = m.score_black ?? 0;
    const apply = (team: 'white' | 'black') => {
      const players = (team === 'white' ? m.team_white : m.team_black) || [];
      for (const p of players) {
        const l = line(p.id, p.name);
        l.played += 1;
        if (w === b) l.drawn += 1;
        else if ((team === 'white') === w > b) l.won += 1;
        else l.lost += 1;
      }
    };
    apply('white');
    apply('black');
    (m.scorers || []).forEach((s) => (line(s.player_id, s.player_name).goals += s.goals || 0));
    if (m.mvp_player_id) line(m.mvp_player_id).mvp += 1;
  }

  return Array.from(lines.values());
}

export default function HistoryPage() {
  const { user, profile, isAdmin: ctxIsAdmin } = useAuth();
  const isAdmin = Boolean(user && (ctxIsAdmin || profile?.role === 'admin'));
  const [deleting, setDeleting] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<'leaderboard' | 'matches'>('leaderboard');
  const [sortBy, setSortBy] = useState<SortKey>('won');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  // Clic sull'intestazione: prima decrescente, secondo clic crescente
  const handleSort = (key: SortKey) => {
    if (key === sortBy) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(key);
      setSortDir('desc');
    }
  };
  // Ultimo anno visibile: il nuovo anno compare dal 31 dicembre alle 22:00 (ora italiana)
  const [visibleYear, setVisibleYear] = useState(() => getVisibleHistoryYear());
  useEffect(() => {
    const t = setInterval(() => setVisibleYear(getVisibleHistoryYear()), 60000);
    return () => clearInterval(t);
  }, []);
  const [editing, setEditing] = useState<Match | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [season, setSeason] = useState<string>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null);
  const [detailMatchId, setDetailMatchId] = useState<string | null>(null);
  // Per la scheda del giocatore (la stessa di Giocatori): parametri, forma, statistiche di sempre, ultime 5
  const categories = useStatCategories();
  const { forms } = useForms();
  const allStats = useMemo(() => computeMatchStats(matches), [matches]);
  const recentMatches = useMemo(() => lastCompletedMatches(matches), [matches]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoaded(true);
      return;
    }
    const unsubMatches = subscribeMatches((list) => {
      setMatches(list.filter((m) => m.status === 'completed'));
      setLoaded(true);
    });
    const unsubProfiles = subscribeProfiles((list) => setProfiles(list || []));
    return () => {
      unsubMatches();
      unsubProfiles();
    };
  }, []);

  // Anni con partite + l'anno in corso (anche senza partite), mai oltre l'ultimo anno visibile
  const seasons = useMemo(
    () =>
      Array.from(new Set([String(visibleYear), ...matches.map((m) => (m.match_date || m.id).slice(0, 4))]))
        .filter((y) => Number(y) <= visibleYear)
        .sort()
        .reverse(),
    [matches, visibleYear]
  );
  const visibleMatches = useMemo(
    () => (season === 'all' ? matches : matches.filter((m) => (m.match_date || m.id).startsWith(season))),
    [matches, season]
  );

  const nameOf = (id: string, fallback?: string) =>
    profiles.find((p) => p.id === id)?.full_name || fallback || 'Giocatore';

  const leaderboard = useMemo(() => {
    const list = buildLeaderboard(visibleMatches, nameOf);
    return list.sort(
      (a, b) =>
        (sortDir === 'desc' ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy]) ||
        b.won - a.won ||
        b.goals - a.goals ||
        a.played - b.played ||
        a.name.localeCompare(b.name)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMatches, profiles, sortBy, sortDir]);

  // Cancellazione (solo admin): toglie anche le V/P/S che la partita aveva aggiunto ai profili
  const handleDeleteMatch = async (m: Match) => {
    if (!(await askConfirm(`Cancellare dallo storico la partita del ${formatItalianDate(m.match_date || m.id)}? Vittorie/pareggi/sconfitte di questa partita verranno tolti dai profili.`))) return;
    setDeleting(m.id);
    try {
      await deleteMatchResult(m.match_date || m.id);
    } catch (err) {
      console.warn('[Storico] cancellazione non riuscita:', err);
      notify('Cancellazione non riuscita. Riprova.');
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!(await askConfirm(`Vuoi davvero cancellare tutto lo storico${season === 'all' ? '' : ` ${season}`}?`))) return;
    setDeleting('all');
    try {
      for (const m of visibleMatches) {
        await deleteMatchResult(m.match_date || m.id);
      }
    } catch (err) {
      console.warn('[Storico] cancellazione non riuscita:', err);
      notify('Cancellazione interrotta. Alcune partite potrebbero essere ancora presenti: riprova.');
    } finally {
      setDeleting(null);
    }
  };

  const totalGoals = visibleMatches.reduce((acc, m) => acc + (m.score_white ?? 0) + (m.score_black ?? 0), 0);

  // Dettagli in finestra: giocatore (stesso di Giocatori) e partita
  const detailPlayer = profiles.find((p) => p.id === detailPlayerId) || null;
  const detailMatch = matches.find((m) => m.id === detailMatchId) || null;

  const UNIT: Record<SortKey, string> = { played: 'partite', won: 'vinte', drawn: 'pari', lost: 'perse', goals: 'gol', mvp: 'MVP' };
  const zeroTone = (v: number, tone: string) => (v === 0 ? 'text-slate-600' : tone);
  const shortDate = (d: string) => {
    const [y, mo, dd] = d.split('-').map(Number);
    return new Date(y, mo - 1, dd).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  };
  const shortName = (full: string) => {
    const [first, ...rest] = full.trim().split(/\s+/);
    return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Titolo + stagione (e menu admin) sulla stessa riga */}
      <header className="flex items-center justify-between gap-3 min-h-[2.5rem]">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Storico</h1>
        <div className="flex items-center gap-2">
          {seasons.length > 0 && (
            <select
              value={season}
              onChange={(e) => {
                setSeason(e.target.value);
                setPickedDate(null);
              }}
              aria-label="Stagione"
              className="bg-slate-900 border border-slate-800 rounded-full pl-3.5 pr-8 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Tutte le stagioni</option>
              {seasons.map((y) => (
                <option key={y} value={y}>
                  Stagione {y}
                </option>
              ))}
            </select>
          )}
          {isAdmin && visibleMatches.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Altre azioni"
                aria-expanded={menuOpen}
                className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                  <div className="absolute right-0 top-full mt-1 z-40 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-1 animate-in">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        handleDeleteAll();
                      }}
                      disabled={deleting !== null}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      {deleting === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      {season === 'all' ? 'Cancella tutto lo storico' : `Cancella storico ${season}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Numeri in una striscia + selettore Classifica / Partite */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
          {(
            [
              [visibleMatches.length, 'partite'],
              [totalGoals, 'gol'],
              [leaderboard.length, 'giocatori'],
            ] as const
          ).map(([v, label]) => (
            <span key={label} className="flex-shrink-0 rounded-full bg-slate-900 px-3.5 py-1.5 text-sm text-slate-400 whitespace-nowrap">
              <span className="font-semibold text-white tabular-nums">{v}</span> {label}
            </span>
          ))}
        </div>
        <div className="flex items-center bg-slate-900 p-1 rounded-full border border-slate-800 text-sm self-stretch sm:self-auto" role="radiogroup" aria-label="Vista">
          {(
            [
              ['leaderboard', 'Classifica', ListOrdered],
              ['matches', 'Partite', CalendarDays],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={view === key}
              onClick={() => setView(key)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full font-semibold transition-colors ${
                view === key ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {!loaded ? (
        <div className="space-y-3" role="status" aria-label="Caricamento in corso">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : visibleMatches.length === 0 ? (
        <div className="rounded-2xl bg-slate-900/60 p-8 text-center space-y-2">
          <Trophy className="h-8 w-8 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-300 font-semibold">Nessuna partita archiviata</p>
          <p className="text-sm text-slate-500">Dopo ogni partita un admin inserisce risultato, marcatori e MVP.</p>
        </div>
      ) : view === 'leaderboard' ? (
        <>
          {/* Telefono e tablet: righe, ordinamento dalla tendina */}
          <div className="lg:hidden space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">Tocca un giocatore per la sua scheda</span>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortKey);
                  setSortDir('desc');
                }}
                aria-label="Ordina per"
                className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="won">Per vittorie</option>
                <option value="goals">Per gol</option>
                <option value="mvp">Per MVP</option>
                <option value="played">Per presenze</option>
                <option value="drawn">Per pareggi</option>
                <option value="lost">Per sconfitte</option>
              </select>
            </div>
            <ul className="bg-slate-900 rounded-2xl divide-y divide-slate-800 overflow-hidden">
              {leaderboard.map((l, idx) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => profiles.some((p) => p.id === l.id) && setDetailPlayerId(l.id)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-slate-800/60"
                  >
                    <span className={`w-6 flex-shrink-0 text-center text-sm tabular-nums ${idx < 3 ? 'font-bold text-white' : 'text-slate-500'}`}>{idx + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{l.name}</span>
                      <span className="block text-xs text-slate-400 tabular-nums">
                        {l.played} {l.played === 1 ? 'partita' : 'partite'} ·{' '}
                        <span className={zeroTone(l.won, 'text-emerald-400')}>{l.won}V</span>{' '}
                        <span className={zeroTone(l.drawn, 'text-amber-400')}>{l.drawn}P</span>{' '}
                        <span className={zeroTone(l.lost, 'text-red-400')}>{l.lost}S</span>
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-right">
                      <span className={`block text-lg font-bold tabular-nums leading-none ${l[sortBy] === 0 ? 'text-slate-600' : 'text-white'}`}>
                        {l[sortBy]}
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">{UNIT[sortBy]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* PC: tabella pulita, intestazioni ordinabili */}
          <div className="hidden lg:block bg-slate-900 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-800">
                  <th className="text-left pl-5 pr-2 py-3 w-14">#</th>
                  <th className="text-left px-2 py-3">Giocatore</th>
                  {SORT_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={`p-0 w-20 ${sortBy === c.key ? 'bg-slate-800/40' : ''}`}
                      aria-sort={sortBy === c.key ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(c.key)}
                        title={`Ordina per ${c.title}`}
                        className={`w-full px-2 py-3 font-semibold whitespace-nowrap ${sortBy === c.key ? 'text-white' : 'hover:text-white'}`}
                      >
                        {c.label}
                        <span className="inline-block w-3 text-[9px]" aria-hidden="true">
                          {sortBy === c.key ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((l, idx) => (
                  <tr key={l.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                    <td className={`pl-5 pr-2 py-2.5 tabular-nums ${idx < 3 ? 'font-bold text-white' : 'text-slate-500'}`}>{idx + 1}</td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => profiles.some((p) => p.id === l.id) && setDetailPlayerId(l.id)}
                        className="font-semibold text-white hover:text-emerald-300 text-left"
                      >
                        {l.name}
                      </button>
                    </td>
                    {SORT_COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={`px-2 py-2.5 text-center tabular-nums ${sortBy === c.key ? 'bg-slate-800/40 font-semibold' : ''} ${zeroTone(l[c.key], c.cell || 'text-slate-200')}`}
                      >
                        {l[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="space-y-4 lg:grid lg:grid-cols-[22rem_1fr] lg:gap-6 lg:space-y-0 lg:items-start">
          <HistoryCalendar
            matchDates={visibleMatches.map((m) => m.match_date || m.id)}
            selected={pickedDate}
            onSelect={setPickedDate}
            maxYear={visibleYear}
          />
          <ul className="bg-slate-900 rounded-2xl divide-y divide-slate-800 overflow-hidden">
            {visibleMatches
              .filter((m) => !pickedDate || (m.match_date || m.id) === pickedDate)
              .sort((a, b) => (b.match_date || b.id).localeCompare(a.match_date || a.id))
              .map((m) => {
                const w = m.score_white ?? 0;
                const b = m.score_black ?? 0;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setDetailMatchId(m.id)}
                      className="w-full grid grid-cols-[5.5rem_1fr_minmax(0,7rem)] sm:grid-cols-[7rem_1fr_minmax(0,10rem)] items-center gap-2 px-3.5 py-3 text-left hover:bg-slate-800/60"
                    >
                      <span className="text-sm text-slate-400 capitalize">{shortDate(m.match_date || m.id)}</span>
                      <span className="flex items-center justify-center gap-2 text-sm">
                        <span className="hidden sm:inline text-slate-400">Bianchi</span>
                        <span className={`text-lg font-bold tabular-nums ${w > b ? 'text-emerald-400' : 'text-white'}`}>{w}</span>
                        <span className="text-slate-600">–</span>
                        <span className={`text-lg font-bold tabular-nums ${b > w ? 'text-emerald-400' : 'text-white'}`}>{b}</span>
                        <span className="hidden sm:inline text-slate-400">Neri</span>
                      </span>
                      <span className="truncate text-right text-xs text-amber-300">
                        {m.mvp_player_id ? `⭐ ${shortName(nameOf(m.mvp_player_id))}` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {detailPlayer && (
        <PlayerDetailSheet
          player={detailPlayer}
          categories={categories}
          form={forms.get(detailPlayer.id)}
          matchStats={allStats.get(detailPlayer.id)}
          recentMatches={recentMatches}
          isAdmin={false}
          onClose={() => setDetailPlayerId(null)}
        />
      )}

      {detailMatch && (
        <MatchDetailSheet
          match={detailMatch}
          nameOf={nameOf}
          isAdmin={isAdmin}
          busy={deleting !== null}
          onClose={() => setDetailMatchId(null)}
          onEdit={(m) => {
            setDetailMatchId(null);
            setEditing(m);
          }}
          onDelete={async (m) => {
            setDetailMatchId(null);
            await handleDeleteMatch(m);
          }}
        />
      )}

      {editing && (
        <MatchEditModal
          match={editing}
          profiles={profiles}
          closedBy={profile?.id || ''}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
