---
name: data-and-roles
description: ClubCalcetto data model (Firestore collections, players, matches, stats, history by year) and roles (player, admin, super admin) with their permissions. Read before touching data, rules or permissions.
---

# Data model (Firestore) and roles

Production data is REAL: never rewrite stats, no paid services, never print secrets. Types in `src/types/database.ts`.

## Collections

- `profiles/{id}` - player. id = Firebase uid (super admin = `p-1`; guests = `guest-<timestamp>` with `is_guest`, `user_id: null`).
  Fields: full_name (ONE string, no separate surname), email, first_name / last_name (only for email sign-ups
  since 2026-11-10; Google sign-ups and older profiles have just full_name; the profile page edits only full_name), avatar_url, role, position (Portiere|Difensore|Esterno|Punta),
  stats `{<parameter>: 1..10}`, overall_rating, matches_won/drawn/lost (changed ONLY via increment in match transactions),
  `deactivated_at` / `deactivated_by` (set only by the server; `subscribeProfiles` hides deactivated profiles unless asked with `'deactivated'`).
- `private_profiles/{profileId}` - C2 (2026-11-18): { email, updated_at }. Read: the player + admins; write: the player, only their own sign-in email (`ensurePrivateEmail` at every sign-in). Profiles NEVER get a new/changed `email` from clients (rules `profileEmailUntouched`, `saveProfileDoc` strips it). Old profiles keep `email` until the super admin runs Impostazioni → Admin e account → "Protezione delle email" (`/api/admin/email-privacy`, `migrateProfileEmails`, repeatable). Admin screens read emails with `useProfileEmails`; super admin in the UI = profile id `p-1`. Self-registration (C3, `isValidNewOwnProfile`): only app fields, stats 1..7, OVR <= 7.
- `presences/{date}_{playerId}` - sign-up; order from `joined_at` (server time); status COMPUTED by `rankDayPresences`
  Withdrawal lock (C12, 2026-11-18) enforced in rules too: own delete denied from `timelock_hours_before` hours before 20:30 Italian time when `settings/app_config.timelock_enabled` (same as `isTimelockActive` in the app); admins always can. Rules use real Italian time with summer time (C14, `toItalianTime`; formula mirrored in tests/unit/italianTimeRule.test.ts). Admin profile edits save ONLY changed fields (C1, `updateProfileFields` + `profileChanges`), never the whole copy.
  (first 10 = starters); `admin_override` 'starter'|'waitlist'.
- `matches/{date}` - one match per day. `status: 'completed'` = archived: score_white/black, team_white/team_black
  `[{id,name}]`, scorers, mvp_player_id, penalty_saves, total_cost, `profile_effects` (what was added to W/D/L; makes re-saving idempotent).
- `generated_teams/{date}` - teams (slot order POR, DIF, EST SX, EST DX, PUN), confirmed, substitutions, mvp_vote_test.
- `mvp_votes/{date}_{uid}`, `push_tokens/{fcmToken}`, `match_payments/{date}`, `sport_fields`, `stat_categories` (player parameters).
- `settings/app_config` (standard cost/time, default field, timelock_*, form_* switches, goalkeeper_mode),
  `settings/calendar` (open_until), `settings/official_match`, `settings/notifications` (mode off|admins|all).
- Server only (denied by the rules): `notify_state/{date}`, `account_feedback`, `invites/{token}`.
- `admin_requests/{id}` - admins' notification centre (bell in the header, `RequestsCenter.tsx`). Written only by the server,
  read by admins. Types: `new_signup` (id `signup_<uid>`), `restore` (`restore_<profileId>`), `account_closed` (`closed_<uid>`); status open|done.

## Statistics and history

- Storico (leaderboard), the profile's "Le mie statistiche" and the player card tab "Statistiche" are computed at read time
  from `matches` with status completed: played, won/drawn/lost, goals (scorers), MVP (`computeMatchStats` in `statUtils`;
  the Storico page has its own `buildLeaderboard`). Nothing extra is stored. Seasons = year of `match_date`.
- The Giocatori table (admins) and Anagrafica V-P-S use the counters stored on the profile (`getPlayerMatchRecord`).
- `saveMatchResult` / `deleteMatchResult` (firestoreService) keep the profile counters consistent.
- "Stato forma" (`formUtils`): temporary bonus from the last 3 matches, never written to profiles.

## Roles

