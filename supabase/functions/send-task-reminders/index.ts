// ═══════════════════════════════════════════════════════════════════
// send-task-reminders — the piece referenced (but never built) by
// public/sw.js and supabase/migrations/0001_reminders.sql.
//
// Runs on a schedule (see supabase/migrations/0002_schedule_reminders.sql),
// finds reminders whose reminder_at has passed and haven't been sent yet,
// delivers each via whichever channel(s) the user opted into — push
// (a push_subscriptions row exists) and/or email (notification_prefs.
// email_reminders_enabled), independently — then marks the reminder sent.
// Expired/unsubscribed push endpoints (404/410/401/403) are deleted from
// push_subscriptions as they're found.
//
// Not user-facing HTTP — triggered only by pg_cron via pg_net, gated by
// a shared secret (X-Cron-Secret) rather than a user JWT, since there is
// no signed-in user in a cron context. Deploy with --no-verify-jwt.
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'Nook <onboarding@resend.dev>';
const SITE_URL = Deno.env.get('SITE_URL') ?? '';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function reminderBody(reminder: { target_at: string | null }) {
  if (!reminder.target_at) return 'Reminder';
  const d = new Date(reminder.target_at);
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  // Task due-dates are anchored to 23:59:59 (no real due *time*) — skip the clock in that case.
  const isDateOnly = d.getHours() === 23 && d.getMinutes() === 59;
  return isDateOnly ? `Due ${dateStr}` : `Due ${dateStr} at ${timeStr}`;
}

async function sendReminderEmail(to: string, reminder: { title: string; source_type: string; source_id: string; target_at: string | null }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

  const body = reminderBody(reminder);
  const url = SITE_URL
    ? (reminder.source_type === 'task' ? `${SITE_URL}/?reminder=task:${reminder.source_id}` : SITE_URL)
    : null;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject: `Reminder: ${reminder.title}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="margin-bottom: 4px;">${reminder.title}</h2>
          <p style="color: #666; margin-top: 0;">${body}</p>
          ${url ? `<p><a href="${url}" style="display:inline-block; background:#7869fc; color:#fff; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600;">Open in Nook</a></p>` : ''}
        </div>
      `,
    }),
  });

  if (!res.ok) throw new Error(`Resend API error: ${res.status} ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: dueReminders, error } = await supabase
    .from('reminders')
    .select('id, user_id, source_type, source_id, title, target_at')
    .lte('reminder_at', new Date().toISOString())
    .eq('reminder_sent', false)
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0, failed = 0, cleaned = 0, emailSent = 0, emailFailed = 0;

  for (const reminder of dueReminders ?? []) {
    const [{ data: subs }, { data: prefs }] = await Promise.all([
      supabase.from('push_subscriptions').select('id, endpoint, p256dh_key, auth_key').eq('user_id', reminder.user_id),
      supabase.from('notification_prefs').select('email_reminders_enabled').eq('user_id', reminder.user_id).maybeSingle(),
    ]);

    if (prefs?.email_reminders_enabled) {
      try {
        const { data: userRes } = await supabase.auth.admin.getUserById(reminder.user_id);
        const email = userRes?.user?.email;
        if (email) {
          await sendReminderEmail(email, reminder);
          emailSent++;
        }
      } catch {
        emailFailed++;
      }
    }

    const payload = JSON.stringify({
      title: reminder.title,
      body: reminderBody(reminder),
      source_type: reminder.source_type,
      source_id: reminder.source_id,
      url: reminder.source_type === 'task' ? `/?reminder=task:${reminder.source_id}` : '/',
    });

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
          payload,
        );
        sent++;
      } catch (err) {
        failed++;
        const statusCode = (err as { statusCode?: number }).statusCode;
        // 404/410 = subscription gone; 401/403 = signed with a VAPID key the
        // subscription no longer recognizes (e.g. after a key rotation) —
        // both are permanent failures for this endpoint, not transient ones.
        if (statusCode === 404 || statusCode === 410 || statusCode === 401 || statusCode === 403) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          cleaned++;
        }
      }
    }

    await supabase.from('reminders').update({ reminder_sent: true }).eq('id', reminder.id);
  }

  return new Response(
    JSON.stringify({ processed: dueReminders?.length ?? 0, sent, failed, cleaned, emailSent, emailFailed }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
