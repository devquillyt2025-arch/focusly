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

// In-memory map of task id → setTimeout handle for reminder cleanup
const _reminderTimers = {};

/**
 * Schedule (or reschedule) a browser notification for a task reminder.
 * Clears any previously scheduled reminder for the same task id.
 * @param {string} taskId
 * @param {string} taskName
 * @param {string} reminderTimeISO - ISO 8601 datetime string
 */
export function scheduleTaskReminder(taskId, taskName, reminderTimeISO) {
  // Cancel existing timer for this task
  clearTaskReminder(taskId);
  if (!reminderTimeISO) return;

  const fireAt = new Date(reminderTimeISO).getTime();
  const now = Date.now();
  const delay = fireAt - now;

  if (delay <= 0) return; // reminder is in the past, skip

  _reminderTimers[taskId] = setTimeout(async () => {
    // Request permission if not yet granted
    const perm = await requestNotificationPermission();
    if (perm !== 'granted') return;
    sendNotification(`⏰ Reminder: ${taskName}`, {
      body: 'This task has a reminder set for now.',
      requireInteraction: true,
      tag: `task-reminder-${taskId}`,
    });
    delete _reminderTimers[taskId];
  }, delay);
}

/**
 * Cancel a scheduled reminder for a task.
 */
export function clearTaskReminder(taskId) {
  if (_reminderTimers[taskId]) {
    clearTimeout(_reminderTimers[taskId]);
    delete _reminderTimers[taskId];
  }
}
