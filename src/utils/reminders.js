// ─── Reminders data layer ───────────────────────────────────────────
// Talks directly to the Supabase `reminders` companion table (see
// supabase/migrations/0001_reminders.sql). This is NOT a copy of task
// data — the task itself (localStorage, synced to Google Tasks) stays
// authoritative for everything except *when to remind*. RLS scopes
// every query to the signed-in user, so no explicit user_id filters
// are needed on reads.

import { supabase, isAuthConfigured } from './authClient';

// Tasks have date-only due dates (no time component). When a reminder
// uses an offset ("30 min before due"), we anchor to end-of-day since
// there's no natural due *time* to offset from.
export const TASK_DUE_TIME_ANCHOR = '23:59:59';

export function computeReminderAt(targetAt, offsetMinutes) {
  if (!targetAt) return null;
  const target = targetAt instanceof Date ? targetAt : new Date(targetAt);
  return new Date(target.getTime() - offsetMinutes * 60000);
}

// Fetch the reminder row for one task/event, or null if none is set.
export async function getReminder(sourceType, sourceId) {
  if (!isAuthConfigured) return null;
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// mode: 'absolute' (reminderAt is the exact time) or 'offset' (reminderAt
// is computed from targetAt - offsetMinutes). Upserts on the
// (user_id, source_type, source_id) unique constraint, so setting a new
// reminder on the same task/event replaces the old one.
export async function saveReminder({ sourceType, sourceId, title, targetAt, mode, absoluteAt, offsetMinutes }) {
  if (!isAuthConfigured) throw new Error('Reminders require Supabase to be configured.');

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to set reminders.');

  const reminderAt = mode === 'offset'
    ? computeReminderAt(targetAt, offsetMinutes)
    : new Date(absoluteAt);
  if (!reminderAt || isNaN(reminderAt.getTime())) throw new Error('Could not compute a valid reminder time.');

  // target_at is NOT NULL in the schema — tasks without a due date have no
  // natural "target" to reference, so fall back to the reminder's own fire
  // time (it becomes its own reference point for Overdue/Today/Upcoming grouping).
  const targetAtIso = targetAt
    ? (targetAt instanceof Date ? targetAt.toISOString() : targetAt)
    : reminderAt.toISOString();

  const { error } = await supabase.from('reminders').upsert({
    user_id: user.id,
    source_type: sourceType,
    source_id: sourceId,
    title,
    target_at: targetAtIso,
    reminder_at: reminderAt.toISOString(),
    reminder_offset_minutes: mode === 'offset' ? offsetMinutes : null,
    reminder_sent: false,
  }, { onConflict: 'user_id,source_type,source_id' });

  if (error) throw error;
}

export async function clearReminder(sourceType, sourceId) {
  if (!isAuthConfigured) return;
  await supabase.from('reminders')
    .delete()
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);
}

// All reminders for the signed-in user (RLS-scoped), ascending by when they fire.
export async function listReminders() {
  if (!isAuthConfigured) return [];
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .order('reminder_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Groups into Overdue / Today / Upcoming for the Reminders tab.
// Overdue: reminder time has passed but the Edge Function hasn't marked
// it sent yet (either it's about to fire, or genuinely missed a cycle).
export function groupReminders(reminders, now = new Date()) {
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const overdue = [];
  const today = [];
  const upcoming = [];

  for (const r of reminders) {
    const at = new Date(r.reminder_at);
    if (isNaN(at)) {
      console.warn(`[Reminders] Reminder ${r.id} has an unparseable reminder_at — hiding it from the list.`);
      continue;
    }
    if (at <= now) overdue.push(r);
    else if (at <= todayEnd) today.push(r);
    else upcoming.push(r);
  }
  return { overdue, today, upcoming };
}
