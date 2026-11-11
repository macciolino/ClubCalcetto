---
name: ui-conventions
description: ClubCalcetto UI conventions - theme, shared components (tables, dropdowns, confirm dialogs, player cards, collapsible cards), responsive and safe-area rules. Read before changing any screen.
---

# UI conventions

## Theme

- ONE theme: dark. `<html class="dark">` with `color-scheme: dark` forced in `layout.tsx` / `globals.css`. There is no
  light theme and no toggle (Tailwind `darkMode: 'class'` is set, but `dark:` variants are not used).
  The phone/OS light mode can only affect native controls (e.g. `<select>` popups) and the browser chrome.
- Palette (design system, set in `tailwind.config.ts` by overriding slate-900/950): page `slate-950` = #0B0F19,
  cards `slate-900` = #131C2E, borders `slate-800` = #1E293B, green `emerald-500` = #10B981 (starters, confirmations,
  main CTA), amber `amber-500` = #F59E0B (waiting, "Primo a 10"), muted text `slate-400` = #94A3B8.
  Rose = destructive, violet = test mode, orange/sky = in forma / fuori forma. Never hard-code other hex backgrounds.
- Day pills (Presenze, Squadre): ONLY the selected day has a background (`bg-emerald-500 text-slate-950`); the
  others have no border/background, just a small status dot under the date (grey = sign-ups, green = full,
  amber = first to 10) and a legend.
- Risky actions ("Ritirati", remove a player) are real buttons with icon + `askConfirm`, never a bare text link.
- Admin per-row actions on mobile: tap the row → bottom sheet (`fixed inset-0 … items-end sm:items-center`,
  `rounded-t-2xl sm:rounded-2xl`, big buttons), not rows of tiny icons. Tall sheets (e.g. Confronta): `h-[80vh] rounded-t-3xl animate-sheet` +
  drag bar (`h-1.5 w-10 rounded-full bg-slate-700`), title + X; backdrop `animate-fade`.
- Older cards were `rounded-3xl shadow-xl` with `font-black uppercase` titles: replaced by the style below (keep it that way).

## Current style (approved 2026-11-11, applied to every page)

- Font Inter (next/font, `--font-inter`, global). Page title on the page, no header card: `h1 text-2xl sm:text-3xl font-bold`,
  subtitle `text-sm text-slate-400`. Section titles `text-sm font-semibold text-slate-300`. Avoid `font-black` + uppercase + tracking.
- Cards `bg-slate-900 border border-slate-800 rounded-2xl p-5`, no shadow/gradient/glow; callouts are plain cards with a small
  coloured icon before the title (NO coloured left stripe: the owner does not want it). Buttons: primary `bg-emerald-500 text-slate-950 font-semibold rounded-xl`,
  secondary `border border-slate-700`, quiet text button. Small text at least `text-xs text-slate-400`.
- Loading: `PageSkeleton` / `Skeleton` from `components/ui/Skeleton.tsx`, never a big spinner. Motion: `.animate-in`
  (fade + rise 180ms, defined in globals.css, off with prefers-reduced-motion). Emoji only when they mean something
  (⚪⚫ team, 🥇 Primo a 10, 🔥❄️ forma, ★ admin), never as decoration in titles.
- Exceptions that keep a bold "sports" look on purpose: `VirtualPitch` stickers, `PlayerCardFifa`, `StatBadge`.
- Rollback points: git tags `backup-prima-restyling` (before the restyling), `backup-prima-scheda-presenze`.

## Shared components (`src/components/`)

- `CollapsibleCard` - "a tendina" section with an always-visible summary (closed by default).
- `NumberInput` - numeric field usable on phones (never plain `type=number`).
- `PlayerCardFifa` - player card: summary line "N partite · V · P · S" + proportion bar, radar + `StatBars` (parameters
  as 1-10 bars, form part lighter), "Statistiche" tab with 6 neutral boxes (colour only on V/P/S numbers); `StatBadge`; `RadarChart` (optional `overlay`: 'form' dashed light green, 'compare' blue); last 5 results dots; % wins and goals per match.
- Giocatori table: md+ only (sortable headers, parameter cells = number + mini bar, own row with green left stripe);
  phones get a compact list (tap to open V-P-S, `StatBars` and admin actions).
