import { useMemo } from 'react';
import { CAT_META } from './TaskList';

function todayStr() { return new Date().toISOString().split('T')[0]; }

function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtDur(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export default function Stats({ tasks, pomodoroLog, settings }) {
  const stats = useMemo(() => {
    const ws  = weekStart();
    const tod = todayStr();

    const weekPomos    = pomodoroLog.filter(ts => new Date(ts) >= ws).length;
    const todayPomos   = pomodoroLog.filter(ts => ts.startsWith(tod)).length;
    const weekDone     = tasks.filter(t => t.completedAt && new Date(t.completedAt) >= ws).length;
    const totalLogged  = tasks.reduce((s, t) => s + t.timeLogged, 0);

    const activeDays = new Set(
      tasks.filter(t => t.completedAt && new Date(t.completedAt) >= ws)
        .map(t => t.completedAt.split('T')[0])
    ).size;

    const byCategory = {};
    for (const t of tasks) {
      if (!t.timeLogged) continue;
      byCategory[t.category] = (byCategory[t.category] ?? 0) + t.timeLogged;
    }

    return { weekPomos, todayPomos, weekDone, totalLogged, activeDays, byCategory };
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
            const meta = CAT_META[cat] ?? { color: '#6366f1', label: cat };
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
