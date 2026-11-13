'use client';

import React from 'react';
import { Match } from '@/types/database';
import { formatItalianDate } from '@/lib/utils/dateUtils';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { Pencil, Trash2 } from 'lucide-react';

/**
 * Archived match detail (Storico; reusable elsewhere): big score, the two line-ups side by side with
 * ⚽ goals, ⭐ MVP and 🧤 penalty saves next to the names, cost. Admin footer: Modifica / Cancella.
 */
export function MatchDetailSheet({
  match,
  nameOf,
  isAdmin,
  busy = false,
  onEdit,
  onDelete,
  onClose,
}: {
  match: Match;
  nameOf: (id: string, fallback?: string) => string;
  isAdmin: boolean;
  busy?: boolean;
  onEdit?: (m: Match) => void;
  onDelete?: (m: Match) => void;
  onClose: () => void;
}) {
  // Giocatori della partita (10 in un 5vs5, 14 in un 7vs7…): per la quota a testa
  const headCount = (match.team_white?.length || 0) + (match.team_black?.length || 0) || 10;
  const w = match.score_white ?? 0;
  const b = match.score_black ?? 0;
  const goalsOf = (id: string) => (match.scorers || []).filter((s) => s.player_id === id).reduce((n, s) => n + (s.goals || 0), 0);
  const savesOf = (id: string) => (match.penalty_saves || []).filter((s) => s.player_id === id).reduce((n, s) => n + (s.count || 0), 0);
  const outcome = w === b ? 'Pareggio' : w > b ? 'Vittoria Bianchi' : 'Vittoria Neri';

  const lineup = (team: 'white' | 'black') => {
    const players = (team === 'white' ? match.team_white : match.team_black) || [];
    return (
      <div className="min-w-0 space-y-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-secondary">
          <span
            className={`block rounded-full ${team === 'white' ? 'h-[9px] w-[33px] bg-white ring-1 ring-line-strong' : 'h-2.5 w-9 bg-slate-950 border border-slate-500'}`}
            aria-hidden="true"
          />
          {team === 'white' ? 'Bianchi' : 'Neri'}
        </p>
        <ul className="space-y-1.5 text-sm">
          {players.map((p) => {
            const g = goalsOf(p.id);
            const sv = savesOf(p.id);
            const mvp = match.mvp_player_id === p.id;
            return (
              <li key={p.id} className="flex items-center gap-1.5 min-w-0">
                <span className={`truncate ${mvp ? 'text-warning font-semibold' : 'text-primary'}`}>{nameOf(p.id, p.name)}</span>
                {mvp && <span title="MVP">⭐</span>}
                {g > 0 && (
                  <span className="flex-shrink-0 text-xs text-secondary" title={`${g} gol`}>
                    ⚽{g > 1 ? `×${g}` : ''}
                  </span>
                )}
                {sv > 0 && (
                  <span className="flex-shrink-0 text-xs text-secondary" title={`${sv} rigori parati`}>
                    🧤{sv > 1 ? `×${sv}` : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <Sheet
      onClose={onClose}
      locked={busy}
      size="lg"
      title={<span className="capitalize">{formatItalianDate(match.match_date || match.id)}</span>}
      subtitle={
        match.total_cost
          ? `${headCount / 2}vs${headCount / 2} · Campo €${Number(match.total_cost).toFixed(0)} · €${(Number(match.total_cost) / headCount)
              .toFixed(2)
              .replace('.', ',')} a testa`
          : undefined
      }
      footer={
        isAdmin && (onEdit || onDelete) ? (
          <>
            {onDelete && (
              <button type="button" onClick={() => onDelete(match)} disabled={busy} className={`${sheetBtn.danger} sm:mr-auto`}>
                <Trash2 className="h-4 w-4" /> Cancella
              </button>
            )}
            {onEdit && (
              <button type="button" onClick={() => onEdit(match)} disabled={busy} className={sheetBtn.primary}>
                <Pencil className="h-4 w-4" /> Modifica
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {/* Risultato */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-5">
          <span className={`text-5xl font-bold tabular-nums ${w > b ? 'text-accent-text' : 'text-primary'}`}>{w}</span>
          <span className="text-2xl text-muted">–</span>
          <span className={`text-5xl font-bold tabular-nums ${b > w ? 'text-accent-text' : 'text-primary'}`}>{b}</span>
        </div>
        <p className="text-sm text-secondary">{outcome}</p>
      </div>

      {/* Formazioni */}
      {match.team_white?.length || match.team_black?.length ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-8">
          {lineup('white')}
          {lineup('black')}
        </div>
      ) : (
        <p className="text-sm text-muted text-center">Formazioni non salvate.</p>
      )}
      {!match.mvp_player_id && !(match.scorers || []).length && (
        <p className="text-sm text-muted text-center">Nessun marcatore o MVP inserito.</p>
      )}
    </Sheet>
  );
}
