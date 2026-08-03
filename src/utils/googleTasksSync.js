/*
 * GOOGLE TASKS TWO-WAY SYNC ENGINE
 *
 * LIMITATION TO NOTE:
 * This sync only works on the device/browser where Google Tasks was connected, since all sync state lives in localStorage.
 * If the user opens Nook on another device, it will not see previously synced data and may create duplicates.
 * Note: Tokens are stored in localStorage (`nook_google_tokens`). This should move to httpOnly cookies or a backend if multi-device support is ever added.
 * This integration is scoped to the tasks/tracker module only (habits, goals, and journal modules are untouched).
 *
 * The auth-code → token exchange and the token refresh both run in the
 * `google-oauth` Edge Function (server-side, so the client_secret is never
 * bundled into client JS). Consent still happens in the browser, which only
 * needs the public client_id. Because that function verifies the caller's
 * Supabase session, connecting/refreshing Google Tasks requires Supabase to
 * be configured and the user signed in.
 */

import { invokeGoogleOAuth } from './googleOAuthClient';
// The ONE intentional dependency on the Supabase task layer. tasksService is
// otherwise deliberately independent of this file (see its header), but a
// delete has to be agreed on by BOTH sync systems or neither owns it: a task
// deleted on Google was being filtered out of local state here with no
// Supabase tombstone, so the row stayed live remotely and the next
// hydrateTasksFromSupabase() re-adopted it as remote-only — permanently.
// Fire-and-forget and a no-op when Supabase isn't configured / signed out.
import { softDeleteTask } from './tasksService';

// ─── Cross-tab sync-queue mutex ─────────────────────────────────────────────
// nook_sync_queue / nook_deleted_tasks are read-modified-written from two
// places that can race across tabs: pushSyncQueue() (fast, local, called on
// every task edit) and pushLocalChangesToGoogle()'s final write-back (slow —
// happens after a whole batch of network requests). Without this, two tabs
// queuing/flushing concurrently can silently clobber each other's write.
//
// Scoped deliberately narrow: only the actual queue read-modify-write goes
// under the lock, never the network calls in between (see
// pushLocalChangesToGoogle) — holding a lock across a Google API round-trip
// would make one tab's slow sync block another tab's fast local edit queuing
// for no reason. navigator.locks is unavailable in older Safari; withSyncQueueLock
// falls back to just running the function when it's missing, which reverts
// to pre-existing (unlocked) behavior rather than breaking outright.
function withSyncQueueLock(fn) {
  if (!navigator.locks?.request) return Promise.resolve(fn());
  return navigator.locks.request('nook-sync-queue', fn);
}

// ─── PKCE OAuth Helper Functions ────────────────────────────────────────────────────────
function generateRandomString(length) {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec => ('0' + dec.toString(16)).slice(-2)).join('').slice(0, length);
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function connectGoogleTasks() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  if (!clientId) {
    alert('VITE_GOOGLE_CLIENT_ID not found in .env.local. Please make sure .env.local is created and restart your Vite dev server.');
    return;
  }

  const verifier = generateRandomString(64);
  localStorage.setItem('nook_pkce_verifier', verifier);

  const challenge = await generateCodeChallenge(verifier);
  const redirectUri = window.location.origin + window.location.pathname;


  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/tasks',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent', // Forces refresh token generation
    // Tasks, Calendar and Drive backup all share ONE OAuth client. Google
    // treats a re-consent as a REPLACEMENT of the grant, so asking for just
    // `tasks` here without this flag narrows the grant to `tasks` alone and
    // invalidates the refresh tokens issued for the other two — reconnecting
    // Tasks would silently kill Drive backup and Calendar, which then fail
    // with `invalid_grant: Token has been expired or revoked`. Carrying the
    // already-granted scopes forward keeps all three alive.
    include_granted_scopes: 'true',
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

let authCallbackInProgress = false;

export async function handleAuthCallback() {
  if (authCallbackInProgress) return false;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return false;

  const verifier = localStorage.getItem('nook_pkce_verifier');
  if (!verifier) {
    console.warn('[Google Tasks Sync] OAuth code found in URL, but no PKCE verifier found in localStorage (likely already processed).');
    return false;
  }

  authCallbackInProgress = true;
  // Immediately remove verifier to prevent React StrictMode double-execution
  localStorage.removeItem('nook_pkce_verifier');

  const redirectUri = window.location.origin + window.location.pathname;

  try {
    // Exchanged server-side — the client_secret must never reach the browser.
    const data = await invokeGoogleOAuth({
      grant: 'authorization_code',
      code,
      codeVerifier: verifier,
      redirectUri,
    });
    const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;

    localStorage.setItem('nook_google_tokens', JSON.stringify({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt
    }));
    localStorage.setItem('nook_sync_enabled', 'true');

    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    authCallbackInProgress = false;
    return true;
  } catch (err) {
    console.error('[Google Tasks Sync] OAuth callback error:', err);
    alert(`Google Tasks OAuth callback error: ${err.message}`);
    authCallbackInProgress = false;
    return false;
  }
}

