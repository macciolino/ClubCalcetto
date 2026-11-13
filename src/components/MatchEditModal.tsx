'use client';

import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { useFormSettings } from '@/lib/hooks/useForms';
import React, { useEffect, useState } from 'react';
import { Match, MatchTeamPlayer, Profile } from '@/types/database';
import { saveMatchResult } from '@/lib/firebase/firestoreService';
import { formatItalianDate } from '@/lib/utils/dateUtils';
import { toTeamPlayer } from '@/lib/utils/teamUtils';
import { TeamSwapEditor } from '@/components/TeamSwapEditor';
import { MatchResultFields, MatchResultValue, validateScorers } from '@/components/MatchResultFields';
import { Loader2, Check, AlertCircle } from 'lucide-react';

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
    <Sheet
      onClose={onClose}
      locked={saving}
      size="lg"
      height="tall"
      title={`Modifica partita del ${formatItalianDate(match.match_date || match.id)}`}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={sheetBtn.secondary}>
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || Boolean(validation.error) || duplicate}
            className={sheetBtn.primary}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Salva modifiche
          </button>
        </>
      }
    >
          <section className="space-y-2">
            <h3 className="text-xs font-bold text-secondary">Squadre</h3>
            <TeamSwapEditor white={white} black={black} onChange={handleTeamsChange} bench={bench} />
            {duplicate && (
              <p className="text-xs text-danger flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Lo stesso giocatore compare due volte.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-bold text-secondary">Risultato, MVP e marcatori</h3>
            <MatchResultFields fixedKeeper={fixedKeeper} value={result} onChange={setResult} white={white} black={black} />
          </section>

          {error && <p className="text-sm text-danger">{error}</p>}
    </Sheet>
  );
}
