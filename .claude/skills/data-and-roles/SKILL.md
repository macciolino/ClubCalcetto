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
- `presences/{date}_{playerId}` - sign-up; order from `joined_at` (server time); status COMPUTED by `rankDayPresences`
  (first 10 = starters); `admin_override` 'starter'|'waitlist'.
- `matches/{date}` - one match per day. `status: 'completed'` = archived: score_white/black, team_white/team_black
  `[{id,name}]`, scorers, mvp_player_id, penalty_saves, total_cost, `profile_effects` (what was added to W/D/L; makes re-saving idempotent).
- `generated_teams/{date}` - teams (slot order POR, DIF, EST SX, EST DX, PUN), confirmed, substitutions, mvp_vote_test.
- `mvp_votes/{date}_{uid}`, `push_tokens/{fcmToken}`, `match_payments/{date}`, `sport_fields`, `stat_categories` (player parameters).
- `settings/app_config` (standard cost/time, default field, timelock_*, form_* switches, goalkeeper_mode),
  `settings/calendar` (open_until), `settings/official_match`, `settings/notifications` (mode off|admins|all).
- Server only (denied by the rules): `notify_state/{date}`, `account_feedback`.

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
  Cannot change roles; cannot delete registered accounts (guests only).
- Super admin: verified email macciolino84@gmail.com (profile `p-1`). Promotes/demotes admins, deactivates / reactivates /
  deletes accounts (through `/api/account/delete`), reads the feedback. Cannot be deactivated or deleted.
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
