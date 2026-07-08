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

// Reusable "set a reminder" control for a task's Scheduling tab.
// sourceType/sourceId identify the task; targetAt is its due date
// (anchored to end-of-day, since tasks don't have a due *time*) or
// null if no due date is set yet.
export default function ReminderField({ sourceType, sourceId, title, targetAt, targetLabel = 'due date' }) {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [existing, setExisting] = useState(null);
  const [mode, setMode]         = useState('offset'); // 'offset' | 'absolute'
  const [offsetValue, setOffsetValue] = useState(30);
  const [offsetUnit, setOffsetUnit]   = useState('minutes'); // 'minutes' | 'hours'

  // Absolute mode: date and time are picked independently, defaulting to
  // right now so the field never opens empty.
  const [absoluteDate, setAbsoluteDate] = useState(() => nowParts().date);
  const [absoluteTime, setAbsoluteTime] = useState(() => nowParts().time);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const dateRef = useRef(null);
  const timeRef = useRef(null);

  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getReminder(sourceType, sourceId)
      .then(row => {
        setExisting(row);
        if (row) {
          if (row.reminder_offset_minutes != null) {
            setMode('offset');
            const inHours = row.reminder_offset_minutes % 60 === 0 && row.reminder_offset_minutes >= 60;
            setOffsetUnit(inHours ? 'hours' : 'minutes');
            setOffsetValue(inHours ? row.reminder_offset_minutes / 60 : row.reminder_offset_minutes);
          } else {
            setMode('absolute');
            const d = new Date(row.reminder_at);
            setAbsoluteDate(localDateStr(d));
            setAbsoluteTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
          }
        } else {
          setMode(targetAt ? 'offset' : 'absolute');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [sourceType, sourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Close pickers on outside click
  useEffect(() => {
    if (!showDatePicker && !showTimePicker) return;
    const handler = e => {
      if (showDatePicker && dateRef.current && !dateRef.current.contains(e.target)) setShowDatePicker(false);
      if (showTimePicker && timeRef.current && !timeRef.current.contains(e.target)) setShowTimePicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDatePicker, showTimePicker]);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const offsetMinutes = offsetUnit === 'hours' ? Number(offsetValue) * 60 : Number(offsetValue);
      await saveReminder({
        sourceType, sourceId, title, targetAt,
        mode,
        absoluteAt: mode === 'absolute' ? `${absoluteDate}T${absoluteTime}` : null,
        offsetMinutes: mode === 'offset' ? offsetMinutes : null,
      });
      await load();
    } catch (err) {
      setError(err.message || 'Could not save reminder.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true); setError('');
    try {
      await clearReminder(sourceType, sourceId);
      setExisting(null);
    } catch (err) {
      setError(err.message || 'Could not clear reminder.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="tdp-field">
        <label className="tdp-label">Reminder</label>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading…</div>
      </div>
    );
  }

  const dateLabel = new Date(absoluteDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeLabel = (() => {
    const [h, m] = absoluteTime.split(':').map(Number);
    const meridiem = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${pad(m)} ${meridiem}`;
  })();

  return (
    <div className="tdp-field">
      <label className="tdp-label">Reminder</label>

      <div className="tdp-compact-row">
        <button
          type="button"
          className={`tdp-seg-btn${mode === 'offset' ? ' tdp-seg-active' : ''}`}
          disabled={!targetAt}
          title={targetAt ? '' : `Set a ${targetLabel} first to use a relative reminder`}
          onClick={() => setMode('offset')}
        >
          Before {targetLabel}
        </button>
        <button
          type="button"
          className={`tdp-seg-btn${mode === 'absolute' ? ' tdp-seg-active' : ''}`}
          onClick={() => setMode('absolute')}
        >
          At a specific time
        </button>
      </div>

      {mode === 'offset' ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number" min="1" max="999"
            value={offsetValue}
            onChange={e => setOffsetValue(e.target.value)}
            style={{ width: 70, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.875rem' }}
          />
          <div className="tdp-select-wrap" style={{ flex: 1 }}>
            <select className="tdp-native-select" value={offsetUnit} onChange={e => setOffsetUnit(e.target.value)}>
              <option value="minutes">Minutes before</option>
              <option value="hours">Hours before</option>
            </select>
            <svg className="tdp-select-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
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
              {dateLabel}
            </button>
            <AnimatePresence>
              {showDatePicker && (
                <CalendarDatePicker
                  value={absoluteDate}
                  onChange={v => { if (v) setAbsoluteDate(v); }}
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
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-input)', border: `1px solid ${showTimePicker ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', padding: '9px 12px', cursor: 'pointer',
                color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600,
                transition: 'border-color 0.13s ease', boxSizing: 'border-box',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {timeLabel}
            </button>
            <AnimatePresence>
              {showTimePicker && (
                <TimePicker
                  value={absoluteTime}
                  onChange={setAbsoluteTime}
                  onClose={() => setShowTimePicker(false)}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {error && <span className="form-error">{error}</span>}

      {existing && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Currently set for {new Date(existing.reminder_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="tdp-save-btn"
          disabled={saving}
          onClick={handleSave}
          style={{ flex: 1, opacity: saving ? 0.6 : 1 }}
        >
          {existing ? 'Update reminder' : 'Set reminder'}
        </button>
        {existing && (
          <button
            type="button"
            className="tdp-delete-btn"
            disabled={saving}
            onClick={handleClear}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
