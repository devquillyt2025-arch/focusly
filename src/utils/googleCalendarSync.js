/*
 * GOOGLE CALENDAR SYNC
 * Uses the same OAuth client as Google Tasks (same project) but requests
 * calendar.events scope. Tokens are stored separately under nook_gcal_tokens
 * so Tasks and Calendar auth are fully independent.
 *
 * OAuth flow: PKCE (same as Tasks). The `state=gcal` param + separate verifier key
 * ensures Tasks and Calendar callbacks don't conflict.
 *
 * The auth-code → token exchange and the token refresh both run in the
 * `google-oauth` Edge Function (server-side, so the client_secret is never
 * bundled into client JS) — see utils/googleOAuthClient.js.
 */

import { localDateStr } from './date';
import { invokeGoogleOAuth } from './googleOAuthClient';

// 'YYYY-MM-DD' + 1 calendar day (local), for events whose end time crosses midnight.
function addOneDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return localDateStr(d);
}

const GCAL_TOKEN_KEY    = 'nook_gcal_tokens';
const GCAL_VERIFIER_KEY = 'nook_gcal_pkce_verifier';
const GCAL_ENABLED_KEY  = 'nook_gcal_enabled';
const CALENDAR_ID       = 'primary';

// Google Calendar event colorId → hex
const GCAL_COLORS = {
  '1': '#a4bdfc', '2': '#7ae28c', '3': '#dbadff', '4': '#ff887c',
  '5': '#fbd75b', '6': '#ffb878', '7': '#46d6db', '8': '#e1e1e1',
  '9': '#5484ed', '10': '#51b749', '11': '#dc2127',
};
const GCAL_DEFAULT_COLOR = '#4285f4';

export function gcalColor(colorId) {
  return GCAL_COLORS[colorId] || GCAL_DEFAULT_COLOR;
}

// ─── PKCE helpers ─────────────────────────────────────────────────
function genRandom(len) {
  const arr = new Uint8Array(len);
  window.crypto.getRandomValues(arr);
  return Array.from(arr, b => ('0' + b.toString(16)).slice(-2)).join('').slice(0, len);
}

async function genChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Auth ──────────────────────────────────────────────────────────
export async function connectGoogleCalendar() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  if (!clientId) {
    alert('VITE_GOOGLE_CLIENT_ID not found in .env.local.');
    return;
  }
  const verifier = genRandom(64);
  localStorage.setItem(GCAL_VERIFIER_KEY, verifier);
  const challenge = await genChallenge(verifier);
  const redirectUri = window.location.origin + window.location.pathname;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    // Shared OAuth client — see the same flag in googleTasksSync.js and
    // driveBackup.js. Without it, re-consenting for calendar.events alone
    // narrows the grant and invalidates the Tasks and Drive refresh tokens.
    include_granted_scopes: 'true',
    state: 'gcal',
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

let calCallbackInProgress = false;

export async function handleCalendarAuthCallback() {
  if (calCallbackInProgress) return false;
  const params = new URLSearchParams(window.location.search);
  const code  = params.get('code');
  const state = params.get('state');
  if (!code || state !== 'gcal') return false;

  const verifier = localStorage.getItem(GCAL_VERIFIER_KEY);
  if (!verifier) return false;

  calCallbackInProgress = true;
  localStorage.removeItem(GCAL_VERIFIER_KEY);

  const redirectUri = window.location.origin + window.location.pathname;

  try {
    // Exchanged server-side — the client_secret must never reach the browser.
    const data = await invokeGoogleOAuth({
      grant: 'authorization_code',
      code,
      codeVerifier: verifier,
      redirectUri,
    });
    localStorage.setItem(GCAL_TOKEN_KEY, JSON.stringify({
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + (data.expires_in || 3600) * 1000,
    }));
    localStorage.setItem(GCAL_ENABLED_KEY, 'true');
    window.history.replaceState({}, document.title, window.location.pathname);
    calCallbackInProgress = false;
    return true;
  } catch (err) {
    alert(`Google Calendar OAuth error: ${err.message}`);
    calCallbackInProgress = false;
    return false;
  }
}

