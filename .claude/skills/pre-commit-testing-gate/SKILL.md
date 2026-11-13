---
name: pre-commit-testing-gate
description: Quality gate protocol that enforces running or updating relevant automated tests after substantial code changes and before proposing a git commit.
---

# Skill: Pre-Commit Testing & Quality Gate Protocol

## Trigger Condition
Activate this protocol whenever you complete substantial code changes involving:
- Business logic & calculations (e.g., Cassa quota splits, OVR/stats calculations, goal validations)
- Firebase services, Firestore queries, or Security Rules
- State management, custom hooks, or user lifecycle flows (invites, reconciliation, soft delete)
- Core interactive UI flows (e.g., Match Day tabs, Player filters)
*(Skip this protocol for trivial copy edits, comments, or minor CSS/styling tweaks).*

## Mandatory Action Before Commit
1. **Pause before commit:** Never suggest or execute a `git commit` immediately after finishing substantial code edits.
2. **Prompt the user:** Explicitly ask the user: *"Vuoi che lanci o aggiorni i test relativi alle modifiche appena fatte prima di procedere con il commit?"*
3. **Target the right tests:** List the specific test files or test suites directly impacted by the modified files (distinguishing between Unit tests, Integration tests, and E2E Playwright tests) and offer to run them or update their assertions if the business logic changed.

## Project map: modified files → tests to run (ClubCalcetto)

| Modified files | Unit (Vitest) `npm run test:unit` | Integration (emulators) `npm run test:integration` | Rules `npm run test:rules` | E2E (Playwright) `npm run test:e2e` |
|---|---|---|---|---|
| `lib/utils/cashUtils.ts`, `lib/services/paymentService.ts`, Cassa in `TabOverviewMatch.tsx` | `tests/unit/cash.test.ts` | — | `scripts/test-rules.mjs` (Cassa merge) | `tests/e2e/match-day.spec.ts` (Cassa) |
| `lib/utils/resultValidation.ts`, `MatchResultFields.tsx`, `saveMatchResult` | `tests/unit/resultValidation.test.ts` | — | — | `tests/e2e/match-day.spec.ts` (Chiusura) |
| `lib/utils/matchFormat.ts`, `matchUtils.ts`, `presenceRanking.ts`, `teamUtils.ts`, `lib/algorithm/teamBalancer.ts` | `tests/unit/formats.test.ts`, `tests/unit/cash.test.ts` (costs) | `tests/integration/lifecycle.test.ts` (format proposal) | — | — |
| `lib/server/*` (profileMerge, adminRequests, presenceWatch, push), `app/api/**` | — | `tests/integration/lifecycle.test.ts` | — | — |
| `firestore.rules` | — | — | `scripts/test-rules.mjs` | — |
| `lib/firebase/firestoreService.ts`, `lib/context/AuthContext.tsx`, `app/login` | the unit files of the logic touched | `tests/integration/lifecycle.test.ts` | `scripts/test-rules.mjs` | `tests/e2e/match-day.spec.ts` (login + flows) |
| `admin/TabOverviewMatch.tsx`, `admin/AdminSections.tsx`, `ui/Sheet.tsx`, `ui/Feedback.tsx` | — | — | — | `tests/e2e/match-day.spec.ts` |

Always also run, before any commit of substantial changes: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`.

Notes:
- E2E uses the emulator ports 8080/9099: `npm run dev:emulators` must be stopped first.
- Integration and E2E run only on the local emulators (fake project `demo-clubcalcetto`), never on production.
- If a test fails because the business rule changed on purpose, propose the updated assertion to the user; never weaken a test just to make it pass.
- No test covers the change? Say so and propose a new test in the right suite.