- `VirtualPitch` (with `PlayerSticker` inside) - pitch with upright sticker cards, 1-1-2-1 symmetric on x = 50 and mirrored
  between the teams; coordinates in `lib/utils/formation.ts`. A "photo" on the pitch is only one uploaded in the app (`data:image/` JPEG); Google's automatic
  avatar and old emoji avatars show initials in the photo area with the first name below. Downloads use html-to-image
  with `style: { margin: '0' }` (the `mx-auto` margin would shift and crop the picture).
- `PresenceCard` (Presenze): main action first ("Ci sono" / "Mettimi in attesa" / "Sei titolare (n° X)" + small
  "Ritirati" link / "Iscrizioni chiuse"), ring 0-10, 10 dots with initials (tap = name), "Vedi nomi ▾", waitlist on one
  line, admin tools behind "⋯ Gestisci". No OVR on this card. Previous design: git tag `backup-prima-scheda-presenze`.
- `TeamSwapEditor` - tap-to-swap team editing; `MatchResultFields` - score/MVP/scorers form; `MatchEditModal` - bottom-sheet dialog.
- Admin modals: `FieldModal`, `StatsLegendModal`; `PlayerModal` for editing a player.
- Dropdowns are native `<select>` (`bg-slate-950 border border-slate-700 rounded-xl`); give them `min-w-0` inside flex rows.
  Use a neutral focus border (`focus:border-slate-500`): an emerald one peeks out behind the native popup.
- Messages and confirmations: NEVER `alert()` / `confirm()`. Use `notify(msg, kind?)` (toast at the bottom, kind guessed:
  error / info / success) and `if (!(await askConfirm(msg))) return;` (app dialog, red button when the text sounds destructive)
  from `components/ui/Feedback.tsx`; `<FeedbackHost />` is mounted in `layout.tsx`. Inline rose text for form errors.
- Forms (see `/login`): `noValidate`, required fields marked with a rose `*`, errors shown after submit or blur:
  `border-rose-500` + message under the field (`aria-invalid`, `aria-describedby`). Password rules listed live under the field.
- Segmented switchers (tabs): `flex gap-1 bg-slate-900 border p-1 rounded-xl`, active = `bg-emerald-500 text-slate-950`, with `aria-pressed`.
- Tables: wrapper `overflow-x-auto`, header `text-xs uppercase text-slate-400`, numbers `font-mono text-center`.
  Sortable columns: the header is a button, active column `text-emerald-300` with a small ▼/▲ and `aria-sort` (Storico,
  Giocatori table via `SortHeader`). Photos: `uploadedPhoto()` / `initialsOf()` from `lib/utils/playerUtils.ts` everywhere.

## Settings layout (`/impostazioni`)

- md+: sticky sidebar (`grid-cols-[240px_1fr]`) grouped Personali / Amministrazione, active item emerald; content on the right.
- Phones: list of sections (label + description + chevron) → tap opens the section with "← Impostazioni". One URL per
  section (`?sezione=`) so Back works. New settings go in a section, not in a new page.

## Responsive

- Mobile first; breakpoints `sm` 640, `md` 768 (bottom nav disappears, top nav appears), `lg` 1024.
- Touch targets at least 44px; lists stack to one column on phones; admin tabs are stacked rows on phones.
- Safe areas (`globals.css`): `pt-safe`, `pb-safe`, `px-safe`, `body-safe-bottom`, `modal-safe`, `sheet-safe-bottom`,
  with viewport-fit=cover. Fixed bars and dialogs must use them.
- Icons: lucide-react only. No new dependencies.

## Pitch & motion
- `components/PitchLines.tsx`: football pitch SVG (2:3, grass stripes, areas, arcs, goals) whose lines draw themselves
  (`.pitch-draw`, `.pitch-dots` in globals.css; `pitch-fast` parent = quicker). Used by the login panel and the splash.
- `components/SplashScreen.tsx` (in layout): pitch + logo, ~1.3 s, once per session (sessionStorage `cc_splash_seen`),
  never on /login; the inline `SPLASH_GUARD` script hides it before paint.
- `VirtualPitch` stickers enter from their own half one after another (`.sticker-enter`, `--from-y`, delay = order × 70 ms).
- Every animation has a `prefers-reduced-motion` fallback.
