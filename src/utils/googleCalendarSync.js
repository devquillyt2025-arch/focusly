/*
 * GOOGLE CALENDAR SYNC
 * Uses the same OAuth client as Google Tasks (same project) but requests
 * calendar.events scope. Tokens are stored separately under nook_gcal_tokens
 * so Tasks and Calendar auth are fully independent.
 *
 * OAuth flow: PKCE (same as Tasks). The `state=gcal` param + separate verifier key
 * ensures Tasks and Calendar callbacks don't conflict.
 */

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

  const clientId     = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';
  const redirectUri  = window.location.origin + window.location.pathname;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        code, code_verifier: verifier,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) {
      alert(`Google Calendar auth failed: ${await res.text()}`);
      calCallbackInProgress = false;
      return false;
    }
    const data = await res.json();
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

  const clientId     = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        refresh_token: tokens.refreshToken, grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) { disconnectGoogleCalendar(); return null; }
    const data = await res.json();
    const next = {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresAt:    Date.now() + (data.expires_in || 3600) * 1000,
    };
    localStorage.setItem(GCAL_TOKEN_KEY, JSON.stringify(next));
    return next.accessToken;
  } catch { return null; }
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

export async function createGCalEvent(token, { title, date, time, description = '' }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const endHour = time
    ? `${String((parseInt(time.split(':')[0], 10) + 1) % 24).padStart(2, '0')}:${time.split(':')[1]}`
    : null;

  const body = {
    summary: title,
    description,
    start: time ? { dateTime: `${date}T${time}:00`, timeZone: tz } : { date },
    end:   time ? { dateTime: `${date}T${endHour}:00`, timeZone: tz } : { date },
  };

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
