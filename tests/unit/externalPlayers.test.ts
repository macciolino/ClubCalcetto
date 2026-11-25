import { describe, expect, it } from 'vitest';
import { externalPlayerId, externalProfile, externalVoteWindow, isExternalId, outcomeFor } from '@/lib/utils/externalPlayers';
import { computeMatchStats, computeRecentResults } from '@/lib/utils/statUtils';
import type { Match } from '@/types/database';

const match = {
  id: '2026-11-20',
  match_date: '2026-11-20',
  status: 'completed',
  score_white: 3,
  score_black: 2,
  team_white: [{ id: 'a', name: 'Anna' }, { id: 'ext-luca', name: 'Luca' }],
  team_black: [{ id: 'b', name: 'Bruno' }],
  scorers: [{ player_id: 'ext-luca', goals: 2 }, { player_id: 'a', goals: 1 }, { player_id: 'b', goals: 2 }],
  mvp_player_id: 'ext-luca',
} as unknown as Match;

describe('giocatori esterni', () => {
  it('id riconoscibile', () => {
    expect(externalPlayerId('luca')).toBe('ext-luca');
    expect(isExternalId('ext-luca')).toBe(true);
    expect(isExternalId('luca')).toBe(false);
  });

  it('dall’iscrizione esterna il giocatore da mostrare', () => {
    const p = externalProfile({ player_id: 'ext-luca', external: { profileId: 'luca', userId: 'u', name: 'Luca', noticeId: 'n' } });
    expect(p).toMatchObject({ id: 'ext-luca', full_name: 'Luca', is_external: true, is_guest: false });
    expect(externalProfile({ player_id: 'x' })).toBeUndefined();
  });

  it('con il livello della sua lega (OVR e parametri), altrimenti quello di partenza', () => {
    const base = { profileId: 'luca', userId: 'u', name: 'Luca', noticeId: 'n' };
    expect(externalProfile({ player_id: 'ext-luca', external: { ...base, overall_rating: 8.4, stats: { Difesa: 9, Tiro: 7 } } })).toMatchObject({
      overall_rating: 8.4,
      stats: { Difesa: 9, Tiro: 7 },
    });
    expect(externalProfile({ player_id: 'ext-luca', external: base })).toMatchObject({ overall_rating: 6, stats: {} });
  });

  it('esito della partita per l’esterno: risultato, gol, MVP', () => {
    expect(outcomeFor(match, 'ext-luca')).toEqual({ result: 'won', goals: 2, mvp: true });
    expect(outcomeFor(match, 'b')).toEqual({ result: 'lost', goals: 2, mvp: false });
    expect(outcomeFor(match, 'nessuno')).toBeNull();
  });

  it('le statistiche della lega ignorano gli esterni (presenze, gol, MVP, forma)', () => {
    const stats = computeMatchStats([match]);
    expect(stats.has('ext-luca')).toBe(false);
    expect(stats.get('a')).toMatchObject({ played: 1, won: 1, goals: 1, mvp: 0 });
    expect(computeRecentResults([match]).has('ext-luca')).toBe(false);
  });

  it('finestra del voto MVP: inizio + 1h45, per 24 ore', () => {
    const w = externalVoteWindow('2026-11-20T19:30:00.000Z');
    expect(new Date(w.opensAt).toISOString()).toBe('2026-11-20T21:15:00.000Z');
    expect(w.closesAt - w.opensAt).toBe(24 * 3_600_000);
  });
});

describe('nome dalle formazioni della partita', () => {
  it('l’ospite non ha scheda: il nome resta nella partita (formazioni o marcatori)', async () => {
    const { nameInMatch } = await import('@/lib/utils/matchUtils');
    expect(nameInMatch(match, 'ext-luca')).toBe('Luca');
    expect(nameInMatch({ team_white: [], team_black: [], scorers: [{ player_id: 'x', player_name: 'Xavi', goals: 1 }] }, 'x')).toBe('Xavi');
    expect(nameInMatch(match, 'nessuno')).toBeUndefined();
  });
});
