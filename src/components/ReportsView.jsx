import { useState, useRef } from 'react';
import {
  TRACKER_CATS, TRACKER_TYPES,
  computeHabitStreaks, computeTargetStats, computeAverageStats, computeProjectStats,
  getLogForDate, todayStr, dateStrOf, isScheduledOn, computeGlobalStats, getSparklineData,
  upsertLog, toggleMilestone
} from '../trackers/trackerUtils';
import { HabitStreakChart, HabitDayOfWeekChart, TargetProgressChart, TargetVelocityChart, AverageRollingChart, ProjectBurndownChart } from './TrackerCharts';
import { calculateTrends } from '../trackers/analyticsUtils';
import AnalyticsDashboard from './AnalyticsDashboard';
import html2canvas from 'html2canvas';

// ─── Reports view ──────────────────────────────────────────────────
export default function ReportsView({ trackers, tasks, pomodoroLog, onUpdateTracker, onDeleteTracker, onEditTracker, onAddTracker }) {
  const [catFilter,  setCatFilter]  = useState('all');
  const [viewMode,   setViewMode]   = useState('trackers'); // 'trackers' | 'analytics'
  const [detail,     setDetail]     = useState(null); // tracker shown in detail

  const global = computeGlobalStats(trackers);
  const daysInMonthSoFar = new Date().getDate();

  // Overall success rate: logged / scheduled across all days this month
  const successRate = (() => {
    let sched = 0, logged = 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let d = new Date(monthStart); d <= now; d.setDate(d.getDate() + 1)) {
      const ds = dateStrOf(d);
      trackers.forEach(t => {
        if (t.type === 'project') return;
        if (isScheduledOn(t, d)) {
          sched++;
          if ((t.logs || []).some(l => l.date === ds && (l.value === true || typeof l.value === 'number'))) logged++;
        }
      });
    }
    return sched > 0 ? Math.round((logged / sched) * 100) : 0;
  })();

  const trackersWithTrends = calculateTrends(trackers);
  
  let filtered = catFilter === 'all'
    ? trackersWithTrends
    : trackersWithTrends.filter(t => t.category === catFilter);
    
  // Sort by trend if in trackers view (improving first)
  filtered = [...filtered].sort((a, b) => (b._trendScore || 0) - (a._trendScore || 0));

  const openDetail = (tracker) => setDetail(tracker);
  const closeDetail = () => setDetail(null);

  const handleDelete = (id) => {
    onDeleteTracker(id);
    closeDetail();
  };

  // Sync detail tracker when parent state updates
  const liveDetail = detail ? (trackers.find(t => t.id === detail.id) ?? null) : null;

  return (
    <div className="reports-view">
      <div className="page-hero" style={{ marginBottom: 24 }}>
        <div className="page-hero-left">
          <div className="page-hero-badge" aria-hidden="true"><IconBarChart /></div>
          <div className="page-hero-text">
            <h2 className="page-hero-title">Reports</h2>
            <span className="page-hero-sub">
              {global.activeTrackers} tracker{global.activeTrackers === 1 ? '' : 's'} · {successRate}% success rate
            </span>
          </div>
        </div>
        {onAddTracker && (
          <button className="add-task-btn" onClick={onAddTracker}>＋ Add Tracker</button>
        )}
      </div>

      <div className="view-mode-tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg-card)', padding: 6, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', width: 'max-content', margin: '0 auto 24px' }}>
        <button style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: viewMode === 'trackers' ? 'var(--accent)' : 'transparent', color: viewMode === 'trackers' ? '#fff' : 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setViewMode('trackers')}>Trackers</button>
        <button style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: viewMode === 'analytics' ? 'var(--accent)' : 'transparent', color: viewMode === 'analytics' ? '#fff' : 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setViewMode('analytics')}>Analytics</button>
      </div>

      {viewMode === 'analytics' ? (
        <AnalyticsDashboard trackers={trackers} tasks={tasks} pomodoroLog={pomodoroLog} />
      ) : (
        <>
          {/* Global stats */}
          <div className="reports-global-stats">
            <div className="rgs-card">
              <div className="rgs-val">{global.activeTrackers}</div>
              <div className="rgs-lbl">Trackers</div>
            </div>
            <div className="rgs-card">
              <div className="rgs-val">{global.perfectDaysMonth}</div>
              <div className="rgs-lbl">Perfect Days</div>
              <div className="rgs-sub">{global.perfectDaysMonth} of {daysInMonthSoFar} days</div>
            </div>
            <div className="rgs-card">
              <div className="rgs-val">{global.longestStreak > 0 ? `${global.longestStreak}d` : '—'}</div>
              <div className="rgs-lbl">Best Streak</div>
              {global.longestStreak !== global.bestStreak && (
                <div className="rgs-sub">current: {global.bestStreak}d</div>
              )}
            </div>
            <div className="rgs-card">
              <div className="rgs-val">{successRate}%</div>
              <div className="rgs-lbl">Success Rate</div>
              <div className="rgs-progress-bar">
                <div className="rgs-progress-fill" style={{ width: `${successRate}%` }} />
              </div>
            </div>
          </div>

          {/* Category filter */}
          <div className="cat-filter-row" style={{ padding: '0 0 4px' }}>
            {['all', ...Object.keys(TRACKER_CATS)].map(key => {
              const m = TRACKER_CATS[key];
              const active = catFilter === key;
              return (
                <button key={key}
                  className={`cat-chip${active ? ' cat-chip-active' : ''}`}
                  style={active && m ? { background: m.color, borderColor: m.color, color: '#fff' } : {}}
                  onClick={() => setCatFilter(key)}
                >
                  {m?.label ?? 'All'}
                </button>
              );
            })}
          </div>

          {/* Tracker list */}
          {filtered.length === 0 ? (
            <div className="empty-state">
              <span>📊</span>
              <p>{trackers.length === 0 ? 'No trackers yet.' : 'No trackers in this category.'}</p>
              {trackers.length === 0 && onAddTracker && (
                <button className="tracker-add-cta" onClick={onAddTracker}>
                  <IconPlusCircle />
                  <span>Track a new habit</span>
                </button>
              )}
            </div>
          ) : (
            <div className="report-list">
              {filtered.map(t => (
                <TrackerReportRow key={t.id} tracker={t} onClick={() => openDetail(t)} />
              ))}
              {trackers.length < 3 && onAddTracker && (
                <button className="tracker-add-cta" onClick={onAddTracker}>
                  <IconPlusCircle />
                  <span>Track a new habit</span>
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {liveDetail && (
        <TrackerDetail
          tracker={liveDetail}
          onClose={closeDetail}
          onDelete={() => handleDelete(liveDetail.id)}
          onEdit={() => { closeDetail(); onEditTracker(liveDetail); }}
          onUpdateTracker={onUpdateTracker}
        />
      )}
    </div>
  );
}

// ─── Report row ────────────────────────────────────────────────────
function TrackerReportRow({ tracker, onClick }) {
  const catMeta  = TRACKER_CATS[tracker.category] ?? TRACKER_CATS.health;
  const typeMeta = TRACKER_TYPES[tracker.type] ?? TRACKER_TYPES.habit;
  const spark    = getSparklineData(tracker);

  let statA = '—', statB = '—', pct = 0;
  if (tracker.type === 'habit') {
    const s = computeHabitStreaks(tracker);
    statA = `${s.current}d`;
    statB = `${s.successRate}%`;
    pct   = s.successRate;
  } else if (tracker.type === 'target') {
    const s = computeTargetStats(tracker);
    statA = `${s.progress}%`;
    statB = s.pace;
    pct   = s.progress;
  } else if (tracker.type === 'average') {
    const s = computeAverageStats(tracker);
    statA = s.avg7 != null ? `${s.avg7}${s.unit}` : '—';
    statB = '7d avg';
    pct   = s.avg7 != null && s.targetAverage > 0
      ? Math.min(100, Math.round((s.avg7 / s.targetAverage) * 100))
      : s.avg7 != null ? 75 : 0;
  } else if (tracker.type === 'project') {
    const s = computeProjectStats(tracker);
    statA = `${s.progress}%`;
    statB = s.pace;
    pct   = s.progress;
  }

  const dotColor = pct >= 80 ? 'var(--color-green)' : pct >= 50 ? 'var(--color-amber)' : 'var(--color-red)';

  return (
    <button className="report-row" onClick={onClick}>
      <div className="report-row-bar" style={{ background: catMeta.color }} />
      <span className="report-row-icon">{typeMeta.icon}</span>
      <div className="report-row-info">
        <div className="report-row-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {tracker.name}
          {tracker.trend === 'improving' && <span title="Improving" style={{ color: 'var(--color-green)', fontSize: '0.8rem' }}>↑</span>}
          {tracker.trend === 'declining' && <span title="Declining" style={{ color: 'var(--color-red)', fontSize: '0.8rem' }}>↓</span>}
        </div>
        <div className="report-row-sub">
          <span className="mini-cat-badge"
            style={{ background: catMeta.color + '22', color: catMeta.color, border: `1px solid ${catMeta.color}44` }}>
            {catMeta.label}
          </span>
          <span className="report-row-type">{typeMeta.label}</span>
        </div>
      </div>
      <div className="report-row-stats">
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className="rrs-status-dot" style={{ background: dotColor }} />
          <span className="rrs-val">{statA}</span>
        </div>
        <span className="rrs-lbl">{statB}</span>
      </div>
      <div className="report-row-spark">
        <Sparkline data={spark} color={catMeta.color} type={tracker.type} />
      </div>
      <span className="report-row-arrow">›</span>
    </button>
  );
}

// ─── Sparkline SVG ─────────────────────────────────────────────────
function Sparkline({ data, color, type }) {
  if (!data.length) return <div style={{ width: 56 }} />;

  if (type === 'habit') {
    return (
      <div className="spark-dots">
        {data.slice(-7).map((v, i) => (
          <div key={i} className="spark-dot" style={{ background: v ? color : 'var(--border)' }} />
        ))}
      </div>
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data.filter(v => v > 0), 0);
  const range = max - min || 1;
  const W = 56, H = 24;

  if (data.length < 2) return <div style={{ width: W }} />;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

// ─── Tracker Detail modal ──────────────────────────────────────────
function TrackerDetail({ tracker, onClose, onDelete, onEdit, onUpdateTracker }) {
  const catMeta  = TRACKER_CATS[tracker.category] ?? TRACKER_CATS.health;
  const typeMeta = TRACKER_TYPES[tracker.type] ?? TRACKER_TYPES.habit;
  
  const detailRef = useRef(null);

  const log = (value) => onUpdateTracker(upsertLog(tracker, value));
  const toggleMs = (id) => onUpdateTracker(toggleMilestone(tracker, id));

  const handleShare = async () => {
    if (!detailRef.current) return;
    try {
      const canvas = await html2canvas(detailRef.current, { backgroundColor: '#0f172a' });
      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          alert('Image copied to clipboard!');
        } catch (e) {
          alert('Failed to copy image. Your browser might not support this feature.');
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-wide detail-modal" onClick={e => e.stopPropagation()} role="dialog" ref={detailRef}>
        <div className="modal-hdr">
          <div className="detail-hdr-left">
            <span className="detail-type-icon">{typeMeta.icon}</span>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{tracker.name}</h3>
              <span className="mini-cat-badge"
                style={{ background: catMeta.color + '22', color: catMeta.color, border: `1px solid ${catMeta.color}44` }}>
                {catMeta.label}
              </span>
            </div>
          </div>
          <div className="detail-hdr-actions no-print">
            <button className="hdr-btn" onClick={handleShare} title="Share Image" style={{ width: 'auto', padding: '0 12px', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Share
            </button>
            <button className="hdr-btn" onClick={onEdit} title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button className="hdr-btn" onClick={() => { if (confirm(`Delete "${tracker.name}"?`)) onDelete(); }} title="Delete" style={{ color: 'var(--color-red)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="detail-body">
          {tracker.description && (
            <p className="detail-description">{tracker.description}</p>
          )}

          {tracker.type === 'habit'   && <HabitDetail   tracker={tracker} onLog={log} />}
          {tracker.type === 'target'  && <TargetDetail  tracker={tracker} onLog={log} />}
          {tracker.type === 'average' && <AverageDetail tracker={tracker} onLog={log} />}
          {tracker.type === 'project' && <ProjectDetail tracker={tracker} onToggle={toggleMs} />}
        </div>
      </div>
    </div>
  );
}

// ─── Habit detail ──────────────────────────────────────────────────
function HabitDetail({ tracker, onLog }) {
  const { current, longest, successRate, doneCount, logged } = computeHabitStreaks(tracker);
  const today = todayStr();
  const todayLog = getLogForDate(tracker, today);

  return (
    <>
      <div className="detail-stats-grid">
        <StatCard val={`${current}d`} lbl="Current Streak" />
        <StatCard val={`${longest}d`} lbl="Longest Streak" />
        <StatCard val={`${successRate}%`} lbl="Success Rate" />
        <StatCard val={doneCount} lbl="Total Done" />
      </div>

      {/* Today log */}
      <div className="detail-today-row">
        <span className="detail-section-lbl">Today</span>
        {todayLog?.value === true  && <span className="habit-logged-badge">✓ Done</span>}
        {todayLog?.value === false && <span className="habit-logged-badge skipped">→ Skipped</span>}
        {todayLog == null && (
          <div className="habit-action-row">
            <button className="habit-done-btn" onClick={() => onLog(true)}>✓ Done</button>
            <button className="habit-skip-btn" onClick={() => onLog(false)}>→ Skip</button>
          </div>
        )}
      </div>

      {/* Heatmap */}
      <div className="detail-section-lbl" style={{ marginBottom: 8 }}>Activity (last 13 weeks)</div>
      <HabitHeatmap tracker={tracker} />

      <HabitStreakChart tracker={tracker} color={TRACKER_CATS[tracker.category]?.color || 'var(--accent)'} />
      <HabitDayOfWeekChart tracker={tracker} color={TRACKER_CATS[tracker.category]?.color || 'var(--accent)'} />
    </>
  );
}

// ─── Habit heatmap ─────────────────────────────────────────────────
function HabitHeatmap({ tracker }) {
  const today = new Date();
  const logMap = {};
  for (const l of tracker.logs || []) logMap[l.date] = l.value;

  // Build 13 weeks × 7 days (91 days), starting from a Sunday 91 days ago
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 91);
  // Snap to previous Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const weeks = [];
  let d = new Date(startDate);
  const todayStr_ = dateStrOf(today);

  while (d <= today || weeks.length < 13) {
    const week = [];
    for (let dow = 0; dow < 7; dow++) {
      const ds = dateStrOf(d);
      const isFuture = ds > todayStr_;
      const val = logMap[ds];
      week.push({ date: ds, value: val, isFuture, isScheduled: !isFuture && isScheduledOn(tracker, d) });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
    if (weeks.length >= 13) break;
  }

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-days-col">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <span key={i} className="heatmap-day-label">{i % 2 === 1 ? d : ''}</span>
        ))}
      </div>
      <div className="heatmap-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap-week">
            {week.map((cell, di) => (
              <div key={di}
                className={[
                  'heatmap-cell',
                  cell.isFuture   ? 'hm-future'  : '',
                  !cell.isFuture && cell.isScheduled && cell.value === true  ? 'hm-done'   : '',
                  !cell.isFuture && cell.isScheduled && cell.value === false ? 'hm-skip'   : '',
                  !cell.isFuture && cell.isScheduled && cell.value == null   ? 'hm-missed' : '',
                ].filter(Boolean).join(' ')}
                title={cell.date}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Target detail ─────────────────────────────────────────────────
function TargetDetail({ tracker, onLog }) {
  const { currentValue, targetValue, startValue, unit, progress, pace } = computeTargetStats(tracker);
  const [val, setVal] = useState('');
  const today = todayStr();
  const todayLog = getLogForDate(tracker, today);

  const submit = () => {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    // Log cumulative progress
    onLog(currentValue + n);
    setVal('');
  };

  const PACE_COLOR = { behind: 'var(--color-red)', 'on-track': 'var(--color-green)', ahead: 'var(--color-blue)' };

  return (
    <>
      <div className="detail-stats-grid">
        <StatCard val={`${currentValue}${unit}`} lbl="Current" />
        <StatCard val={`${targetValue}${unit}`} lbl="Target" />
        <StatCard val={`${progress}%`} lbl="Complete" />
        <StatCard val={pace} lbl="Pace" color={PACE_COLOR[pace]} />
      </div>

      {/* Progress bar */}
      <div className="detail-progress-bar-wrap">
        <div className="detail-progress-bar" style={{ width: `${progress}%`, background: TRACKER_CATS[tracker.category]?.color ?? 'var(--accent)' }} />
      </div>

      {/* Log today */}
      <div className="detail-today-row">
        <span className="detail-section-lbl">Log Progress</span>
        <div className="inline-log-row">
          <input type="number" className="inline-log-input" value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={`+${unit || 'amount'}`} step="any" min="0" />
          <button className="inline-log-btn" onClick={submit} disabled={!val}>Add</button>
        </div>
      </div>

      {/* Line chart */}
      {tracker.logs.length > 0 && (
        <>
          <div className="detail-section-lbl" style={{ marginBottom: 8, marginTop: 16 }}>Progress vs Pace</div>
          <TargetProgressChart tracker={tracker} color={TRACKER_CATS[tracker.category]?.color || 'var(--accent)'} />
          <TargetVelocityChart tracker={tracker} color={TRACKER_CATS[tracker.category]?.color || 'var(--accent)'} />
        </>
      )}
    </>
  );
}

// ─── Average detail ────────────────────────────────────────────────
function AverageDetail({ tracker, onLog }) {
  const { todayValue, avg7, avg30, targetAverage, unit } = computeAverageStats(tracker);
  const [val, setVal] = useState(todayValue != null ? String(todayValue) : '');

  const submit = () => {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    onLog(n);
  };

  return (
    <>
      <div className="detail-stats-grid">
        <StatCard val={todayValue != null ? `${todayValue}${unit}` : '—'} lbl="Today" />
        <StatCard val={avg7 != null ? `${avg7}${unit}` : '—'} lbl="7-Day Avg" />
        <StatCard val={avg30 != null ? `${avg30}${unit}` : '—'} lbl="30-Day Avg" />
        <StatCard val={`${targetAverage}${unit}`} lbl="Target" />
      </div>

      <div className="detail-today-row">
        <span className="detail-section-lbl">Log Today</span>
        <div className="inline-log-row">
          <input type="number" className="inline-log-input" value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={unit || 'value'} step="any" min="0" />
          <button className="inline-log-btn" onClick={submit} disabled={!val}>Log</button>
        </div>
      </div>

      {tracker.logs.length > 0 && (
        <>
          <div className="detail-section-lbl" style={{ marginBottom: 8, marginTop: 16 }}>Last 30 Days</div>
          <AverageBarChart tracker={tracker} />
          <AverageRollingChart tracker={tracker} color={TRACKER_CATS[tracker.category]?.color || 'var(--accent)'} />
        </>
      )}
    </>
  );
}

// ─── Project detail ────────────────────────────────────────────────
function ProjectDetail({ tracker, onToggle }) {
  const { done, total, progress, pace } = computeProjectStats(tracker);
  const { milestones = [], targetDate = '' } = tracker.config;
  const catColor = TRACKER_CATS[tracker.category]?.color ?? 'var(--accent)';
  const PACE_COLOR = { behind: 'var(--color-red)', 'on-track': 'var(--color-green)', complete: 'var(--accent)' };

  return (
    <>
      <div className="detail-stats-grid">
        <StatCard val={`${done}/${total}`} lbl="Milestones" />
        <StatCard val={`${progress}%`} lbl="Complete" />
        <StatCard val={pace} lbl="Pace" color={PACE_COLOR[pace]} />
        {targetDate && <StatCard val={targetDate} lbl="Target Date" />}
      </div>

      <div className="detail-progress-bar-wrap">
        <div className="detail-progress-bar" style={{ width: `${progress}%`, background: catColor }} />
      </div>

      <div className="detail-section-lbl" style={{ marginTop: 16, marginBottom: 8 }}>Milestones</div>
      <div className="project-milestone-list" style={{ gap: 6 }}>
        {milestones.map(m => (
          <button key={m.id} className={`milestone-check-row${m.done ? ' ms-done' : ''}`}
            onClick={() => onToggle(m.id)}>
            <span className={`ms-checkbox${m.done ? ' ms-checked' : ''}`}>{m.done ? '✓' : ''}</span>
            <span className="ms-text">{m.text}</span>
            {m.done && m.doneAt && (
              <span className="ms-done-date">{m.doneAt.split('T')[0]}</span>
            )}
          </button>
        ))}
      </div>

      <ProjectBurndownChart tracker={tracker} color={catColor} />
    </>
  );
}

// ─── SVG Charts ───────────────────────────────────────────────────
function TargetLineChart({ tracker }) {
  const logs = [...(tracker.logs || [])].sort((a, b) => a.date.localeCompare(b.date));
  const { startValue = 0, targetValue = 100 } = tracker.config;
  const color = TRACKER_CATS[tracker.category]?.color ?? 'var(--accent)';
  const data = [{ value: startValue }, ...logs];

  const W = 100, H = 80;
  const vals = data.map(d => d.value);
  const max = Math.max(...vals, targetValue) * 1.05;
  const min = Math.min(...vals, startValue, 0);
  const range = max - min || 1;

  const px = (i) => (i / (data.length - 1)) * W;
  const py = (v) => H - 4 - ((v - min) / range) * (H - 8);

  const pts = data.map((d, i) => `${px(i)},${py(d.value)}`).join(' ');
  const targetY = py(targetValue);

  return (
    <div className="detail-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 120 }}>
        <line x1="0" y1={targetY} x2={W} y2={targetY} stroke={color} strokeWidth="0.8" strokeDasharray="3,2" opacity="0.4" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle key={i} cx={px(i)} cy={py(d.value)} r="2.5" fill={color} />
        ))}
      </svg>
      <div className="chart-axis-row">
        <span>{data[0]?.date ?? ''}</span>
        <span style={{ color, fontWeight: 700 }}>Target: {targetValue}{tracker.config.unit}</span>
        <span>{data[data.length - 1]?.date ?? ''}</span>
      </div>
    </div>
  );
}

function AverageBarChart({ tracker }) {
  const today = new Date();
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29);
  const logs = [...(tracker.logs || [])]
    .filter(l => l.date >= dateStrOf(cutoff))
    .sort((a, b) => a.date.localeCompare(b.date));

  const { targetAverage = 0, unit = '' } = tracker.config;
  const color = TRACKER_CATS[tracker.category]?.color ?? 'var(--accent)';
  if (!logs.length) return null;

  const W = 100, H = 80;
  const vals = logs.map(l => l.value);
  const max = Math.max(...vals, targetAverage) * 1.1 || 1;
  const barW = W / logs.length;
  const avgY = H - 4 - (targetAverage / max) * (H - 8);

  return (
    <div className="detail-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 120 }}>
        {logs.map((l, i) => {
          const bh = (l.value / max) * (H - 8);
          return <rect key={i} x={i * barW + 0.5} y={H - 4 - bh} width={barW - 1} height={bh}
            fill={color} opacity="0.7" rx="1" />;
        })}
        {targetAverage > 0 && (
          <line x1="0" y1={avgY} x2={W} y2={avgY} stroke={color} strokeWidth="1.2" strokeDasharray="3,2" />
        )}
      </svg>
      <div className="chart-axis-row">
        <span>{logs[0]?.date ?? ''}</span>
        {targetAverage > 0 && <span style={{ color, fontWeight: 700 }}>Target: {targetAverage}{unit}</span>}
        <span>{logs[logs.length - 1]?.date ?? ''}</span>
      </div>
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────
function StatCard({ val, lbl, color }) {
  return (
    <div className="stat-card">
      <div className="stat-val" style={color ? { color } : {}}>{val}</div>
      <div className="stat-lbl">{lbl}</div>
    </div>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────
function IconBarChart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
    </svg>
  );
}

function IconPlusCircle() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  );
}