export async function getValidAccessToken(onStatusChange) {
  const tokensStr = localStorage.getItem('nook_google_tokens');
  if (!tokensStr) {
    return null;
  }

  let tokens;
  try { tokens = JSON.parse(tokensStr); } catch { return null; }

  // If valid for at least 1 more minute
  if (tokens.accessToken && tokens.expiresAt && Date.now() < tokens.expiresAt - 60000) {
    return tokens.accessToken;
  }


  if (!tokens.refreshToken) {
    console.error('[Google Tasks Sync] No refresh token available.');
    if (onStatusChange) onStatusChange('Sync failed — retry');
    return null;
  }

  try {
    // Refreshed server-side — the client_secret must never reach the browser.
    const data = await invokeGoogleOAuth({ grant: 'refresh_token', refreshToken: tokens.refreshToken });
    const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    const newTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken, // keep old if not returned
      expiresAt
    };

    localStorage.setItem('nook_google_tokens', JSON.stringify(newTokens));
    return newTokens.accessToken;
  } catch (err) {
    console.error('[Google Tasks Sync] Refresh token error:', err);
    if (onStatusChange) onStatusChange('Sync failed — retry');
    // Only tear the connection down when Google itself rejected the refresh
    // token (expired/revoked). A transport or Edge Function failure is
    // transient — disconnecting there would sign the user out over a blip.
    if (String(err?.message || '').startsWith('token_exchange_failed')) {
      alert(`Your Google Tasks connection has expired or was revoked.\nError: ${err.message}\n\nPlease reconnect in Settings.`);
      disconnectGoogleTasks();
    }
    return null;
  }
}

// ─── Task Model Mapping ─────────────────────────────────────────────────────────────────
export function extractDueDateTime(gTaskDue) {
  if (!gTaskDue) return { dueDate: '', time: '' };
  
  // If no time is provided, Google Tasks (or Nook's date-only fallback) sets it to midnight UTC.
  const isDateOnly = gTaskDue.endsWith('T00:00:00.000Z') || !gTaskDue.includes('T');
  if (isDateOnly) {
    return { dueDate: gTaskDue.split('T')[0], time: '' };
  }
  
  // If a specific time was set, convert it from UTC to the user's local timezone.
  const d = new Date(gTaskDue);
  if (isNaN(d.getTime())) return { dueDate: '', time: '' };
  
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  
  return {
    dueDate: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${min}`
  };
}

export function nookToGoogleTask(task) {
  const res = {
    title: task.name || 'Untitled',
    notes: task.notes || '',
    status: task.status === 'completed' ? 'completed' : 'needsAction'
  };
  if (task.dueDate) {
    if (task.time && typeof task.time === 'string' && task.time.includes(':')) {
      const [yyyy, mm, dd] = task.dueDate.split('-');
      const [hh, min] = task.time.split(':');
      const localD = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min));
      if (!isNaN(localD.getTime())) {
        res.due = localD.toISOString();
      } else {
        res.due = `${task.dueDate}T00:00:00.000Z`;
      }
    } else {
      res.due = `${task.dueDate}T00:00:00.000Z`;
    }
  } else {
    res.due = null;
  }
  // NOTE — Recurrence / RRULE:
  // The Google Tasks REST API does NOT support a recurrence field for classic
  // tasks (only Google Calendar events do). Any RRULE sent here is silently
  // ignored by the API. Nook's recurrence is therefore intentionally local-only:
  // it auto-creates the next task occurrence when a recurring task is completed.
  // If full native recurrence is needed, a separate Google Calendar integration
  // (different OAuth scope: calendar) would be required.
  return res;
}

// ─── Immediate single-field sync ────────────────────────────────────────────────────────
// Directly PATCHes one task in Google Tasks without going through the full sync queue.
// Used by the Scheduling tab so the user gets instant feedback when changing a field.
//
// Returns:
//   { ok: true }                          — push succeeded
//   { ok: false, reason: 'unauthenticated' } — no valid token (not connected / expired)
//   { ok: false, reason: 'api_error', status, message } — Google API returned an error
//   { ok: false, reason: 'network_error', message }     — fetch threw
//
export async function syncTaskField(task) {
  // 1. Auth guard — get a valid token, refreshing if needed.
  const token = await getValidAccessToken();
  if (!token) {
    return { ok: false, reason: 'unauthenticated' };
  }

  // 2. The task must already have a googleTaskId to be PATCHable.
  //    If it doesn't (hasn't been created on Google yet), fall back to the full queue.
  if (!task.googleTaskId) {
    return { ok: false, reason: 'no_google_id' };
  }

  // 3. Build the minimal payload (only the fields Google Tasks exposes).
  const payload = nookToGoogleTask(task);

  try {
    const res = await fetch(
      `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${task.googleTaskId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (res.ok) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { msg: 'Time updated and synced successfully!', type: 'success' } }));
      return { ok: true };
    }

    const errText = await res.text();
    console.warn('[syncTaskField] PATCH failed', res.status, errText);
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { msg: 'Failed to sync. Please check your connection.', type: 'warn' } }));
    return { ok: false, reason: 'api_error', status: res.status, message: errText };
  } catch (err) {
    console.error('[syncTaskField] Network error:', err);
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { msg: 'Failed to sync. Please check your connection.', type: 'warn' } }));
    return { ok: false, reason: 'network_error', message: err.message };
  }
}



