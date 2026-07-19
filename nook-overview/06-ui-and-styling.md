# 06 — UI & Styling

## One stylesheet

The entire app is styled by a single **`src/index.css`** (~8500 lines), imported
once in `main.jsx`. There is **no CSS framework, no CSS modules, no Tailwind, no
preprocessor.** Alongside the class-based styles, **inline `style={{}}` objects are
idiomatic** and used heavily — repeated inline style objects are accepted here and
should not be hoisted into shared constants.

## Theming (CSS custom properties + `data-theme`)

Colours are CSS variables on `:root`. The app ships **dark by default**; a light
theme overrides the same variables under `:root[data-theme="light"]`. The theme
choice is stored in `localStorage.nook-theme` and applied by stamping
`data-theme` on the root element.

Representative tokens (dark):
```css
:root {
  --bg-base:      #0a0a0a;
  --text-primary: #f5f5f5;
  --accent:       #7869fc;   /* Nook purple */
  /* …plus --bg-elevated, --bg-input, --bg-hover, --border, --border-strong,
     --text-secondary, --text-muted, --text-faint, --accent-glow, color-* etc. */
}
:root[data-theme="light"] { --bg-base: #f9fafb; --text-primary: #222; /* … */ }
```

When adding UI, use existing variables (`--bg-hover`, `--jnx-line`, `--accent`,
etc.). A few tokens referenced in old code (`--surface-2`, `--border-soft`) are
**never actually defined** — don't rely on them.

## Fonts

Loaded from Google Fonts in `index.html`: **Inter** (UI) and **Newsreader**
(serif display, used for journal/day headings). `theme-color` meta is `#0d1117`.

## Animation

**framer-motion** drives tab transitions (`AnimatePresence` around the active tab
in `App.jsx`) and small entrance/stagger animations (e.g. journal metadata via
`variants`). Note the tab wrapper uses an **opacity-only** transition on purpose:
animating `y` leaves an inline transform that becomes a containing block and breaks
`position:sticky` descendants. **canvas-confetti** (CDN in `index.html`) fires on
celebratory moments.

## The sidebar rail (added version5)

The sidebar is an **always-mounted icon rail**, not a mount/unmount toggle:

- `sidebarOpen` (App state) persists to `localStorage.nook-sidebar-open`.
- `true` → full 240px sidebar; `false` → 60px icon-only rail (`.main-nav--rail`).
- The `.app` root gets `.sidebar-open` or `.sidebar-rail`; both drive `margin-left`
  on `.app-body` via `--sidebar-width` (240px) / `--sidebar-rail-width` (60px).
- `nook-sidebar-open` is in `CROSS_TAB_IGNORE_KEYS` — a UI preference, so toggling
  it must not fire the cross-tab data-changed banner.
- `useIsRail()` in `SidebarFlyout.jsx` watches `.main-nav`'s class list with a
  **`MutationObserver`** (not a media query) so the search trigger collapses in
  sync with the JS toggle.
- CSS-only tooltips: `data-tooltip` + `::after` pseudo-element with
  `transition-delay: 0.3s`.
- **Mobile (≤768px):** `.main-nav` is `display:none` regardless of state; the
  mobile bottom nav handles navigation. Do not change this.

See [03-tabs-and-features.md](03-tabs-and-features.md) for the nav section arrays.

## Icons

Icons are **local `function IcoX()` / `NavIcoX()` components** that return inline
SVG, each file using a shared `const S` / `SI` spread-props object. Duplicating
that props object across files is accepted — there is no shared icon library.

## Responsive strategy

Desktop uses the sidebar rail + multi-column layouts; at ≤768px the app switches to
a stacked, page-scrolling layout with a hardcoded bottom nav. Several tabs
(tasks/habits/journal) use a **contained-scroll** layout on ≥768px: the app shell
is locked to `100dvh` (`html,body{overflow:hidden}`) and each tab wrapper is
bounded to the viewport via a `*-tab-active` class so only the inner content
scrolls, not the page. Mobile keeps normal page scroll.

## Conventions to match (don't "improve")

- Terse style: aligned `const` blocks, single-line guards, `try {} catch {}` around
  every localStorage access, `?.`/`??` over defensive `if`s.
- JSX uses the **automatic runtime** — no file imports `React` directly.
- Route-level views are `lazy()`-loaded, one chunk per tab.
- Commit convention: `type(scope): lowercase imperative summary`, scope is the tab
  (`tasks`, `journal`, `activity-log`, `reports`, `daily`, `shared`).
