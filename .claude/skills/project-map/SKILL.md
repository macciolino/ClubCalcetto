---
name: project-map
description: Map of the ClubCalcetto project - folders, routes, where each page and feature lives (Storico, Giocatori, Admin, Profilo, Squadre, Presenze, notifications). Read before searching the codebase.
---

# ClubCalcetto - project map

Brand shown to users: **Club Soccer** (renamed 2026-11-10). Code, repo, Vercel domain and storage keys still say ClubCalcetto.
Header (`Navbar.tsx`): logo + "Club Soccer" on the left; on the right icon, name and role open a dropdown menu
(Profilo, Impostazioni, Logout; closes on outside tap, Esc, page change). Profilo is NOT in the page menu / bottom bar
(Home, Presenze, Giocatori, Squadre, Storico). Admins reach the admin sections from the user menu → Impostazioni
(no "Admin" item in the bar). `/impostazioni` without `?sezione=` = overview: grouped borderless rows with the CURRENT
VALUE on the right (e.g. "mer 11 nov", "ritiri bloccati 4h prima"); a section shows the grouped list as sidebar (lg+) and
"← Impostazioni". Profilo links `?sezione=notifiche` and `?sezione=account`. On md+ the page menu is a
separate bar BELOW the header, as wide as the cards (same `max-w-6xl px-4 sm:px-6` container); header and menu
are wrapped in ONE sticky container so both stay at the top while scrolling; phones use the bottom bar.
After login (and email verified) `/login` redirects to `/` (the Home).

Next.js 16 App Router + React 19 + TypeScript strict + Tailwind (dark only). Firebase JS SDK v9 (Google Auth,
Firestore realtime). Deploy: `git push` on `main` → Vercel. Routes are still Italian (English routes are a TODO), UI text Italian.
Checks: `npx tsc --noEmit -p .`, `npx next build`, `npm run test:rules` (Firestore rules on emulators). No ESLint config.

## Pages (`src/app/<route>/page.tsx`, all client components)

| Route | Page | Notes |
|---|---|---|
| `/` | Home "Prossima partita" | dynamic header ("Ciao Nome" + status title + detail + optional action link; `head` in page.tsx, first true condition wins: archived → MVP vote open → played not archived → no match → confirmed → teams ready → 10/10 → closed → open), match card (when/where/cost, "Ci sono"/"Ritirati", ring, own team); right column on lg (below on phone): "Il tuo rendimento" + "Ultima partita". No shortcut boxes (they duplicated the nav) and no admin note. After login users land here |
| `/presenze` | Sign-ups | day strip (status dots) + ONE `PresenceCard` for the selected day (no "Tutti i giorni" view any more); card: ring, 10 initials dots (tap → name tooltip), "Ritirati" with confirm; admin "Gestisci": list rows → bottom sheet (Fai titolare / Sposta in attesa / Rimuovi), add player, "Azzera presenze del giorno"; "Primo a 10" badge |
| `/giocatori` | Players (minimal): title (+ "Nuovo ospite" ≥ lg, admin); 3 leader cards in one row (same style as player cards, informative); controls = search (admin "+" inside < lg) then Ruolo · Ordina · Confronta (icon, text ≥ lg) · Card/Elenco icons (phone 2 rows, ≥ sm one row). Cards: `PlayerCardFifa` = borderless compact button (avatar, full name up to 2 lines, role + small `FormDots`, OVR by band), grid 1/2/3/4 cols. Tap card / Elenco row / table name → `PlayerDetailSheet` (Sheet: OVR + last 5, radar + stats as tabs < lg, side by side ≥ lg; admin actions as header icons: pencil = Modifica, "⋯" menu = Rendi/Togli admin (super admin), Elimina; no footer). Elenco < lg: columns name | role badge | V·P·S | OVR; ≥ lg: full table |
| `/giocatori` (cont.) | Players | card view (`PlayerCardFifa`, tabs radar / Statistiche) or table view (players see only name, role column and OVR; admins also V-P-S and parameters); admin edit via `PlayerModal` |
| `/squadre` | Teams. Top to bottom: summary line (date · time · field · €/person), date pills (calendar days + "Altra data"), status bar with ONE primary admin button (Genera → Conferma partita; Ribilancia secondary), admin-only collapsible "Modifica dettagli partita" (time/field/cost), tab Campo / "Modifica manuale" (`TeamSwapEditor`), `VirtualPitch` + share row (WhatsApp, Scarica immagine, Analisi AI), "Equilibrio" card (Bianchi/Neri bars + lists), `MvpVoteCard`, AI report (if asked), empty state with Genera (admin) or link to Presenze |
| `/history` | Storico (minimal): title + season pill select + admin "⋯" menu (Cancella tutto lo storico); number strip (partite · gol · giocatori) + Classifica/Partite pill. Classifica: < lg rows (index, top 3 bold, name, partite + V P S, value of the "Ordina per" select) ; ≥ lg borderless table with sortable headers, sorted column highlighted, zeros grey, top 3 numbers bold white (no medals). Tap player → `PlayerDetailSheet`. Partite: `HistoryCalendar` (left on lg) + thin rows (date · score · ⭐ MVP) → `MatchDetailSheet` (score, line-ups with ⚽/⭐/🧤, cost; admin Modifica → `MatchEditModal`, Cancella) |
| `/profilo` | Own profile | photo, name, position, radar, global stats, two links: Notifiche and Account (both in Impostazioni) |
| `/impostazioni` | Settings (+ admin panel) | groups: Tuo account = notifiche (`NotificationGuide`), account (`AccountSettings`: logout everywhere + `DeleteAccountSection`) · Gestione partita = partita · Club = campi, regole, parametri, notifiche-club · Accessi (super admin) = accessi. Old `?sezione=rosa` → accessi (super) or /giocatori (admin). Admin sections rendered by `components/admin/AdminSections.tsx` |
| `/admin` | old admin panel | now only redirects to `/impostazioni?sezione=partita` (old links keep working) |
| `/login` | Google login | |

