import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { getReminder, saveReminder, clearReminder } from '../utils/reminders';
import { localDateStr } from '../utils/date';
import CalendarDatePicker from './CalendarDatePicker';
import TimePicker from './TimePicker';

const pad = n => String(n).padStart(2, '0');

function nowParts() {
  const d = new Date();
  return { date: localDateStr(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function fmtDateLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTimeLabel(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${meridiem}`;
}

// ─── ReminderField ───────────────────────────────────────────────────────────
// Reusable "set a reminder" control for a task's Scheduling tab.
//
// Architecture note — why reminders are Supabase-local (not synced to Google):
//   The Google Tasks REST API has NO reminder endpoint for classic tasks.
//   Reminders are only available on Google Calendar events, which is an entirely
//   separate API (different OAuth scope: `calendar`). Syncing reminders to Google
//   would require a full Google Calendar integration.
//
//   Nook's reminder system instead stores reminders in a Supabase `reminders` table,
//   scoped to the signed-in user (RLS). A Supabase Edge Function / CRON job fires
//   the actual push notification via the Web Push / VAPID key. This is intentional
//   and gives us fine-grained control over reminder timing that Google Tasks cannot
//   offer (e.g. absolute date+time reminders independent of the task due date).
//
// sourceType/sourceId identify the task; targetAt is its due date
// (anchored to end-of-day since tasks don't have a due *time*) or
// null if no due date is set yet.
export default function ReminderField({ sourceType, sourceId, title, targetAt, onTimeSelect }) {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [existing, setExisting] = useState(null);
  const [error,    setError]    = useState('');

  // Always absolute mode — date and time picked independently.
  const [absoluteDate, setAbsoluteDate] = useState(() => nowParts().date);
  const [absoluteTime, setAbsoluteTime] = useState(() => nowParts().time);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const dateRef = useRef(null);
  const timeRef = useRef(null);

  // Debounce ref so rapid date+time combos only fire one save.
  const saveTimerRef = useRef(null);
  // Track whether the initial load has finished so we don't auto-save on mount.
  const initialised = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    getReminder(sourceType, sourceId)
      .then(row => {
        setExisting(row);
        if (row) {
          const d = new Date(row.reminder_at);
          setAbsoluteDate(localDateStr(d));
          setAbsoluteTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        } else {
          const parts = nowParts();
          setAbsoluteDate(parts.date);
          setAbsoluteTime(parts.time);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => {
        setLoading(false);
        initialised.current = true;
      });
  }, [sourceType, sourceId]);

  useEffect(() => { load(); }, [load]);

  // Close pickers on outside click.
  useEffect(() => {
    if (!showDatePicker && !showTimePicker) return;
    const handler = e => {
      if (showDatePicker && dateRef.current && !dateRef.current.contains(e.target)) setShowDatePicker(false);
      if (showTimePicker && timeRef.current && !timeRef.current.contains(e.target)) setShowTimePicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDatePicker, showTimePicker]);

  // Auto-save whenever date or time changes (after initial load).
  const autoSave = useCallback((date, time) => {
    if (!initialised.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      setError('');
      try {
        await saveReminder({
          sourceType, sourceId, title, targetAt,
          mode: 'absolute',
          absoluteAt: `${date}T${time}`,
          offsetMinutes: null,
        });
        // Reload so "Currently set for…" reflects the server-confirmed time.
        await load();
      } catch (err) {
        setError(err.message || 'Could not save reminder.');
      } finally {
        setSaving(false);
      }
    }, 400); // 400 ms debounce — fast but not spammy
  }, [sourceType, sourceId, title, targetAt, load]);

  const handleDateChange = useCallback(v => {
    if (!v) return;
    setAbsoluteDate(v);
    setShowDatePicker(false);
    autoSave(v, absoluteTime);
  }, [absoluteTime, autoSave]);

  const handleTimeChange = useCallback(v => {
    setAbsoluteTime(v);
    setShowTimePicker(false);
    autoSave(absoluteDate, v);
    if (onTimeSelect) onTimeSelect(v);
  }, [absoluteDate, autoSave, onTimeSelect]);

  const handleClear = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      await clearReminder(sourceType, sourceId);
      setExisting(null);
      if (onTimeSelect) onTimeSelect('');
    } catch (err) {
      setError(err.message || 'Could not clear reminder.');
    } finally {
      setSaving(false);
    }
  }, [sourceType, sourceId, onTimeSelect]);

  // Cleanup debounce on unmount.
  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  if (loading) {
    return (
      <div className="tdp-field">
        <label className="tdp-label">Reminder date and time</label>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="tdp-field">
      <label className="tdp-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Reminder date and time
        {saving && (
          <span style={{
            display: 'inline-block',
            width: 12, height: 12,
            border: '2px solid var(--accent)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
            flexShrink: 0,
          }} aria-label="Saving…" />
        )}
      </label>

      {/* Date + Time pickers side by side */}
      <div style={{ display: 'flex', gap: 8, opacity: saving ? 0.6 : 1, pointerEvents: saving ? 'none' : 'auto', transition: 'opacity 0.15s ease' }}>
        {/* Date trigger */}
        <div ref={dateRef} style={{ position: 'relative', flex: 3 }}>
          <button
            type="button"
            onClick={() => { setShowDatePicker(p => !p); setShowTimePicker(false); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-input)', border: `1px solid ${showDatePicker ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', padding: '9px 12px', cursor: 'pointer',
              color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600,
              transition: 'border-color 0.13s ease', boxSizing: 'border-box',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', flexShrink: 0 }}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {fmtDateLabel(absoluteDate)}
          </button>
          <AnimatePresence>
            {showDatePicker && (
              <CalendarDatePicker
                value={absoluteDate}
                onChange={handleDateChange}
                onClose={() => setShowDatePicker(false)}
                allowClear={false}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Time trigger */}
        <div ref={timeRef} style={{ position: 'relative', flex: 2 }}>
          <button
            type="button"
            onClick={() => { setShowTimePicker(p => !p); setShowDatePicker(false); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--bg-input)', border: `1px solid ${showTimePicker ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', padding: '9px 12px', cursor: 'pointer',
              color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600,
              transition: 'border-color 0.13s ease', boxSizing: 'border-box',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {fmtTimeLabel(absoluteTime)}
            </span>
            {existing && !saving && (
              <span role="button"
                onClick={e => { e.stopPropagation(); handleClear(); }}
                title="Clear Reminder"
                style={{ color: 'var(--color-red)', fontSize: '1rem', lineHeight: 1, padding: '0 2px', cursor: 'pointer' }}
              >×</span>
            )}
          </button>
          <AnimatePresence>
            {showTimePicker && (
              <TimePicker
                value={absoluteTime}
                onChange={handleTimeChange}
                onClose={() => setShowTimePicker(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {error && <span className="form-error">{error}</span>}

      {existing && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
          Currently set for {new Date(existing.reminder_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      )}

      {/* Keyframe for the saving spinner — injected once via a style tag */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
