// ─── Automated backup scheduler (foreground / client-driven) ────────────
// pg_cron can't read localStorage, so the schedule lives here: on app load
// (and window focus) we check whether a backup is due for the user's chosen
// frequency and, if so, build it in the browser and push it to Drive via the
// drive-backup Edge Function. Runs only while Nook is open — acceptable given
// Nook is opened daily; Periodic Background Sync is a deliberate later option.

import { supabase } from './authClient';
import { buildBackup } from './backup';

const DAY_MS = 24 * 60 * 60 * 1000;

// A module-level guard so overlapping triggers (mount + focus) don't double-run.
let backupInFlight = false;

export async function maybeRunAutoBackup() {
  if (!supabase || backupInFlight) return;
  // Latch synchronously, before any await, so a second trigger in the same tick
  // (e.g. mount + focus firing together) can't slip past the due-check and run a
  // duplicate backup while the first is still reading state.
  backupInFlight = true;

  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;

    const { data: cfg } = await supabase
      .from('drive_backup')
      .select('frequency, last_backup_at, refresh_secret_id')
      .eq('user_id', uid)
      .maybeSingle();

    // Not opted in, or Drive never connected → nothing to do.
    if (!cfg || cfg.frequency === 'off' || !cfg.refresh_secret_id) return;

    const gapMs = cfg.frequency === 'daily' ? DAY_MS : 7 * DAY_MS;
    const last = cfg.last_backup_at ? new Date(cfg.last_backup_at).getTime() : 0;
    if (Date.now() - last < gapMs) return; // not due yet

    const backup = await buildBackup();
    await supabase.functions.invoke('drive-backup', { body: { backup } });
  } catch (err) {
    // Never let a backup hiccup disrupt app startup — it's logged to
    // backup_runs by the Edge Function and surfaced in Settings.
    console.warn('[AutoBackup] skipped:', err?.message || err);
  } finally {
    backupInFlight = false;
  }
}
