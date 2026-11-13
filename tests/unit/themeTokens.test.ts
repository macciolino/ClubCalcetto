import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import tailwindConfig from '../../tailwind.config';

const css = fs.readFileSync(path.join(__dirname, '../../src/app/globals.css'), 'utf8');
const TOKENS = ['--bg-app', '--bg-card', '--bg-card-hover', '--text-primary', '--text-secondary', '--border-color', '--accent-primary', '--accent-contrast', '--accent-text', '--text-muted', '--border-strong', '--danger-text', '--warning-text'];

/** R G B channels of a token inside a CSS block (":root {" or ".dark {") that defines --bg-app. */
function tokensOf(selector: string): Record<string, [number, number, number]> {
  const blocks = css.split(`${selector} {`).slice(1).map((b) => b.split('}')[0]);
  const block = blocks.find((b) => b.includes('--bg-app'));
  if (!block) throw new Error(`blocco ${selector} con i token non trovato`);
  const out: Record<string, [number, number, number]> = {};
  for (const m of block.matchAll(/(--[a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  return out;
}

const hex = (rgb: [number, number, number]) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const luminance = ([r, g, b]: [number, number, number]) => {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

describe('Token di tema (Light / Dark)', () => {
  const light = tokensOf(':root');
  const dark = tokensOf('.dark');

  it('ogni token esiste in entrambi i temi', () => {
    for (const t of TOKENS) {
      expect(light[t], `light ${t}`).toBeDefined();
      expect(dark[t], `dark ${t}`).toBeDefined();
    }
  });

  it('valori richiesti per il tema chiaro e quello scuro attuale', () => {
    expect(hex(light['--bg-app'])).toBe('#F8FAFC');
    expect(hex(light['--bg-card'])).toBe('#FFFFFF');
    expect(hex(light['--border-color'])).toBe('#E2E8F0');
    expect(hex(light['--text-primary'])).toBe('#0F172A');
    expect(hex(light['--accent-primary'])).toBe('#059669');
    expect(hex(dark['--bg-app'])).toBe('#0B0F19');
    expect(hex(dark['--bg-card'])).toBe('#131C2E');
    expect(hex(dark['--accent-primary'])).toBe('#10B981');
  });

  it.each([
    ['--text-primary', '--bg-card', 7],
    ['--text-primary', '--bg-app', 7],
    ['--text-secondary', '--bg-card', 4.5],
    ['--text-secondary', '--bg-app', 4.5],
    ['--accent-contrast', '--accent-primary', 4.5],
    ['--accent-text', '--bg-card', 4.5],
    ['--danger-text', '--bg-card', 4.5],
    ['--warning-text', '--bg-card', 4.5],
  ])('contrasto %s su %s ≥ %f:1 in entrambi i temi (WCAG AA)', (fg, bg, min) => {
    expect(contrast(light[fg], light[bg])).toBeGreaterThanOrEqual(min);
    expect(contrast(dark[fg], dark[bg])).toBeGreaterThanOrEqual(min);
  });

  it('testo attenuato: ≥ 4.5:1 nel tema chiaro, come oggi (≥ 3.5:1) in quello scuro', () => {
    expect(contrast(light['--text-muted'], light['--bg-card'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark['--text-muted'], dark['--bg-card'])).toBeGreaterThanOrEqual(3.5);
  });

  it('Tailwind espone i token con opacità (bg-card/60 ecc.)', () => {
    const colors = (tailwindConfig.theme?.extend?.colors || {}) as Record<string, unknown>;
    expect(colors.app).toBe('rgb(var(--bg-app) / <alpha-value>)');
    expect(colors.card).toMatchObject({ DEFAULT: 'rgb(var(--bg-card) / <alpha-value>)', hover: 'rgb(var(--bg-card-hover) / <alpha-value>)' });
    expect(colors.primary).toBe('rgb(var(--text-primary) / <alpha-value>)');
    expect(colors.secondary).toBe('rgb(var(--text-secondary) / <alpha-value>)');
    expect(colors.line).toMatchObject({ DEFAULT: 'rgb(var(--border-color) / <alpha-value>)', strong: 'rgb(var(--border-strong) / <alpha-value>)' });
    expect(colors.muted).toBe('rgb(var(--text-muted) / <alpha-value>)');
    expect(colors.danger).toBe('rgb(var(--danger-text) / <alpha-value>)');
    expect(colors.warning).toBe('rgb(var(--warning-text) / <alpha-value>)');
    expect(colors.accent).toMatchObject({ DEFAULT: 'rgb(var(--accent-primary) / <alpha-value>)' });
  });
});
