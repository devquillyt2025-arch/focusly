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
