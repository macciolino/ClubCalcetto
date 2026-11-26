import { describe, expect, it } from 'vitest';
import { BASE_RADAR_CATEGORIES, BASE_RADAR_NAMES, buildCardStats, cleanBaseRadar, defaultBaseRadar, radarOverall } from '@/lib/utils/baseRadar';
import { MIN_PLAYERS_FOR_AVERAGE, averageOverall, formatForPlayers, prevailingFormat } from '@/lib/utils/publicLeagues';

describe('Radar Base', () => {
  it('parte da 6 su tutti i parametri di base', () => {
    expect(BASE_RADAR_NAMES.length).toBeGreaterThanOrEqual(8);
    expect(Object.values(defaultBaseRadar()).every((v) => v === 6)).toBe(true);
    expect(BASE_RADAR_CATEGORIES.every((c) => c.default_value === 6)).toBe(true);
  });

  it('cleanBaseRadar accetta solo interi da 1 a 10 per ogni parametro', () => {
    expect(cleanBaseRadar(defaultBaseRadar())).toEqual(defaultBaseRadar());
    expect(cleanBaseRadar({ ...defaultBaseRadar(), Tiro: 10, Fisico: 1 })).toMatchObject({ Tiro: 10, Fisico: 1 });
    expect(cleanBaseRadar({ ...defaultBaseRadar(), Tiro: 11 })).toBeNull();
    expect(cleanBaseRadar({ ...defaultBaseRadar(), Tiro: 0 })).toBeNull();
    expect(cleanBaseRadar({ ...defaultBaseRadar(), Tiro: 6.5 })).toBeNull();
    expect(cleanBaseRadar({ ...defaultBaseRadar(), Tiro: '7' })).toMatchObject({ Tiro: 7 });
    const missing = { ...defaultBaseRadar() } as Record<string, number>;
    delete missing.Tiro;
    expect(cleanBaseRadar(missing)).toBeNull();
    expect(cleanBaseRadar(null)).toBeNull();
    expect(cleanBaseRadar('x')).toBeNull();
  });

  it('i parametri in più vengono scartati', () => {
    expect(Object.keys(cleanBaseRadar({ ...defaultBaseRadar(), Extra: 9 })!)).toEqual(BASE_RADAR_NAMES);
  });

  it('radarOverall: media con un decimale', () => {
    expect(radarOverall(defaultBaseRadar())).toBe(6);
    expect(radarOverall({ a: 7, b: 8 })).toBe(7.5);
  });
});

describe('buildCardStats (scheda nuova in una lega)', () => {
  const cats = [{ name: 'Tiro', default_value: 7 }, { name: 'Difesa', default_value: 7 }, { name: 'Salto', default_value: 5 }];
  it('usa il Radar Base; un parametro che la lega ha in più prende il suo valore di default', () => {
    expect(buildCardStats(cats, null, { Tiro: 9, Difesa: 4 })).toEqual({ stats: { Tiro: 9, Difesa: 4, Salto: 5 }, source: 'radar' });
  });
  it('i valori già rivisti in un’altra lega vincono sul Radar Base', () => {
    expect(buildCardStats(cats, { Tiro: 8 }, { Tiro: 9, Difesa: 4 })).toEqual({ stats: { Tiro: 8, Difesa: 4, Salto: 5 }, source: 'league' });
  });
  it('senza Radar Base né altra lega: i default della lega', () => {
    expect(buildCardStats(cats, null, null)).toEqual({ stats: { Tiro: 7, Difesa: 7, Salto: 5 }, source: 'default' });
  });
  it('ignora i valori fuori scala', () => {
    expect(buildCardStats(cats, { Tiro: 99 }, { Tiro: 0, Difesa: 3 }).stats).toEqual({ Tiro: 7, Difesa: 3, Salto: 5 });
  });
});

describe('Leghe pubbliche: formato prevalente e livello medio', () => {
  it('formatForPlayers: il formato col numero di giocatori più vicino', () => {
    expect(formatForPlayers(10)).toBe('5v5');
    expect(formatForPlayers(14)).toBe('7v7');
    expect(formatForPlayers(15)).toBe('7v7');
    expect(formatForPlayers(16)).toBe('8v8');
    expect(formatForPlayers(22)).toBe('11v11');
    expect(formatForPlayers(2)).toBe('5v5');
  });

  it('prevailingFormat: il più frequente (formato salvato o dedotto dai giocatori), a parità il più piccolo', () => {
    expect(prevailingFormat([{ format: '7v7' }, { players: 14 }, { players: 10 }])).toBe('7v7');
    expect(prevailingFormat([{ players: 10 }, { players: 14 }])).toBe('5v5');
    expect(prevailingFormat([], '8v8')).toBe('8v8');
    expect(prevailingFormat([{ format: 'boh' }, {}], '7v7')).toBe('7v7');
  });

  it('averageOverall: sotto il minimo di giocatori è null ("Nuova lega")', () => {
    expect(averageOverall([6, 7, 8])).toBeNull();
    const six = Array.from({ length: MIN_PLAYERS_FOR_AVERAGE }, (_, i) => 5 + i);
    expect(averageOverall(six)).toBe(7.5);
    expect(averageOverall([...six, null, undefined, 0])).toBe(7.5);
  });
});
