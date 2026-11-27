/**
 * Surfaces of the design system: cards, list rows, empty states and the small blocks inside them.
 *
 * The problem they solve: `bg-card` on `bg-app` has almost no contrast in the light theme (white on #F8FAFC), so a block
 * without an edge melts into the page and the eye has to guess where it ends. Every surface therefore has a 1px edge,
 * made only of the existing tokens (no new colour, no shadow):
 *  - light: `line-strong` (#CBD5E1), soft but clearly there (about 1.5:1 against the card);
 *  - dark: the same token at 60%, so it does not glare on the navy cards (about 1.6:1).
 * Inside a card, small blocks (pills, notes) use the lighter `line` edge: they must read as part of the card, not compete.
 *
 * Use these strings instead of writing `bg-card rounded-2xl` by hand. Padding, spacing and layout stay with the caller.
 */
const edge = 'border border-line-strong dark:border-line-strong/60';
/** Lighter edge for small blocks inside a card */
const innerEdge = 'border border-line dark:border-line-strong/40';

export const surface = {
  /** Section block, notice card, empty state */
  card: `rounded-2xl bg-card ${edge}`,
  /** One row of a list */
  row: `rounded-xl bg-card ${edge}`,
  /** A row that is a button: the edge firms up on hover */
  rowButton: `rounded-xl bg-card ${edge} hover:bg-card-hover hover:border-line-strong transition-colors`,
  /** Small block on a card or sheet (note, one person of a list): `bg-app` with its own soft edge */
  inset: `rounded-xl bg-app ${innerEdge}`,
  /** Pill / badge on a card (format, role, shirt, spots left): add the background and text colour yourself */
  pill: innerEdge,
  /** Field of a filter bar (chips and selects) */
  control: edge,
};
