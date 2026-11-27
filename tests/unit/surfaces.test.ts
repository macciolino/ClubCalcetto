import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
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

  it('in tutta l’app nessuna card (bg-card + rounded-2xl) resta senza bordo', () => {
    const files: string[] = [];
    const walk = (dir: string) =>
      readdirSync(dir).forEach((f) => {
        const full = path.join(dir, f);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.tsx')) files.push(full);
      });
    walk(path.join(process.cwd(), 'src'));
    const eol = new RegExp('\\r?\\n');
    const bare: string[] = [];
    files.forEach((f) =>
      readFileSync(f, 'utf8')
        .split(eol)
        .forEach((line, i) => {
          if (/(?<![\w/:-])bg-card(?![\w/-])/.test(line) && /(?<![\w-])rounded-2xl(?![\w-])/.test(line) && !/border|surface\./.test(line)) {
            bare.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
          }
        })
    );
    expect(bare).toEqual([]);
  });
});
