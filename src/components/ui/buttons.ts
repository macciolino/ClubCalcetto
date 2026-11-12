/**
 * Button styles of the design system — the only ones to use for main actions (CTA).
 *
 * Rules:
 *  - Navigation buttons (they take you to another page: "Vai alle presenze", "Vai allo Storico"):
 *    label + <ArrowRight /> on the RIGHT, no icon on the left.
 *  - Action / state buttons ("Apri la settimana prossima", "Genera squadre", "Salva"):
 *    descriptive icon on the LEFT (lock, plus, shuffle…), no arrow.
 *  - Full width on phone (comfortable touch height), natural width from sm.
 */
const base =
  'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50';

export const btn = {
  primary: `${base} bg-emerald-500 hover:bg-emerald-400 text-slate-950`,
  secondary: `${base} border border-slate-700 text-slate-200 hover:bg-slate-800`,
  danger: `${base} border border-rose-500/40 text-rose-300 hover:bg-rose-500/10`,
};

/** The big "Ci sono" / "Mettimi in attesa" button (Home and Presenze): same everywhere. */
export const presenceBtn = (isFull: boolean) =>
  `w-full py-3.5 px-4 rounded-xl font-semibold text-base transition-colors active:scale-[0.99] disabled:opacity-50 ${
    isFull ? 'bg-amber-400 hover:bg-amber-300 text-slate-950' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
  }`;
