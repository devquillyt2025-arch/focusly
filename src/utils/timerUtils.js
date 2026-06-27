// ── Timer Duration Helper ──────────────────────────────────────────────────
// Exported here (not in App.jsx) to keep App.jsx a pure-component file
// and avoid Vite Fast Refresh "incompatible exports" warnings.

export function getSecsForMode(mode, sett) {
  switch (mode) {
    case 'focus':  return (sett.focusDuration  || 25) * 60;
    case 'short':  return (sett.shortDuration  ||  5) * 60;
    case 'long':   return (sett.longDuration   || 15) * 60;
    case 'custom': return (sett.customDuration || 25) * 60;
    default:       return 25 * 60;
  }
}
