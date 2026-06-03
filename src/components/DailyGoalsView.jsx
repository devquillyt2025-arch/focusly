import { useState } from 'react';
import DailyIntentions from './DailyIntentions';
import StreakPanel from './StreakPanel';
import {
  TRACKER_CATS, TRACKER_TYPES,
  isScheduledToday, isLoggedToday, getLogForDate,
  upsertLog, toggleMilestone, computeHabitStreaks, computeTargetStats, computeAverageStats,
  computeProjectStats, computeGlobalStats, todayStr,
} from '../trackers/trackerUtils';
import { getDailyInsight } from '../trackers/insightsEngine';

// ─── Main view ─────────────────────────────────────────────────────
export default function DailyGoalsView({
  trackers, onUpdateTracker, onAddTracker,
  intentions, onIntentionUpdate, onIntentionToggle,
  pomodoroLog, tasks, onTriggerWeeklyReview
}) {
  const today = new Date();
  const dateLabel = today.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });

  const scheduled = trackers.filter(t => isScheduledToday(t));
  const global = computeGlobalStats(trackers);
  
  const todayDateStr = todayStr();
  const [insightDismissed, setInsightDismissed] = useState(() => {
    return localStorage.getItem('focusly-insight-dismissed') === todayDateStr;
  });
  
  const dailyInsight = !insightDismissed ? getDailyInsight(trackers, tasks, pomodoroLog) : null;
  
  const dismissInsight = () => {
    localStorage.setItem('focusly-insight-dismissed', todayDateStr);
    setInsightDismissed(true);
  };

  const groups = { morning: [], afternoon: [], evening: [], anytime: [] };
  for (const t of scheduled) {
    const tag = t.config?.timeTag ?? 'anytime';
    (groups[tag] ?? groups.anytime).push(t);
  }

  const logTracker = (id, value) => {
    const t = trackers.find(x => x.id === id);
    if (!t) return;
    onUpdateTracker(upsertLog(t, value));
  };

  const toggleMs = (trackerId, msId) => {
    const t = trackers.find(x => x.id === trackerId);
    if (!t) return;
    onUpdateTracker(toggleMilestone(t, msId));
  };

  const GROUP_LABELS = { morning: '🌅 Morning', afternoon: '☀️ Afternoon', evening: '🌙 Evening', anytime: '📌 Today' };

  return (
    <div className="daily-view">
      {/* Date header */}
      <div className="daily-header">
        <div className="daily-date">{dateLabel}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="hdr-btn" onClick={onTriggerWeeklyReview} title="Weekly Review" style={{ fontSize: '0.8rem', padding: '4px 8px', background: 'rgba(255,255,255,0.1)', borderRadius: 6 }}>
            📝 Review
          </button>
          {global.scheduledCount > 0 && (
            <div className="daily-progress-pill">
              {global.loggedCount}/{global.scheduledCount} done
              {global.isPerfect && <span className="perfect-star">⭐</span>}
            </div>
          )}
        </div>
      </div>

      {global.isPerfect && global.scheduledCount > 0 && (
        <div className="perfect-day-banner">🌟 Perfect day! All trackers logged.</div>
      )}

      {/* Insights Banner */}
      {dailyInsight && (
        <div className="daily-insight-banner" style={{ background: 'linear-gradient(to right, rgba(99, 102, 241, 0.1), rgba(16, 185, 129, 0.1))', padding: '12px 16px', borderRadius: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.2rem' }}>💡</span>
            <span style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.4 }}>{dailyInsight}</span>
          </div>
          <button onClick={dismissInsight} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem', padding: 4 }}>×</button>
        </div>
      )}

      {/* Intentions */}
      <DailyIntentions
        intentions={intentions}
        onUpdate={onIntentionUpdate}
        onToggle={onIntentionToggle}
      />

      {/* Streak */}
      <StreakPanel
        pomodoroLog={pomodoroLog}
        tasks={tasks}
        intentions={intentions}
      />

      {/* Tracker groups */}
      {scheduled.length === 0 ? (
        <div className="daily-empty">
          <span>🎯</span>
          <p>No trackers scheduled for today.</p>
          <button className="add-task-btn" onClick={onAddTracker}>＋ Add Tracker</button>
        </div>
      ) : (
        Object.entries(groups).map(([key, list]) => {
          if (!list.length) return null;
          return (
            <section key={key} className="tracker-group">
              <div className="tracker-group-label">{GROUP_LABELS[key]}</div>
              {list.map(t => (
                <DailyTrackerCard
                  key={t.id}
                  tracker={t}
                  onLog={logTracker}
                  onMilestoneToggle={toggleMs}
                />
              ))}
            </section>
          );
        })
      )}

      {scheduled.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <button className="btn-checkin" onClick={onAddTracker}>＋ Add Tracker</button>
        </div>
      )}
    </div>
  );
}

