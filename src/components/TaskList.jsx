import { useState, useMemo } from 'react';

export const CAT_META = {
  learning: { label: 'Learning', color: '#6366f1' },
  fitness:  { label: 'Fitness',  color: '#10b981' },
  mental:   { label: 'Mental',   color: '#f59e0b' },
  work:     { label: 'Work',     color: '#3b82f6' },
  growth:   { label: 'Growth',   color: '#ec4899' },
};

const PRI_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6', none: 'transparent' };

function fmtTime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

const ALL_CATS = Object.keys(CAT_META);

export default function TaskList({ tasks, activeTaskId, timerRunning, onSelect, onToggle, onDelete, onClearCompleted, onAdd }) {
  const [catFilter, setCatFilter] = useState('all');

  const visible = useMemo(() => {
    const base = catFilter === 'all' ? tasks : tasks.filter(t => t.category === catFilter);
    return [...base].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [tasks, catFilter]);

  const pendingCount = tasks.filter(t => !t.completed).length;
  const hasCompleted = tasks.some(t => t.completed);

  return (
    <div className="task-list-panel">
      <div className="tl-header">
        <div className="tl-title-row">
          <h2>Tasks <span className="task-count-badge">{pendingCount}</span></h2>
          <div className="tl-header-actions">
            {hasCompleted && (
              <button className="text-action-btn" onClick={onClearCompleted} title="Clear completed">
                Clear done
              </button>
            )}
            <button className="add-task-btn" onClick={onAdd}>＋ Add</button>
          </div>
        </div>

        <div className="cat-filter-row">
          <button
            className={`cat-chip${catFilter === 'all' ? ' cat-chip-active' : ''}`}
            onClick={() => setCatFilter('all')}
          >
            All
          </button>
          {ALL_CATS.map(cat => (
            <button
              key={cat}
              className={`cat-chip${catFilter === cat ? ' cat-chip-active' : ''}`}
              style={catFilter === cat ? { background: CAT_META[cat].color, borderColor: CAT_META[cat].color, color: '#fff' } : {}}
              onClick={() => setCatFilter(cat)}
            >
              {CAT_META[cat].label}
            </button>
          ))}
        </div>
      </div>

      <div className="task-items">
        {visible.length === 0 && (
          <div className="empty-state">
            <span>🌱</span>
            <p>{catFilter === 'all' ? 'No tasks yet.\nAdd one to start!' : `No ${CAT_META[catFilter]?.label} tasks.`}</p>
          </div>
        )}

        {visible.map(task => {
          const meta = CAT_META[task.category] ?? CAT_META.work;
          const isActive = task.id === activeTaskId;
          const priColor = PRI_COLOR[task.priority] ?? 'transparent';

          return (
            <div
              key={task.id}
              className={`task-item${isActive ? ' task-active' : ''}${task.completed ? ' task-done' : ''}`}
              onClick={() => !timerRunning && onSelect(task.id)}
              title={timerRunning && !isActive ? 'Pause timer to switch tasks' : undefined}
            >
              <button
                className={`task-check${task.completed ? ' checked' : ''}`}
                onClick={e => { e.stopPropagation(); onToggle(task.id); }}
                aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
              >
                {task.completed && '✓'}
              </button>

              <div className="task-body">
                <div className="task-name-row">
                  {task.priority !== 'none' && (
                    <span className="pri-dot" style={{ background: priColor }} title={task.priority} />
                  )}
                  <span className="task-name">{task.name}</span>
                </div>
                <div className="task-badges">
                  <span
                    className="cat-badge"
                    style={{ background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}44` }}
                  >
                    {meta.label}
                  </span>
                  {task.timeLogged > 0 && (
                    <span className="info-badge">⏱ {fmtTime(task.timeLogged)}</span>
                  )}
                  {task.pomodorosCompleted > 0 && (
                    <span className="info-badge">🍅 {task.pomodorosCompleted}</span>
                  )}
                  {task.dueDate && (
                    <span className="info-badge">📅 {task.dueDate}</span>
                  )}
                </div>
              </div>

              <button
                className="task-del-btn"
                onClick={e => { e.stopPropagation(); onDelete(task.id); }}
                aria-label="Delete"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
