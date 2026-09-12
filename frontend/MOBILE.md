# Mobile breakpoints

Use the same values in CSS (`@media`) and JS (`useMediaQuery`).

| Name | Query | Use |
|------|-------|-----|
| **nav** | `max-width: 1023px` | Drawer sidebar, registry/table cards, compact headers |
| **compact** | `max-width: 767px` | Phone toolbars (2-row), activity/access cards, assign 1-col |
| **phone** | `max-width: 639px` | Fullscreen modals, densest column hide |

## Unified mobile chrome (keep in sync)

Primary file: [`src/styles/mobile.css`](src/styles/mobile.css)

Across pages ≤1023:

1. **Title** — hide `.page-header-eyebrow` / `.page-header-heading` (title lives in mobile top bar). Collapse empty `.page-header-main` when no crumb/subtitle/hint.
2. **Actions** — `margin-top: 0` on `.page-header-actions` (no desktop title offset). Full-width CTA on ≤767 for registry/projects/qb/dev.
3. **Spheres / audience** — full-width `.sphere-select`, `.sphere-tabs`, `.task-audience-bar`.
4. **Dense tables** — card rows only on **phone ≤639**; from 640px keep columns in one line:
   - Staff / Leaders → `registry.css` (cards ≤639; compact table 640–1023)
   - Checklist → `mobile.css` (≤1023 journal list, unified chrome)
   - Issuance → `issuance.css` (≤1023)
   - Academy → `academy.css` (≤1023)
   - Activity / Access → own CSS (≤767)
   - Case prizes → `cases.css` (≤1023)
5. **Touch** — primary controls ≥ `--touch-min` (44px) on phone; inputs `font-size: 16px` where focus zoom matters.

Page-stack modifiers to prefer: `--tasks`, `--checklist`, `--issuance`, `--academy`, `--projects`, `--dashboard`, `--activity`, `--qb`, `--assign`, `--jfl`, `--forum-fmt`, `--dev`, `--cases`; plus `office-registry-page` / `staff-registry-page`.

## JS

```ts
import { MOBILE_NAV_QUERY, COMPACT_QUERY, PHONE_QUERY, matchesMediaQuery } from './hooks/useMediaQuery'
```

## Manual test viewports

- 390×844 — iPhone, burger nav, modals fullscreen, staff/leaders card rows
- 768×1024 — iPad, drawer + staff/leaders compact table (one line)
- 1023×768 — nav breakpoint edge

## Regression checklist

- Burger open/close, nav active state, route change closes menu
- Staff / Leaders — table from 640px; card rows only ≤639; no horizontal page scroll
- Academy / Issuance — card rows ≤1023
- Checklist — single column mode, week nav full width
- Tasks toolbar — ≤2 rows on compact, create + filters + view
- Activity / Access — stacked cards
- Task drawer — safe area, mobile top bar hidden
- QB / Assign modals — fullscreen on phone
- Profile settings modal
