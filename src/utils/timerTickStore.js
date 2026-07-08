// Lets the running-timer's per-second display value live outside React state.
// The ticking interval (in App.jsx) calls setTickSeconds() every second; only
// components that actually display the countdown (Timer, FocusCompanion,
// DailyGoalsView) subscribe via useSyncExternalStore, so the 1s tick never
// forces App — or any other tab/sidebar/header — to re-render.

let seconds = 0;
const listeners = new Set();

export function setTickSeconds(v) {
  seconds = v;
  listeners.forEach(l => l());
}

export function getTickSeconds() {
  return seconds;
}

export function subscribeTick(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
