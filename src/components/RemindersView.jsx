import { memo,  useState, useEffect, useCallback } from 'react';
import { listReminders, groupReminders, clearReminder } from '../utils/reminders';

// Read-only aggregated view over the `reminders` companion table — this
// page has no independent create/delete, it only surfaces and lets you
// jump to the task that owns each reminder (set from a task's
// Scheduling tab). Snooze/dismiss actions land in the next pass.
export default memo(function RemindersView({ onNavigateToSource }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    listReminders()
      .then(setReminders)
      .catch(err => setError(err.message || 'Could not load reminders.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh (without the loading spinner) when the tab regains focus, so reminders
  // added/cleared from a task's Scheduling tab show up without a manual reload.
  useEffect(() => {
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const { overdue, today, upcoming } = groupReminders(reminders);
  const total = reminders.length;

  return (
    <div className="cdp-page">
      <div className="cdp-stats">
        <StatCard icon={<IcoBell />} label="Total" value={total} sub="All reminders" />
        <StatCard icon={<IcoAlert />} label="Overdue" value={overdue.length} sub={overdue.length > 0 ? 'Need attention' : 'All caught up'} warn={overdue.length > 0} />
        <StatCard icon={<IcoSun />} label="Today" value={today.length} sub="Firing today" />
        <StatCard icon={<IcoClock />} label="Upcoming" value={upcoming.length} sub="Later" />
      </div>

      {error && (
        <div style={{ padding: 12, background: 'var(--color-red-bg)', border: '1px solid var(--color-red)', borderRadius: 'var(--radius-sm)', color: 'var(--color-red)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="cdp-empty">
          <span className="tab-fallback-spinner" aria-label="Loading" />
        </div>
      ) : total === 0 ? (
        <div className="cdp-empty">
          <IcoBell size={30} />
          <p className="cdp-empty-title">No reminders set</p>
          <p className="cdp-empty-sub">Add one from a task's Scheduling tab — this page just surfaces them.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <ReminderGroup label="Overdue" items={overdue} tone="red" onNavigateToSource={onNavigateToSource} onDismiss={() => load(true)} />
          <ReminderGroup label="Today" items={today} tone="accent" onNavigateToSource={onNavigateToSource} onDismiss={() => load(true)} />
          <ReminderGroup label="Upcoming" items={upcoming} tone="muted" onNavigateToSource={onNavigateToSource} onDismiss={() => load(true)} />
        </div>
      )}
    </div>
  );
});

function ReminderGroup({ label, items, tone, onNavigateToSource, onDismiss }) {
  if (items.length === 0) return null;
  const toneColor = tone === 'red' ? 'var(--color-red)' : tone === 'accent' ? 'var(--accent)' : 'var(--text-muted)';
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: toneColor }}>{label}</span>
        <span style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', padding: '1px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(r => <ReminderRow key={r.id} reminder={r} onNavigateToSource={onNavigateToSource} onDismiss={onDismiss} />)}
      </div>
    </section>
  );
}

function ReminderRow({ reminder, onNavigateToSource, onDismiss }) {
  const [dismissing, setDismissing] = useState(false);
  const reminderTime = new Date(reminder.reminder_at);
  const targetTime = reminder.target_at ? new Date(reminder.target_at) : null;

  const handleDismiss = async (e) => {
    e.stopPropagation();
    if (dismissing) return;
    setDismissing(true);
    try {
      await clearReminder(reminder.source_type, reminder.source_id);
      onDismiss?.();
    } catch {
      setDismissing(false);
    }
  };

  return (
    <div
      onClick={() => onNavigateToSource?.(reminder.source_type, reminder.source_id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
        cursor: 'pointer', transition: 'border-color 0.13s ease',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-glow)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <SourceIcon type={reminder.source_type} />
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reminder.title}</span>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          Reminds {reminderTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          {targetTime && ` · due ${targetTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
        </span>
      </div>
      <button
        onClick={handleDismiss}
        disabled={dismissing}
        aria-label="Dismiss reminder"
        title="Dismiss reminder"
        style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 6,
          cursor: dismissing ? 'default' : 'pointer', color: 'var(--text-muted)',
          padding: '4px 8px', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0,
          opacity: dismissing ? 0.5 : 1, transition: 'opacity 0.13s',
        }}
      >
        {dismissing ? '…' : 'Dismiss'}
      </button>
    </div>
  );
}

function SourceIcon({ type }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (type === 'calendar') {
    return <svg width="16" height="16" viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  }
  return <svg width="16" height="16" viewBox="0 0 24 24" {...p}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
}

function StatCard({ icon, label, value, sub, warn }) {
  return (
    <div className="cdp-stat">
      <span className="cdp-stat-icon" style={{ background: warn ? 'rgba(239,68,68,0.12)' : 'var(--accent-glow)', color: warn ? 'var(--color-red)' : 'var(--accent)' }}>{icon}</span>
      <div className="cdp-stat-body">
        <span className="cdp-stat-label">{label}</span>
        <div className="cdp-stat-numrow">
          <span className="cdp-stat-value">{value}</span>
          {sub && <span className={`cdp-stat-sub${warn ? ' cdp-stat-sub-warn' : ''}`}>{sub}</span>}
        </div>
      </div>
    </div>
  );
}

function IcoBell({ size = 18 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function IcoAlert({ size = 18 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function IcoSun({ size = 18 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>; }
function IcoClock({ size = 18 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
