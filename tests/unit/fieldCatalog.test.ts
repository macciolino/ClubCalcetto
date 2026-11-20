import { describe, expect, it } from 'vitest';
import { dedupKey, leagueFieldFromCatalog, looksLikeSameField, matchesCatalogSearch, normalizeText } from '@/lib/utils/fieldCatalog';
import type { CatalogField } from '@/types/database';

describe('Catalogo campi: doppioni e ricerca', () => {
  it('normalizza accenti, maiuscole, punteggiatura e abbreviazioni delle vie', () => {
    expect(normalizeText('  V.le Città-Studi, 12 ')).toBe('viale citta studi 12');
    expect(normalizeText('P.za Duomo')).toBe('piazza duomo');
    expect(normalizeText('C.so Buenos Aires')).toBe('corso buenos aires');
    expect(normalizeText('V. Luini 5')).toBe('via luini 5');
    expect(dedupKey('Campo  LUINI', 'Via Luini 5, Milano')).toBe(dedupKey('campo luini', 'V. Luini 5 Milano'));
  });

  it('stesso campo: stesso indirizzo, oppure stesso nome nella stessa città', () => {
    const luini = { name: 'Campo Luini', address: 'Via Luini 5, Milano' };
    expect(looksLikeSameField(luini, { name: 'Centro Luini', address: 'V. Luini 5 Milano' })).toBe(true);
    expect(looksLikeSameField(luini, { name: 'campo luini', address: 'Via Roma 1, Milano' })).toBe(true);
    expect(looksLikeSameField(luini, { name: 'Campo Luini', address: 'Via Roma 1, Monza' })).toBe(false);
    expect(looksLikeSameField(luini, { name: 'Oratorio', address: 'Via Roma 1, Milano' })).toBe(false);
  });

  it('ricerca: ogni parola deve comparire nel nome o nell’indirizzo', () => {
    const f = { name: 'Centro Sportivo Luini', address: 'Via Luini 5, Milano' };
    expect(matchesCatalogSearch(f, 'luini milano')).toBe(true);
    expect(matchesCatalogSearch(f, 'citta')).toBe(false);
    expect(matchesCatalogSearch(f, '')).toBe(true);
  });

  it('il campo della lega prende i dati e i prezzi di partenza dal catalogo', () => {
    const c = { id: 'c1', name: 'Luini', address: 'Via Luini 5', phone: '02 1', default_cost: 80, default_costs: { '7v7': 110 }, status: 'approved' } as CatalogField;
    expect(leagueFieldFromCatalog(c)).toEqual({ name: 'Luini', address: 'Via Luini 5', phone: '02 1', cost: 80, costs: { '7v7': 110 } });
  });
});
