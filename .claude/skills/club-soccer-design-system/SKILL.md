---
name: club-soccer-design-system
description: Club Soccer design system and architecture guidelines v2.0 - dark sports-dashboard theme, mobile-first ergonomics, unified CTAs (left icon for actions, right arrow for navigation), bottom sheets with vertically stacked buttons on mobile, 5-slot form tracker, master day selector for multi-tab sections, role-based rendering and admin-approved lifecycle flows. Read before designing or changing any screen or component.
---

# Skill: Club Soccer Design System & Architecture Guidelines (v2.0)

You are an expert UI/UX designer and full-stack developer collaborating on "Club Soccer", a mobile-first web application for managing amateur football (calcetto) groups, player ratings, matches, and attendance.

## 1. Core Design Principles & Theme
- Theme: Dark mode professional sports dashboard (deep dark navy/slate backgrounds, glowing green primary accents #10B981, semantic status colors).
- Typography & Spacing: Clean, touch-first, optimized for mobile ergonomics with desktop "command center" adaptations.

## Multi-Theme & Semantic Tokens (Light / Dark Mode)
- *No Hardcoded Theme Colors:* Never use hardcoded dark-only background or text colors (e.g., bg-slate-900, text-white on main surfaces) for layout containers, cards, modals, or inputs. Always use the centralized semantic CSS/Tailwind design tokens (bg-app, bg-card, bg-card-hover, text-primary, text-secondary, border-subtle, accent-primary) so every component adapts seamlessly to both Light and Dark themes.
- *Contrast & Semantic Badges:* Ensure semantic status badges (Win/Green, Draw/Yellow, Loss/Red, Paid/Unpaid) maintain accessible contrast ratios against both #FFFFFF (Light cards) and dark slate backgrounds (Dark cards).
- *Internationalization (next-intl):* Never hardcode UI strings in Italian or English inside JSX components; always use next-intl translation keys (messages/it.json and messages/en.json).

## 2. Global Component Standards (Strict Consistency)
- *Primary Buttons & CTAs:*
  - Must strictly follow a unified style across ALL pages.
  - Action/State CTAs (e.g., "Apri la settimana prossima", "Salva", "Condividi", "Segna tutti pagati") use clear contextual icons on the left.
  - Navigation/Jump CTAs (e.g., "Vai alle squadre", "Vai allo Storico") must uniformly include a right-facing arrow indicator (→) — this applies to every navigation element, both buttons and text links.
- *Modals & Dialogs:*
  - Mobile: Must always render as smooth slide-up Bottom Sheets with a top drag bar and a *vertical stack* for action buttons (Confirmation button on top in primary green, Cancel/Secondary button below in dark style). Never place buttons side-by-side on mobile.
  - Desktop: Centered modal boxes with backdrop blur.
- *Form Tracker (Last 5 Matches):*
  - Always fixed to 5 slots using semantic dots (🟢 Win=#10B981, 🟡 Draw=#F59E0B, 🔴 Loss=#EF4444, ⚪ Absent/Empty=#334155).
- *Navigation Tabs & Selectors:*
  - Multi-tab sections (like Match Day: Organizzazione, Cassa, Risultato) must be driven by a master date/day selector at the top to avoid infinite scrolling and context loss.
  - The master selector is a row of horizontal day cards; below it, clean horizontal tabs (never an infinite vertical stack of sections).

## 3. Permissions & Logic Rules
- Admin-only features (such as adding guests via the "+" icon in the search bar or modifying match logistics) must be conditionally rendered strictly based on user roles.
- Lifecycle management (invites, reconciliation, soft delete & restore workflows) must follow the established multi-step approval flows without letting regular users bypass admin decisions.

## Where these rules live in the code
- Buttons / CTAs: `src/components/ui/buttons.ts` (`btn.*`, `btnInline.*`, `textLink`, `menu.*`, `presenceBtn`).
- Modals: `src/components/ui/Sheet.tsx` (footer: put the secondary button first and the primary last — on phone the stack is reversed, so the primary is on top) and the confirm dialog in `src/components/ui/Feedback.tsx`.
- Form tracker: `src/components/FormDots.tsx`.
- Match day page: `src/components/admin/TabOverviewMatch.tsx` (day selector + 3 tabs, panels side by side ≥1024px).
- Roles: `useAuth()` (`isAdmin`, `isSuperAdmin`); server checks in `src/lib/server/adminRequests.ts`; Firestore rules in `firestore.rules`.
- Lifecycle flows: `src/lib/server/profileMerge.ts`, `src/app/api/admin/requests`, bell `src/components/admin/RequestsCenter.tsx`.
- Theme tokens: `src/app/globals.css` (`:root` light, `.dark` dark) and `tailwind.config` — real class names: `bg-app`, `bg-card`, `bg-card-hover`, `text-primary`, `text-secondary`, `text-muted`, `border-line` / `border-line-strong` (= border-subtle), `bg-accent` / `text-accent-text` / `text-on-accent` (= accent-primary), `text-danger`, `text-warning`.
- Translations: `messages/it.json`, `messages/en.json` (same keys, checked by `tests/unit/i18n.test.ts`); `useTranslations()` from `next-intl`, `useLocaleSetting()` from `src/i18n/I18nProvider.tsx`; positions, stat names and pitch places via `src/i18n/usePlayerLabels.ts` (data stays Italian in Firestore).
- More detail: skills `ui-conventions`, `data-and-roles`, `project-map`.
