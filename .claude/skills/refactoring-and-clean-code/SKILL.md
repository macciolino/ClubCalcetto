---
name: refactoring-and-clean-code
description: Architectural and code quality guidelines for Next.js, TypeScript, and React to prevent monolithic components, separate business logic into custom hooks/utilities, and keep code modular and testable.
---

# Skill: Refactoring & Clean Code Architecture (Club Soccer)

## 1. Component Modularity (Anti-Monolith Rule)
- Never build huge, monolithic page components ("God Components" > 250-300 lines).
- Break down complex views (such as Match Day tabs, Player lists, or Admin panels) into small, focused, single-responsibility subcomponents inside dedicated component folders.

## 2. Separation of Concerns (Logic vs. UI)
- Keep JSX components focused strictly on rendering and user interaction.
- Extract complex state management, Firebase data fetching, and business calculations (e.g., Cassa quota splits, match score validations, player sorting/filtering, OVR math) into custom hooks (`use...`) or pure TypeScript utility functions (`utils/...`).
- Pure functions make unit testing effortless and keep UI components clean.

## 3. TypeScript & Tailwind Hygiene
- Enforce strict TypeScript typing: avoid `any`, reuse centralized interfaces/types for Firestore documents (`Player`, `Match`, `Transaction`, etc.).
- Extract repeated UI patterns (such as status badges, card wrappers, or modal action footers) into reusable UI primitives instead of duplicating long Tailwind class strings.

## How this maps to the ClubCalcetto codebase
- **Types:** all Firestore document types are in `src/types/database.ts`. In this project a player is `Profile`, a match `Match`,
  the Cassa record `MatchPaymentRecord`, teams `GeneratedTeamRecord` / `MatchTeamPlayer`, presences `Presence`. Reuse them; do not redeclare.
- **Pure logic (tested in `tests/unit`):** `src/lib/utils/` (`cashUtils`, `resultValidation`, `matchFormat`, `matchUtils`,
  `presenceRanking`, `teamUtils`, `formUtils`, `statUtils`) and `src/lib/algorithm/teamBalancer.ts`. New calculations go here, with a test.
- **Data access:** Firestore reads/writes in `src/lib/firebase/firestoreService.ts` and `src/lib/services/*`; realtime hooks in
  `src/lib/hooks/` (`useMatchFormats`, `useForms`, `useStatCategories`). Components must not call `setDoc`/`onSnapshot` directly for new code.
- **Server logic:** `src/lib/server/*` (Admin SDK) behind the API routes in `src/app/api/**`.
- **UI primitives:** `src/components/ui/` — `buttons.ts` (`btn`, `btnInline`, `textLink`, `menu`), `Sheet.tsx` (every modal),
  `Feedback.tsx` (`notify`, `askConfirm`), `Skeleton.tsx`; plus `FormDots`, `CollapsibleCard`, `StatRatingFields`. Add new badges / cards / footers here.
- **Known monoliths to split gradually** (only when touching them, never as a risky big-bang rewrite on real data):
  `src/app/squadre/page.tsx` (~1060 lines), `src/app/login/page.tsx` (~830), `src/components/admin/TabOverviewMatch.tsx` (~775),
  `src/app/giocatori/page.tsx` (~740), `src/components/admin/AdminSections.tsx` (~350).
- **Refactoring safety:** behaviour must stay identical (production data is real). Before splitting, make sure tests cover the
  logic being moved; then follow the `pre-commit-testing-gate` skill.
