import { describe, expect, it } from 'vitest';
import { averageRadars, externalLevel } from '@/lib/utils/externalLevel';
import { defaultBaseRadar } from '@/lib/utils/baseRadar';
import { externalProfile } from '@/lib/utils/externalPlayers';

/**
 * Level of an external player ("Spot", docs/ARCHITECTURE.md §3.5): the average of the radars confirmed in their own
 * leagues + the quick ratings they got as a guest; otherwise their Radar Base; otherwise the neutral 6.
 */
const radar = (over: Record<string, number> = {}) => ({ ...defaultBaseRadar(), ...over });

describe('Livello dell’esterno', () => {
  it('senza nulla: il 6 neutro del club, nessun parametro', () => {
    expect(externalLevel({})).toEqual({ from: 'default', overall_rating: 6, count: 0 });
    expect(externalLevel({ radar: null, confirmedCards: [], ratings: [] }).from).toBe('default');
  });

  it('solo il Radar Base: lo usa tale e quale', () => {
    const lv = externalLevel({ radar: radar({ Tiro: 9 }) });
    expect(lv.from).toBe('radar');
    expect(lv.stats).toMatchObject({ Tiro: 9, Fisico: 6 });
    expect(lv.overall_rating).toBe(6.4);
  });

  it('un Radar Base incompleto o fuori scala non conta (si torna al 6)', () => {
    expect(externalLevel({ radar: { Tiro: 9 } }).from).toBe('default');
    expect(externalLevel({ radar: radar({ Tiro: 11 }) }).from).toBe('default');
  });

  it('radar confermati nelle sue leghe: media per parametro, meglio del Radar Base', () => {
    const lv = externalLevel({ radar: radar({ Tiro: 2 }), confirmedCards: [{ Tiro: 8, Difesa: 6 }, { Tiro: 6, Difesa: 8 }] });
    expect(lv.from).toBe('leagues');
    expect(lv.count).toBe(2);
    expect(lv.stats).toEqual({ Tiro: 7, Difesa: 7 });
    expect(lv.overall_rating).toBe(7);
  });

  it('le valutazioni lasciate da altre leghe contano come i radar confermati', () => {
    const lv = externalLevel({ radar: radar(), confirmedCards: [{ Tiro: 8 }], ratings: [{ Tiro: 6 }] });
    expect(lv.stats).toEqual({ Tiro: 7 });
    expect(lv.count).toBe(2);
    // anche da sole (mai ricevute conferme di lega) battono il Radar Base
    expect(externalLevel({ radar: radar(), ratings: [{ Tiro: 9 }] })).toMatchObject({ from: 'leagues', stats: { Tiro: 9 } });
  });

  it('valori non validi vengono ignorati nella media', () => {
    expect(averageRadars([{ Tiro: 8, Difesa: 0 }, { Tiro: 12, Difesa: 5 }, { Tiro: 6 }])).toEqual({ Tiro: 7, Difesa: 5 });
    expect(externalLevel({ radar: radar(), confirmedCards: [{}, { Tiro: 0 }] }).from).toBe('radar');
  });

  it('nelle squadre l’esterno pesa quanto il suo livello, mai zero', () => {
    const base = { profileId: 'p', userId: 'u', name: 'Luca', noticeId: 'n' };
    const lv = externalLevel({ radar: radar({ Tiro: 10 }) });
    expect(externalProfile({ player_id: 'ext-p', external: { ...base, ...lv, levelFrom: lv.from } })).toMatchObject({ overall_rating: 6.5, is_external: true });
    expect(externalProfile({ player_id: 'ext-p', external: base })?.overall_rating).toBe(6);
  });
});
