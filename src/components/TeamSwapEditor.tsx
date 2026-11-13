'use client';

import React, { useState } from 'react';
import { MatchTeamPlayer } from '@/types/database';
import { slotLabel } from '@/lib/utils/teamUtils';
import { slotsForTeamSize } from '@/lib/utils/matchFormat';
import { ArrowLeftRight } from 'lucide-react';

type Side = 'white' | 'black' | 'bench';
interface Selection {
  side: Side;
  index: number;
}

interface TeamSwapEditorProps {
  white: MatchTeamPlayer[];
  black: MatchTeamPlayer[];
  onChange: (white: MatchTeamPlayer[], black: MatchTeamPlayer[]) => void;
  /** Players not in the teams who can replace someone (e.g. all players, in the history). */
  bench?: MatchTeamPlayer[];
  disabled?: boolean;
  /** false = goalkeeper in rotation (first slot shown as "PORTA ↻") */
  fixedKeeper?: boolean;
  /** Formation of the match (7vs7, 8vs8…): names of the places; default from the team size */
  formation?: string;
}

/**
 * Manual team editing made for phones: tap a player, then tap another one to swap them
 * (between the two teams or between roles). With a bench, tap a bench player and then a slot to replace.
 */
export function TeamSwapEditor({ white, black, onChange, bench = [], disabled, fixedKeeper = true, formation }: TeamSwapEditorProps) {
  const slots = slotsForTeamSize(Math.max(white.length, black.length), formation);
  const [selected, setSelected] = useState<Selection | null>(null);

  const listOf = (side: Side) => (side === 'white' ? white : side === 'black' ? black : bench);

  const handleTap = (side: Side, index: number) => {
    if (disabled) return;
    if (!selected) {
      setSelected({ side, index });
      return;
    }
    if (selected.side === side && selected.index === index) {
      setSelected(null);
      return;
    }
    if (selected.side === 'bench' && side === 'bench') {
      setSelected({ side, index });
      return;
    }

    const nextWhite = [...white];
    const nextBlack = [...black];
    const target = (s: Side) => (s === 'white' ? nextWhite : nextBlack);

    if (selected.side === 'bench' || side === 'bench') {
      // Sostituzione con un giocatore fuori squadra
      const benchIdx = selected.side === 'bench' ? selected.index : index;
      const slot = selected.side === 'bench' ? { side, index } : selected;
      target(slot.side)[slot.index] = bench[benchIdx];
    } else {
      // Scambio tra due posti (stessa squadra = cambio ruolo, squadre diverse = cambio maglia)
      const a = listOf(selected.side)[selected.index];
      const b = listOf(side)[index];
      target(selected.side)[selected.index] = b;
      target(side)[index] = a;
    }
    setSelected(null);
    onChange(nextWhite, nextBlack);
  };

  const slotClass = (side: Side, index: number) => {
    const isSel = selected?.side === side && selected.index === index;
    return `w-full min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-sm font-semibold transition-all ${
      isSel
        ? 'border-amber-400 bg-amber-400/15 text-white ring-2 ring-amber-400/50'
        : selected
        ? 'border-slate-700 bg-slate-950 text-slate-200 hover:border-emerald-500'
        : 'border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-600'
    } disabled:opacity-60`;
  };

  const renderTeam = (side: 'white' | 'black', title: string) => (
    <div className="space-y-1.5">
      <div className="text-xs font-bold text-slate-300">{title}</div>
      {listOf(side).map((p, i) => (
        <button
          key={`${side}-${p.id}-${i}`}
          type="button"
          disabled={disabled}
          onClick={() => handleTap(side, i)}
          className={slotClass(side, i)}
          aria-pressed={selected?.side === side && selected.index === i}
        >
          <span className="w-12 flex-shrink-0 text-[10px] font-mono font-bold text-emerald-400">
            {slotLabel(i, fixedKeeper, slots)}
          </span>
          <span className="truncate">{p.name}</span>
        </button>
      ))}
    </div>
  );

  const benchPlayers = bench.filter((b) => ![...white, ...black].some((p) => p.id === b.id));

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
        {selected
          ? 'Ora tocca il giocatore con cui scambiarlo (tocca di nuovo per annullare).'
          : 'Tocca un giocatore e poi un altro per scambiarli di squadra o di ruolo.'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {renderTeam('white', '⚪ Bianchi')}
        {renderTeam('black', '⚫ Neri')}
      </div>
      {benchPlayers.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-bold text-slate-400">
            Altri giocatori (tocca e poi scegli chi sostituire)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {bench.map((p, i) =>
              benchPlayers.includes(p) ? (
                <button
                  key={`bench-${p.id}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleTap('bench', i)}
                  className={`px-3 py-2 rounded-full border text-xs font-semibold ${
                    selected?.side === 'bench' && selected.index === i
                      ? 'border-amber-400 bg-amber-400/15 text-white'
                      : 'border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {p.name}
                </button>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}
