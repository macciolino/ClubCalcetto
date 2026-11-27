import { describe, expect, it } from 'vitest';
import { surface } from '@/components/ui/surfaces';

/**
 * Surfaces (src/components/ui/surfaces.ts): every block has a 1px edge and uses only the design tokens, so it reads in
 * the light theme (white card on #F8FAFC) and in the dark one, and follows the theme without hard-coded colours.
 */
describe('Superfici del design system', () => {
  const all = Object.entries(surface);

  it.each(all)('%s: ha un bordo da 1px e solo token del tema', (_name, classes) => {
    expect(classes).toMatch(/\bborder\b/);
    expect(classes).toMatch(/border-line/);
    // niente colori fissi (slate-*, white, black, hex) né ombre
    expect(classes).not.toMatch(/slate-|\bwhite\b|\bblack\b|#[0-9a-f]{3,6}|shadow/i);
  });

  it('le card e le righe hanno la superficie del tema e gli angoli arrotondati', () => {
    for (const k of ['card', 'row', 'rowButton'] as const) expect(surface[k]).toMatch(/bg-card\b/);
    expect(surface.card).toMatch(/rounded-2xl/);
    expect(surface.row).toMatch(/rounded-xl/);
  });

  it('il bordo è più morbido nel tema scuro (stesso token, opacità ridotta)', () => {
    expect(surface.card).toMatch(/border-line-strong\b/);
    expect(surface.card).toMatch(/dark:border-line-strong\/60/);
  });

  it('i blocchi dentro una card usano il bordo più leggero', () => {
    expect(surface.inset).toMatch(/border-line\b/);
    expect(surface.inset).toMatch(/bg-app/);
    expect(surface.pill).toMatch(/border-line\b/);
  });
});
