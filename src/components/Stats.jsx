import { useMemo, memo } from 'react';
import { CAT_META } from '../utils/categoryMeta';

function fmtDur(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function Stats({ tasks, pomodoroLog, settings }) {
  const stats = useMemo(() => {
    // Use a UTC-based 7-day rolling window so pomo ISO timestamps and task
    // completedAt ISO strings are compared on a consistent UTC baseline.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const weekPomos    = pomodoroLog.filter(ts => new Date(ts) >= sevenDaysAgo).length;
    const weekDone     = tasks.filter(t => t.completedAt && new Date(t.completedAt) >= sevenDaysAgo).length;
    const totalLogged  = tasks.reduce((s, t) => s + t.timeLogged, 0);

    const activeDays = new Set(
      tasks.filter(t => t.completedAt && new Date(t.completedAt) >= sevenDaysAgo)
        .map(t => t.completedAt.split('T')[0])
    ).size;

    const byCategory = {};
    for (const t of tasks) {
      if (!t.timeLogged) continue;
      byCategory[t.category] = (byCategory[t.category] ?? 0) + t.timeLogged;
    }

    return { weekPomos, weekDone, totalLogged, activeDays, byCategory };
  }, [tasks, pomodoroLog]);

  const catEntries = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = catEntries.length ? catEntries[0][1] : 1;

  return (
    <div className="stats-panel">
      <h3 className="stats-heading">Weekly Stats</h3>
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-val">{fmtDur(stats.totalLogged)}</div>
          <div className="stat-lbl">Total Tracked</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{stats.weekPomos}</div>
          <div className="stat-lbl">Pomodoros (week)</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{stats.weekDone}</div>
          <div className="stat-lbl">Tasks Done (week)</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{stats.activeDays}</div>
          <div className="stat-lbl">Active Days</div>
        </div>
      </div>

      {catEntries.length > 0 && (
        <div className="cat-breakdown">
          <h4 className="breakdown-lbl">Time by Category</h4>
          {catEntries.map(([cat, secs]) => {
            const meta = CAT_META[cat] ?? { color: 'var(--accent)', label: cat };
            return (
              <div key={cat} className="cat-bar-row">
                <span className="cat-bar-name" style={{ color: meta.color }}>{meta.label}</span>
                <div className="cat-bar-track">
                  <div className="cat-bar-fill" style={{ width: `${(secs / maxCat) * 100}%`, background: meta.color }} />
                </div>
                <span className="cat-bar-time">{fmtDur(secs)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(Stats);
