---
name: ui-conventions
description: ClubCalcetto UI conventions - theme, shared components (tables, dropdowns, confirm dialogs, player cards, collapsible cards), responsive and safe-area rules. Read before changing any screen.
---

# UI conventions

## Theme

- ONE theme: dark. `<html class="dark">` with `color-scheme: dark` forced in `layout.tsx` / `globals.css`. There is no
  light theme and no toggle (Tailwind `darkMode: 'class'` is set, but `dark:` variants are not used).
  The phone/OS light mode can only affect native controls (e.g. `<select>` popups) and the browser chrome.
- Palette: page `slate-950`, cards `slate-900`, borders `slate-800/700`, accent `emerald-500/400`,
  amber = highlight/MVP, rose = destructive, violet = test mode, orange/sky = in forma / fuori forma.
- Cards: `bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl`. Titles: `text-sm font-black uppercase tracking-wider`.

## Shared components (`src/components/`)

- `CollapsibleCard` - "a tendina" section with an always-visible summary (closed by default).
- `NumberInput` - numeric field usable on phones (never plain `type=number`).
- `PlayerCardFifa` - player card (radar tab + "Statistiche" tab: 6 boxes like the profile); `StatBadge` - OVR pill; `RadarChart`.
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
- Confirmations: native `confirm()` with a full Italian sentence, no typed confirmations. Errors: `alert()` or inline rose text.
- Forms (see `/login`): `noValidate`, required fields marked with a rose `*`, errors shown after submit or blur:
  `border-rose-500` + message under the field (`aria-invalid`, `aria-describedby`). Password rules listed live under the field.
- Segmented switchers (tabs): `flex gap-1 bg-slate-900 border p-1 rounded-xl`, active = `bg-emerald-500 text-slate-950`, with `aria-pressed`.
- Tables: wrapper `overflow-x-auto`, header `text-xs uppercase text-slate-400`, numbers `font-mono text-center`.
  Sortable columns: the header is a button, active column `text-emerald-300` with a small ▼/▲ and `aria-sort` (see Storico).

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
