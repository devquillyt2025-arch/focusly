import { useMemo, useEffect } from 'react';
import { CAT_META } from './TaskList';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function todayStr() { return new Date().toISOString().split('T')[0]; }

function fmtDur(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s || 0}s`;
}

function getStreak(pomodoroLog, tasks) {
  const days = new Set([
    ...pomodoroLog.map(ts => ts.split('T')[0]),
    ...tasks.filter(t => t.completedAt).map(t => t.completedAt.split('T')[0]),
  ]);
  let s = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (days.has(d.toISOString().split('T')[0])) s++;
    else if (i > 0) break;
  }
  return s;
}

export default function AnalyticsModal({ tasks, pomodoroLog, settings, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const data = useMemo(() => {
    const tod = todayStr();
    const today = new Date();

    // 7-day bar chart data
    const chartDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().split('T')[0];
      const pomos = pomodoroLog.filter(ts => ts.startsWith(key)).length;
      const done  = tasks.filter(t => t.completedAt?.startsWith(key)).length;
      return { key, label: DAY_LABELS[d.getDay()], pomos, done };
    });

    const maxVal = Math.max(1, ...chartDays.map(d => Math.max(d.pomos, d.done)));

    const todayPomos = pomodoroLog.filter(ts => ts.startsWith(tod)).length;
    const todayDone  = tasks.filter(t => t.completedAt?.startsWith(tod)).length;
    const weekPomos  = chartDays.reduce((s, d) => s + d.pomos, 0);
    const weekFocus  = weekPomos * (settings.focusDuration || 25) * 60;
    const streak     = getStreak(pomodoroLog, tasks);

    const byCategory = {};
    for (const t of tasks) {
      if (!t.timeLogged) continue;
      byCategory[t.category] = (byCategory[t.category] ?? 0) + t.timeLogged;
    }
    const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const maxCat = catEntries.length ? catEntries[0][1] : 1;

    const recent = tasks
      .filter(t => t.completedAt)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .slice(0, 8);

    return { todayPomos, todayDone, weekFocus, streak, chartDays, maxVal, catEntries, maxCat, recent };
  }, [tasks, pomodoroLog, settings]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-wide" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-hdr">
          <h3>📊 Analytics</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-form analytics-body">
          {/* Stat cards */}
          <div className="analytics-cards">
            <div className="a-card"><div className="a-val">{data.todayPomos}</div><div className="a-lbl">Pomodoros Today</div></div>
            <div className="a-card"><div className="a-val">{data.todayDone}</div><div className="a-lbl">Tasks Today</div></div>
            <div className="a-card"><div className="a-val">{fmtDur(data.weekFocus)}</div><div className="a-lbl">Focus (week)</div></div>
            <div className="a-card"><div className="a-val">{data.streak} 🔥</div><div className="a-lbl">Day Streak</div></div>
          </div>

          {/* 7-day chart */}
          <div className="chart-section">
            <h4>7-Day Activity</h4>
            <div className="bar-chart">
              {data.chartDays.map(d => {
                const pH = data.maxVal > 0 ? Math.round((d.pomos / data.maxVal) * 72) : 0;
                const dH = data.maxVal > 0 ? Math.round((d.done  / data.maxVal) * 72) : 0;
                return (
                  <div key={d.key} className="bar-col">
                    <div className="bar-tracks">
                      <div className="bar-fill bar-focus" style={{ height: pH }} title={`${d.pomos} focus sessions`} />
                      <div className="bar-fill bar-done"  style={{ height: dH }} title={`${d.done} tasks done`} />
                    </div>
                    <div className="bar-label">{d.label}</div>
                  </div>
                );
              })}
            </div>
            <div className="chart-legend">
              <span className="legend-dot" style={{ background: '#6366f1' }} /><span>Focus sessions</span>
              <span className="legend-dot" style={{ background: '#10b981' }} /><span>Tasks done</span>
            </div>
          </div>

          {/* Category breakdown */}
          {data.catEntries.length > 0 && (
            <div className="chart-section">
              <h4>Time by Category</h4>
              {data.catEntries.map(([cat, secs]) => {
                const meta = CAT_META[cat] ?? { color: '#6366f1', label: cat };
                return (
                  <div key={cat} className="cat-bar-row">
                    <span className="cat-bar-name" style={{ color: meta.color }}>{meta.label}</span>
                    <div className="cat-bar-track">
                      <div className="cat-bar-fill" style={{ width: `${(secs / data.maxCat) * 100}%`, background: meta.color }} />
                    </div>
                    <span className="cat-bar-time">{fmtDur(secs)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent completions */}
          {data.recent.length > 0 && (
            <div className="chart-section">
              <h4>Recent Completions</h4>
              <ul className="recent-list">
                {data.recent.map(t => {
                  const meta = CAT_META[t.category] ?? { color: '#6366f1', label: t.category };
                  const when = new Date(t.completedAt);
                  const whenStr = when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  return (
                    <li key={t.id} className="recent-item">
                      <span className="recent-dot" style={{ background: meta.color }} />
                      <span className="recent-name">{t.name}</span>
                      <span className="recent-when">{whenStr}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
