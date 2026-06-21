# Mobile breakpoints

Use the same values in CSS (`@media`) and JS (`useMediaQuery`).

| Name | Query | Use |
|------|-------|-----|
| **nav** | `max-width: 1023px` | Drawer sidebar, registry card layout |
| **compact** | `max-width: 767px` | Checklist cards, tasks list default, toolbars |
| **phone** | `max-width: 639px` | Fullscreen modals, single-column grids |

## JS

```ts
import { MOBILE_NAV_QUERY, COMPACT_QUERY, PHONE_QUERY, matchesMediaQuery } from './hooks/useMediaQuery'
```

## CSS

Primary file: [`src/styles/mobile.css`](src/styles/mobile.css)

Registry mobile layout: [`src/styles/registry.css`](src/styles/registry.css) (`@media max-width: 1023px`)

## Manual test viewports

- 390×844 — iPhone, burger nav, modals fullscreen
- 768×1024 — iPad, drawer + registry cards
- 1023×768 — nav breakpoint edge

## Regression checklist

- Burger open/close, nav active state, route change closes menu
- Staff/Leaders registry — no horizontal scroll
- Checklist — single column mode, week nav full width
- Task drawer — safe area, mobile top bar hidden
- QB modals — fullscreen on phone
- Profile settings modal
