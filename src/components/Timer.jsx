import { CAT_META } from './TaskList';

const RADIUS = 88;
const STROKE = 9;
const SIZE   = 200;
const CIRC   = 2 * Math.PI * RADIUS;

const MODE_META = {
  focus:  { label: 'Focus',       color: '#ef4444', hint: '1' },
  short:  { label: 'Short Break', color: '#10b981', hint: '2' },
  long:   { label: 'Long Break',  color: '#3b82f6', hint: '3' },
  custom: { label: 'Custom',      color: '#f59e0b', hint: '4' },
};

const LONG_BREAK_AFTER = 4;

function pad(n) { return String(n).padStart(2, '0'); }

function fmtTimer(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

function fmtLogged(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function Timer({ task, timerMode, timerState, timerSeconds, totalSeconds, pomodoroCount, onSwitchMode, onStart, onPause, onReset }) {
  const progress = totalSeconds > 0 ? timerSeconds / totalSeconds : 1;
  const offset   = CIRC * (1 - progress);
  const mode     = MODE_META[timerMode] ?? MODE_META.focus;
  const catMeta  = task ? (CAT_META[task.category] ?? CAT_META.work) : null;

  const stateLabel =
    timerState === 'running' ? 'Focusing…' :
    timerState === 'paused'  ? 'Paused'    : 'Ready';

  return (
    <div className="timer-panel">
      {/* Mode nav */}
      <nav className="mode-nav">
        {Object.entries(MODE_META).map(([key, m]) => (
          <button
            key={key}
            className={`mode-btn${timerMode === key ? ' mode-btn-active' : ''}`}
            style={timerMode === key ? { background: m.color, borderColor: m.color } : {}}
            onClick={() => onSwitchMode(key)}
            title={`${m.label} (${m.hint})`}
          >
            {m.label}
          </button>
        ))}
      </nav>

      {/* Ring */}
      <div className="ring-wrap">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="ring-svg">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--ring-track)" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            fill="none"
            stroke={mode.color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            style={{
              transform: 'rotate(-90deg)',
              transformOrigin: 'center',
              transition: timerState === 'running' ? 'stroke-dashoffset 1s linear' : 'stroke-dashoffset 0.35s ease',
              filter: `drop-shadow(0 0 8px ${mode.color}66)`,
            }}
          />
        </svg>
        <div className="ring-center">
          <span className="timer-digits">{fmtTimer(timerSeconds)}</span>
          <span className="timer-status">{stateLabel}</span>
        </div>
      </div>

      {/* Pomodoro dots */}
      <div className="pomo-dots">
        {Array.from({ length: LONG_BREAK_AFTER }, (_, i) => (
          <div
            key={i}
            className={`pomo-dot${i < pomodoroCount ? ' pomo-dot-filled' : ''}`}
            style={i < pomodoroCount ? { background: mode.color, borderColor: mode.color, boxShadow: `0 0 6px ${mode.color}99` } : {}}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="timer-controls">
        {timerState === 'running' ? (
          <button className="ctrl-btn pause-btn" onClick={onPause}>⏸ Pause</button>
        ) : (
          <button
            className="ctrl-btn start-btn"
            onClick={onStart}
            style={{ background: mode.color, boxShadow: `0 4px 14px ${mode.color}55` }}
          >
            {timerState === 'paused' ? '▶ Resume' : '▶ Start'}
          </button>
        )}
        <button className="ctrl-btn reset-btn" onClick={onReset}>↺ Reset</button>
      </div>

      {/* Active task info */}
      {task ? (
        <div className="task-detail-card">
          {catMeta && (
            <span
              className="timer-cat-badge"
              style={{ background: catMeta.color + '22', color: catMeta.color, border: `1px solid ${catMeta.color}44` }}
            >
              {catMeta.label}
            </span>
          )}
          <p className="task-detail-name">{task.name}</p>
          <div className="task-detail-rows">
            <div className="detail-row">
              <span className="detail-lbl">Estimate</span>
              <span className="detail-val">{task.timeEstimate} min</span>
            </div>
            <div className="detail-row">
              <span className="detail-lbl">Logged</span>
              <span className="detail-val">{task.timeLogged > 0 ? fmtLogged(task.timeLogged) : '—'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-lbl">Pomodoros</span>
              <span className="detail-val">{task.pomodorosCompleted || 0}</span>
            </div>
            {task.dueDate && (
              <div className="detail-row">
                <span className="detail-lbl">Due</span>
                <span className="detail-val">{task.dueDate}</span>
              </div>
            )}
          </div>
          {task.notes && <p className="task-detail-notes">{task.notes}</p>}
        </div>
      ) : (
        <p className="no-task-hint">← Select a task to track time</p>
      )}
    </div>
  );
}
