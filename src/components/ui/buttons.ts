/**
 * Button, link and menu styles of the design system — the only ones to use.
 *
 * Rules:
 *  - Navigation buttons (they take you to another page: "Vai alle presenze", "Vai allo Storico"):
 *    label + <ArrowRight /> on the RIGHT, no icon on the left. Same for text links (`textLink`).
 *  - Action / state buttons ("Apri la settimana prossima", "Genera squadre", "Salva"):
 *    descriptive icon on the LEFT (lock, plus, shuffle…), no arrow.
 *  - `btn`: full width on phone (comfortable touch height), natural width from sm.
 *    `btnInline`: same look, always natural width (inside a row: header actions, next to an input…).
 */
const shape =
  'inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50';

const tone = {
  primary: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950',
  secondary: 'border border-slate-700 text-slate-200 hover:bg-slate-800',
  danger: 'border border-rose-500/40 text-rose-300 hover:bg-rose-500/10',
};

export const btn = {
  primary: `w-full sm:w-auto ${shape} ${tone.primary}`,
  secondary: `w-full sm:w-auto ${shape} ${tone.secondary}`,
  danger: `w-full sm:w-auto ${shape} ${tone.danger}`,
};

export const btnInline = {
  primary: `${shape} ${tone.primary}`,
  secondary: `${shape} ${tone.secondary}`,
  danger: `${shape} ${tone.danger}`,
  /** Final step of a destructive confirmation only (filled red) */
  dangerSolid: `${shape} bg-rose-600 hover:bg-rose-500 text-white`,
};

/** Green text link with <ArrowRight /> on the right ("Vai allo Storico →"). */
export const textLink = 'inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300 hover:text-emerald-200';

/** "⋯" / account dropdown menus: panel and rows (position classes are added by the caller). */
export const menu = {
  panel: 'rounded-xl bg-slate-800 border border-slate-700 shadow-2xl p-1 animate-in',
  item: 'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-100 hover:bg-slate-700 disabled:opacity-50',
  danger: 'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50',
  divider: 'my-1 border-t border-slate-700',
};

/** The big "Ci sono" / "Mettimi in attesa" button (Home and Presenze): same everywhere. */
export const presenceBtn = (isFull: boolean) =>
  `w-full py-3.5 px-4 rounded-xl font-semibold text-base transition-colors active:scale-[0.99] disabled:opacity-50 ${
    isFull ? 'bg-amber-400 hover:bg-amber-300 text-slate-950' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
  }`;