- Player: any signed-in user. Edits only own full_name, avatar_url, position; own presence on open days; own MVP vote; own devices.
- Admin: `profiles.role == 'admin'`. Everything in /admin (matches, teams, settings, stats, anyone's presences, guests).
  Since 2026-11-12: also promotes/demotes admins (never p-1, never guests) and manages closed accounts
  (Impostazioni → Admin e account: reactivate / delete for good, via `/api/account/delete`). Not the feedback.
- Super admin: verified email macciolino84@gmail.com (profile `p-1`). Everything admins do, plus reads the feedback
  (`account_feedback`). Cannot be deactivated or deleted.
- Enforcement is in `firestore.rules` (UI checks are only convenience). After changing rules: `npm run test:rules`, then the
  owner publishes them by hand in the Firebase console (code first, rules second).

## Session

- 30 days from the last real Google sign-in (`SESSION_MAX_DAYS` in `AuthContext.tsx`, based on the token claim `auth_time`).
  Checked at app start, every 15 minutes and when the app comes back to the foreground; then automatic sign-out to
  `/login?expired=1`. Client-side only: `firestore.rules` and the API routes do not check `auth_time`.

## Closing an account (`src/lib/server/accountDeletion.ts`)

- Deactivate (data kept): Auth user disabled, profile marked `deactivated_at`, future presences and push tokens removed.
  Hidden everywhere; the super admin reactivates it from Admin → Anagrafica Rosa → "Disattivati" and the player finds
  parameters, W/D/L and history again (same uid).
- Delete (hard): Auth user, profile, push tokens, presences removed. Archived matches keep id + name. A new sign-up gets
  a NEW uid, so parameters, W/D/L and the link to old matches are lost.
- The player chooses between the two in the profile (reason required, saved in `account_feedback`). The super admin's trash
  on an active registered account deactivates it; deleting for good is done from the "Disattivati" list. Guests are simply deleted.

## Logout = every device
- `signOut()` (AuthContext) calls `POST /api/account/signout-all` (Bearer idToken): the server revokes the Firebase
  refresh tokens (`revokeRefreshTokens`) and writes `profiles/{id}.sessions_revoked_at` (ms, admin SDK, no rule change).
- Every open device listens to its own profile: if `sessions_revoked_at` > its sign-in time (`authTime`), it signs out
  and goes to `/login?signedout=1` ("Sei uscito da tutti i dispositivi."). A new login afterwards is not affected.

## Match cost
- `sport_fields/{id}.cost` (optional, € total) = cost of a match on that field. Effective cost of a match:
  match override (`cost_override` / archived `total_cost`) → cost of the match's field (`location`, else default field)
  → club standard `settings.standard_total_cost` → 80. Helpers: `fieldCostFor()` + `effectiveMatchCost(match, std, fieldCost)`
  in `lib/utils/matchUtils.ts` (used by Home, Squadre, Partita della settimana). Archived matches keep their own total_cost.
- `fieldService` strips `undefined` before writing (Firestore refuses it) and removes emptied optional fields (`deleteField`).

## User lifecycle (guests, invites, coming back) — server code in `lib/server/profileMerge.ts`, `adminRequests.ts`
- Profile id = account uid, so moving a player's history = `moveReferences(fromId, toId)`: rewrites every reference
  (matches teams/scorers/MVP/penalty saves/profile_effects, generated_teams, match_payments, mvp_votes incl. doc id, presences doc id).
- Invite (admin, guest detail "⋯" → "Invita su WhatsApp"): `POST /api/invite` → token in `invites` (30 days, single use) →
  link `/login?invite=TOKEN` (banner with the guest's name). After sign-in the app calls `POST /api/account/registered { invite }`:
  `claimGuest(guestId, uid)` moves history, copies stats/OVR/role, sums W/D/L, deletes the guest. Works also for an already signed-in account.
- Sign-up without invite: `/api/account/registered` opens a `new_signup` request if unlinked guests exist; admin links
  ("Collega", same `claimGuest`) or "Nuovo giocatore".
- Closing an account: unchanged choice (deactivate = data kept / delete = hard). The self-close also opens `account_closed`.
- Coming back: a DEACTIVATED account that signs in / signs up again (`auth/user-disabled`, `auth/email-already-in-use`) →
  `POST /api/account/return-request { email }` → profile `restore_requested_at`, `restore` request, "Bentornato" screen on /login.
  Admin: "Ripristina profilo e storico" (reactivate) or "Riparti da zero" (`archiveAndReset`: old record copied to `ex-<ts>`,
  anonymised + hidden, references moved there; fresh profile with default stats, Auth re-enabled). Hard-deleted accounts come back as new sign-ups.
- Any admin can resolve requests (`POST /api/admin/requests`); deleting for good stays super admin only.

## Radar Base, public leagues (2026-11-26)
- NEW accounts (`/api/account/registered { isNew: true }`) get `profiles.base_radar_pending: true`; `OnboardingGate` shows
  `BaseRadarStep` (8 base parameters, all at 6) before any page except /login. `POST /api/account/base-radar` saves
  `profiles.baseRadar` once (1–10 each) and clears the flag; clients cannot write these fields (rules). Older accounts never get the flag.
- `ensureLeagueCard` builds the card from stats reviewed in another league, else the Radar Base (`buildCardStats`), with
  `stat_status: 'UNCONFIRMED'` + `needs_stat_review: true` + `self_stats` = the Radar; `CONFIRMED` when a manager saves the
  review or approves a guest claim. Badge "Da confermare" until then.
- Public leagues (`visibility: 'public'`, active): `GET /api/leagues/public` (name, prevailing format, average OVR or null,
  players, matches; 5-minute cache), `POST` joins directly (`joinPublicLeague`); shown on the welcome screen of an account with no league.

## New player self-assessment and admin review (2026-11-12)
- At sign-up (`/api/account/registered`, new profile, 0 matches, not a claimed guest) the server sets
  `self_rating_pending: true` and `needs_stat_review: true`. Older profiles have neither field → never asked.
- `SelfRatingPrompt` (mounted in the Navbar) shows a sheet with one slider 1–10 per parameter; "Più tardi" = this session only.
  Saved by `POST /api/account/self-rating` (validates 1–10 for every club parameter) → `stats`, copy in `self_stats`,
  `overall_rating`, `self_rating_pending: false`. Players still cannot write their stats directly (rules unchanged).
- "Matches played" = matches_won + drawn + lost (the counters `saveMatchResult` increments); no separate field.
  When it reaches 1 and `needs_stat_review` is true the player appears in the bell (RequestsCenter, "Valutazioni da rivedere",
  computed live from profiles, counts in the badge). The admin corrects the sliders (self value shown under each) and saves
  → `stats`, `overall_rating`, `needs_stat_review: false`, `stat_reviewed_at/by`; the item disappears.
- A guest linked through an invite / "Collega" gets both flags false (an admin already rated the guest).
- Push to admins after a first match: `saveMatchResult` → `requestFirstMatchCheck(date)` → `/api/notify { type: 'first_match' }`
  (admins only): new players of that match with `needs_stat_review` and ≥1 match, not yet notified → push "📋 Valutazione da rivedere"
  (url `/?richieste=1` opens the bell), then `stat_review_notified_at` so it is sent once.
- Coming back: profiles with `restore_requested_at` show an amber dot on Impostazioni → "Admin e account" and are listed first
  with "Vuole rientrare". Reactivating from that list also closes the `restore_…` request.
- Login: "Password dimenticata?" (sign-in mode) → `sendPasswordResetEmail` in Italian; same message whether or not the email exists.

## Match formats (2026-11-13) — `lib/utils/matchFormat.ts`
- Formats `5v5 | 7v7 | 8v8 | 11v11` → 10 / 14 / 16 / 22 players. Chosen by an admin PER MATCH DAY in
  `settings/match_formats` → `days[date] = { format, formation, updated_at, updated_by }` (no entry = 5vs5 1-1-2-1).
  Rules: it lives under `settings` (read signed-in, write admin) — no rule change.
- Formations (first = default): 5v5 1-1-2-1 · 7v7 1-2-3-1 / 1-3-2-1 · 8v8 1-3-3-1 / 1-2-3-2 · 11v11 1-4-3-3 / 1-4-4-2.
  `FORMATIONS` has each place (label, role, x/y in the white half; black mirrored). Team arrays are stored in slot order.
- Starters vs waitlist: `rankDayPresences(list, maxStarters)`; the app subscriptions (`subscribePresences*`) and the
  server (`loadRankedPresences` reads the format) rank with the day's format. Changing the format re-ranks at once
  (nothing written); `requestTeamsCheck(date)` → server notifies who moves up.
- Roles: `FieldPosition` now includes 'Centrocampista' (5vs5 treats it as Esterno).
- Teams: `balanceTeams(players, { slots })` — 5 per team = exact search (unchanged); 7/8/11 = 40 restarts + pair swaps
  (deterministic unless "Ribilancia"), then `orderTeamForFormation` puts players on the places by role.
  Teams saved for another size → Squadre shows "rigenera" (`teamsWrongFormat`).
- Cost: field `cost` = 5vs5, `costs['7v7'|'8v8'|'11v11']` (empty = field does not host that format);
  club `standard_total_cost` = 5vs5, `standard_costs[...]` (empty = proportional to the 5vs5 quota).
  `matchCostFor(match, settings, fields, format)`; quota = cost / players. Archived matches keep total_cost and
  `cost_per_player` = total / players of that match.
- Proposals: `checkPromotions` → `proposeBiggerFormat`: future day, sign-ups (starters + waitlist) ≥ next format's
  players → `admin_requests/format_<date>_<format>` (type `format_proposal`, created once ever) + push to admins.
  Bell: "Passa al …" (`apply_format`, writes the day's format and re-checks promotions) or "Resta …" (`dismiss`).

## In-app bell for everyone (2026-11-13)
- Every push sent with `sendToProfiles` (so also `deliver` / `deliverToAdmins`) is ALSO saved in
  `profiles/{id}/notifications/{auto}` = { title, body, url, created_at, read } by `addToInbox` (server only),
  even for profiles without a registered device. Admin requests use `{ inbox: false }` (they already show in "Da gestire").
- `registeredProfileIds()` = all active non-guest accounts (+ any profile with a device): "iscrizioni aperte" and
  "voto MVP" reach everyone's bell. The notification mode (off / admins-test / all) applies to the bell too.
- Rules: each person reads / marks read (`read: true` only) / deletes only their own; nobody writes from the app.
- Bell (`RequestsCenter.tsx` → `RequestsBell`, in the Navbar): last 30, unread badge, opening marks them read,
  tap = go to the notification's page. Admins also see "Da gestire" on top.
- Cleanup: the cron (`/api/cron/mvp-vote`) deletes notifications older than 60 days once a day (~4:00 Rome; `?clean=1` forces it).
- Gemini tactical preview removed (route, lib, dependency) on 2026-11-13.

## Cassa (match_payments/{date}) — `lib/services/paymentService.ts`
- `payments[playerId] = true|false`. Reading NEVER writes; each change writes only the touched players
  (`setDoc(..., { payments: { id: bool } }, { merge: true })`); keys are never removed (a player who leaves the teams keeps his status).
- Who is listed (TabOverviewMatch): archived match → its archived teams (frozen); teams saved in Squadre → their players
  (before the date with substitutions, after it as saved); otherwise the starters of the day. Quota = cost / players in the
  teams, or / the format's players when the list is the starters.

## Personal preferences (2026-11-13)
- `profiles/{id}.locale` ('it' | 'en') and `.theme` ('system' | 'light' | 'dark'): the player may change them on their own
  profile (rules: added to the self-update whitelist with value checks; tested in `scripts/test-rules.mjs`).
- Saved by `savePreferences()` from Impostazioni → Lingua / Tema (`components/settings/*`), applied on sign-in on any device
  by `PreferencesSync` (layout). The device keeps its own copy (localStorage `cc_locale`, `cc_theme`) for the first paint.

## Multi-league (steps 1A–4 done 2026-11-18)
- Target: every club collection lives under `leagues/{leagueId}/<same name>/<same id>` (matches, presences, generated_teams,
  match_payments, mvp_votes, sport_fields, stat_categories, settings, admin_requests, notify_state) + `players/{playerId}`
  (league card: OVR, stats, W/D/L, guests; SAME id as the profile, so every reference stays valid; `userId` = auth uid or
  null for a ghost, `leagueRole` PRESIDENT|COLLABORATOR|PLAYER, `isActivePlayer`). Types in `src/types/league.ts`.
- Global stays: `profiles/{id}` = account (name, photo, locale, theme, sessions, deactivation, `platformRole` 'SUPER_ADMIN' only on p-1),
  `private_profiles`, `push_tokens`, inbox `profiles/{id}/notifications`, `account_feedback`.
- `memberships/{uid}.leagues.{leagueId} = { player_id, league_role, name }`: server-written index (profile id ≠ uid for p-1);
  rules use it (`isLeagueMember`). Role changes must update BOTH the player card and this index.
- Migration "I Calcettari" (id `calcettari`): `lib/server/leagueMigration.ts`, route `/api/admin/league-migration` (super admin,
  dryRun default), card Impostazioni → Admin e account. Only COPIES, never overwrites (batch `create`), never deletes old data; repeatable.
  Today's admins + p-1 → PRESIDENT. Permission helpers: `lib/utils/leaguePermissions.ts`.
- 1B (2026-11-18): the app reads/writes ONLY `leagues/{active}/…`. Client: `lcol/ldoc` (`lib/league/leagueRefs.ts`, active id set by
  `ActiveLeagueProvider` in `lib/context/ActiveLeagueContext.tsx`, `cc_league` on the device; pages remount on league change).
  `useAuth().profile` = global account merged with the active card; `isAdmin` = PRESIDENT|COLLABORATOR of the active league;
  `isSuperAdmin` = platform. "Rendi/Togli admin" writes `leagueRole` PRESIDENT/PLAYER (+ legacy `role`). Own name/photo/position: profile + card.
- Server: `lib/server/leagueScope.ts` — `inLeague(id, fn)` (AsyncLocalStorage), `leagueDb()`, `isLeagueManager(uid)`, `memberCard`,
  `mirrorOnCards` (deactivation / return request copied on every card), `scoped(handler)` = route runs in the league of header
  `x-league-id` (sent by every client API call). Cron runs per active league. New accounts: `ensureDefaultLeagueCard` → "I Calcettari" (until step 3 invites).
- Rules: club collections only under `leagues/{id}`: members read (verified email required), managers write, presidents change roles
  (never p-1, guests never managers), own card = name/photo/position. Old top-level collections = read-only backup (admins).
- Re-run "Crea la lega" after deploying 1B to copy anything written to the old paths in between (it never overwrites).
- Step 2 (2026-11-18): `POST /api/leagues` (`lib/server/leagueCreation.ts`): verified account, max 5 created each; id = slug + 6 hex;
  creator card PRESIDENT (`isActivePlayer` = "Gioco anch'io"), 8 default parameters (`lib/utils/defaultCategories.ts`), optional field f1
  + default_field_id, membership merged. `defaultFormat` is only stored for now (days still default to 5vs5).
  Header: `components/league/LeagueSwitcher.tsx` (sheet < 1024px, popover ≥ 1024px), `CreateLeagueSheet`, `LeagueWelcome`
  (no league → shown by ActiveLeagueProvider instead of the pages, except /login and /join). `/join/[code]` = placeholder until step 3.
  Local caches are emptied when the active league changes (`cc_cache_league`). Cards with `isActivePlayer: false` are hidden from player lists.
- Step 3 (2026-11-18): invite link `/join/{code}` — `league_invites/{code}` = { leagueId, createdBy, revoked } (server only, rules deny);
  one active code per league (`POST /api/league-invite`, managers; `regenerate` revokes). `GET/POST /api/join`: league name for anyone,
  signed in → member? + ghost players (guest cards without account, not archived); join = new card (league default parameters,
  self-rating + review flags) or claim a ghost (`claimGuest`). Suspended league = invalid. `/join` is public in the proxy; signed-out users
  go to /login and come back (`lib/utils/returnPath.ts`, `cc_return_to`). NO automatic league at sign-up any more (old guest invites
  `/login?invite=` still join THEIR league). `POST /api/league-admin`: settings (presidents; name copied into every membership),
  role (presidents; `setMemberRole` never leaves 0 presidents, guests never managers, p-1 only by the super admin; also updates the
  membership `league_role`), playing (own `isActivePlayer`). UI: Impostazioni → Lega (`components/league/LeaguePanel.tsx`); "Rendi/Togli admin"
  in Giocatori and Accessi use the same server route.
- Step 4 (2026-11-18): platform governance = `profiles/{id}.platformRole == 'SUPER_ADMIN'` (server-written; rules `platformRoleUntouched`
  refuse it from the app, even for admins) + verified email. Client `useAuth().isPlatformSuperAdmin` → user menu "Super admin"
  (after a divider) → `/super-admin` (`GET/POST /api/super-admin/leagues`, `lib/server/platformAdmin.ts`: every league with members /
  guests (count queries), status, date; suspend / re-activate). Suspended league: rules `isLeagueActive` → read-only for everyone
  (no presences, votes, cards, manager writes); server `isLeagueManager` false, invites invalid, reconcile skipped, league-admin 423,
  cron skips it; amber banner under the header (`ActiveLeagueProvider.isSuspended`).
