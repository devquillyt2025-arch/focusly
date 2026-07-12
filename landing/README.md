# nook — 3D holographic landing page

A portfolio flex piece for **nook**, a holographic/glassmorphic productivity app.
The whole job of this page is to make someone stop scrolling and go *"how did they
build this."* No signup, no waitlist, no CTA — just a refractive glass object that
reacts to you, and a live demo of the product's brain.

Built as an **isolated Next.js 14 app** inside the nook repo (`/landing`) so it
never collides with the main app's Vite build.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **React Three Fiber** + **drei** + **@react-three/postprocessing** — the hero object
- **Framer Motion** — scroll/UI animation
- **Tailwind CSS** — with nook's holographic palette as theme colors
- **@anthropic-ai/sdk** — the "ask nook" widget

## Run it

```bash
cd landing
npm install
cp .env.local.example .env.local   # optional — add ANTHROPIC_API_KEY for live "ask nook"
npm run dev                         # http://localhost:3000
```

`npm run typecheck` / `npm run build` to verify.

## What's happening

### Hero — the centerpiece (`components/Scene.tsx`)
An abstract refractive glass **torus-knot** (procedural geometry, one transmission
draw) rendered with drei's `MeshTransmissionMaterial` — iridescence, chromatic
aberration, an ior-driven color that shifts cool→warm on scroll. It:

- idle-rotates on its own,
- tilts with the cursor (subtle parallax, not drag-control),
- sits on `#050505` with a soft radial glow behind it,
- gets **bloom + chromatic aberration + film noise** via postprocessing,
- has a **cursor-tracked point light** so the refraction visibly follows the mouse —
  it feels alive, not pre-baked.

### Scroll narrative
`lib/useScrollGrade.ts` runs one rAF loop that owns scroll: it feeds the shared
`scrollStore` (read every frame inside the R3F `useFrame`) **and** writes CSS custom
properties on `<html>`. So the object morph (scale / spin / color) and the page's
ambient hue shift **as one system** — cool indigo at the hero, warm holographic
magenta by the modules (`components/ModuleShowcase.tsx`), where the eight nook
modules stagger in as glass cards on scroll-into-view.

### Atmosphere & feel
The login card's living-glass language is carried across the whole page:

- **Cursor light** (`components/CursorGlow.tsx`) — a hue-tinted glow trails the
  cursor (transform-only rAF lerp), so every glass surface reads as lit by you.
- **Card physics** — module cards tilt in 3D toward the pointer and carry a
  cursor-tracked specular highlight (direct style writes, zero re-renders).
- **Letter-by-letter hero** — the wordmark blurs in per letter, then parallaxes
  up and dissolves on scroll-out while the object takes the frame.
- **Particle dust** — ~260 additive points drift around the object (one draw
  call) and catch the bloom pass.
- **Pinned statement** (`components/Statement.tsx`) — an Apple-style sentence
  revealed word-by-word, scrubbed by scroll while pinned.
- **Marquee, film grain, vignette, giant finale wordmark** — plus styled
  scrollbar and selection. Grain/vignette/glow are fixed compositor layers;
  everything respects `prefers-reduced-motion`.

### Easter egg
**Triple-click the object** and it briefly shatters into shard particles, then
reforms. Instanced shards (one draw call), envelope-animated in `useFrame` — cheap,
and it gets screenshotted.

### Login → dashboard (`components/LiquidGlassLogin.tsx` + `app/login/page.tsx`)
`/login` is now the real front door to the nook dashboard — same Supabase
project as the main (Vite) app, email/password + Google OAuth, sign-up, and
password reset, all wired to `src/utils/authClient.js`'s exact error-copy and
`AuthPage.jsx`'s exact auth calls. Visual design is untouched from the
original: the SVG turbulence/displacement refraction, cursor-tracked
specular, and edge sheen are unchanged.

**Why it's not a shared session automatically:** landing (`/login`) and the
dashboard are separate deployments — separate origins, separate storage.
- **Google/GitHub OAuth** needs no bridge: `redirectTo` points straight at the
  dashboard's origin (`NEXT_PUBLIC_APP_URL`), so when the provider redirects
  back, the dashboard's own `detectSessionInUrl` (already used for its native
  Google sign-in) picks the session up automatically.
