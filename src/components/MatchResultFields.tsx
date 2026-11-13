'use client';

import React, { useState } from 'react';
import { MatchScorer, MatchTeamPlayer } from '@/types/database';
import { validateScorers, type MatchResultValue } from '@/lib/utils/resultValidation';
import { NumberInput } from '@/components/NumberInput';
import { Star, Plus, Minus, X, AlertCircle } from 'lucide-react';

// Tipo e controllo dei marcatori vivono in lib/utils/resultValidation (funzioni pure, testate)
export type { MatchResultValue } from '@/lib/utils/resultValidation';
export { validateScorers } from '@/lib/utils/resultValidation';

interface MatchResultFieldsProps {
  value: MatchResultValue;
  onChange: (value: MatchResultValue) => void;
  white: MatchTeamPlayer[];
  black: MatchTeamPlayer[];
  /** MVP votes of the players (Squadre page), shown next to the names: the admin can still pick anyone */
  mvpVotes?: { playerId: string; count: number }[];
  /** Club plays with a fixed goalkeeper: shows "Rigori parati" for the two goalkeepers (first slot of each team) */
  fixedKeeper?: boolean;
}

/** Final score, MVP and scorers of a match (used in Admin → Match & Cassa and in the history editor). */
export function MatchResultFields({ value, onChange, white, black, mvpVotes = [], fixedKeeper = false }: MatchResultFieldsProps) {
  const votesOf = (id: string) => mvpVotes.find((v) => v.playerId === id)?.count || 0;
  const mvpLabel = (p: MatchTeamPlayer) => (votesOf(p.id) > 0 ? `${p.name} (${votesOf(p.id)} voti)` : p.name);
  const topVoted = mvpVotes[0];
  const [newScorerId, setNewScorerId] = useState('');
  const set = (patch: Partial<MatchResultValue>) => onChange({ ...value, ...patch });

  const totalGoals = value.scoreWhite + value.scoreBlack;
  const scorerGoals = value.scorers.reduce((acc, s) => acc + (s.goals || 0), 0);
  const remaining = Math.max(0, totalGoals - scorerGoals);
  const { error, warnings } = validateScorers(value, white, black);
  const players = [...white, ...black];
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name || 'Giocatore';

  const addGoal = (playerId: string, delta: number) => {
    if (!playerId) return;
    if (delta > 0 && remaining <= 0) return;
    const existing = value.scorers.find((s) => s.player_id === playerId);
    let scorers: MatchScorer[];
    if (existing) {
      scorers = value.scorers
        .map((s) => (s.player_id === playerId ? { ...s, goals: s.goals + delta } : s))
        .filter((s) => s.goals > 0);
    } else if (delta > 0) {
      scorers = [...value.scorers, { player_id: playerId, player_name: nameOf(playerId), goals: delta }];
    } else {
      return;
    }
    set({ scorers });
  };

  const teamOf = (id: string) => (white.some((p) => p.id === id) ? '⚪' : '⚫');

  const keepers = [white[0], black[0]].filter((p): p is MatchTeamPlayer => Boolean(p));
  const savesOf = (id: string) => (value.penaltySaves || []).find((x) => x.player_id === id)?.count || 0;
  const setSaves = (p: MatchTeamPlayer, count: number) => {
    const others = (value.penaltySaves || []).filter((x) => x.player_id !== p.id);
    set({ penaltySaves: count > 0 ? [...others, { player_id: p.id, player_name: p.name, count }] : others });
  };

  return (
    <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      {/* Risultato */}
      <div className="min-w-0 bg-slate-950 p-3 sm:p-4 rounded-2xl border border-slate-800 space-y-3">
        <h3 className="text-xs font-bold text-slate-300">Risultato finale</h3>
        {/* Per ogni squadra: nome, ovale del colore della maglia, casella del punteggio (in colonna, allineati) */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1 sm:gap-2">
          {(
            [
              ['Bianchi', 'scoreWhite', 'h-[9px] w-[33px] bg-white'],
              null,
              ['Neri', 'scoreBlack', 'h-2.5 w-9 bg-slate-950 border border-slate-500'],
            ] as const
          ).map((team) =>
            team === null ? (
              <span key="sep" className="h-12 sm:h-14 flex items-center text-xl font-bold text-slate-600" aria-hidden="true">
                –
              </span>
            ) : (
              <div key={team[0]} className="min-w-0 flex flex-col items-center gap-1.5">
                <span className="text-xs font-semibold text-white">{team[0]}</span>
                <span className={`block rounded-full ${team[2]}`} aria-hidden="true" />
                <NumberInput
                  min={0}
                  max={50}
                  value={value[team[1]]}
                  onValueChange={(v) => set({ [team[1]]: v } as Partial<typeof value>)}
                  aria-label={`Gol ${team[0]}`}
                  className="w-12 h-12 sm:w-16 sm:h-14 bg-slate-900 border-2 border-slate-700 text-center text-xl sm:text-2xl font-bold text-white tabular-nums rounded-xl focus:border-emerald-500 focus:outline-none"
                />
                {/* − / + comodi per il pollice */}
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => set({ [team[1]]: Math.max(0, value[team[1]] - 1) } as Partial<typeof value>)}
                    disabled={value[team[1]] <= 0}
                    aria-label={`Un gol in meno ai ${team[0]}`}
                    className="h-8 w-8 rounded-full bg-slate-800 text-slate-200 flex items-center justify-center hover:bg-slate-700 disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ [team[1]]: Math.min(50, value[team[1]] + 1) } as Partial<typeof value>)}
                    aria-label={`Un gol in più ai ${team[0]}`}
                    className="h-8 w-8 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center justify-center hover:bg-emerald-500/25"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </span>
              </div>
            )
          )}
        </div>
        <p className="text-center text-xs font-semibold text-emerald-400">
          {value.scoreWhite > value.scoreBlack
            ? 'Vittoria Bianchi'
            : value.scoreBlack > value.scoreWhite
            ? 'Vittoria Neri'
            : 'Pareggio'}
        </p>
      </div>

      {/* MVP */}
      <div className="min-w-0 bg-slate-950 p-3 sm:p-4 rounded-2xl border border-slate-800 space-y-3">
        <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Star className="h-4 w-4 text-amber-400" /> MVP
        </h3>
        <select
          aria-label="MVP della partita"
          value={value.mvpPlayerId}
          onChange={(e) => set({ mvpPlayerId: e.target.value })}
          className="w-full min-w-0 px-2.5 sm:px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm font-semibold truncate focus:outline-none focus:border-amber-400"
        >
          <option value="">-- Nessun MVP --</option>
          <optgroup label="⚪ Bianchi">
            {white.map((p) => (
              <option key={p.id} value={p.id}>{mvpLabel(p)}</option>
            ))}
          </optgroup>
          <optgroup label="⚫ Neri">
            {black.map((p) => (
              <option key={p.id} value={p.id}>{mvpLabel(p)}</option>
            ))}
          </optgroup>
        </select>
        {topVoted && players.some((p) => p.id === topVoted.playerId) ? (
          <p className="text-xs text-slate-400">
            Voto dei giocatori: più votato <strong className="text-amber-300">{nameOf(topVoted.playerId)}</strong> ({topVoted.count}{' '}
            {topVoted.count === 1 ? 'voto' : 'voti'}).
            {value.mvpPlayerId !== topVoted.playerId && (
              <>
                {' '}
                <button type="button" onClick={() => set({ mvpPlayerId: topVoted.playerId })} className="text-emerald-400 underline font-semibold">
                  Usa il più votato
                </button>
              </>
            )}
          </p>
        ) : (
          <p className="text-xs text-slate-500">Nessun voto dei giocatori per ora.</p>
        )}
      </div>

      {/* Marcatori: a tutta larghezza, così i nomi si leggono interi */}
      <div className="col-span-2 bg-slate-950 p-3 sm:p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300">Marcatori</h3>
          <span className={`text-xs font-mono font-bold ${error ? 'text-rose-400' : 'text-slate-400'}`}>
            {scorerGoals}/{totalGoals} gol
          </span>
        </div>

        <div className="flex gap-2 sm:max-w-md">
          <select
            value={newScorerId}
            onChange={(e) => setNewScorerId(e.target.value)}
            disabled={remaining <= 0}
            className="flex-1 min-w-0 px-2.5 py-2 bg-slate-900 border border-slate-800 text-slate-200 rounded-lg text-sm disabled:opacity-50"
          >
            <option value="">{remaining > 0 ? 'Chi ha segnato?' : 'Tutti i gol assegnati'}</option>
            <optgroup label="⚪ Bianchi">
              {white.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
            <optgroup label="⚫ Neri">
              {black.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          </select>
          <button
            type="button"
            onClick={() => {
              addGoal(newScorerId, 1);
              setNewScorerId('');
            }}
            disabled={!newScorerId || remaining <= 0}
            aria-label="Aggiungi gol"
            className="px-3 py-2 bg-emerald-500 text-slate-950 rounded-lg text-sm font-bold disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {value.scorers.length > 0 && (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {value.scorers.map((s) => (
              <li
                key={s.player_id}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-sm"
              >
                <span className="flex-1 min-w-0 truncate text-slate-200" title={nameOf(s.player_id) || s.player_name}>
                  {teamOf(s.player_id)} {nameOf(s.player_id) || s.player_name}
                </span>
                <button
                  type="button"
                  onClick={() => addGoal(s.player_id, -1)}
                  aria-label="Togli un gol"
                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-6 text-center font-mono font-bold text-emerald-300">{s.goals}</span>
                <button
                  type="button"
                  onClick={() => addGoal(s.player_id, 1)}
                  disabled={remaining <= 0}
                  aria-label="Aggiungi un gol"
                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => set({ scorers: value.scorers.filter((x) => x.player_id !== s.player_id) })}
                  aria-label="Rimuovi marcatore"
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="text-xs text-rose-300 flex items-start gap-1.5">
            <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
          </p>
        )}
        {warnings.map((w) => (
          <p key={w} className="text-xs text-amber-300 flex items-start gap-1.5">
            <AlertCircle className="h-4 w-4 flex-shrink-0" /> {w} (ok solo se c&apos;è stato un autogol)
          </p>
        ))}
      </div>
    </div>

    {fixedKeeper && keepers.length > 0 && (
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
        <h3 className="text-xs font-bold text-slate-300">Rigori parati (portiere)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {keepers.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm">
              <span className="flex-1 truncate text-slate-200">
                {i === 0 ? '⚪' : '⚫'} {p.name}
              </span>
              <button
                type="button"
                onClick={() => setSaves(p, Math.max(0, savesOf(p.id) - 1))}
                aria-label={`Togli un rigore parato a ${p.name}`}
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center font-mono font-bold text-emerald-300">{savesOf(p.id)}</span>
              <button
                type="button"
                onClick={() => setSaves(p, Math.min(5, savesOf(p.id) + 1))}
                aria-label={`Aggiungi un rigore parato a ${p.name}`}
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">Il portiere è il primo giocatore di ogni squadra (posto POR).</p>
      </div>
    )}
    </div>
  );
}
