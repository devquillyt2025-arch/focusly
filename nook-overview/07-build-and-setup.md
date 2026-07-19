# 07 — Build & Setup (rebuild from zero)

This is the practical "stand it up from nothing" guide.

## 1. Bootstrap the project

```bash
npm create vite@latest nook -- --template react   # React + Vite, plain JS
cd nook
npm install
```

Then install the runtime dependencies Nook actually uses:

```bash
npm install @supabase/supabase-js chart.js react-chartjs-2 framer-motion \
            canvas-confetti html2canvas jszip
npm install -D playwright        # only used for manual verification, not tests
```

`package.json` scripts are the entire surface:
```json
{ "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" } }
```

There is **no TypeScript, no ESLint, no test runner.** `main.jsx` uses the
automatic JSX runtime; no file imports `React` directly.

## 2. `index.html` responsibilities

- Load **Inter** + **Newsreader** from Google Fonts.
- `<link rel="manifest" href="/manifest.json">` and PWA icons (`public/`).
- Mount point `<div id="root">` + `<script type="module" src="/src/main.jsx">`.
- **Register the service worker** on load:
  ```html
  <script>
    if ('serviceWorker' in navigator)
      window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
  </script>
  ```
- Load **canvas-confetti** from CDN (`cdn.jsdelivr.net`).

## 3. `main.jsx` composition

```jsx
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary title="Nook hit an unexpected error"
                   message="Your data is safe in local storage — refreshing usually resolves this.">
      <AuthGate><App/></AuthGate>
    </ErrorBoundary>
  </StrictMode>
);
```
Also install `window.onerror` / `unhandledrejection` loggers so non-React
exceptions don't vanish.

## 4. Build the data layer first

The app is only as good as its storage contract. Implement, in this order:
1. `utils/id.js`, `utils/date.js`, `utils/activityLog.js` — primitives.
2. `App.jsx` load→state→persist loop for the App-owned slices (`SK` map).
3. Feature stores that own their own keys: `habitsStore.js`,
   `trackers/trackerUtils.js`, and the per-view keys (notes, links, vault,
   countdowns, journal).

Match the **exact key names and entity shapes** in
[02-data-model.md](02-data-model.md) for data compatibility with existing Nook
data.

## 5. Run WITHOUT the cloud (the default path)

With no `VITE_SUPABASE_*` set, `isAuthConfigured` is false, `AuthGate` passes
through, and every cloud helper no-ops. **The whole app works offline, no account.**
This is the mode to build and test in first.

```bash
npm run dev      # http://localhost:5173
```

> **Tip for gate-free verification:** point Vite's `envDir` at a directory holding
> an *empty* `.env` so `VITE_SUPABASE_*` are absent and `AuthGate` passes through.
> Do not edit or move the real `.env.local`.

## 6. Add the cloud layer (optional)

Only needed for reminders-while-closed, Google Tasks/Calendar sync, Web Push, and
scheduled Drive backups. See [05-backend.md](05-backend.md) for the full schema and
functions. Steps:

1. Create a Supabase project. Run the migrations in `supabase/migrations/` in
   order (`0001`, `0003`, `0004`, `0006`, `0007`).
2. Set client env in `.env.local`:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   VITE_GOOGLE_CLIENT_ID=...        # optional: Google integrations
   VITE_VAPID_PUBLIC_KEY=...        # optional: Web Push
   ```
3. Deploy the four edge functions with the correct JWT flags:
   ```bash
   supabase functions deploy google-oauth          # verify jwt (default)
   supabase functions deploy connect-drive         # verify jwt (default)
   supabase functions deploy drive-backup          # verify jwt (default)
   supabase functions deploy send-task-reminders --no-verify-jwt
   ```
4. Set the **server-only** secrets (never `VITE_`): `GOOGLE_CLIENT_SECRET`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
   (auto), plus optional `RESEND_API_KEY` / `RESEND_FROM` / `SITE_URL`.
5. Store the cron secret in Vault and enable the pg_cron schedule (`0003`).
6. Generate a VAPID key pair; the public half is `VITE_VAPID_PUBLIC_KEY`, the
   private half is the function's `VAPID_PRIVATE_KEY`.

## 7. Build & deploy

```bash
npm run build      # outputs to dist/
npm run preview    # serve the build locally
```

Deploy `dist/` as a static site (any static host). The service worker and manifest
must be served from the site root. Note `vite.config.js` also copies the favicon
into `public/` and `src/` on build.

> **`vite build` passing is NOT sufficient verification.** It type-checks nothing
> (no TS, no lint) and will happily build a `ReferenceError` that throws only at
> render time. Always verify by driving the real app.

## Security notes for a rebuild

- **The vault (`nook_vault`) stores credentials in plaintext localStorage.** It is
  a convenience store, not a zero-knowledge password manager. Don't present it as
  encrypted-at-rest. If you harden it, add real client-side encryption.
- **Never put a secret behind a `VITE_` prefix** — Vite inlines those into the
  shipped bundle, exposing them to every user. Client secrets (Google client
  secret, VAPID private key, cron secret, service role key) belong only in edge
  function / server env.
- RLS is the only thing protecting Supabase rows — keep every table's policies
  scoped to `auth.uid() = user_id`.

## Repo hygiene

- **`landing/` is a separate Next.js app and is off-limits for SPA changes.**
- Commit per tab (`type(scope): summary`) so a bad change is bisectable.
- The `dist/` folder is git-ignored; don't commit build churn.