export async function getCalendarToken() {
  const raw = localStorage.getItem(GCAL_TOKEN_KEY);
  if (!raw) return null;
  let tokens;
  try { tokens = JSON.parse(raw); } catch { return null; }

  if (tokens.accessToken && tokens.expiresAt && Date.now() < tokens.expiresAt - 60000)
    return tokens.accessToken;

  if (!tokens.refreshToken) { disconnectGoogleCalendar(); return null; }

  try {
    // Refreshed server-side — the client_secret must never reach the browser.
    const data = await invokeGoogleOAuth({ grant: 'refresh_token', refreshToken: tokens.refreshToken });
    const next = {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresAt:    Date.now() + (data.expires_in || 3600) * 1000,
    };
    localStorage.setItem(GCAL_TOKEN_KEY, JSON.stringify(next));
    return next.accessToken;
  } catch (err) {
    // Only disconnect when Google itself rejected the refresh token; a
    // transport/Edge Function failure is transient and must not sign the
    // user out (matches the pre-existing !res.ok vs throw distinction).
    if (String(err?.message || '').startsWith('token_exchange_failed')) disconnectGoogleCalendar();
    return null;
  }
}

// ─── API calls ─────────────────────────────────────────────────────
export async function fetchGCalEvents(token, timeMin, timeMax) {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '500',
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  const data = await res.json();
  return (data.items || [])
    .filter(ev => ev.status !== 'cancelled')
    .map(ev => ({
      id:          ev.id,
      title:       ev.summary || '(No title)',
      date:        (ev.start?.date || ev.start?.dateTime || '').slice(0, 10),
      time:        ev.start?.dateTime ? ev.start.dateTime.slice(11, 16) : null,
      endTime:     ev.end?.dateTime   ? ev.end.dateTime.slice(11, 16)   : null,
      allDay:      !!ev.start?.date,
      source:      'google',
      colorId:     ev.colorId || null,
      description: ev.description || '',
      location:    ev.location || '',
      htmlLink:    ev.htmlLink || '',
      gcalId:      ev.id,
    }));
}

