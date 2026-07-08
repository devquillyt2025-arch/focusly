# Nook — Full Mobile Responsiveness Audit (Discovery)

**Method:** Playwright at 375 / 390 / 428 / 768px, `isMobile`+`hasTouch`, realistic seeded data, all 14 pages. Programmatic horizontal-overflow detection + per-element touch-target measurement + full-page screenshots, plus a targeted modal-fit check.

**Theme note:** Captured in dark theme. Responsive *layout* breakage (overflow, stacking, touch-target size) is driven by the same layout CSS in both themes — color is the only thing theme changes — so one theme is sufficient for every finding below. No finding here is color/contrast-specific.

**Headline:** This is **not** an app with absent mobile support — it has a real adaptive strategy (icon-rail nav ≤1024px, bottom-bar nav ≤640px, page content grids that stack, modals that fit). The problems are concentrated in **two areas**: (1) the **top app bar has no mobile treatment and breaks on every page below ~600px**, and (2) **secondary filter toolbars and small icon buttons** don't adapt. Tablet (768px) is in good shape.

---

## CRITICAL

### C1 — Top app bar overlaps/collides on every page at phone widths
**Viewports:** 375, 390, 428 (fine at 768). **All 14 pages.**
The header's search field, the "Good Morning/Night" greeting, the `Ctrl K` badge, and the right-side icon cluster (activity / notifications / avatar) all render on one fixed row with no mobile reflow. They overlap — e.g. the search's `Ctrl K` badge sits on top of the greeting text ("…Ctrl K‹light" mashed together). Measured: `.header-right` (w=230) ends at x=463 on a 375px screen (88px past the edge); still 35px over at 428px.
**File:** `src/App.jsx` header block (~L1285–1303, `.yartu-top-search` + `HeaderGreeting` + `.header-right`); no `@media` rule collapses the header anywhere in `src/index.css`.
**Screenshots:** every `M-*-375.png` top strip; contrast with clean `M-Today-768.png`.

---

## HIGH

### H1 — 14-item horizontally-scrolling bottom nav (violates ≤5-item rule)
**Viewports:** ≤640 (375/390/428).
At ≤640px the sidebar becomes a `position:sticky; bottom:0` bar with `overflow-x:auto` carrying **all 14 destinations** at 62px each (~868px of content). Only ~6 fit on screen; the rest require horizontally scrolling a bar with no scroll affordance. Skill `bottom-nav-limit` = max 5. At ≤480px labels are also hidden, so it's a 14-icon scroll strip with no text.
**File:** `src/index.css:3897–3919` (`.main-nav` row/bottom-bar rules), `:3922` (labels hidden ≤480).
**Screenshots:** bottom strip of any `M-*-375.png` (note the bar shows different item subsets per page as it scrolls to the active item).

### H2 — Secondary filter toolbars overflow (single non-wrapping rows)
**Viewports:** 375/390/428 (Tasks & Notes also slightly at 768).
These toolbars are fixed horizontal rows that clip instead of wrapping/stacking:
- **Tasks** — Search / Sort / Filter / overview-count / Sync: filter dropdown + "N pending" count clipped off the right (`.relative-select-container` right=468 @375; still right=832 @768). `src/components/TaskList.jsx:806`.
- **Notes** — the color-swatch filter row overflows badly (240px row ends at x=500 on a 375 screen); most swatches unreachable. `src/components/NotesView.jsx` toolbar (~L658).
- **Activity Log** — Module / Status / Date-range row: only Search + Module visible; **Status and Date filters pushed entirely off-screen** (`.al-dsel` right=492 @375). `src/components/ActivityLogView.jsx:237`.
**Screenshots:** `M-Tasks-375.png`, `M-Notes-375.png`, `M-ActivityLog-375.png`.

### H3 — Pervasive sub-44px touch targets; worst are icon-only buttons (22–32px)
**Viewports:** all (measured @375). Skill priority 2 (CRITICAL rule): min 44×44px.
96 distinct interactive elements measure under 44px tall @375. The genuinely hard-to-tap ones are icon-only buttons small in **both** dimensions:
| Size | Button | Page |
|---|---|---|
| 22×22 | color-picker toggle | Notes |
| 22×22 / 26×26 / 24×24 | Star / Copy URL / Edit | Links |
| 24×24 | task Star / kebab "More" | Tasks |
| 26–32px | Journal toolbar (bold/italic/underline), week/day nav arrows, collapse | Journal |
| 28×28 | prev/next month chevrons | Calendar |
| 30×30 | header "Analytics" button | all pages |
| 32×32 | gear / refresh | Activity Log |
**File:** respective components; these use desktop icon-button sizing with no mobile `min-height/min-width` bump. `hitSlop`-equivalent padding would fix without visual change.

### H4 — Journal editor layout broken at phone width
**Viewports:** 375/390/428.
Below the "Writing activity" heat-strip, the editor renders as a large empty area bisected by a stray vertical divider line, with the editor toolbar ("‹ › 📖 Autosave on 🔍") floating in the middle of blank space and the date label stranded at the very bottom. The desktop two-column editor doesn't collapse cleanly.
**File:** `src/components/JournalView.jsx` editor region + `src/index.css` `.journal-rich-editor` / `.jnx-*` layout.
**Screenshot:** `M-Journal-375.png`.

---

## MEDIUM

