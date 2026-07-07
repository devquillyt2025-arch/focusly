// Shared id generator: base-36 timestamp + random suffix.
// NOTE: activityLog.js uses a distinct hyphenated format on purpose; it is
// intentionally NOT consolidated here.

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