// ─── Offline Queue & Rate Limiting ───────────────────────────────────────────────────────
export function pushSyncQueue(action) {
  if (localStorage.getItem('nook_sync_enabled') !== 'true') return;
  return withSyncQueueLock(() => {
    const qStr = localStorage.getItem('nook_sync_queue');
    let q = [];
    try { q = qStr ? JSON.parse(qStr) : []; } catch {}

    // Deduplicate or replace existing operations on the same task
    if (action.type === 'UPDATE' || action.type === 'CREATE') {
      q = q.filter(item => item.taskId !== action.taskId);
    } else if (action.type === 'DELETE') {
      q = q.filter(item => item.taskId !== action.taskId);
      const delStr = localStorage.getItem('nook_deleted_tasks');
      let deletedIds = [];
      try { deletedIds = delStr ? JSON.parse(delStr) : []; } catch {}
      if (action.googleTaskId && !deletedIds.includes(action.googleTaskId)) {
        deletedIds.push(action.googleTaskId);
        localStorage.setItem('nook_deleted_tasks', JSON.stringify(deletedIds));
      }
    }

    // qid identifies this specific queued op instance (not just its task) so
    // pushLocalChangesToGoogle's write-back can remove exactly the ops it
    // processed without clobbering anything a concurrent tab queued in the
    // meantime — see the lock comment above.
    q.push({ ...action, qid: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` });
    localStorage.setItem('nook_sync_queue', JSON.stringify(q));
  });
}

// ─── Two-Way Sync Engine ────────────────────────────────────────────────────────────────
let syncInProgress = false;
let lastSyncTimestamp = 0; // For debouncing window focus triggers

// ─── Retry/backoff for queued push ops ──────────────────────────────────────
// 429 (rate limit) was always retried; 401 (token expired/invalid — a fresh
// token comes from getValidAccessToken() on the *next* sync cycle, so this is
// genuinely retryable, not permanent) and 5xx (transient server errors) were
// previously silently dropped after one attempt. 4xx other than 401/429
// (400 bad payload, 403 permission/config, 404 already handled as a
// conflict) are NOT retryable — retrying those forever would just spin.
function isRetryableStatus(status) {
  return status === 429 || status === 401 || status >= 500;
}

const MAX_RETRY_ATTEMPTS = 8;
// Exponential, capped at 5 min — bounded mostly by the natural sync cadence
// (focus-triggered syncs are themselves 30s-debounced) rather than by a tight
// retry loop, so this mainly prevents hammering on the rare back-to-back
// manual "Sync Now" case.
function backoffMs(attempts) {
  return Math.min(2 ** attempts * 1000, 5 * 60 * 1000);
}

// Requeues op with an incremented attempt count and backoff window, or drops
// it (with a console warning — this is the last point before the op is gone
// for good) once MAX_RETRY_ATTEMPTS is exceeded, so a permanently-broken op
// can't sit in the queue retrying forever.
function requeueWithBackoff(remainingQ, op) {
  const attempts = (op.attempts || 0) + 1;
  if (attempts > MAX_RETRY_ATTEMPTS) {
    console.warn(`[Google Tasks Sync] Dropping ${op.type} for task ${op.taskId} after ${MAX_RETRY_ATTEMPTS} failed attempts.`);
    return;
  }
  remainingQ.push({ ...op, attempts, nextRetryAt: Date.now() + backoffMs(attempts) });
}

// setTasks is REQUIRED for correctness, not optional convenience.
//
// This function's sync bookkeeping — above all the googleTaskId Google hands
// back on a CREATE — used to reach React state only as a side effect of
// pullTasksFromGoogle's `if (taskStateChanged)` commit. When the pull had
// nothing of its own to apply, that commit was skipped and the mapping was
// discarded with it. That is the exact case right after creating one task: the
// pull matches it, finds it already current, changes nothing.
//
// The task was then live on Google with no local googleTaskId, so every later
// pull failed to recognise it and minted a fresh duplicate — and the original
// never healed, because nothing else writes that field. Committing here makes
// the push own its own result instead of borrowing the pull's.
export async function pushLocalChangesToGoogle(tasks, token, setTasks) {
  const qStr = localStorage.getItem('nook_sync_queue');
  let q = [];
  try { q = qStr ? JSON.parse(qStr) : []; } catch {}
  if (!q.length) return tasks;

  let updatedTasks = [...tasks];
  const remainingQ = [];

  // Per-task record of ONLY the sync-bookkeeping fields this run changed.
  // Deliberately not the whole task: `tasks` is a snapshot taken before a
  // batch of network round-trips, so merging it wholesale onto live state
  // could revert a rename the user made while the batch was in flight. These
  // fields are owned solely by the sync engine, so applying just them is safe.
  const pushedFields = new Map();
  const recordPushed = (taskId, fields) => {
    pushedFields.set(taskId, { ...(pushedFields.get(taskId) || {}), ...fields });
  };

  // Fetch all existing Google Tasks once to match child subtasks easily
  const allRes = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showDeleted=true', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  let existingGTasks = [];
  if (allRes.ok) {
    const d = await allRes.json();
    existingGTasks = d.items || [];
  }

  const delStr = localStorage.getItem('nook_deleted_tasks');
  let deletedIds = [];
  try { deletedIds = delStr ? JSON.parse(delStr) : []; } catch {}

  for (const op of q) {
    // Still cooling down from a previous retryable failure — skip the network
    // call (and the rate-limit delay below) entirely this cycle.
    if (op.nextRetryAt && Date.now() < op.nextRetryAt) {
      remainingQ.push(op);
      continue;
    }

    // Small delay between requests to respect Google Tasks API usage limits
    await new Promise(r => setTimeout(r, 100));

    // Wraps this op's entire processing (including subtask sync below) so an
    // unexpected failure partway through — a network drop mid-request, a
    // malformed response body — can't abort the whole batch and discard
    // every earlier op this run already completed. updatedTasks only reaches
    // the caller (and the queue write-back only runs) once, after this loop
    // finishes; without this, one bad op would silently undo everything
    // before it too, not just itself.
    try {
    if (op.type === 'CREATE' || op.type === 'UPDATE') {
      let localTask = updatedTasks.find(t => t.id === op.taskId);
      if (!localTask) continue; // task was deleted before sync

      let parentGoogleTaskId = localTask.googleTaskId;

      // Decide POST-vs-PATCH from whether a googleTaskId already exists, not
      // from the queued op's `type` label — the label reflects intent at
      // queue time, which can go stale (e.g. an earlier attempt this same
      // batch already created the task, then a *later* op threw before the
      // batch finished; see the per-op try/catch below). Branching on
      // `op.type === 'CREATE'` here would re-POST and duplicate the task on
      // Google every time a since-completed CREATE op gets reprocessed.
      if (!parentGoogleTaskId) {
        const payload = nookToGoogleTask(localTask);
        const res = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          const nowIso = new Date().toISOString();
          parentGoogleTaskId = data.id;
          updatedTasks = updatedTasks.map(t => t.id === op.taskId ? { ...t, googleTaskId: data.id, lastSyncedAt: nowIso } : t);
          // The mapping that was being lost. Without this the task is orphaned.
          recordPushed(op.taskId, { googleTaskId: data.id, lastSyncedAt: nowIso });
          localTask = updatedTasks.find(t => t.id === op.taskId);
        } else if (isRetryableStatus(res.status)) {
          requeueWithBackoff(remainingQ, op); // rate limited / expired token / transient server error
          continue;
        } else {
          const errText = await res.text();
          console.error('[Google Tasks Sync] POST task failed:', errText);
          if (res.status === 403) {
            alert(`Google Tasks API Error (403 Forbidden).\n\nPlease ensure the Google Tasks API is ENABLED in your Google Cloud Console for project 505104249489.\n\nDetails: ${errText}`);
          }
          continue;
        }
      } else {
        const payload = nookToGoogleTask(localTask);
        const res = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${parentGoogleTaskId}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const nowIso = new Date().toISOString();
          updatedTasks = updatedTasks.map(t => t.id === op.taskId ? { ...t, lastSyncedAt: nowIso } : t);
          recordPushed(op.taskId, { lastSyncedAt: nowIso });
          localTask = updatedTasks.find(t => t.id === op.taskId);
        } else if (res.status === 404) {
          console.warn('[Google Tasks Sync] Conflict: Task deleted on Google Tasks but updated locally.');
          updatedTasks = updatedTasks.map(t => t.id === op.taskId ? { ...t, syncConflict: 'Deleted on Google Tasks, edited locally', googleTaskId: null } : t);
          recordPushed(op.taskId, { syncConflict: 'Deleted on Google Tasks, edited locally', googleTaskId: null });
          continue;
        } else if (isRetryableStatus(res.status)) {
          requeueWithBackoff(remainingQ, op);
          continue;
        } else {
          const errText = await res.text();
          console.error('[Google Tasks Sync] PATCH task failed:', errText);
          if (res.status === 403) {
            alert(`Google Tasks API Error (403 Forbidden).\n\nPlease ensure the Google Tasks API is ENABLED in your Google Cloud Console for project 505104249489.\n\nDetails: ${errText}`);
          }
          continue;
        }
      }

      // ─── Sync Subtasks for this Parent Task ───
      if (parentGoogleTaskId) {
        const currentGChildren = existingGTasks.filter(gt => gt.parent === parentGoogleTaskId && !gt.deleted);
        let updatedSubtasks = [...(localTask.subtasks || [])];
        let subtasksChanged = false;

        // 1. Check for deleted subtasks
        for (const gChild of currentGChildren) {
          if (deletedIds.includes(gChild.id)) {
            await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${gChild.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
          }
        }

        // 2. Create or update active subtasks
        for (let i = 0; i < updatedSubtasks.length; i++) {
          const sub = updatedSubtasks[i];
          let match = currentGChildren.find(gt => gt.id === sub.googleTaskId || gt.title === sub.text);

          // Only create a new Google subtask when there's no existing match. If a
          // match is found by title but we haven't stored its googleTaskId yet, the
          // `else if (match)` branch links it — creating here would duplicate it.
          if (!match) {
            const subRes = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks?parent=${parentGoogleTaskId}`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: sub.text || 'Untitled subtask',
                status: sub.completed ? 'completed' : 'needsAction'
              })
            });
            if (subRes.ok) {
              const subData = await subRes.json();
              updatedSubtasks[i] = { ...sub, googleTaskId: subData.id };
              subtasksChanged = true;
              existingGTasks.push(subData);
            }
          } else if (match) {
            if (match.title !== sub.text || (match.status === 'completed') !== !!sub.completed) {
              const subRes = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${match.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: sub.text || 'Untitled subtask',
                  status: sub.completed ? 'completed' : 'needsAction'
                })
              });
              if (subRes.ok) {
                const subData = await subRes.json();
                updatedSubtasks[i] = { ...sub, googleTaskId: subData.id };
                subtasksChanged = true;
              }
            } else if (!sub.googleTaskId) {
              updatedSubtasks[i] = { ...sub, googleTaskId: match.id };
              subtasksChanged = true;
            }
          }
        }

        if (subtasksChanged) {
          updatedTasks = updatedTasks.map(t => t.id === op.taskId ? { ...t, subtasks: updatedSubtasks } : t);
          // Carries the per-subtask googleTaskId mapping, which has the same
          // orphaning problem as the parent's if it never reaches state.
          recordPushed(op.taskId, { subtasks: updatedSubtasks });
        }
      }

    } else if (op.type === 'DELETE') {
      if (!op.googleTaskId) continue;
      const res = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${op.googleTaskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok && isRetryableStatus(res.status)) {
        requeueWithBackoff(remainingQ, op);
      } else if (!res.ok) {
        console.error('[Google Tasks Sync] DELETE task failed:', await res.text());
      }
    }
    } catch (err) {
      // Safe to requeue regardless of op.type now — the POST-vs-PATCH branch
      // above checks parentGoogleTaskId, not op.type, so a requeued CREATE
      // that actually already succeeded before this throw will correctly
      // PATCH (or no-op) instead of re-POSTing on retry.
      console.error(`[Google Tasks Sync] Unexpected error processing ${op.type} for task ${op.taskId}:`, err);
      requeueWithBackoff(remainingQ, op);
    }
  }

  // Don't blindly overwrite the queue with remainingQ — q was a snapshot from
  // when this function started, and this loop just spent many seconds making
  // network requests. Another tab (or a same-tab pushSyncQueue call) may have
  // queued something new in the meantime; blindly setting the queue to
  // remainingQ would silently drop it. Instead, under the same lock
  // pushSyncQueue uses, merge by key (qid — falling back to type+taskId for
  // anything queued before qid existed) against whatever the queue currently
  // holds: remove ops this run fully resolved, update ops it's still
  // retrying with their fresh attempts/nextRetryAt, and leave anything else
  // (added concurrently) untouched.
  //
  // Matched by key, not object identity — requeueWithBackoff() pushes a new
  // {...op, attempts, nextRetryAt} object into remainingQ rather than the
  // original op reference, so a reference-equality check here would
  // wrongly treat every retried op as "processed" and drop it instead of
  // persisting its backoff state.
  const keyOf = op => op.qid || `${op.type}:${op.taskId}`;
  const remainingByKey = new Map(remainingQ.map(op => [keyOf(op), op]));
  const processedKeys = new Set(q.map(keyOf).filter(key => !remainingByKey.has(key)));
  await withSyncQueueLock(() => {
    const curStr = localStorage.getItem('nook_sync_queue');
    let current = [];
    try { current = curStr ? JSON.parse(curStr) : []; } catch {}
    const next = current
      .filter(item => !processedKeys.has(keyOf(item)))
      .map(item => remainingByKey.get(keyOf(item)) || item);
    localStorage.setItem('nook_sync_queue', JSON.stringify(next));
  });

  // Commit the push's own bookkeeping. Functional updater against live state,
  // applying only the recorded fields, so this cannot revert edits made while
  // the batch was in flight. Runs regardless of what the pull goes on to do —
  // that dependency was the bug.
  if (setTasks && pushedFields.size) {
    setTasks(prev => prev.map(t => (
      pushedFields.has(t.id) ? { ...t, ...pushedFields.get(t.id) } : t
    )));
  }

  return updatedTasks;
}

