// Shared local-date helpers.
// NOTE: These produce the *local* calendar date (getFullYear/Month/Date),
// which differs from UTC-based helpers (toISOString().split('T')[0]) near
// midnight for non-UTC users. Do not swap one family for the other.

export function localDateStr(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr() {
  return localDateStr();
}

// ─── Generic Date helpers (shared to avoid per-view reimplementations) ───
export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
export function startOfDay(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
export function endOfDay(d)   { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }
