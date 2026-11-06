'use client';

import React, { useState } from 'react';
import { MatchScorer, MatchTeamPlayer } from '@/types/database';
import { NumberInput } from '@/components/NumberInput';
import { Star, Plus, Minus, X, AlertCircle } from 'lucide-react';

export interface MatchResultValue {
  scoreWhite: number;
  scoreBlack: number;
  mvpPlayerId: string;
  scorers: MatchScorer[];
}

/**
 * Checks the scorers against the final result.
 * error  → saving is blocked (more scorer goals than goals in the match);
 * warnings → shown but allowed (e.g. own goals make per-team totals differ).
 */
export function validateScorers(
  value: MatchResultValue,
  white: MatchTeamPlayer[],
  black: MatchTeamPlayer[]
): { error: string | null; warnings: string[] } {
  const totalGoals = value.scoreWhite + value.scoreBlack;
  const scorerGoals = value.scorers.reduce((acc, s) => acc + (s.goals || 0), 0);
  if (scorerGoals > totalGoals) {
    return {
      error: `I gol dei marcatori (${scorerGoals}) superano i gol del risultato finale (${totalGoals}). Correggi prima di salvare.`,
      warnings: [],
    };
  }
  const warnings: string[] = [];
  const goalsOf = (team: MatchTeamPlayer[]) =>
    value.scorers.filter((s) => team.some((p) => p.id === s.player_id)).reduce((acc, s) => acc + s.goals, 0);
  if (goalsOf(white) > value.scoreWhite) {
    warnings.push(`I marcatori dei Bianchi hanno ${goalsOf(white)} gol ma i Bianchi ne hanno fatti ${value.scoreWhite}.`);
  }
  if (goalsOf(black) > value.scoreBlack) {
    warnings.push(`I marcatori dei Neri hanno ${goalsOf(black)} gol ma i Neri ne hanno fatti ${value.scoreBlack}.`);
  }
  return { error: null, warnings };
}

interface MatchResultFieldsProps {
  value: MatchResultValue;
  onChange: (value: MatchResultValue) => void;
  white: MatchTeamPlayer[];
  black: MatchTeamPlayer[];
  /** MVP votes of the players (Squadre page), shown next to the names: the admin can still pick anyone */
  mvpVotes?: { playerId: string; count: number }[];
}

/** Final score, MVP and scorers of a match (used in Admin → Match & Cassa and in the history editor). */
export function MatchResultFields({ value, onChange, white, black, mvpVotes = [] }: MatchResultFieldsProps) {
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Risultato */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">⚽ Risultato finale</h3>
        <div className="flex items-center justify-around gap-3">
          <label className="text-center space-y-1">
            <span className="text-xs font-bold text-white block">⚪ Bianchi</span>
            <NumberInput
              min={0}
              max={50}
              value={value.scoreWhite}
              onValueChange={(v) => set({ scoreWhite: v })}
              className="w-16 h-14 bg-slate-900 border-2 border-slate-700 text-center text-2xl font-black text-white rounded-xl focus:border-emerald-500 focus:outline-none"
            />
          </label>
          <span className="text-xl font-black text-slate-600">-</span>
          <label className="text-center space-y-1">
            <span className="text-xs font-bold text-white block">⚫ Neri</span>
            <NumberInput
              min={0}
              max={50}
              value={value.scoreBlack}
              onValueChange={(v) => set({ scoreBlack: v })}
              className="w-16 h-14 bg-slate-900 border-2 border-slate-700 text-center text-2xl font-black text-white rounded-xl focus:border-emerald-500 focus:outline-none"
            />
          </label>
        </div>
        <p className="text-center text-[11px] font-mono text-emerald-400 font-bold uppercase">
          {value.scoreWhite > value.scoreBlack
            ? 'Vittoria Bianchi'
            : value.scoreBlack > value.scoreWhite
            ? 'Vittoria Neri'
            : 'Pareggio'}
        </p>
      </div>

      {/* MVP */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Star className="h-4 w-4 text-amber-400" /> MVP
        </h3>
        <select
          value={value.mvpPlayerId}
          onChange={(e) => set({ mvpPlayerId: e.target.value })}
          className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm font-semibold focus:outline-none focus:border-amber-400"
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

      {/* Marcatori */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Marcatori</h3>
          <span className={`text-xs font-mono font-bold ${error ? 'text-rose-400' : 'text-slate-400'}`}>
            {scorerGoals}/{totalGoals} gol
          </span>
        </div>

        <div className="flex gap-2">
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
          <ul className="space-y-1.5">
            {value.scorers.map((s) => (
              <li
                key={s.player_id}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-sm"
              >
                <span className="flex-1 truncate text-slate-200">
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
                <span className="w-6 text-center font-mono font-black text-emerald-300">{s.goals}</span>
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
  );
}