### M1 — Today "Viewing/Editing" toggle overlaps the summary text
**Viewports:** 375/390/428 (fine at 768).
The `Viewing/Editing` segmented control floats over the "Today you have: 3 events to do…" list, clipping "events to c…". It's absolutely/flex-positioned for desktop width without a mobile stack.
**File:** `src/components/DailyGoalsView.jsx` (`.yartu-mode-toggle` / greeting header). **Screenshot:** `M-Today-375.png`.

### M2 — `sidebarOpen` initializes `true` with no viewport detection
Mobile nav is 100% CSS-driven; there's no JS awareness of screen size (no `matchMedia`, no auto-collapse). It works today because the ≤640 CSS reshapes the always-rendered nav into a bottom bar — but any future JS nav logic (close-on-navigate, drawer) has no hook, and the hamburger/`sidebar-reopen` affordance is effectively dead weight on mobile.
**File:** `src/App.jsx:991`.

### M3 — Inconsistent breakpoint system
11 distinct `max-width` breakpoints across `index.css` (1280 / 1200 / 1100 / 1080 / 1024 / 980 / 840 / 820 / 768 / 640 / 480) with no systematic scale — the same logical "tablet"/"phone" boundary is drawn at different pixels by different components, which is why some toolbars adapt at 768 and others not until 640/480. Skill `breakpoint-consistency`. Recommend consolidating to ~3–4 tokens (e.g. 480 / 768 / 1024 / 1280).

### M4 — Habits: activity dots + habit-row controls overflow
**Viewports:** 375/390/428.
The "14-DAY ACTIVITY" dot row runs off the right edge of the stats banner, and the per-habit right-side controls (weekday grid + streak + Mark Done) crowd/overflow rather than stacking under the habit name.
**File:** `src/components/HabitsView.jsx` + `.hv-*` CSS. **Screenshot:** `M-Habits-375.png`. (Note: the `.task-detail-panel hv-panel` flagged by the overflow scanner is an off-canvas edit drawer parked off-screen — a false positive, not visible breakage.)

### M5 — Non-icon controls also below 44px tall app-wide
Beyond H3's icons: text buttons run 29–39px tall, toggles 21px, inputs 34–36px. Individually tappable (wide enough) but collectively below the comfort minimum — a blanket "bump interactive heights to ≥44px on touch" pass would help forms and toolbars everywhere (Settings toggles `.toggle-track` 40×21, Focus adjust pills 24px tall, etc.).

### M6 — Calendar Month view unverified (Day view is the default and is fine)
The calendar defaults to **Day** view, which renders as a clean vertical hour list on mobile. The **Month** view (7-column grid) was not the active view and is the classic mobile-breakage risk (cramped 7-col cells / horizontal scroll). Flag for explicit verification in the fix phase.
**File:** `src/components/CalendarView.jsx` month-grid. **Screenshot (Day, OK):** `M-Calendar-375.png`.

---

## LOW

### L1 — Tablet (768) minor toolbar clipping
Cosmetic at tablet width: Tasks overview count ("2 pendin…"), Notes sort select, and Activity Log date button clip a few px at the right edge. Same root cause as H2, milder. **Screenshots:** `M-Tasks-768.png`, `M-Notes-768.png`.

### L2 — Modal × close buttons ~27px (under 44px)
Modals themselves are **well-behaved** on mobile (335px wide @375, centered, `max-height:90vh` internal scroll, actions reachable — see `MODAL-addtask-375.png`). Only nit: the `.modal-close` button is ~27px, consistent with the H3 touch-target theme.

### L3 — Long-string wrapping (verify when expanded)
Seeded long email (Vault) and long URLs (Links) were hidden behind collapsed groups this pass. Links cards showed correct truncation; Vault account rows should be re-checked expanded to confirm long usernames wrap/ellipsize rather than overflow.

---

## What already works well (don't touch in fixes)
- **Viewport meta** correct (`width=device-width, initial-scale=1`; zoom not disabled).
- **Round 2 `.page-hero` headers reflow correctly** on mobile — icon+title+subtitle+CTA wrap sensibly; the CTA is never pushed off-screen (Tasks, Notes, Habits, Reports, Settings, Countdowns, Saved Logins, Reminders, Focus, Activity Log all verified). This was a specific concern in the prompt — it's fine.
- **Content grids stack to 1 column** correctly: Tasks 60/40 dashboard → stacked; Reports stat cards → 2×2; Notes/note cards → single column; Settings 2-col → 1-col.
- **Modals fit and scroll** within the viewport; close reachable.
- **Tablet (768px)** is largely clean: header fits, 64px icon-rail nav works, content stacks.
- **Focus, Settings, Reports, Saved Logins** pages adapt cleanly with no structural breakage.

---

## Suggested fix-phase ordering (for when you confirm scope)
1. **C1** top app bar — highest impact, affects all 14 pages; needs a mobile header layout (stack/collapse search, hide or shrink greeting, keep icon cluster).
2. **H2** filter toolbars — make Tasks / Notes / Activity Log toolbars wrap or become horizontally scrollable *with* affordance.
3. **H3** icon touch targets — blanket `min-width/height:44px` (or hit-area padding) on icon-only buttons.
4. **H4** Journal editor mobile layout.
5. **H1** bottom nav — reduce to a primary set (≤5) + "More" overflow, or make the scroll affordance explicit.
6. **M1/M4/M6** page-specific (Today toggle, Habits controls, Calendar month view).
7. **M3** breakpoint consolidation — do alongside the above so new rules use one scale.
8. **M5 / L1 / L2 / L3** polish.

No code changes made in this pass.
