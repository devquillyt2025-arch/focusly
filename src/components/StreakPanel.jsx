import { useMemo } from 'react';

function todayStr() { return new Date().toISOString().split('T')[0]; }

export default function StreakPanel({ pomodoroLog, tasks, intentions }) {
  const { streak, weekDays } = useMemo(() => {
    const today = todayStr();

    const activeDays = new Set([
      ...pomodoroLog.map(ts => ts.split('T')[0]),
      ...tasks.filter(t => t.completedAt).map(t => t.completedAt.split('T')[0]),
    ]);

    if (intentions?.history) {
      for (const [d, active] of Object.entries(intentions.history)) {
        if (active) activeDays.add(d);
      }
    }
    if (intentions?.date === today && intentions?.items?.some(i => i.done)) {
      activeDays.add(today);
    }

    let s = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const k = d.toISOString().split('T')[0];
      if (activeDays.has(k)) s++;
      else if (i > 0) break;
    }

    const weekDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      weekDays.push({
        dateStr,
        label: d.toLocaleDateString('en', { weekday: 'short' }).slice(0, 1),
        isToday:  dateStr === today,
        isActive: activeDays.has(dateStr),
        isFuture: dateStr > today,
      });
    }

    return { streak: s, weekDays };
  }, [pomodoroLog, tasks, intentions]);

  const hasAnyActivity = weekDays.some(d => d.isActive);
  if (!hasAnyActivity && streak === 0) return null;

  return (
    <div className="streak-panel">
      <div className="streak-panel-header">
        <span className="streak-panel-title">Weekly Streak</span>
        {streak > 0 && (
          <span className="streak-count-inline">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444" stroke="none" style={{ flexShrink: 0 }}>
              <path d="M12 12c2-2.96 0-7-1-8 0 3.038-1.773 4.741-3 6-1.226 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.532-1.056-3.94-2-5-1.786 3-2.791 3-4 2z"/>
            </svg>
            {streak}d
          </span>
        )}
      </div>
      <div className="streak-week-row">
        {weekDays.map(day => (
          <div key={day.dateStr} className="streak-day-col">
            <div
              className={[
                'streak-dot',
                day.isActive  ? 's-active'  : '',
                day.isToday   ? 's-today'   : '',
                day.isFuture  ? 's-future'  : '',
              ].filter(Boolean).join(' ')}
              title={day.dateStr}
            />
            <span className="streak-day-name">{day.label}</span>
          </div>
        ))}
      </div>
      <div className="streak-subtitle">Activity — last 7 days</div>
    </div>
  );
}
