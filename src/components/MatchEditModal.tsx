'use client';

import { useFormSettings } from '@/lib/hooks/useForms';
import React, { useEffect, useState } from 'react';
import { Match, MatchTeamPlayer, Profile } from '@/types/database';
import { saveMatchResult } from '@/lib/firebase/firestoreService';
import { formatItalianDate } from '@/lib/utils/dateUtils';
import { toTeamPlayer } from '@/lib/utils/teamUtils';
import { TeamSwapEditor } from '@/components/TeamSwapEditor';
import { MatchResultFields, MatchResultValue, validateScorers } from '@/components/MatchResultFields';
import { Loader2, Pencil, X, Check, AlertCircle } from 'lucide-react';

interface MatchEditModalProps {
  match: Match;
  profiles: Profile[];
  closedBy: string;
  onClose: () => void;
}

/**
 * Admin correction of an archived match (pencil in Storico → Partite).
 * Saved with saveMatchResult: W/D/L on the profiles are corrected (never counted twice)
 * and the leaderboard is recalculated from the matches, so everything stays consistent.
 */
export function MatchEditModal({ match, profiles, closedBy, onClose }: MatchEditModalProps) {
  const [white, setWhite] = useState<MatchTeamPlayer[]>(match.team_white || []);
  const [black, setBlack] = useState<MatchTeamPlayer[]>(match.team_black || []);
  const [result, setResult] = useState<MatchResultValue>({
    scoreWhite: match.score_white ?? 0,
    scoreBlack: match.score_black ?? 0,
    mvpPlayerId: match.mvp_player_id || '',
    scorers: match.scorers || [],
    penaltySaves: match.penalty_saves || [],
  });
  const [saving, setSaving] = useState(false);
  const fixedKeeper = Boolean(useFormSettings().fixedKeeper);
  const [error, setError] = useState('');

  // Chiudi con Esc e blocca lo scroll della pagina sotto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const bench = profiles.map(toTeamPlayer).sort((a, b) => a.name.localeCompare(b.name));

  // Se un giocatore esce dalle squadre, toglilo anche da MVP e marcatori
  const handleTeamsChange = (w: MatchTeamPlayer[], b: MatchTeamPlayer[]) => {
    setWhite(w);
    setBlack(b);
    const ids = new Set([...w, ...b].map((p) => p.id));
    setResult((r) => ({
      ...r,
      mvpPlayerId: ids.has(r.mvpPlayerId) ? r.mvpPlayerId : '',
      scorers: r.scorers.filter((s) => ids.has(s.player_id)),
      penaltySaves: (r.penaltySaves || []).filter((s) => ids.has(s.player_id)),
    }));
  };

  const validation = validateScorers(result, white, black);
  const duplicate = new Set([...white, ...black].map((p) => p.id)).size !== white.length + black.length;

  const handleSave = async () => {
    if (validation.error || duplicate) return;
    setSaving(true);
    setError('');
    try {
      await saveMatchResult({
        date: match.match_date || match.id,
        scoreWhite: result.scoreWhite,
        scoreBlack: result.scoreBlack,
        teamWhite: white,
        teamBlack: black,
        mvpPlayerId: result.mvpPlayerId || null,
        scorers: result.scorers,
        penaltySaves: result.penaltySaves || [],
        totalCost: Number(match.total_cost) || 80,
        closedBy,
      });
      onClose();
    } catch (err) {
      console.warn('[Storico] modifica non riuscita:', err);
      setError('Salvataggio non riuscito. Controlla la connessione e riprova.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-4 pt-safe px-safe"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-edit-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center gap-2">
          <Pencil className="h-4 w-4 text-emerald-400" />
          <h2 id="match-edit-title" className="text-sm font-black text-white uppercase tracking-wider flex-1">
            Modifica partita del {formatItalianDate(match.match_date || match.id)}
          </h2>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="p-2 -m-2 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Squadre</h3>
            <TeamSwapEditor white={white} black={black} onChange={handleTeamsChange} bench={bench} />
            {duplicate && (
              <p className="text-xs text-rose-300 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Lo stesso giocatore compare due volte.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Risultato, MVP e marcatori</h3>
            <MatchResultFields fixedKeeper={fixedKeeper} value={result} onChange={setResult} white={white} black={black} />
          </section>

          {error && <p className="text-sm text-rose-300">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-5 pt-4 sheet-safe-bottom flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-3 rounded-xl text-xs font-bold text-slate-300 border border-slate-700 hover:bg-slate-800"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || Boolean(validation.error) || duplicate}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Salva modifiche
          </button>
        </div>
      </div>
    </div>
  );
}