// ─── Individual tracker card ───────────────────────────────────────
function DailyTrackerCard({ tracker, onLog, onMilestoneToggle }) {
  const catMeta  = TRACKER_CATS[tracker.category] ?? TRACKER_CATS.health;
  const typeMeta = TRACKER_TYPES[tracker.type] ?? TRACKER_TYPES.habit;
  const logged   = isLoggedToday(tracker);

  return (
    <div className={`daily-card${logged ? ' daily-card-done' : ''}`}
      style={{ '--cat-color': catMeta.color }}>
      <div className="daily-card-bar" />
      <div className="daily-card-body">
        <div className="daily-card-top">
          <span className="daily-type-icon">{typeMeta.icon}</span>
          <div className="daily-card-info">
            <div className="daily-card-name">{tracker.name}</div>
            <div className="daily-card-meta">
              <span className="mini-cat-badge"
                style={{ background: catMeta.color + '22', color: catMeta.color, border: `1px solid ${catMeta.color}44` }}>
                {catMeta.label}
              </span>
              <TrackerMetaLine tracker={tracker} />
            </div>
          </div>
          <div className="daily-card-actions">
            <TrackerActions tracker={tracker} onLog={onLog} onMilestoneToggle={onMilestoneToggle} />
          </div>
        </div>
        {tracker.type === 'project' && <ProjectMilestones tracker={tracker} onToggle={onMilestoneToggle} />}
      </div>
    </div>
  );
}

// ─── Meta line (streak / progress summary) ─────────────────────────
function TrackerMetaLine({ tracker }) {
  if (tracker.type === 'habit') {
    const { current } = computeHabitStreaks(tracker);
    return current > 0
      ? <span className="daily-meta-text">🔥 {current}d streak</span>
      : <span className="daily-meta-text">Start your streak today</span>;
  }
  if (tracker.type === 'target') {
    const { currentValue, targetValue, unit, progress } = computeTargetStats(tracker);
    return <span className="daily-meta-text">{currentValue}{unit} / {targetValue}{unit} · {progress}%</span>;
  }
  if (tracker.type === 'average') {
    const { avg7, targetAverage, unit } = computeAverageStats(tracker);
    return <span className="daily-meta-text">
      7d avg: {avg7 ?? '—'}{unit}
      {targetAverage > 0 && ` · target: ${targetAverage}${unit}`}
    </span>;
  }
  if (tracker.type === 'project') {
    const { done, total, progress } = computeProjectStats(tracker);
    return <span className="daily-meta-text">{done}/{total} milestones · {progress}%</span>;
  }
  return null;
}

// ─── Quick-log actions ─────────────────────────────────────────────
function TrackerActions({ tracker, onLog, onMilestoneToggle }) {
  const today = todayStr();
  const todayLog = getLogForDate(tracker, today);

  if (tracker.type === 'habit') {
    const done = todayLog?.value === true;
    const skipped = todayLog?.value === false;
    if (done) return <div className="habit-logged-badge">✓ Done</div>;
    if (skipped) return <div className="habit-logged-badge skipped">→ Skipped</div>;
    return (
      <div className="habit-action-row">
        <button className="habit-done-btn" onClick={() => onLog(tracker.id, true)}>✓ Done</button>
        <button className="habit-skip-btn" onClick={() => onLog(tracker.id, false)}>→ Skip</button>
      </div>
    );
  }

  if (tracker.type === 'target' || tracker.type === 'average') {
    return <InlineLogInput tracker={tracker} todayLog={todayLog} onLog={onLog} />;
  }

  if (tracker.type === 'project') {
    const { done, total } = computeProjectStats(tracker);
    return <span className="project-count-badge">{done}/{total}</span>;
  }

  return null;
}

// ─── Inline number log input ───────────────────────────────────────
function InlineLogInput({ tracker, todayLog, onLog }) {
  const { unit = '' } = tracker.config;
  const [val, setVal] = useState(todayLog?.value != null ? String(todayLog.value) : '');
  const [editing, setEditing] = useState(!todayLog);

  const submit = () => {
    const n = parseFloat(val);
    if (isNaN(n)) return;

    // For Target trackers, accumulate: new value = last cumulative value + logged amount
    if (tracker.type === 'target') {
      const sorted = [...(tracker.logs || [])].sort((a, b) => a.date.localeCompare(b.date));
      const lastLog = sorted.filter(l => l.date < todayStr()).pop();
      const lastVal = lastLog?.value ?? tracker.config.startValue ?? 0;
      onLog(tracker.id, lastVal + n);
    } else {
      onLog(tracker.id, n);
    }
    setEditing(false);
  };

  if (!editing && todayLog?.value != null) {
    return (
      <button className="logged-value-btn" onClick={() => setEditing(true)}>
        {todayLog.value}{unit} ✓
      </button>
    );
  }

  return (
    <div className="inline-log-row">
      <input
        type="number"
        className="inline-log-input"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder={tracker.type === 'target' ? `+${unit}` : unit}
        step="any"
        min="0"
      />
      <button className="inline-log-btn" onClick={submit} disabled={!val}>Log</button>
    </div>
  );
}

// ─── Project milestone list ────────────────────────────────────────
function ProjectMilestones({ tracker, onToggle }) {
  const milestones = tracker.config.milestones || [];
  if (!milestones.length) return null;

  return (
    <div className="project-milestone-list">
      {milestones.map(m => (
        <button key={m.id} className={`milestone-check-row${m.done ? ' ms-done' : ''}`}
          onClick={() => onToggle(tracker.id, m.id)}>
          <span className={`ms-checkbox${m.done ? ' ms-checked' : ''}`}>
            {m.done ? '✓' : ''}
          </span>
          <span className="ms-text">{m.text}</span>
        </button>
      ))}
    </div>
  );
}
