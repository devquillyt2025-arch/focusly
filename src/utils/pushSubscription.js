// ─── Web Push subscription management ──────────────────────────────
// Registers the service worker, subscribes via PushManager, and keeps
// the Supabase `push_subscriptions` table in sync with this browser's
// subscription. Reminder delivery itself happens server-side (the
// send-task-reminders Edge Function) — this module only manages the
// subscribe/unsubscribe lifecycle.

import { supabase, isAuthConfigured } from './authClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

// PushManager needs the VAPID key as a Uint8Array, not the base64url string.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const browser = ua.includes('Firefox') ? 'Firefox' : ua.includes('Edg/') ? 'Edge' : ua.includes('Chrome') ? 'Chrome' : ua.includes('Safari') ? 'Safari' : 'Browser';
  const os = ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'Mac' : ua.includes('Linux') ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' · ');
}

// Registers the SW (idempotent — safe to call every time) and subscribes
// this browser to push, then upserts the subscription row in Supabase.
// Reminders require Supabase (that's where push_subscriptions and the
// user's identity live), so this is a no-op setup that throws clearly if
// auth isn't configured, matching this app's existing "degrade quietly
// without Supabase" pattern elsewhere.
export async function subscribeToPush() {
  if (!isAuthConfigured) throw new Error('Reminders require Supabase to be configured.');
  if (!isPushSupported()) throw new Error('Push notifications are not supported in this browser.');
  if (!VAPID_PUBLIC_KEY) throw new Error('Missing VITE_VAPID_PUBLIC_KEY.');

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to enable reminders.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: json.endpoint,
    p256dh_key: json.keys.p256dh,
    auth_key: json.keys.auth,
    device_label: deviceLabel(),
  }, { onConflict: 'endpoint' });

  if (error) throw error;
  return subscription;
}

// Unsubscribes this browser and removes its row from Supabase.
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});
  if (isAuthConfigured) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).then(
      () => {}, () => {}
    );
  }
}

// Reflects actual browser subscription state — safe to call on mount to
// resync the Settings toggle if it was enabled on a different device/session.
export async function isCurrentlySubscribed() {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
}