export async function pullTasksFromGoogle(tasks, setTasks, token, onStatusChange) {
  // Always fetch full list to ensure parent/child relationships resolve correctly
  const url = 'https://www.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showDeleted=true';

  const pullRes = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!pullRes.ok) {
    const errText = await pullRes.text();
    console.error('[Google Tasks Sync] Pull sync failed:', pullRes.status, errText);
    if (onStatusChange) onStatusChange('Sync failed — retry');
    if (pullRes.status === 403) {
      alert(`Google Tasks API Error (403 Forbidden).\n\nPlease ensure the Google Tasks API is ENABLED in your Google Cloud Console for project 505104249489.\n\nDetails: ${errText}`);
    } else {
      alert(`Google Tasks sync failed (${pullRes.status}): ${errText}`);
    }
    throw new Error(`Pull sync failed: ${pullRes.status}`);
  }

  const pullData = await pullRes.json();
  const gTasks = pullData.items || [];
  const nowIso = new Date().toISOString();


  let updatedTasks = [...tasks];
  let taskStateChanged = false;

  // Local task ids claimed by orphan adoption below, so two Google tasks
  // sharing a title can't both re-attach to the same local row.
  const adoptedLocalIds = new Set();

  // Task ids this pull decided to REMOVE (deleted on Google, not edited
  // locally since the last sync). Tracked separately because the merge at the
  // end rebuilds from `prev`, and absence from `updatedTasks` cannot express
  // "delete this" — `prev.map()` keeps anything it doesn't find. Without this
  // set the removal is computed and then silently undone.
  const removedIds = new Set();

  const delStr = localStorage.getItem('nook_deleted_tasks');
  let deletedIds = [];
  try { deletedIds = delStr ? JSON.parse(delStr) : []; } catch {}

  // Separate top-level parent tasks and subtasks
  const gParentTasks = gTasks.filter(t => !t.parent);
  const gSubtasks = gTasks.filter(t => t.parent);

  for (const gTask of gParentTasks) {
    const localTask = updatedTasks.find(t => t.googleTaskId === gTask.id);

    if (!localTask) {
      if (gTask.deleted) continue;
      
      // Check if deleted locally but updated on Google Tasks (conflict)
      if (deletedIds.includes(gTask.id)) {
        console.warn(`[Google Tasks Sync] Conflict logged: Task "${gTask.title}" was deleted locally but updated on Google Tasks.`);
      } else {
        // ── Orphan adoption (safety net) ──────────────────────────────────
        // Before minting a task, try to re-attach to a local one that is
        // plainly the same task with a lost mapping: same title, no
        // googleTaskId of its own, not already claimed earlier in this pull.
        //
        // Without this, ANY path that loses the mapping duplicates on every
        // subsequent pull, forever, because the orphan never regains an id to
        // match on. Subtask matching has always had this fallback (it matches
        // `s.text === gSub.title`); parent tasks never did, which is why they
        // duplicate and subtasks don't.
        //
        // Adopts the mapping only — no content is copied over. The normal
        // last-write-wins comparison handles fields on the next pull, so this
        // can't let a stale remote silently overwrite a local edit.
        const gTitle = gTask.title || 'Untitled';
        const orphan = updatedTasks.find(t =>
          !t.googleTaskId && !adoptedLocalIds.has(t.id) && (t.name || '') === gTitle
        );
        if (orphan) {
          console.warn(`[Google Tasks Sync] Re-attached "${gTitle}" to its Google task instead of creating a duplicate (lost googleTaskId).`);
          adoptedLocalIds.add(orphan.id);
          updatedTasks = updatedTasks.map(t => t.id === orphan.id
            ? { ...t, googleTaskId: gTask.id, lastSyncedAt: nowIso } : t);
          taskStateChanged = true;
          continue;
        }

        const extracted = extractDueDateTime(gTask.due);
        const newTask = {
          id: String(Date.now() + Math.random()),
          name: gTask.title || 'Untitled',
          category: 'work',
          priority: 'none',
          timeEstimate: 25,
          notes: gTask.notes || '',
          dueDate: extracted.dueDate,
          time: extracted.time,
          completed: gTask.status === 'completed',
          status: gTask.status || 'needsAction',
          timeLogged: 0,
          pomodorosCompleted: 0,
          createdAt: gTask.updated || new Date().toISOString(),
          completedAt: gTask.status === 'completed' ? (gTask.completed || new Date().toISOString()) : null,
          recurrence: null,
          recurrenceDays: [],
          subtasks: [],
          googleTaskId: gTask.id,
          lastSyncedAt: nowIso,
          updatedAt: gTask.updated || new Date().toISOString(),
          syncConflict: null
        };
        updatedTasks.push(newTask);
        taskStateChanged = true;
      }
    } else {
      // Matching local task found
      if (gTask.deleted) {
        const localUpdated = new Date(localTask.updatedAt || localTask.createdAt).getTime();
        const localSynced = new Date(localTask.lastSyncedAt || 0).getTime();
        if (localUpdated > localSynced) {
          console.warn(`[Google Tasks Sync] Conflict logged: Task "${localTask.name}" deleted on Google Tasks, but edited locally.`);
        } else {
          updatedTasks = updatedTasks.filter(t => t.id !== localTask.id);
          // Dropping it from updatedTasks is not enough — see removedIds.
          removedIds.add(localTask.id);
          taskStateChanged = true;
          // Tombstone in Supabase too, exactly as App.jsx's deleteTask does.
          // Removing it from local state alone left the remote row live, and
          // the next hydrate adopted it straight back as a remote-only task.
          // Must be the PRE-filter task object: softDeleteTask sends a full
          // row, and localTask is the only copy that still exists here.
          softDeleteTask(localTask);
        }
      } else {
        // Compare timestamps (last-write-wins)
        const gUpdated = new Date(gTask.updated).getTime();
        const localUpdated = new Date(localTask.updatedAt || localTask.createdAt).getTime();
        const localSynced = new Date(localTask.lastSyncedAt || 0).getTime();
        if (isNaN(gUpdated)) {
          console.warn(`[Google Tasks Sync] Task "${gTask.title}" has an unparseable "updated" timestamp — this update will be skipped.`);
        }

        // If Google Task is newer than our last sync AND newer than local update
        if (gUpdated > localSynced && gUpdated > localUpdated) {
          const extracted = extractDueDateTime(gTask.due);
          updatedTasks = updatedTasks.map(t => t.id === localTask.id ? {
            ...t,
            name: gTask.title || 'Untitled',
            notes: gTask.notes || '',
            dueDate: extracted.dueDate,
            time: extracted.time,
            completed: gTask.status === 'completed',
            status: gTask.status || 'needsAction',
            completedAt: gTask.status === 'completed' ? (gTask.completed || t.completedAt || new Date().toISOString()) : null,
            lastSyncedAt: nowIso,
            updatedAt: gTask.updated
          } : t);
          taskStateChanged = true;
        } else if (localUpdated > gUpdated) {
        }
      }
    }
  }

  // ─── Process Subtasks ───
  for (const gSub of gSubtasks) {
    const parentTask = updatedTasks.find(t => t.googleTaskId === gSub.parent);
    if (!parentTask) continue;

    const localSub = (parentTask.subtasks || []).find(s => s.googleTaskId === gSub.id || s.text === gSub.title);

    if (!localSub) {
      if (gSub.deleted) continue;
      if (deletedIds.includes(gSub.id)) continue;

      const newSub = {
        id: String(Date.now() + Math.random()),
        text: gSub.title || 'Untitled subtask',
        completed: gSub.status === 'completed',
        status: gSub.status || 'needsAction',
        googleTaskId: gSub.id,
        updatedAt: gSub.updated
      };
      const nextSubs = [...(parentTask.subtasks || []), newSub];
      updatedTasks = updatedTasks.map(t => t.id === parentTask.id ? { ...t, subtasks: nextSubs } : t);
      taskStateChanged = true;
    } else {
      if (gSub.deleted) {
        const nextSubs = (parentTask.subtasks || []).filter(s => s.id !== localSub.id);
        updatedTasks = updatedTasks.map(t => t.id === parentTask.id ? { ...t, subtasks: nextSubs } : t);
        taskStateChanged = true;
      } else {
        const gUpdated = new Date(gSub.updated).getTime();
        const localUpdated = new Date(localSub.updatedAt || parentTask.updatedAt || parentTask.createdAt).getTime();
        const localSynced = new Date(parentTask.lastSyncedAt || 0).getTime();
        if (isNaN(gUpdated)) {
          console.warn(`[Google Tasks Sync] Subtask "${gSub.title}" has an unparseable "updated" timestamp — this update will be skipped.`);
        }

        if (gUpdated > localSynced && gUpdated > localUpdated) {
          const nextSubs = (parentTask.subtasks || []).map(s => s.id === localSub.id ? {
            ...s,
            text: gSub.title || 'Untitled subtask',
            completed: gSub.status === 'completed',
            status: gSub.status || 'needsAction',
            googleTaskId: gSub.id,
            updatedAt: gSub.updated
          } : s);
          updatedTasks = updatedTasks.map(t => t.id === parentTask.id ? { ...t, subtasks: nextSubs } : t);
          taskStateChanged = true;
        } else if (!localSub.googleTaskId) {
          const nextSubs = (parentTask.subtasks || []).map(s => s.id === localSub.id ? { ...s, googleTaskId: gSub.id } : s);
          updatedTasks = updatedTasks.map(t => t.id === parentTask.id ? { ...t, subtasks: nextSubs } : t);
          taskStateChanged = true;
        }
      }
    }
  }

  localStorage.setItem('nook_last_pull_sync', nowIso);

  // ── FLAG-4: Tombstone pruning ─────────────────────────────────────────────
  // Remote IDs seen in this (complete, un-paginated) pull. Any tombstoned Google
  // Task ID that is NOT in the remote list will never be resurrected — safe to
  // evict so nook_deleted_tasks doesn't grow without bound and exhaust quota.
  const remoteIdSet = new Set(gTasks.map(t => t.id));
  try {
    const rawTomb = localStorage.getItem('nook_deleted_tasks');
    const tombstones = rawTomb ? JSON.parse(rawTomb) : [];
    const pruned = tombstones.filter(gId => remoteIdSet.has(gId));
    if (pruned.length < tombstones.length) {
      localStorage.setItem('nook_deleted_tasks', JSON.stringify(pruned));
    }
  } catch { /* non-fatal */ }

  if (taskStateChanged) {
    // ── FLAG-1: Functional updater ────────────────────────────────────────────
    // Pull can take multiple API round-trips. Using a functional updater means
    // the merge runs against React's *current* state rather than the snapshot
    // captured at pull-start, so concurrent local edits (checkbox, rename, etc.)
    // that arrived during the pull are preserved rather than overwritten.
    //
    // Merge strategy: Google's pulled value wins for every allowlisted field
    // (consistent with the existing last-write-wins intent), but local-only
    // fields (timeLogged, pomodorosCompleted, notes, subtasks…) kept on prev
    // are never clobbered by a pull that doesn't know about them.
    //
    // The leading filter is what lets this merge express a DELETION. Rebuilding
    // from `prev` means a task the pull removed is otherwise restored by the
    // `.map()` below, because absence from `byId` reads as "no update for this
    // task", not "remove it" — so a task deleted on Google came straight back
    // on every pull. Dropping removedIds first is the only way to distinguish
    // the two. (Before 638bd1c this was a wholesale setTasks(updatedTasks),
    // which expressed deletion implicitly; the functional merge that replaced
    // it fixed a clobbering bug and lost that property.)
    setTasks(prev => {
      const byId = Object.fromEntries(updatedTasks.map(t => [t.id, t]));
      const merged = prev
        .filter(t => !removedIds.has(t.id))
        .map(t => byId[t.id] ? { ...t, ...byId[t.id] } : t)
        .concat(updatedTasks.filter(t => !prev.find(p => p.id === t.id)));
      return merged;
    });
  }
}