Admin sections (`src/components/admin/AdminSections.tsx`, shown in Impostazioni): partita = `TabOverviewMatch` (Giorno
ufficiale, Cassa, Chiusura partita; no KPI boxes); campi / regole / parametri = `TabClubConfigFields` with `part="campi"`
(fields list with each field's cost + "Orario e costo standard"), `part="regole"` (Blocco ritiri switch +
`FormSettingsCard show="keeper"`), `part="params"` (`FormSettingsCard show="form"` + `StatParametersCard`); blocks use
`SettingsBlock` (borderless); notifiche-club = `NotificationSettingsCard`; accessi (super admin) = `AdminsCard` (admins with
email, Togli admin, Rendi admin) + `DeactivatedAccountsList` + `DeletionFeedbackCard`. "Rosa giocatori" was removed:
players are managed in /giocatori (super admin: "Rendi admin" in the player detail; admins see emails).
The menu item "Admin" points to `/impostazioni?sezione=partita`.

## API routes (`src/app/api/`, Node runtime, firebase-admin)

- `notify` - push notifications + server reconcile of teams/promotions (Bearer Firebase ID token)
- `cron/mvp-vote` - called every 10 min by `.github/workflows/mvp-vote-notify.yml` (Bearer `CRON_SECRET`)
- `account/delete` (mode deactivate | delete | reactivate), `account/feedback` - closing accounts and the reasons given (super admin)
- `push-config` - public VAPID key; `presence/toggle` - unused stub

## Library (`src/lib/`)

- `firebase/firestoreService.ts` - ALL client Firestore reads/writes (subscribe*, save*, transactions)
- `firebase/admin.ts`, `server/*` - server only (`push.ts`, `presenceWatch.ts`, `accountDeletion.ts`)
- `context/AuthContext.tsx` - user, profile, isAdmin, isSuperAdmin, updateProfile, signOut
- `utils/` - pure logic: `presenceRanking` (starters/waitlist, firstToTenByWeek), `teamUtils` (reconcileTeams, slot labels),
  `formUtils` (Stato forma), `matchUtils` (effective cost/time, MVP vote window), `dateUtils`, `formation` (pitch coordinates)
- `algorithm/teamBalancer.ts` - 5v5 balancing; `hooks/` - useForms, useStatCategories
- `services/` - localStorage caches + push/account/notification client helpers

## Other

- `src/proxy.ts` - middleware (cookie-based routing only; real security is in `firestore.rules`)
- `firestore.rules` + `scripts/test-rules.mjs`; `scripts/make-icons.mjs` (icons generated from `assets/`)
- `public/firebase-messaging-sw.js` - push service worker

## Checks before pushing
- `npx tsc --noEmit`, `npm run lint` (ESLint 9 flat config `eslint.config.mjs` = Next core-web-vitals + TypeScript;
  must stay at 0 errors — set-state-in-effect and `any` are warnings on purpose), `npm run build`,
  `npm run test:rules` (Firestore emulator).
