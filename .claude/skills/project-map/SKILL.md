---
name: project-map
description: Map of the ClubCalcetto project - folders, routes, where each page and feature lives (Storico, Giocatori, Admin, Profilo, Squadre, Presenze, notifications). Read before searching the codebase.
---

# ClubCalcetto - project map

Brand shown to users: **Club Soccer** (renamed 2026-11-10). Code, repo, Vercel domain and storage keys still say ClubCalcetto.
Header (`Navbar.tsx`): logo + "Club Soccer" on the left; on the right icon, name and role open a dropdown menu
(Profilo, Impostazioni, Logout; closes on outside tap, Esc, page change). Profilo is NOT in the page menu / bottom bar
(Home, Presenze, Giocatori, Squadre, Storico). Admins reach the admin sections from the user menu → Impostazioni
(no "Admin" item in the bar). `/impostazioni` without `?sezione=` = overview of all sections (cards, same on PC and
phone); a section shows the sidebar (md+) and "← Impostazioni". Profile "Notifiche → Apri" links `?sezione=notifiche`. On md+ the page menu is a
separate bar BELOW the header, as wide as the cards (same `max-w-6xl px-4 sm:px-6` container); header and menu
are wrapped in ONE sticky container so both stay at the top while scrolling; phones use the bottom bar.
After login (and email verified) `/login` redirects to `/` (the Home).

Next.js 16 App Router + React 19 + TypeScript strict + Tailwind (dark only). Firebase JS SDK v9 (Google Auth,
Firestore realtime). Deploy: `git push` on `main` → Vercel. Routes are still Italian (English routes are a TODO), UI text Italian.
Checks: `npx tsc --noEmit -p .`, `npx next build`, `npm run test:rules` (Firestore rules on emulators). No ESLint config.

## Pages (`src/app/<route>/page.tsx`, all client components)

| Route | Page | Notes |
|---|---|---|
| `/` | Home "Prossima partita" | official match date: when/where/cost, own status with "Ci sono"/"Ritirati", ring + places, own team, shortcuts. After login users land here |
| `/presenze` | Sign-ups | day strip + `PresenceCard`; admin: opens next week, adds/removes players, forces starter/waitlist (arrows), "Azzera presenze del giorno"; "Primo a 10" badge; "Partita al completo" card: admin "Conferma partita" (same as Squadre: `confirmTeams` + match_confirmed notification) or "Genera squadre" if no teams yet |
| `/giocatori` | Players: leaders row (Capocannoniere, Più MVP, Più presenze, In forma → tap sorts the cards), role filters, "Confronta" (`PlayerCompare`) |
| `/giocatori` (cont.) | Players | card view (`PlayerCardFifa`, tabs radar / Statistiche) or table view (players see only name, role column and OVR; admins also V-P-S and parameters); admin edit via `PlayerModal` |
| `/squadre` | Teams | generate / Ribilancia / Conferma Partita / tab "Modifica manuale" (`TeamSwapEditor`), `VirtualPitch`, `MvpVoteCard` |
| `/history` | Storico | tabs Classifica (leaderboard, sortable by clicking the headers) / Partite (`HistoryCalendar` + match cards), season select, admin delete + `MatchEditModal`. A new year appears from 31 Dec 22:00 Europe/Rome (`getVisibleHistoryYear` in `dateUtils`) |
| `/profilo` | Own profile | photo, name, position, radar, global stats, link to Impostazioni, `DeleteAccountSection` (bottom: deactivate or delete) |
| `/impostazioni` | Settings (+ admin panel) | `?sezione=` notifiche (everyone: `NotificationGuide`) · admin: partita, rosa, notifiche-club, regole, parametri · super admin: account. Sidebar on md+, list → section with back link on phones. Admin sections rendered by `components/admin/AdminSections.tsx` |
| `/admin` | old admin panel | now only redirects to `/impostazioni?sezione=partita` (old links keep working) |
| `/login` | Google login | |

Admin sections (`src/components/admin/AdminSections.tsx`, shown in Impostazioni): partita = `TabOverviewMatch` (day election,
cash, match closing); rosa = `TabUsersRoles`; notifiche-club = `NotificationSettingsCard`; regole / parametri =
`TabClubConfigFields` with `part="rules"` (fields, Blocco ritiri, cost/time) or `part="params"` (`FormSettingsCard` incl.
goalkeeper mode, `StatParametersCard`); account (super admin) = `DeactivatedAccountsList` + `DeletionFeedbackCard`.
The menu item "Admin" points to `/impostazioni?sezione=partita`.

## API routes (`src/app/api/`, Node runtime, firebase-admin)

- `notify` - push notifications + server reconcile of teams/promotions (Bearer Firebase ID token)
- `cron/mvp-vote` - called every 10 min by `.github/workflows/mvp-vote-notify.yml` (Bearer `CRON_SECRET`)
- `account/delete` (mode deactivate | delete | reactivate), `account/feedback` - closing accounts and the reasons given (super admin)
- `push-config` - public VAPID key; `ai/tactical-preview` - Gemini hook; `presence/toggle` - unused stub

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