export async function syncTasks(tasks, setTasks, onStatusChange, isFocusTrigger = false) {
  if (localStorage.getItem('nook_sync_enabled') !== 'true') {
    if (onStatusChange) onStatusChange('Not connected');
    return;
  }
  if (!navigator.onLine) {
    if (onStatusChange) onStatusChange('Sync failed — retry');
    return;
  }
  // Debounce window focus trigger by 30 seconds
  if (isFocusTrigger && Date.now() - lastSyncTimestamp < 30000) {
    return;
  }
  if (syncInProgress) {
    return;
  }
  syncInProgress = true;
  if (onStatusChange) onStatusChange('Syncing...');

  const token = await getValidAccessToken(onStatusChange);
  if (!token) {
    console.error('[Google Tasks Sync] Could not get valid access token.');
    syncInProgress = false;
    return;
  }

  try {
    // 1. Push local changes to Google Tasks first
    // setTasks is passed so the push commits its own googleTaskId mapping
    // instead of depending on the pull's taskStateChanged commit firing.
    const updatedTasks = await pushLocalChangesToGoogle(tasks, token, setTasks);

    // 2. Pull remote changes from Google Tasks second
    await pullTasksFromGoogle(updatedTasks, setTasks, token, onStatusChange);

    lastSyncTimestamp = Date.now();
    if (onStatusChange) onStatusChange('Synced');
  } catch (err) {
    console.error('[Google Tasks Sync] syncTasks orchestrator error:', err);
    if (onStatusChange) onStatusChange('Sync failed — retry');
  } finally {
    syncInProgress = false;
  }
}
  
export async function directGoogleTaskUpdate(googleTaskId, updates) {
  const token = await getValidAccessToken();
  if (!token) return false;
  try {
    const res = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${googleTaskId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return res.ok;
  } catch (err) {
    console.error('[Google Tasks Sync] Direct Update failed:', err);
    return false;
  }
}

export async function directGoogleTaskDelete(googleTaskId) {
  const token = await getValidAccessToken();
  if (!token) return false;
  try {
    const res = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${googleTaskId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.ok || res.status === 404;
  } catch (err) {
    console.error('[Google Tasks Sync] Direct Delete failed:', err);
    return false;
  }
}

export function disconnectGoogleTasks() {
  localStorage.removeItem('nook_google_tokens');
  localStorage.removeItem('nook_sync_enabled');
  localStorage.removeItem('nook_sync_queue');
  localStorage.removeItem('nook_last_pull_sync');
  localStorage.removeItem('nook_deleted_tasks');
}
