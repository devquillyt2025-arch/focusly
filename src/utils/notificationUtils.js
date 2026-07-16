export function checkNotificationPermission() {
  if (!('Notification' in window)) return false;
  return Notification.permission === 'granted';
}

export function sendNotification(title, options = {}) {
  if (!checkNotificationPermission()) return;

  const defaultOptions = {
    icon: '/icon-192.png',
    badge: '/icon-192.png',
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

/**
 * Request notification permission gracefully, returns a promise resolving to
 * 'granted' | 'denied' | 'default' | 'unsupported'
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return 'denied';
  }
}
