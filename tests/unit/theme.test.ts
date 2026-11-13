import { describe, expect, it } from 'vitest';
import { toThemeChoice } from '@/components/settings/ThemeSetting';
import it_ from '../../messages/it.json';
import en from '../../messages/en.json';

describe('Scelta del tema', () => {
  it('valori validi restano quelli', () => {
    expect(toThemeChoice('light')).toBe('light');
    expect(toThemeChoice('dark')).toBe('dark');
    expect(toThemeChoice('system')).toBe('system');
  });
  it('valori sconosciuti o assenti (vecchia memoria del browser) → Sistema', () => {
    expect(toThemeChoice(undefined)).toBe('system');
    expect(toThemeChoice('blue')).toBe('system');
    expect(toThemeChoice('')).toBe('system');
  });
  it('etichette in italiano e inglese per ogni scelta', () => {
    expect([it_.theme.system, it_.theme.light, it_.theme.dark]).toEqual(['Sistema', 'Chiaro', 'Scuro']);
    expect([en.theme.system, en.theme.light, en.theme.dark]).toEqual(['System', 'Light', 'Dark']);
  });
});
