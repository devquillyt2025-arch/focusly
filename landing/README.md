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

### Easter egg
**Triple-click the object** and it briefly shatters into shard particles, then
reforms. Instanced shards (one draw call), envelope-animated in `useFrame` — cheap,
and it gets screenshotted.

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
