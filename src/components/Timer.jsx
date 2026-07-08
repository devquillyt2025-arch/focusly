import { useState, useEffect, useSyncExternalStore } from 'react';
import { CAT_META } from '../utils/categoryMeta';
import { getTickSeconds, subscribeTick } from '../utils/timerTickStore';

const RADIUS = 88;
const STROKE = 9;
const SIZE   = 200;
const CIRC   = 2 * Math.PI * RADIUS;

const MODE_META = {
  focus:  { label: 'Focus',       color: 'var(--color-red)', hint: '1' },
  short:  { label: 'Short Break', color: 'var(--color-green)', hint: '2' },
  long:   { label: 'Long Break',  color: 'var(--color-blue)', hint: '3' },
  custom: { label: 'Custom',      color: 'var(--color-amber)', hint: '4' },
};

const LONG_BREAK_AFTER = 4;
const MIN_SECS = 60; // 1 minute minimum

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

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export default function Timer({ task, timerMode, activeTimerMode, timerState, totalSeconds, pomodoroCount, onSwitchMode, onStart, onPause, onReset, onAdjustDuration }) {
  // Sourced from an external store (not props) so this 1s tick only re-renders
  // Timer itself, not the whole app tree — see utils/timerTickStore.js.
  const timerSeconds = useSyncExternalStore(subscribeTick, getTickSeconds);
  // Ring always reflects the ACTIVE running mode; tabs reflect the selected view mode
  const ringMode    = timerState !== 'idle' ? (activeTimerMode ?? timerMode) : timerMode;
  const progress    = totalSeconds > 0 ? timerSeconds / totalSeconds : 1;
  const offset      = CIRC * (1 - progress);
  const viewMeta    = MODE_META[timerMode]    ?? MODE_META.focus;
  const ringMeta    = MODE_META[ringMode]     ?? MODE_META.focus;
  const catMeta     = task ? (CAT_META[task.category] ?? CAT_META.work) : null;

  const backgroundRunning = timerState !== 'idle' && timerMode !== activeTimerMode;

  const stateLabel =
    timerState === 'running' ? (ringMode === 'focus' ? 'Focusing…' : 'On break…') :
    timerState === 'paused'  ? 'Paused'    : 'Ready';

  const startLabel = backgroundRunning
    ? `▶ Start ${viewMeta.label}`
    : timerState === 'paused' ? '▶ Resume' : '▶ Start';

  const currentCycleIndex = pomodoroCount;

  // ── Duration editing state (only active when timer is idle) ──────
  const [isExactEdit, setIsExactEdit] = useState(false);
  const [editMins,    setEditMins]    = useState(0);
  const [editSecs,    setEditSecs]    = useState(0);

  // Close edit mode whenever the timer starts, is reset, or the tab changes
  useEffect(() => {
    setIsExactEdit(false);
  }, [timerMode, timerState]);

  const openExactEdit = () => {
    setEditMins(Math.floor(timerSeconds / 60));
    setEditSecs(timerSeconds % 60);
    setIsExactEdit(true);
  };

  const confirmExactEdit = () => {
    const secs = Math.max(MIN_SECS, editMins * 60 + editSecs);
    onAdjustDuration(secs);
    setIsExactEdit(false);
  };

  const cancelExactEdit = () => {
    setIsExactEdit(false);
  };

  const adjustTime = (deltaSecs) => {
    const newSecs = Math.max(MIN_SECS, timerSeconds + deltaSecs);
    onAdjustDuration(newSecs);
  };

  const canDecrement5 = timerSeconds > MIN_SECS + 300;
  const canDecrement1 = timerSeconds > MIN_SECS;

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

      {/* Background-timer status badge */}
      {backgroundRunning && (
        <div className="bg-timer-badge" style={{ borderColor: `${ringMeta.color}44`, color: ringMeta.color, background: `${ringMeta.color}12` }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: ringMeta.color, display: 'inline-block', animation: 'bgTimerPulse 1.2s ease-in-out infinite' }} />
          {ringMeta.label} running — {fmtTimer(timerSeconds)}
        </div>
      )}

      {/* Ring */}
      <div className="ring-wrap">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="ring-svg">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--ring-track)" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            fill="none"
            stroke={ringMeta.color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            style={{
              transform: 'rotate(-90deg)',
              transformOrigin: 'center',
              transition: timerState === 'running' ? 'stroke-dashoffset 1s linear' : 'stroke-dashoffset 0.35s ease',
              filter: `drop-shadow(0 0 8px ${ringMeta.color}66)`,
            }}
          />
        </svg>
        <div className="ring-center">
          <span className="timer-digits">{fmtTimer(timerSeconds)}</span>
          <span className="timer-status" style={{ color: ringMeta.color + 'cc' }}>{stateLabel}</span>
        </div>
      </div>

      {/* Duration edit bar — only shown when idle */}
      {timerState === 'idle' && (
        <div className="timer-edit-zone">
          {isExactEdit ? (
            /* Exact MM:SS input row */
            <div className="timer-exact-edit-row">
              <input
                type="number"
                className="timer-edit-input"
                min="0" max="99"
                value={editMins}
                onChange={e => setEditMins(clamp(parseInt(e.target.value) || 0, 0, 99))}
                onKeyDown={e => { if (e.key === 'Enter') confirmExactEdit(); if (e.key === 'Escape') cancelExactEdit(); }}
                autoFocus
                aria-label="Minutes"
              />
              <span className="timer-edit-sep">:</span>
              <input
                type="number"
                className="timer-edit-input"
                min="0" max="59"
                value={pad(editSecs)}
                onChange={e => setEditSecs(clamp(parseInt(e.target.value) || 0, 0, 59))}
                onKeyDown={e => { if (e.key === 'Enter') confirmExactEdit(); if (e.key === 'Escape') cancelExactEdit(); }}
                aria-label="Seconds"
              />
              <button className="timer-edit-confirm" onClick={confirmExactEdit} title="Confirm">✓</button>
              <button className="timer-edit-cancel"  onClick={cancelExactEdit}  title="Cancel">✕</button>
            </div>
          ) : (
            /* Quick-adjust bar */
            <div className="timer-edit-bar">
              <button
                className="timer-adj-btn"
                onClick={() => adjustTime(-300)}
                disabled={!canDecrement5}
                title="−5 minutes"
              >−5m</button>
              <button
                className="timer-adj-btn"
                onClick={() => adjustTime(-60)}
                disabled={!canDecrement1}
                title="−1 minute"
              >−1m</button>
              <button
                className="timer-edit-pill"
                onClick={openExactEdit}
                style={{ color: viewMeta.color, borderColor: `${viewMeta.color}55`, background: `${viewMeta.color}10` }}
                title="Edit exact duration"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
              </button>
              <button
                className="timer-adj-btn"
                onClick={() => adjustTime(60)}
                title="+1 minute"
              >+1m</button>
              <button
                className="timer-adj-btn"
                onClick={() => adjustTime(300)}
                title="+5 minutes"
              >+5m</button>
            </div>
          )}
        </div>
      )}

      {/* Pomodoro Stepper */}
      <div className="pomo-stepper">
        <span className="pomo-stepper-label">Cycle</span>
        {Array.from({ length: LONG_BREAK_AFTER }, (_, i) => {
          const done   = i < pomodoroCount;
          const active = timerState === 'running' && ringMode === 'focus' && i === currentCycleIndex;
          return (
            <div
              key={i}
              className={`pomo-step${done ? ' pomo-step-done' : ''}${active ? ' pomo-step-active' : ''}`}
              title={done ? `Session ${i + 1} complete` : active ? `Session ${i + 1} in progress` : `Session ${i + 1}`}
            >
              {done ? '✓' : i + 1}
            </div>
          );
        })}
        <div className="pomo-step pomo-step-break" title="Long Break after 4 sessions">☕</div>
        <span className="pomo-stepper-label">{pomodoroCount}/{LONG_BREAK_AFTER}</span>
      </div>

      {/* Controls */}
      <div className="timer-controls">
        {timerState === 'running' && !backgroundRunning ? (
          <button className="ctrl-btn pause-btn" onClick={onPause}>⏸ Pause</button>
        ) : (
          <button
            className="ctrl-btn start-btn"
            onClick={onStart}
            style={{ background: viewMeta.color, boxShadow: `0 4px 14px ${viewMeta.color}55` }}
          >
            {startLabel}
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
        <p className="no-task-hint">
          <span style={{ opacity: 0.5, marginRight: 5 }}>📋</span>
          Select a task in the panel to track time
        </p>
      )}
    </div>
  );
}
