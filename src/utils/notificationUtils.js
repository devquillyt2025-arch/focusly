export function checkNotificationPermission() {
  if (!('Notification' in window)) return false;
  return Notification.permission === 'granted';
}

export function sendNotification(title, options = {}) {
  if (!checkNotificationPermission()) return;

  const defaultOptions = {
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    requireInteraction: false
  };

  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, { ...defaultOptions, ...options });
      });
    } else {
      new Notification(title, { ...defaultOptions, ...options });
    }
  } catch (e) {
    console.warn("Notification failed", e);
  }
}

export function setupScheduledAlerts(trackers) {
  // We handle the interval in App.jsx to keep things reactive,
  // this file just provides the trigger logic.
}
