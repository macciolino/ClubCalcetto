import { describe, expect, it } from 'vitest';
import { validateScorers, type MatchResultValue } from '@/lib/utils/resultValidation';

const white = [{ id: 'w1', name: 'W1' }, { id: 'w2', name: 'W2' }];
const black = [{ id: 'b1', name: 'B1' }, { id: 'b2', name: 'B2' }];
const result = (scoreWhite: number, scoreBlack: number, scorers: MatchResultValue['scorers'] = []): MatchResultValue => ({
  scoreWhite,
  scoreBlack,
  mvpPlayerId: '',
  scorers,
});

describe('Risultato e marcatori', () => {
  it('marcatori che tornano con il risultato: nessun errore né avviso', () => {
    const v = validateScorers(result(3, 2, [{ player_id: 'w1', goals: 2 }, { player_id: 'w2', goals: 1 }, { player_id: 'b1', goals: 2 }]), white, black);
    expect(v).toMatchObject({ error: null, warnings: [], issues: { error: null, warnings: [] } });
  });

  it('risultato senza marcatori: si può salvare', () => {
    expect(validateScorers(result(4, 4), white, black).error).toBeNull();
  });

  it('meno gol dei marcatori che nel risultato (alcuni gol senza marcatore): permesso', () => {
    const v = validateScorers(result(5, 3, [{ player_id: 'w1', goals: 1 }]), white, black);
    expect(v.error).toBeNull();
    expect(v.warnings).toEqual([]);
  });

  it('più gol dei marcatori che nel risultato: salvataggio bloccato', () => {
    const v = validateScorers(result(1, 0, [{ player_id: 'w1', goals: 2 }]), white, black);
    expect(v.error).toMatch(/superano i gol del risultato finale/);
    expect(v.issues.error).toEqual({ kind: 'tooMany', scorerGoals: 2, totalGoals: 1 });
  });

  it('marcatori dei Bianchi oltre i gol dei Bianchi (es. autogol): avviso, non errore', () => {
    const v = validateScorers(result(1, 2, [{ player_id: 'w1', goals: 2 }]), white, black);
    expect(v.error).toBeNull();
    expect(v.warnings).toHaveLength(1);
    expect(v.warnings[0]).toMatch(/Bianchi/);
    expect(v.issues.warnings).toEqual([{ kind: 'teamExcess', team: 'white', scorerGoals: 2, teamGoals: 1 }]);
  });

  it('marcatori dei Neri oltre i gol dei Neri: avviso sui Neri', () => {
    const v = validateScorers(result(2, 0, [{ player_id: 'b1', goals: 1 }]), white, black);
    expect(v.warnings[0]).toMatch(/Neri/);
  });

  it('0 a 0 con un marcatore: errore', () => {
    expect(validateScorers(result(0, 0, [{ player_id: 'b2', goals: 1 }]), white, black).error).not.toBeNull();
  });
});
