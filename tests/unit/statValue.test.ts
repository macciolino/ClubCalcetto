import { describe, expect, it } from 'vitest';
import { clampStatValue } from '@/lib/utils/statUtils';

describe('clampStatValue: parametri sempre da 1 a 10', () => {
  it('lascia invariati i valori validi', () => {
    expect(clampStatValue(1)).toBe(1);
    expect(clampStatValue(6)).toBe(6);
    expect(clampStatValue(10)).toBe(10);
  });

  it('porta nella scala i valori fuori scala (es. 15 dato con Invio nel campo)', () => {
    expect(clampStatValue(15)).toBe(10);
    expect(clampStatValue(0)).toBe(1);
    expect(clampStatValue(-3)).toBe(1);
  });

  it('arrotonda i decimali e usa il predefinito se non è un numero', () => {
    expect(clampStatValue(7.6)).toBe(8);
    expect(clampStatValue(NaN)).toBe(6);
    expect(clampStatValue(undefined, 7)).toBe(7);
    expect(clampStatValue('9')).toBe(9);
  });
});
