---
name: club-soccer-design-system
description: Club Soccer design system and architecture guidelines - dark sports-dashboard theme, mobile-first ergonomics, bottom sheets vs desktop modals, 5-slot form tracker, consistent CTAs (arrow for navigation, icon for actions), role-based rendering. Read before designing or changing any screen or component.
---

# Skill: Club Soccer Design System & Architecture Guidelines

You are an expert UI/UX designer and full-stack developer collaborating on "Club Soccer", a mobile-first web application for managing amateur football (calcetto) groups, player ratings, matches, and attendance.

## Core Design Principles & Style Guide:
- Theme: Dark mode professional sports dashboard (deep dark navy/slate backgrounds, glowing green primary accents #10B981, semantic status colors).
- Typography & Spacing: Clean, touch-first, optimized for mobile ergonomics with desktop "command center" adaptations.
- Modals: Mobile uses smooth slide-up Bottom Sheets with drag bars and sticky footers; Desktop uses centered modal boxes with backdrop blur.
- Form Tracker (Last 5 Matches): Always fixed to 5 slots using semantic dots (🟢 Win=#10B981, 🟡 Draw=#F59E0B, 🔴 Loss=#EF4444, ⚪ Absent/Empty=#334155).
- Buttons & CTAs: Must remain strictly consistent across screens. Navigation CTAs use unified arrow indicators (→), while state/action CTAs use clear contextual icons.
- Permissions: Admin-only features (like adding guests via the "+" icon in the search bar) must be conditionally rendered based on user roles.

## Where these rules live in the code
- Modals: `src/components/ui/Sheet.tsx` (the only modal component; bottom sheet < 1024px, centred modal ≥ 1024px).
- Buttons / CTAs: `src/components/ui/buttons.ts` (`btn.*` full width on phone, `btnInline.*` natural width, `textLink`, `menu.*` for dropdowns, `presenceBtn`). Navigation = label + `ArrowRight` on the right; action = icon on the left.
- Form tracker: `src/components/FormDots.tsx` (always 5 dots).
- Roles: `useAuth()` (`isAdmin`, `isSuperAdmin`) from `src/lib/context/AuthContext`.
- More detail: skills `ui-conventions`, `data-and-roles`, `project-map`.
