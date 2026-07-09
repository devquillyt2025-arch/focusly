# nook — liquid-glass login

The real front door to the nook dashboard. A standalone Next.js 14 app so it
never collides with the main app's Vite build — deploy it separately, point
it at the same Supabase project.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Framer Motion** — card entrance, banner transitions
- **Tailwind CSS** — nook's holographic palette
- **@supabase/supabase-js** — real auth

## Run it

```bash
cd landing
npm install
cp .env.local.example .env.local   # fill in Supabase URL/anon key + dashboard URL
npm run dev                         # http://localhost:3000
```

`npm run typecheck` / `npm run lint` / `npm run build` to verify.

## What's here

`components/LiquidGlassLogin.tsx` is the whole app. The "liquid" look is an
SVG turbulence + displacement filter (`#nook-liquid`) warping colored caustics
behind a frosted `backdrop-filter` panel, plus a cursor-tracked specular
highlight and a slow moving edge sheen — see `.liquid-glass*` in
`app/globals.css`.

Underneath, it performs real Supabase auth (email/password sign-in and
sign-up, Google/GitHub OAuth, password reset) against the **same Supabase
project as the main app** — same calls as `src/components/AuthPage.jsx` there.

**Why there's a handoff instead of a shared session:** this app and the
dashboard are separate deployments (separate origins), so a session created
here isn't automatically visible there.
- **Google/GitHub OAuth** needs no bridge: `signInWithOAuth`'s `redirectTo`
  points straight at the dashboard's origin (`NEXT_PUBLIC_APP_URL`), so when
  the provider redirects back, the dashboard's own `detectSessionInUrl`
  (already used for its native Google sign-in) picks up the session natively.
- **Email/password** has no redirect step — Supabase just returns a session
  directly. `lib/supabaseClient.ts`'s `handoffUrl()` hands the access/refresh
  tokens to the dashboard via a URL hash with custom key names
  (`sb_access_token`/`sb_refresh_token`, chosen so they never collide with
  Supabase's own `access_token=` hash format). `src/components/AuthGate.jsx`
  on the dashboard side consumes them once via `supabase.auth.setSession(...)`
  and scrubs the hash from the URL/history.
- **Password reset** needs no bridge either — Supabase's recovery email uses
  its own native hash format, which the dashboard's `detectSessionInUrl`
  already handles.

`components/ServiceWorkerGuard.tsx` unregisters any stray service worker on
this origin — the main app registers one for web push, and if this app is
ever served from the same port in dev, that worker can hijack its requests.

## Setup required

1. `.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (same values as the main app's `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`),
   and `NEXT_PUBLIC_APP_URL` (the dashboard's origin — `http://localhost:5173`
   in dev).
2. In the Supabase dashboard → **Authentication → URL Configuration → Redirect
   URLs**, add this app's origin (`http://localhost:3000` in dev, your
   production login domain in prod).
3. **GitHub is wired but not required to work out of the box** — only Google
   is enabled in the shared Supabase project today. The GitHub button makes a
   real `signInWithOAuth('github')` call; until GitHub is enabled as a
   provider in the Supabase dashboard, it shows a friendly "isn't enabled yet"
   error rather than silently doing nothing.

## Layout

```
landing/
├─ app/
│  ├─ layout.tsx      # Geist font, metadata, ServiceWorkerGuard
│  ├─ page.tsx         # the whole route — renders LiquidGlassLogin
│  ├─ globals.css      # palette, .liquid-glass* material
│  ├─ icon.png          # favicon (Next.js file-convention)
│  └─ apple-icon.png    # apple-touch-icon (Next.js file-convention)
├─ components/
│  ├─ LiquidGlassLogin.tsx   # the login card + all auth logic
│  └─ ServiceWorkerGuard.tsx
└─ lib/
   └─ supabaseClient.ts      # client, friendlyAuthError, handoffUrl
```