export async function createGCalEvent(token, { title, date, time, endTime, description = '' }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  let start, end;
  if (time) {
    start = { dateTime: `${date}T${time}:00`, timeZone: tz };
    // Honor the caller's end time; fall back to +1h. If the end isn't strictly
    // after the start (e.g. 23:30 start), it crosses midnight — roll the end
    // DATE forward a day so Google doesn't get a negative-length event.
    let endT = endTime;
    if (!endT) {
      const [h, m] = time.split(':').map(Number);
      endT = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const endDate = endT <= time ? addOneDay(date) : date;
    end = { dateTime: `${endDate}T${endT}:00`, timeZone: tz };
  } else {
    start = { date };
    end   = { date };
  }

  const body = { summary: title, description, start, end };

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Create event failed: ${res.status}`);
  return res.json();
}

export async function deleteGCalEvent(token, gcalEventId) {
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events/${gcalEventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );
}

export function disconnectGoogleCalendar() {
  localStorage.removeItem(GCAL_TOKEN_KEY);
  localStorage.removeItem(GCAL_ENABLED_KEY);
}

export function isGCalConnected() {
  return localStorage.getItem(GCAL_ENABLED_KEY) === 'true';
}

// ─── Offline push queue ──────────────────────────────────────────────────
// Unlike Tasks, Calendar only ever pushes on CREATE (there's no edit/delete
// mirroring back to Google) — createGCalEvent() was previously called inside
// a bare try/catch in CalendarView's submit handler, so a failed push (the
// user was offline, a transient API error) was silently dropped: the event
// stayed local-only forever with no record it needed retrying, no offline
// queue equivalent to nook_sync_queue. This gives it one, scoped to just
// that one operation.
const GCAL_PUSH_QUEUE_KEY = 'nook_gcal_push_queue';
const GCAL_PUSH_MAX_ATTEMPTS = 5;

// Same cross-tab mutex as googleTasksSync.js's sync queue, and for the exact
// same reason — found by grepping for the same read-modify-write shape after
// the Tasks queue needed it. Original reasoning here ("Calendar only ever
// pushes on create, one op at a time, so there's no cross-tab read-modify-
// write race to guard") was wrong: "one op at a time" describes the entity
// model (no per-task ongoing sync state to conflict), not concurrency — it
// says nothing about two *tabs* racing on the same shared queue key, which
// is a risk any unlocked localStorage read-modify-write has regardless of
// how simple the data model is. Verified this queue had it: two tabs each
// queuing a failed push around the same time, or one tab flushing while
// another queues, can each blindly overwrite the other's write, same as
// nook_sync_queue could before it got this same lock.
function withGCalQueueLock(fn) {
  if (!navigator.locks?.request) return Promise.resolve(fn());
  return navigator.locks.request('nook-gcal-push-queue', fn);
}

export function queueGCalPush(payload) {
  return withGCalQueueLock(() => {
    let q = [];
    try { q = JSON.parse(localStorage.getItem(GCAL_PUSH_QUEUE_KEY) || '[]'); } catch {}
    q.push({ ...payload, qid: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, attempts: 0 });
    try { localStorage.setItem(GCAL_PUSH_QUEUE_KEY, JSON.stringify(q)); } catch {}
  });
}

// Attempts every queued push once (no backoff timer — the natural trigger
// cadence this is called from, mount + window focus, already spaces retries
// out in normal use). Returns true if anything in the queue was successfully
// pushed, so the caller knows to refresh its Google event list.
export async function flushGCalPushQueue() {
  let q = [];
  try { q = JSON.parse(localStorage.getItem(GCAL_PUSH_QUEUE_KEY) || '[]'); } catch {}
  if (!q.length) return false;

  const token = await getCalendarToken();
  if (!token) return false; // not connected / couldn't refresh — try again next trigger

  let anySucceeded = false;
  const remaining = [];
  for (const item of q) {
    try {
      const { qid, attempts, ...payload } = item;
      await createGCalEvent(token, payload);
      anySucceeded = true;
    } catch (err) {
      const attempts = (item.attempts || 0) + 1;
      if (attempts >= GCAL_PUSH_MAX_ATTEMPTS) {
        console.warn(`[Google Calendar Sync] Dropping queued event "${item.title}" after ${attempts} failed push attempts:`, err);
      } else {
        remaining.push({ ...item, attempts });
      }
    }
  }

  // Don't blindly overwrite with `remaining` — q was a snapshot from before
  // the network calls above, which took real time. Merge by qid against
  // whatever the queue currently holds, same pattern as the Tasks sync
  // queue's write-back: remove what this run resolved (succeeded or
  // permanently dropped), update anything still retrying, leave anything
  // queued by another tab in the meantime untouched.
  await withGCalQueueLock(() => {
    const keyOf = item => item.qid || item.title;
    const resolvedKeys = new Set(q.map(keyOf).filter(k => !remaining.some(r => keyOf(r) === k)));
    const remainingByKey = new Map(remaining.map(item => [keyOf(item), item]));
    const curStr = localStorage.getItem(GCAL_PUSH_QUEUE_KEY);
    let current = [];
    try { current = curStr ? JSON.parse(curStr) : []; } catch {}
    const next = current
      .filter(item => !resolvedKeys.has(keyOf(item)))
      .map(item => remainingByKey.get(keyOf(item)) || item);
    try { localStorage.setItem(GCAL_PUSH_QUEUE_KEY, JSON.stringify(next)); } catch {}
  });
  return anySucceeded;
}
