import { describe, expect, it } from 'vitest';
import { balanceTeams, getPlayerOverallRating } from '@/lib/algorithm/teamBalancer';
import { formationSlots } from '@/lib/utils/matchFormat';
import type { Profile } from '@/types/database';

/**
 * Values waiting for a manager's review (`stat_status: 'UNCONFIRMED'`, docs/ARCHITECTURE.md "Registrazione e Radar Base")
 * count in the team generator exactly like confirmed ones: the neutral 6 of the Radar Base, or what the player or a
 * manager changed. They are never zero and never left out.
 */
const card = (id: string, ovr: number | undefined, status?: 'UNCONFIRMED' | 'CONFIRMED', position = 'Esterno', stats?: Record<string, number>) =>
  ({
    id,
    full_name: id,
    position,
    overall_rating: ovr,
    stats: stats ?? {},
    ...(status ? { stat_status: status } : {}),
  }) as unknown as Profile;

describe('Generatore squadre e valori da revisionare', () => {
  it('il valore di una scheda da revisionare è quello salvato: 6 neutro, o le modifiche iniziali; mai 0', () => {
    expect(getPlayerOverallRating(card('a', 6, 'UNCONFIRMED'))).toBe(6);
    expect(getPlayerOverallRating(card('b', 8.5, 'UNCONFIRMED'))).toBe(8.5);
    // senza OVR salvato si usa la media dei parametri, senza parametri 6
    expect(getPlayerOverallRating(card('c', undefined, 'UNCONFIRMED', 'Esterno', { Tiro: 9, Difesa: 7 }))).toBe(8);
    expect(getPlayerOverallRating(card('d', undefined, 'UNCONFIRMED'))).toBe(6);
    expect(getPlayerOverallRating(card('e', 0, 'UNCONFIRMED'))).toBe(6);
  });

  it('5 contro 5: i giocatori da revisionare sono in campo e pesano come gli altri', () => {
    // due fuoriclasse da revisionare + otto confermati medi: devono finire in squadre diverse
    const players = [
      card('top1', 9, 'UNCONFIRMED'),
      card('top2', 9, 'UNCONFIRMED'),
      ...Array.from({ length: 8 }, (_, i) => card(`m${i}`, 6, 'CONFIRMED')),
    ];
    const res = balanceTeams(players);
    const ids = [...res.teamWhite, ...res.teamBlack].map((p) => p.id);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toContain('top1');
    expect(ids).toContain('top2');
    const side = (id: string) => (res.teamWhite.some((p) => p.id === id) ? 'W' : 'B');
    expect(side('top1')).not.toBe(side('top2'));
    expect(res.difference).toBe(0);
  });

  it('un giocatore da revisionare a 6 non viene trattato come uno zero: la squadra resta equilibrata', () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) => card(`n${i}`, 6, 'UNCONFIRMED')),
      ...Array.from({ length: 5 }, (_, i) => card(`c${i}`, 6, 'CONFIRMED')),
    ];
    const res = balanceTeams(players);
    expect(res.whiteStats.overallAvg).toBe(6);
    expect(res.blackStats.overallAvg).toBe(6);
    expect(res.fairnessScore).toBe(100);
  });

  it('formati più grandi (7 contro 7): nessuno viene escluso, i valori da revisionare contano', () => {
    const slots = formationSlots('7v7');
    const players = [
      card('gk1', 6, 'UNCONFIRMED', 'Portiere'),
      card('gk2', 6, 'CONFIRMED', 'Portiere'),
      card('x1', 9, 'UNCONFIRMED'),
      card('x2', 9, 'UNCONFIRMED'),
      ...Array.from({ length: 10 }, (_, i) => card(`p${i}`, 6, i % 2 ? 'UNCONFIRMED' : 'CONFIRMED')),
    ];
    const res = balanceTeams(players, { slots, fixedKeeper: true });
    const ids = [...res.teamWhite, ...res.teamBlack].map((p) => p.id);
    expect(new Set(ids).size).toBe(14);
    const side = (id: string) => (res.teamWhite.some((p) => p.id === id) ? 'W' : 'B');
    expect(side('x1')).not.toBe(side('x2'));
    expect(res.difference).toBeLessThanOrEqual(0.35);
  });
});
