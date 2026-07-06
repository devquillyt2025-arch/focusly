import { useMemo } from 'react';

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayStr() { return localDateStr(); }

export default function StreakPanel({ pomodoroLog, tasks, intentions }) {
  const { streak, weekDays } = useMemo(() => {
    const today = todayStr();

    const activeDays = new Set([
      ...pomodoroLog.map(ts => localDateStr(new Date(ts))),
      ...tasks.filter(t => t.completedAt).map(t => localDateStr(new Date(t.completedAt))),
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
      const k = localDateStr(d);
      if (activeDays.has(k)) s++;
      else if (i > 0) break;
    }

    const weekDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = localDateStr(d);
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
    <div className="yartu-card">
      <div className="yartu-card-header">
        <div className="yartu-card-title-group">
          <div className="yartu-badge-circle orange">🔥</div>
          <div className="yartu-card-title">WEEKLY STREAK</div>
        </div>
        {streak > 0 ? (
          <span className="yartu-affordance" style={{ color: '#f97316' }}>{streak}d active</span>
        ) : (
          <span className="yartu-affordance">0d</span>
        )}
      </div>
      <div className="yartu-card-body" style={{ alignItems: 'center', padding: '12px 0' }}>
        <div className="streak-week-row" style={{ width: '100%', justifyContent: 'space-around' }}>
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
        <div className="streak-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '8px' }}>Activity — last 7 days</div>
      </div>
    </div>
  );
}
