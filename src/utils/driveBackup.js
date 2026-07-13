// ─── Automated Google Drive backup — client side ───────────────────────
// Reuses the existing Google OAuth client (VITE_GOOGLE_CLIENT_ID); the only
// difference from the Tasks flow is the drive.file scope and offline access.
// The auth-code → token exchange happens in the `connect-drive` Edge Function
// (server-side, so the client_secret and the resulting refresh token never
// touch the browser). This module only initiates consent, forwards the code,
// and reads/writes the user's backup settings + run log.

import { supabase } from './authClient';
import { buildBackup } from './backup';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const OAUTH_STATE = 'drivebackup';

function redirectUri() {
  return window.location.origin + window.location.pathname;
}

// Kick off the one-time consent. access_type=offline + prompt=consent forces
// Google to return a refresh token; include_granted_scopes keeps any scopes
// (e.g. Tasks) the user already granted on this same OAuth client.
export function connectGoogleDriveBackup() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  if (!clientId) {
    alert('VITE_GOOGLE_CLIENT_ID is not configured.');
    return;
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: OAUTH_STATE,
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Handle the redirect back from Google. Only acts when state === 'drivebackup'
// so it never swallows the Tasks/Calendar callbacks. Returns true on success.
export async function handleDriveBackupCallback() {
  const url = new URLSearchParams(window.location.search);
  if (url.get('state') !== OAUTH_STATE) return false;
  const code = url.get('code');
  if (!code || !supabase) return false;

  try {
    const { data, error } = await supabase.functions.invoke('connect-drive', {
      body: { code, redirectUri: redirectUri() },
    });
    if (error || data?.error) throw new Error(error?.message || data?.error);
    return true;
  } catch (err) {
    console.error('[DriveBackup] connect failed:', err);
    alert(`Couldn't connect Google Drive for backups: ${err?.message || 'unknown error'}`);
    return false;
  } finally {
    // Clean the OAuth params out of the URL regardless of outcome.
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Read the user's backup settings row (null if none yet / signed out).
export async function getBackupConfig() {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;
  const { data } = await supabase
    .from('drive_backup')
    .select('frequency, last_backup_at, last_status, last_error, refresh_secret_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  return data;
}

export function isDriveConnected(config) {
  return Boolean(config?.refresh_secret_id);
}

// Persist the chosen frequency (off | daily | weekly).
export async function setBackupFrequency(frequency) {
  if (!supabase) throw new Error('sync not configured');
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) throw new Error('not signed in');
  const { error } = await supabase
    .from('drive_backup')
    .upsert({ user_id: uid, frequency }, { onConflict: 'user_id' });
  if (error) throw error;
}

// Most recent run outcomes for the "Recent backups" list.
export async function getRecentRuns(limit = 5) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('backup_runs')
    .select('ran_at, status, file_name, counts, error')
    .order('ran_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// Build the backup in the browser and hand it to the drive-backup Edge
// Function. Used by the scheduler and (optionally) a manual "Back up now".
export async function runDriveBackup() {
  if (!supabase) throw new Error('sync not configured');
  const backup = await buildBackup();
  const { data, error } = await supabase.functions.invoke('drive-backup', { body: { backup } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}
