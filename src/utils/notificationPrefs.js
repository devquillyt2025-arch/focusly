// ─── Notification preferences (email reminders) ────────────────────
// Push has its own opt-in (a push_subscriptions row exists or it doesn't).
// Email reminders need an explicit per-user preference row instead, since
// there's no per-device "subscription" step for email — see
// supabase/migrations/0004_notification_prefs.sql.

import { supabase, isAuthConfigured } from './authClient';

export async function isEmailRemindersEnabled() {
  if (!isAuthConfigured) return false;
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('email_reminders_enabled')
    .maybeSingle();
  if (error) throw error;
  return data?.email_reminders_enabled ?? false;
}

export async function setEmailRemindersEnabled(enabled) {
  if (!isAuthConfigured) throw new Error('Reminders require Supabase to be configured.');
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to change this setting.');

  const { error } = await supabase.from('notification_prefs').upsert({
    user_id: user.id,
    email_reminders_enabled: enabled,
  }, { onConflict: 'user_id' });

  if (error) throw error;
}