- **Email/password** has no redirect step — Supabase just returns a session
  directly. `lib/supabaseClient.ts`'s `handoffUrl()` hands the access/refresh
  tokens to the dashboard via a URL hash with custom key names
  (`sb_access_token`/`sb_refresh_token`, chosen so they never collide with
  Supabase's own `access_token=` hash format). `src/components/AuthGate.jsx`
  on the dashboard side consumes them once via `supabase.auth.setSession(...)`
  and immediately scrubs the hash from the URL/history.
- **Password reset** needs no bridge either — Supabase's recovery email uses
  its own native hash format, which `detectSessionInUrl` already handles.

**Setup required:**
1. `landing/.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same values as the main app's
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`), and `NEXT_PUBLIC_APP_URL`
   (the dashboard's origin — `http://localhost:5173` in dev).
2. In the Supabase dashboard → **Authentication → URL Configuration →
   Redirect URLs**, add landing's origin (e.g. `http://localhost:3000` in dev,
   your production landing domain in prod) — required for the OAuth flow to
   be allowed even though it lands on the dashboard's origin.
3. **GitHub is wired but not required to work out of the box** — only Google
   is enabled in the shared Supabase project today (per `AuthPage.jsx`). The
   GitHub button makes a real `signInWithOAuth('github')` call; until GitHub
   is enabled as a provider in the Supabase dashboard, it'll show a friendly
   "isn't enabled yet" error rather than silently doing nothing.

Without `ANTHROPIC_API_KEY` the "ask nook" widget below still degrades to a
demo answer — sign-in configuration is independent of that.

### ask nook (`components/AskNook.tsx` + `app/api/ask/route.ts`)
One input, hits Claude (`claude-opus-4-8`) server-side, and answers *how nook would
route your task across its modules* — a login-free taste of the product's brain.
Degrades to a canned demo answer if `ANTHROPIC_API_KEY` is unset.

### Engagement telemetry (`lib/analytics.ts`)
Fires `sendBeacon` events for dwell time, scroll depth, a **held-past-8s** flag, and
easter-egg/ask hits to `/api/analytics` (currently just logs). The one number worth
knowing: does the 3D actually hold attention long enough to be worth this much
engineering? Point the route at a real sink when you want durable data.

## Performance (non-negotiables, all met)

- R3F canvas is **`next/dynamic` with `ssr: false`** — never server-rendered.
- **Device / reduced-motion detection** (`lib/useDeviceCapability.ts`): reduced-motion,
  no-WebGL, low-core/low-memory, and small screens get a **static gradient fallback**
  (`components/Fallback.tsx`) instead of the scene.
- **DPR capped at 1.8**, `Suspense` with a lightweight loader.
- Procedural geometry only — **no GLTF imports**; the glass is effectively one
  transmission draw call, shards are one instanced draw.

## WebGPU (future)

`Scene.tsx` carries a `TODO(webgpu)` marking the migration path — R3F's WebGPU
renderer is a `<Canvas>`-level swap; the scene graph, materials, and postprocessing
below it are renderer-agnostic, so it won't be a rewrite.

## Layout

```
landing/
├─ app/
│  ├─ layout.tsx            # Geist font, metadata
│  ├─ page.tsx              # composes hero + modules, owns scroll grade
│  ├─ globals.css           # palette, glass material, scroll-hue vars
│  └─ api/
│     ├─ ask/route.ts       # Claude-backed "ask nook"
│     └─ analytics/route.ts # engagement sink
├─ components/
│  ├─ Scene.tsx             # R3F canvas — the glass object
│  ├─ Hero3D.tsx            # dynamic loader + fallback gate + wordmark
│  ├─ Fallback.tsx          # static gradient stand-in
│  ├─ ModuleShowcase.tsx    # glass module cards
│  └─ AskNook.tsx           # AI widget
└─ lib/
   ├─ scroll.ts             # shared scroll singleton (DOM ↔ 3D)
   ├─ useScrollGrade.ts     # scroll → CSS vars + scrollStore
   ├─ useDeviceCapability.ts
   └─ analytics.ts
```
