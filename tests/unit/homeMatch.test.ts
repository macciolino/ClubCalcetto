import { describe, expect, it } from 'vitest';
import { lastMatchOutcome, matchPlace } from '@/lib/utils/matchUtils';
import type { Match, SportField } from '@/types/database';

const luini: SportField = { id: 'f1', name: 'Campo Luini', address: 'Via Luini 5, Milano', notes: '  Parcheggio interno ', maps_url: '' };

describe('Home: dati del campo', () => {
  it('campo della lega: nome, indirizzo, link Maps e note separati', () => {
    const p = matchPlace(null, [luini], 'f1');
    expect(p).toEqual({
      name: 'Campo Luini',
      address: 'Via Luini 5, Milano',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Campo%20Luini%20Via%20Luini%205%2C%20Milano',
      notes: 'Parcheggio interno',
    });
  });

  it('la partita sul campo salvato come "Nome (indirizzo)" usa il link Maps del campo', () => {
    const p = matchPlace({ location: 'Campo Luini (Via Luini 5, Milano)' } as Match, [{ ...luini, maps_url: 'https://maps.app/x' }], undefined);
    expect(p.name).toBe('Campo Luini');
    expect(p.mapsUrl).toBe('https://maps.app/x');
  });

  it('luogo libero scritto a mano: solo il nome e una ricerca su Maps', () => {
    const p = matchPlace({ location: 'Oratorio San Luigi' } as Match, [luini], 'f1');
    expect(p).toEqual({ name: 'Oratorio San Luigi', mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Oratorio%20San%20Luigi' });
  });
});

describe('Home: esito dell’ultima partita', () => {
  const m = { score_white: 5, score_black: 3, team_white: [{ id: 'a' }], team_black: [{ id: 'b' }] } as Match;
  it('vincitore e risultato personale', () => {
    expect(lastMatchOutcome(m, 'a')).toEqual({ winner: 'white', mine: 'won' });
    expect(lastMatchOutcome(m, 'b')).toEqual({ winner: 'white', mine: 'lost' });
    expect(lastMatchOutcome(m, 'z')).toEqual({ winner: 'white', mine: null });
    expect(lastMatchOutcome({ ...m, score_white: 2, score_black: 2 }, 'b')).toEqual({ winner: null, mine: 'drawn' });
    expect(lastMatchOutcome({ ...m, score_white: 1, score_black: 4 }, 'b')).toEqual({ winner: 'black', mine: 'won' });
  });
});
