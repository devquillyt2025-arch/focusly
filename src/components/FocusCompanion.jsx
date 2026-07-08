import { useMemo, useSyncExternalStore } from 'react';
import { CAT_META } from '../utils/categoryMeta';
import { localDateStr } from '../utils/date';
import { getTickSeconds, subscribeTick } from '../utils/timerTickStore';

const PRIO_ORDER = { high: 0, medium: 1, low: 2, none: 3 };
const PRIO_COLOR = { high: 'var(--color-red)', medium: 'var(--color-amber)', low: 'var(--color-blue)', none: 'var(--text-secondary)' };
const MODE_COLOR = { focus: 'var(--color-red)', short: 'var(--color-green)', long: 'var(--color-blue)', custom: 'var(--color-amber)' };
const LONG_BREAK_AFTER = 4;

function fmtEndTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function FocusCompanion({
  tasks, activeTaskId, onSelectTask, onToggle,
  pomodoroLog, timerState, timerMode,
}) {
  // Sourced from an external store (not props) so this 1s tick only re-renders
  // FocusCompanion itself, not the whole app tree — see utils/timerTickStore.js.
  const timerSeconds = useSyncExternalStore(subscribeTick, getTickSeconds);
  const modeColor  = MODE_COLOR[timerMode] ?? 'var(--color-red)';
  const activeTask = tasks.find(t => t.id === activeTaskId) ?? null;

  const quickTasks = useMemo(() => {
    return tasks
      .filter(t => !t.completed)
      .sort((a, b) => {
        const pa = PRIO_ORDER[a.priority] ?? 3;
        const pb = PRIO_ORDER[b.priority] ?? 3;
        if (pa !== pb) return pa - pb;
        if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      })
      .slice(0, 4);
  }, [tasks]);

  const todayStr    = localDateStr();
  const todayPomos  = pomodoroLog.filter(ts => ts.startsWith(todayStr)).length;
  const cyclePos    = todayPomos % LONG_BREAK_AFTER;
  const cyclePct    = (cyclePos / LONG_BREAK_AFTER) * 100;
  const totalCycles = Math.floor(todayPomos / LONG_BREAK_AFTER);

  const sessionEndAt = timerState !== 'idle'
    ? new Date(Date.now() + timerSeconds * 1000)
    : null;

  return (
    <div className="focus-companion">

      {/* ── Current Focus ── */}
      <div className="companion-card">
        <div className="companion-card-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: timerState === 'running' ? 'var(--color-green)' : 'var(--text-secondary)',
              transition: 'background 0.3s',
              boxShadow: timerState === 'running' ? '0 0 6px #22c55e88' : 'none',
            }} />
            <span className="companion-card-title">Current Focus</span>
          </div>
          {sessionEndAt && (
            <span className="companion-session-end">Ends at {fmtEndTime(sessionEndAt)}</span>
          )}
        </div>
        {activeTask ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            {CAT_META[activeTask.category] && (
              <span style={{
                fontSize: '0.67rem', fontWeight: 700,
                padding: '2px 8px', borderRadius: 9999, flexShrink: 0,
                background: CAT_META[activeTask.category].color + '22',
                color: CAT_META[activeTask.category].color,
                border: `1px solid ${CAT_META[activeTask.category].color}44`,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {CAT_META[activeTask.category].label}
              </span>
            )}
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {activeTask.name}
            </span>
          </div>
        ) : (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
            Select a task below to begin tracking.
          </p>
        )}
      </div>

      {/* ── Quick Tasks ── */}
      <div className="companion-card">
        <div className="companion-card-hdr">
          <span className="companion-card-title">Quick Tasks</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {tasks.filter(t => !t.completed).length} pending
          </span>
        </div>
        {quickTasks.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
            All tasks completed! 🎉
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
            {quickTasks.map(task => (
              <div
                key={task.id}
                className="quick-task-row"
                style={{
                  background:  task.id === activeTaskId ? modeColor + '0d' : 'var(--bg-card)',
                  borderColor: task.id === activeTaskId ? modeColor + '44' : 'var(--border)',
                }}
              >
                <button
                  className="quick-task-check"
                  onClick={() => onToggle(task.id)}
                  title="Mark complete"
                  aria-label="Mark complete"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {task.name}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                    {task.priority && task.priority !== 'none' && (
                      <span style={{ fontSize: '0.64rem', fontWeight: 700, color: PRIO_COLOR[task.priority], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {task.priority}
                      </span>
                    )}
                    {task.dueDate && (
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        Due {task.dueDate}
                      </span>
                    )}
                    {!task.dueDate && (!task.priority || task.priority === 'none') && task.timeEstimate && (
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {task.timeEstimate}m est.
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="quick-task-focus-btn"
                  onClick={() => onSelectTask(task.id)}
                  style={{
                    color:       task.id === activeTaskId ? modeColor        : 'var(--accent)',
                    borderColor: task.id === activeTaskId ? modeColor + '55' : '#d1d5db',
                    background:  task.id === activeTaskId ? modeColor + '12' : 'transparent',
                  }}
                >
                  {task.id === activeTaskId ? 'Focused' : 'Focus'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Daily Pomodoro Progress ── */}
      <div className="companion-card">
        <div className="companion-card-hdr">
          <span className="companion-card-title">Daily Progress</span>
          <span style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
            {todayPomos} pomodoro{todayPomos !== 1 ? 's' : ''} today
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
            <span style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {cyclePos} of {LONG_BREAK_AFTER} until long break
              {totalCycles > 0 && (
                <span style={{ marginLeft: 7, fontSize: '0.69rem', color: 'var(--text-muted)' }}>
                  ({totalCycles} cycle{totalCycles !== 1 ? 's' : ''} done)
                </span>
              )}
            </span>
            {timerState === 'running' && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: modeColor }}>
                {timerMode === 'focus' ? '● Focusing' : '● On break'}
              </span>
            )}
          </div>
          <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${cyclePct}%`,
              background: `linear-gradient(90deg, ${modeColor}bb, ${modeColor})`,
              borderRadius: 9999,
              transition: 'width 0.5s ease-in-out',
              minWidth: cyclePos > 0 ? 12 : 0,
            }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 9 }}>
            {Array.from({ length: LONG_BREAK_AFTER }, (_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: i < cyclePos ? modeColor : 'var(--border)',
                  boxShadow: i < cyclePos ? `0 0 6px ${modeColor}88` : 'none',
                  transition: 'all 0.3s ease',
                }} />
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              </div>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
              <div style={{
                width: 10, height: 10, borderRadius: 2,
                background: 'var(--color-blue)',
                opacity: cyclePos === 0 && totalCycles > 0 ? 1 : cyclePos === LONG_BREAK_AFTER ? 1 : 0.22,
                transition: 'opacity 0.3s ease',
              }} />
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>☕</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
