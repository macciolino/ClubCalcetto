'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Match, Profile } from '@/types/database';
import { subscribeMatches, subscribeProfiles, deleteMatchResult } from '@/lib/firebase/firestoreService';
import { useAuth } from '@/lib/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { formatItalianDate, getVisibleHistoryYear } from '@/lib/utils/dateUtils';
import { History, Trophy, Star, ListOrdered, CalendarDays, Coins, Trash2, Loader2, Pencil } from 'lucide-react';
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
  { key: 'won', label: 'V', title: 'Partite vinte', cell: 'font-black text-emerald-400' },
  { key: 'drawn', label: 'P', title: 'Pareggi', cell: 'text-amber-400' },
  { key: 'lost', label: 'S', title: 'Sconfitte', cell: 'text-rose-400' },
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
    if (!confirm(`Cancellare dallo storico la partita del ${formatItalianDate(m.match_date || m.id)}? Vittorie/pareggi/sconfitte di questa partita verranno tolti dai profili.`)) return;
    setDeleting(m.id);
    try {
      await deleteMatchResult(m.match_date || m.id);
    } catch (err) {
      console.warn('[Storico] cancellazione non riuscita:', err);
      alert('Cancellazione non riuscita. Riprova.');
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Vuoi davvero cancellare tutto lo storico${season === 'all' ? '' : ` ${season}`}?`)) return;
    setDeleting('all');
    try {
      for (const m of visibleMatches) {
        await deleteMatchResult(m.match_date || m.id);
      }
    } catch (err) {
      console.warn('[Storico] cancellazione non riuscita:', err);
      alert('Cancellazione interrotta. Alcune partite potrebbero essere ancora presenti: riprova.');
    } finally {
      setDeleting(null);
    }
  };

  const totalGoals = visibleMatches.reduce((acc, m) => acc + (m.score_white ?? 0) + (m.score_black ?? 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Intestazione */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-emerald-400" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Storico Partite</h1>
          </div>
          <p className="text-sm text-slate-400">
            Risultati, marcatori e MVP di tutte le partite archiviate dall&apos;admin.
          </p>
        </div>
        {seasons.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <span>Stagione</span>
            <select
              value={season}
              onChange={(e) => { setSeason(e.target.value); setPickedDate(null); }}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-slate-500"
            >
              <option value="all">Tutte</option>
              {seasons.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Riepilogo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-white">{visibleMatches.length}</div>
          <div className="text-xs text-slate-400 font-semibold">Partite</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-white">{totalGoals}</div>
          <div className="text-xs text-slate-400 font-semibold">Gol totali</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-white">{leaderboard.length}</div>
          <div className="text-xs text-slate-400 font-semibold">Giocatori</div>
        </div>
      </div>

      {/* Selettore vista */}
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-sm w-full sm:w-auto sm:inline-flex">
        <button
          type="button"
          onClick={() => setView('leaderboard')}
          aria-pressed={view === 'leaderboard'}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all ${
            view === 'leaderboard' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          <ListOrdered className="h-4 w-4" /> Classifica
        </button>
        <button
          type="button"
          onClick={() => setView('matches')}
          aria-pressed={view === 'matches'}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all ${
            view === 'matches' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
          }`}
        >
          <CalendarDays className="h-4 w-4" /> Partite
        </button>
      </div>

      {isAdmin && visibleMatches.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDeleteAll}
            disabled={deleting !== null}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border border-rose-500/40 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50"
          >
            {deleting === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {season === 'all' ? 'Cancella tutto lo storico' : `Cancella storico ${season}`}
          </button>
        </div>
      )}

      {!loaded ? (
        <p className="text-sm text-slate-400">Caricamento…</p>
      ) : visibleMatches.length === 0 ? (
        <div className="bg-slate-900 border border-dashed border-slate-700 rounded-3xl p-8 text-center space-y-2">
          <Trophy className="h-8 w-8 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-300 font-semibold">Nessuna partita archiviata</p>
          <p className="text-sm text-slate-500">
            Dopo ogni partita l&apos;admin inserisce risultato, marcatori e MVP in Admin → Match & Cassa.
          </p>
        </div>
      ) : view === 'leaderboard' ? (
        <div className="space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="text-left px-3 py-3">#</th>
                    <th className="text-left px-2 py-3">Giocatore</th>
                    {SORT_COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        className="p-0"
                        aria-sort={sortBy === c.key ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort(c.key)}
                          title={`Ordina per ${c.title}`}
                          className={`w-full px-2 py-3 uppercase tracking-wider font-bold whitespace-nowrap ${
                            sortBy === c.key ? 'text-emerald-300' : 'hover:text-white'
                          }`}
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
                    <tr key={l.id} className="border-b border-slate-800/60 last:border-0 text-slate-200">
                      <td className="px-3 py-2.5 font-mono text-slate-500">{idx + 1}</td>
                      <td className="px-2 py-2.5 font-semibold whitespace-nowrap">{l.name}</td>
                      {SORT_COLUMNS.map((c) => (
                        <td key={c.key} className={`px-2 py-2.5 text-center font-mono ${c.cell}`}>
                          {l[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
        <HistoryCalendar
          matchDates={visibleMatches.map((m) => m.match_date || m.id)}
          selected={pickedDate}
          onSelect={setPickedDate}
          maxYear={visibleYear}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleMatches.filter((m) => !pickedDate || (m.match_date || m.id) === pickedDate).map((m) => {
            const w = m.score_white ?? 0;
            const b = m.score_black ?? 0;
            const mvpName = m.mvp_player_id ? nameOf(m.mvp_player_id) : null;
            return (
              <article key={m.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white">{formatItalianDate(m.match_date || m.id)}</h2>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setEditing(m)}
                      disabled={deleting !== null}
                      aria-label="Modifica partita"
                      className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Modifica
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMatch(m)}
                      disabled={deleting !== null}
                      aria-label="Cancella partita dallo storico"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-rose-300 hover:bg-rose-500/15 disabled:opacity-50"
                    >
                      {deleting === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Cancella
                    </button>
                  )}
                  {m.total_cost ? (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Coins className="h-3.5 w-3.5" />€{Number(m.total_cost).toFixed(0)} · €
                      {(Number(m.total_cost) / 10).toFixed(2)} a testa
                    </span>
                  ) : null}
                </header>

                <div className="flex items-center justify-center gap-4">
                  <div className="text-center flex-1">
                    <div className="text-xs font-bold uppercase text-slate-300">Bianchi</div>
                    <div className={`text-4xl font-black ${w > b ? 'text-emerald-400' : 'text-white'}`}>{w}</div>
                  </div>
                  <span className="text-slate-600 font-black">-</span>
                  <div className="text-center flex-1">
                    <div className="text-xs font-bold uppercase text-slate-300">Neri</div>
                    <div className={`text-4xl font-black ${b > w ? 'text-emerald-400' : 'text-white'}`}>{b}</div>
                  </div>
                </div>

                {(m.team_white?.length || m.team_black?.length) ? (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <ul className="space-y-0.5 text-slate-300">
                      {(m.team_white || []).map((p) => (
                        <li key={p.id} className="truncate">{nameOf(p.id, p.name)}</li>
                      ))}
                    </ul>
                    <ul className="space-y-0.5 text-slate-300 text-right">
                      {(m.team_black || []).map((p) => (
                        <li key={p.id} className="truncate">{nameOf(p.id, p.name)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="space-y-1.5 text-sm border-t border-slate-800 pt-3">
                  {mvpName && (
                    <p className="flex items-center gap-1.5 text-amber-300 font-semibold">
                      <Star className="h-4 w-4" /> MVP: {mvpName}
                    </p>
                  )}
                  {(m.scorers || []).length > 0 && (
                    <p className="text-slate-300">
                      ⚽ {(m.scorers || []).map((s) => `${nameOf(s.player_id, s.player_name)} (${s.goals})`).join(', ')}
                    </p>
                  )}
                  {(m.penalty_saves || []).length > 0 && (
                    <p className="text-slate-300">
                      🧤 Rigori parati: {(m.penalty_saves || []).map((p) => `${nameOf(p.player_id, p.player_name)} (${p.count})`).join(', ')}
                    </p>
                  )}
                  {!mvpName && !(m.scorers || []).length && (
                    <p className="text-slate-500">Nessun marcatore o MVP inserito.</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        </div>
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
