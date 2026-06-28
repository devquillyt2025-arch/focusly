import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CAT_META } from '../utils/categoryMeta';
import { PRI_META } from '../utils/priorityMeta';

// ── Calendar Date Picker ────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEK_DAYS    = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function CalendarDatePicker({ value, onChange, onClose }) {
  const parsed  = value ? new Date(value + 'T00:00:00') : new Date();
  const [nav, setNav] = useState({ year: parsed.getFullYear(), month: parsed.getMonth() });
  const today   = isoToday();

  const grid = useMemo(() => {
    const { year, month } = nav;
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);
    const cells = [];
    const offset = first.getDay();
    const prevLast = new Date(year, month, 0).getDate();
    for (let i = offset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevLast - i);
      cells.push({ date: d, cur: false, iso: toISO(d) });
    }
    for (let i = 1; i <= last.getDate(); i++) {
      const d = new Date(year, month, i);
      cells.push({ date: d, cur: true, iso: toISO(d) });
    }
    while (cells.length % 7 !== 0) {
      const n = cells.length - last.getDate() - offset + 1;
      const d = new Date(year, month + 1, n);
      cells.push({ date: d, cur: false, iso: toISO(d) });
    }
    return cells;
  }, [nav]);

  const prevMonth = () => setNav(n => {
    const d = new Date(n.year, n.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const nextMonth = () => setNav(n => {
    const d = new Date(n.year, n.month + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const quickPick = (label) => {
    const d = new Date();
    if (label === 'Today')     { onChange(toISO(d)); onClose(); return; }
    if (label === 'Tomorrow')  { d.setDate(d.getDate()+1); onChange(toISO(d)); onClose(); return; }
    if (label === 'Next week') { d.setDate(d.getDate() + (7 - d.getDay() + 1)); onChange(toISO(d)); onClose(); return; }
    if (label === 'In 2 weeks'){ d.setDate(d.getDate()+14); onChange(toISO(d)); onClose(); return; }
    if (label === 'Next month') { d.setMonth(d.getMonth()+1); onChange(toISO(d)); onClose(); return; }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      style={{
        position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
        width: 292, overflow: 'hidden',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Quick picks */}
      <div style={{ padding: '12px 12px 8px', display: 'flex', flexWrap: 'wrap', gap: 6, borderBottom: '1px solid var(--border)' }}>
        {['Today','Tomorrow','Next week','In 2 weeks','Next month'].map(lbl => (
          <button key={lbl} onClick={() => quickPick(lbl)}
            style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px' }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: 8, fontSize: '1rem', lineHeight: 1 }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
          {MONTHS_FULL[nav.month]} {nav.year}
        </span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: 8, fontSize: '1rem', lineHeight: 1 }}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 10px' }}>
        {WEEK_DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 10px 14px', gap: '2px 0' }}>
        {grid.map((cell, i) => {
          const isSelected = cell.iso === value;
          const isToday    = cell.iso === today;
          const isPast     = cell.iso < today;
          return (
            <button key={i} onClick={() => { onChange(cell.iso); onClose(); }}
              style={{
                width: 36, height: 36, margin: '0 auto', borderRadius: '50%', border: 'none',
                background: isSelected ? 'var(--accent)' : isToday ? 'var(--accent-glow)' : 'transparent',
                color: isSelected ? '#fff' : isToday ? 'var(--accent)' : !cell.cur ? 'var(--text-muted)' : isPast ? 'var(--text-secondary)' : 'var(--text-primary)',
                fontSize: '0.82rem', fontWeight: isSelected || isToday ? 700 : 400,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                outline: isToday && !isSelected ? '1px solid var(--accent)' : 'none',
                transition: 'all 0.1s ease',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isToday ? 'var(--accent-glow)' : 'transparent'; }}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => { onChange(''); onClose(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.78rem', fontWeight: 600, padding: '4px 0' }}>
          Clear date
        </button>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600, padding: '4px 0' }}>
          Cancel
        </button>
      </div>
    </motion.div>
  );
}


const PRI_ORDER = { high: 0, medium: 1, low: 2, none: 3 };

const SORT_OPTIONS = [
  { value: 'due',      label: 'Due Date'  },
  { value: 'priority', label: 'Priority'  },
  { value: 'created',  label: 'Created'   },
  { value: 'az',       label: 'A → Z'     },
];
const LS_SORT_KEY = 'focusly_task_sort';

function fmtTime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function fmtDue(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dateStr + 'T00:00:00');
  const diff  = Math.round((due - today) / 86400000);
  if (diff < 0) {
    const label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { text: label, overdue: true, color: '#ef4444', fontWeight: 600 };
  }
  if (diff === 0) return { text: 'Today',    overdue: false, color: '#f59e0b', fontWeight: 600 };
  if (diff === 1) return { text: 'Tomorrow', overdue: false, color: '#f59e0b', fontWeight: 600 };
  if (diff <= 7)  return { text: `In ${diff} days`, overdue: false, color: 'var(--text-secondary)', fontWeight: 500 };
  return {
    text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    overdue: false, color: 'var(--text-secondary)', fontWeight: 500,
  };
}

// Returns local-date today as YYYY-MM-DD — kept consistent with fmtDue's local-time logic
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// normalise display name
function displayName(name) {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\b(\w+)\b/g, (w, match, offset) => {
    if (w.length > 1 && w === w.toUpperCase()) return w; // keep all-caps acronyms intact
    if (offset === 0) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }
    if (w.length > 1 && w.slice(1) !== w.slice(1).toLowerCase()) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }
    return w;
  });
}

const ALL_CATS_STATIC = Object.keys(CAT_META);

function TaskRow({
  task,
  isDone,
  activeTaskId,
  timerRunning,
  confirmDeleteId,
  setConfirmDeleteId,
  kebabOpenId,
  setKebabOpenId,
  openDetail,
  onToggle,
  onDelete,
  onQuickUpdate,
  onUpdate,
  setShowDatePicker,
  ALL_CATS,
  handleNewList,
}) {
  const meta = CAT_META[task.category] ?? CAT_META.work;
  const isActive = task.id === activeTaskId;
  const isConfirming = confirmDeleteId === task.id;
  const due = fmtDue(task.dueDate);
  const isOverdue = !isDone && due?.overdue;
  const priColor = !isDone && task.priority !== 'none' ? (PRI_META[task.priority]?.color ?? null) : null;
  const cardBorderLeft = priColor ? `4px solid ${priColor}` : '4px solid transparent';

  return (
    <motion.div
      key={task.id}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`linear-task-row${isActive ? ' task-active' : ''}${isDone ? ' item-completed' : ''}`}
      onClick={() => { if (!isConfirming) openDetail(task); }}
      title={timerRunning && !isActive && !isConfirming ? 'Pause timer to switch tasks' : undefined}
      style={{ borderLeft: cardBorderLeft }}
    >
      {isConfirming ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0 8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Delete this task?</span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="button" style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
              onClick={e => { e.stopPropagation(); onDelete(task.id); setConfirmDeleteId(null); }}>Yes</button>
            <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', padding: 0 }}
              onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {/* Checkbox */}
          <div
            className={`linear-checkbox${isDone ? ' checked' : ''}`}
            onClick={e => { e.stopPropagation(); onToggle(task.id); }}
            aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
          >
            {isDone ? '✓' : ''}
          </div>

          {/* Task Title (Flexible width, wins layout fight) */}
          <div className="linear-task-title-container">
            <span className="linear-task-title" title={task.name}>{displayName(task.name)}</span>
          </div>

          {/* Inline Icons (recurrence, subtasks, attachments, notes, time logged, pomodoros, conflict) */}
          <div className="linear-task-icons">
            {task.recurrence && (
              <span className="linear-inline-meta" title={`Repeats ${task.recurrence}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9"/>
                  <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <polyline points="7 23 3 19 7 15"/>
                  <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
              </span>
            )}
            {task.subtasks?.length > 0 && (
              <span className="linear-inline-meta" title={`Subtasks: ${task.subtasks.filter(s => s.completed).length}/${task.subtasks.length}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                </svg>
                <span>{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
              </span>
            )}
            {task.attachments?.length > 0 && (
              <span className="linear-inline-meta" title={`${task.attachments.length} attachment${task.attachments.length > 1 ? 's' : ''}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
                <span>{task.attachments.length}</span>
              </span>
            )}
            {task.timeLogged > 0 && (
              <span className="linear-inline-meta" title={`Time logged: ${fmtTime(task.timeLogged)}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span>{fmtTime(task.timeLogged)}</span>
              </span>
            )}
            {task.pomodorosCompleted > 0 && (
              <span className="linear-inline-meta" title={`Pomodoros completed: ${task.pomodorosCompleted}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/>
                </svg>
                <span>{task.pomodorosCompleted}</span>
              </span>
            )}
            {task.notes && (
              <span className="linear-inline-meta tc-notes-icon" title={task.notes.length > 120 ? task.notes.slice(0, 120) + '…' : task.notes} aria-label="Has notes">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </span>
            )}
            {task.syncConflict && (
              <span className="linear-inline-meta" style={{ color: 'var(--color-amber, #f59e0b)' }} title={task.syncConflict}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>Conflict</span>
              </span>
            )}
          </div>

          {/* Category (Small muted badge, lower visual weight) */}
          <div className="linear-task-cat">
            <span className="linear-cat-badge">
              <span className="linear-cat-badge-dot" style={{ background: meta.color }} />
              {meta.label}
            </span>
          </div>

          {/* Date (Left-aligned plain text in fixed-width column with urgency coloring) */}
          <div className="linear-task-due" style={{ color: !isDone ? due?.color : undefined, fontWeight: !isDone ? due?.fontWeight : undefined }}>
            {due ? due.text : ''}
          </div>

          {/* Actions (Star & Kebab menu, shrunk to fit row height) */}
          <div className="linear-task-actions">
            {/* Star Button */}
            <button
              type="button"
              className="linear-action-btn star-btn"
              style={{ color: task.starred ? 'var(--color-amber, #f59e0b)' : 'var(--text-secondary)' }}
              onClick={e => { e.stopPropagation(); (onQuickUpdate || onUpdate)({ ...task, starred: !task.starred }); }}
              aria-label={task.starred ? 'Unstar task' : 'Star task'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={task.starred ? 'var(--color-amber, #f59e0b)' : 'none'} stroke={task.starred ? 'var(--color-amber, #f59e0b)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>

            {/* Kebab Menu Button */}
            <button
              type="button"
              className="linear-action-btn kebab-btn"
              style={{ background: kebabOpenId === task.id ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-secondary)' }}
              onClick={e => { e.stopPropagation(); setKebabOpenId(kebabOpenId === task.id ? null : task.id); }}
              aria-label="More actions"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
              </svg>
            </button>

            {/* Dropdown Menu */}
            {kebabOpenId === task.id && (
              <div
                className="kebab-dropdown-menu"
                style={{
                  position: 'absolute', top: 32, right: 0, zIndex: 100, width: 220,
                  background: '#0f172a', border: '1px solid var(--border-strong)',
                  borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.2)', padding: '8px 0',
                  display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left',
                  color: '#f8fafc', fontSize: '0.9rem'
                }}
              >
                <button
                  type="button"
                  className="kebab-menu-item"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'transparent', border: 'none', color: '#f8fafc', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                  onClick={e => { e.stopPropagation(); setKebabOpenId(null); openDetail(task); setTimeout(() => setShowDatePicker(true), 120); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Add deadline
                </button>
                <button
                  type="button"
                  className="kebab-menu-item"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'transparent', border: 'none', color: '#f8fafc', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                  onClick={e => { e.stopPropagation(); setKebabOpenId(null); openDetail(task); setTimeout(() => { const el = document.getElementById('subtask-input'); el?.focus(); }, 100); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
                  Add a subtask
                </button>
                <button
                  type="button"
                  className="kebab-menu-item"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'transparent', border: 'none', color: '#f8fafc', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                  onClick={e => { e.stopPropagation(); setKebabOpenId(null); openDetail(task); setTimeout(() => { const el = document.getElementById('attachment-input'); el?.click(); }, 100); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  Add attachment
                </button>
                <button
                  type="button"
                  className="kebab-menu-item"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'transparent', border: 'none', color: '#f8fafc', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                  onClick={e => { e.stopPropagation(); setKebabOpenId(null); setConfirmDeleteId(task.id); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  Delete
                </button>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />

                {/* List selection */}
                {ALL_CATS.map(catKey => {
                  const isCur = task.category === catKey;
                  return (
                    <button
                      key={catKey}
                      type="button"
                      className="kebab-menu-item"
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'transparent', border: 'none', color: '#f8fafc', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                      onClick={e => { e.stopPropagation(); setKebabOpenId(null); (onQuickUpdate || onUpdate)({ ...task, category: catKey }); }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isCur && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </span>
                      {CAT_META[catKey]?.label}
                    </button>
                  );
                })}

                <button
                  type="button"
                  className="kebab-menu-item"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: 'transparent', border: 'none', color: '#f8fafc', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                  onClick={e => { e.stopPropagation(); handleNewList(task); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  New list
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

export default function TaskList({ tasks, activeTaskId, timerRunning, onSelect, onToggle, onDelete, onClearCompleted, onAdd, onAddTask, onEdit, onUpdate, onQuickUpdate, syncStatus, onSyncNow }) {
  const [customCats, setCustomCats] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('focusly_custom_categories') || '{}');
      Object.assign(CAT_META, saved);
      return saved;
    } catch (e) { return {}; }
  });
  const ALL_CATS = useMemo(() => Object.keys(CAT_META), [customCats]);
  const [kebabOpenId,     setKebabOpenId]     = useState(null);
  const [catFilter,       setCatFilter]       = useState('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showCompleted,   setShowCompleted]   = useState(false);
  const [sortBy,          setSortBy]          = useState(() => localStorage.getItem(LS_SORT_KEY) || 'created');
  const [sortOpen,        setSortOpen]        = useState(false);
  const [query,           setQuery]           = useState('');
  const [detailTask,      setDetailTask]      = useState(null); // original snapshot
  const [local,           setLocal]           = useState(null); // editable copy
  const [savedFeedback,   setSavedFeedback]   = useState(false);
  const [catOpen,         setCatOpen]         = useState(false);
  const [inlineAddCat,    setInlineAddCat]    = useState(null);
  const [inlineAddText,   setInlineAddText]   = useState('');
  const sortRef      = useRef(null);
  const searchRef    = useRef(null);
  const savedTimerRef = useRef(null);
  const titleRef     = useRef(null);
  const notesRef     = useRef(null);
  const catMenuRef       = useRef(null);
  const datePickerRef    = useRef(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Close calendar picker on outside click
  useEffect(() => {
    if (!showDatePicker) return;
    const handler = (e) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDatePicker]);

  const handleNewList = (taskToMove) => {
    const name = prompt('Enter new list name:');
    if (!name || !name.trim()) return;
    const label = name.trim();
    const key = label.toLowerCase().replace(/\s+/g, '_');
    if (!CAT_META[key]) {
      const colors = ['#8b5cf6', '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#ec4899'];
      const color = colors[Object.keys(CAT_META).length % colors.length];
      CAT_META[key] = { label, color };
      const updatedCustom = { ...customCats, [key]: { label, color } };
      localStorage.setItem('focusly_custom_categories', JSON.stringify(updatedCustom));
      setCustomCats(updatedCustom);
    }
    if (taskToMove) {
      (onQuickUpdate || onUpdate)({ ...taskToMove, category: key });
    }
    setKebabOpenId(null);
  };

  // Close kebab dropdown on outside click
  useEffect(() => {
    if (!kebabOpenId) return;
    const h = () => setKebabOpenId(null);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [kebabOpenId]);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return;
    const handler = e => { if (!sortRef.current?.contains(e.target)) setSortOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortOpen]);

  // Close detail panel if the task is deleted externally
  useEffect(() => {
    if (detailTask && !tasks.find(t => t.id === detailTask.id)) {
      setDetailTask(null); setLocal(null);
    }
  }, [tasks, detailTask]);

  // Escape key closes panel
  useEffect(() => {
    if (!detailTask) return;
    const handler = e => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailTask, local]);

  // Close category dropdown on outside click
  useEffect(() => {
    if (!catOpen) return;
    const h = e => { if (!catMenuRef.current?.contains(e.target)) setCatOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [catOpen]);

  // Auto-focus title + sync notes height whenever a task opens in the panel
  useEffect(() => {
    if (!detailTask?.id) return;
    const t = setTimeout(() => titleRef.current?.focus(), 30);
    if (notesRef.current) {
      notesRef.current.style.height = 'auto';
      notesRef.current.style.height = notesRef.current.scrollHeight + 'px';
    }
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailTask?.id]);

  const showSaved = () => {
    setSavedFeedback(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedFeedback(false), 1500);
  };

  // Immediately persist a field change and show inline feedback
  const saveField = (key, value) => {
    const updated = { ...local, [key]: value };
    setLocal(updated);
    (onQuickUpdate || onUpdate)(updated);
    showSaved();
  };

  const openDetail = (task) => {
    setDetailTask(task);
    setLocal({ ...task });
    setCatOpen(false);
  };

  const closePanel = () => {
    if (local && detailTask && local.name.trim()) {
      const changed = local.name !== detailTask.name
        || local.priority !== detailTask.priority
        || local.category !== detailTask.category
        || local.dueDate  !== detailTask.dueDate
        || (local.notes  || '') !== (detailTask.notes  || '');
      if (changed) (onQuickUpdate || onUpdate)(local);
    }
    setDetailTask(null);
    setLocal(null);
    setCatOpen(false);
  };

  const handleInlineAdd = (cat) => {
    if (inlineAddText.trim()) {
      if (onAddTask) {
        onAddTask({
          name: inlineAddText.trim(),
          category: cat,
          priority: 'none',
          timeEstimate: 25,
          notes: '',
          dueDate: '',
          recurrence: null,
          recurrenceDays: []
        });
      } else {
        onAdd();
      }
    }
    setInlineAddCat(null);
    setInlineAddText('');
  };

  const _today = todayISO();
  const overdueFront = t => (t.dueDate && t.dueDate < _today) ? -1 : PRI_ORDER[t.priority] ?? 3;

  const sortFns = {
    due:      (a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    },
    priority: (a, b) => overdueFront(a) - overdueFront(b)
                      || new Date(b.createdAt) - new Date(a.createdAt),
    created:  (a, b) => overdueFront(a) - overdueFront(b)
                      || new Date(b.createdAt) - new Date(a.createdAt),
    az:       (a, b) => a.name.localeCompare(b.name),
  };

  const { pending, completed } = useMemo(() => {
    let base = catFilter === 'all' ? tasks : tasks.filter(t => t.category === catFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      base = base.filter(t => t.name.toLowerCase().includes(q));
    }
    // Sort applies to pending only; completed stays newest-completedAt-first
    const pendingSorted   = base.filter(t => t.status === 'needsAction' || (!t.status && !t.completed)).sort(sortFns[sortBy]);
    const completedSorted = base.filter(t => t.status === 'completed' || (!t.status && t.completed))
                                .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));
    return { pending: pendingSorted, completed: completedSorted };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, catFilter, sortBy, query]);

  const pendingCount = tasks.filter(t => t.status === 'needsAction' || (!t.status && !t.completed)).length;

  // Count pending tasks per category (always from full task list, ignoring current filter)
  const catCounts = useMemo(() => {
    const c = {};
    tasks.forEach(t => {
      if (t.status === 'needsAction' || (!t.status && !t.completed)) c[t.category] = (c[t.category] || 0) + 1;
    });
    return c;
  }, [tasks]);

  const renderTask = (task, isDone) => (
    <TaskRow
      key={task.id}
      task={task}
      isDone={isDone}
      activeTaskId={activeTaskId}
      timerRunning={timerRunning}
      confirmDeleteId={confirmDeleteId}
      setConfirmDeleteId={setConfirmDeleteId}
      kebabOpenId={kebabOpenId}
      setKebabOpenId={setKebabOpenId}
      openDetail={openDetail}
      onToggle={onToggle}
      onDelete={onDelete}
      onQuickUpdate={onQuickUpdate}
      onUpdate={onUpdate}
      setShowDatePicker={setShowDatePicker}
      ALL_CATS={ALL_CATS}
      handleNewList={handleNewList}
    />
  );

  return (
    <div className="task-list-panel today-3col-container" style={{ background: 'transparent', border: 'none', gap: 10 }}>
      
      <style>{`@keyframes customSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* ── UNIFIED COMPACT TOOLBAR: Search → Sort → Filter → Overview → Sync ── */}
      <div className="yartu-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, padding: '10px 16px', width: '100%', boxSizing: 'border-box', flexShrink: 0 }}>

        {/* 1. Search — grows to fill */}
        <div className="task-search-wrap" style={{ position: 'relative', flex: 1, minWidth: 150, maxWidth: 280 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={searchRef}
            className="task-search-input"
            style={{ width: '100%', height: 34, padding: '0 10px 0 28px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
            type="text"
            placeholder="Search tasks..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search tasks"
          />
          {query && (
            <button style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, display: 'flex' }} onClick={() => { setQuery(''); searchRef.current?.focus(); }} aria-label="Clear search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        {/* 2. Sort button */}
        <div className="sort-dropdown" ref={sortRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            style={{ display: 'flex', alignItems: 'center', gap: 5, height: 34, padding: '0 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', boxSizing: 'border-box', whiteSpace: 'nowrap' }}
            onClick={() => setSortOpen(o => !o)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10M3 12h7M3 16h4M17 8v8M14 5l3-3 3 3M14 19l3 3 3-3"/>
            </svg>
            {SORT_OPTIONS.find(o => o.value === sortBy)?.label ?? 'Sort'}
          </button>
          {sortOpen && (
            <div className="sort-menu" style={{ position: 'absolute', top: 40, left: 0, zIndex: 200, background: 'var(--bg-elevated, #0f172a)', border: '1px solid var(--border-strong)', borderRadius: '10px', padding: '6px 0', width: '160px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
              {SORT_OPTIONS.map(opt => {
                const isActive = sortBy === opt.value;
                return (
                  <button
                    key={opt.value}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', width: '100%', background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'left' }}
                    onClick={() => { setSortBy(opt.value); localStorage.setItem(LS_SORT_KEY, opt.value); setSortOpen(false); }}
                    onMouseEnter={e => !isActive && (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => !isActive && (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>{opt.label}</span>
                    {isActive && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Category filter dropdown */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <select
            className="task-cat-select"
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            style={{ color: catFilter !== 'all' ? (CAT_META[catFilter]?.color ?? 'var(--text-primary)') : 'var(--text-primary)' }}
          >
            <option value="all">All Tasks ({tasks.filter(t => t.status === 'needsAction' || (!t.status && !t.completed)).length})</option>
            {ALL_CATS.map(cat => {
              const meta = CAT_META[cat];
              const count = catCounts[cat] || 0;
              if (!count && catFilter !== cat) return null;
              return <option key={cat} value={cat}>{meta.label} ({count})</option>;
            })}
          </select>
          <svg style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        {/* 4. Overview stats — right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{pendingCount}</span>
            <span>pending</span>
          </span>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontWeight: 700, color: '#10b981' }}>{completed.length}</span>
            <span>done</span>
          </span>
        </div>

        {/* 5. Sync button — far right */}
        <div style={{ flexShrink: 0 }}>
          {syncStatus === 'Syncing...' ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#6366f1' }}>
              <svg style={{ animation: 'customSpin 1s linear infinite', width: 13, height: 13 }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"></circle>
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Syncing
            </span>
          ) : syncStatus === 'Not connected' ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#64748b', display: 'inline-block' }} />
              Offline
            </span>
          ) : (
            <button
              type="button"
              onClick={onSyncNow}
              title="Sync Now"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: '1px solid var(--border)', borderRadius: '7px', color: '#6366f1', cursor: 'pointer', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600 }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              {syncStatus.startsWith('Sync failed') ? 'Retry' : 'Sync'}
            </button>
          )}
        </div>

      </div>

      {/* ── STACKED TASK MANAGEMENT DASHBOARD ── */}
      <div className="tasks-stacked-layout" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0, flex: 1, minHeight: 0 }}>

        {/* 1. PENDING TASKS (FULL WIDTH) */}
        <div className="yartu-card" style={{ width: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: '12px 16px', gap: 8, flex: 1, minHeight: 0 }}>
          <div className="yartu-card-hdr">
            <span className="yartu-card-title">Pending Tasks ({pending.length})</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="yartu-card-action" onClick={() => { setInlineAddCat('top'); setInlineAddText(''); }}>＋ Quick Add</button>
              <button style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '0 14px', height: 30, borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 2px 8px rgba(99,102,241,0.25)' }} onClick={onAdd}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Task
              </button>
            </div>
          </div>
          <div className="yartu-list" style={{ padding: '4px 0 0 0', flex: 1, minHeight: 0, gap: 0, overflowY: 'auto' }}>
            
            {/* Quick Add Input */}
            {inlineAddCat === 'top' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-base)', padding: '12px 18px', borderRadius: '12px', border: '1px solid #6366f1', boxShadow: '0 4px 12px rgba(99,102,241,0.1)', marginBottom: 8 }}>
                <input
                  autoFocus
                  type="text"
                  value={inlineAddText}
                  onChange={e => setInlineAddText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleInlineAdd(catFilter === 'all' ? 'work' : catFilter);
                    } else if (e.key === 'Escape') {
                      setInlineAddCat(null);
                      setInlineAddText('');
                    }
                  }}
                  onBlur={() => handleInlineAdd(catFilter === 'all' ? 'work' : catFilter)}
                  placeholder={`Add a task to ${catFilter === 'all' ? 'Work' : CAT_META[catFilter]?.label}...`}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '100%', outline: 'none', fontSize: '0.95rem' }}
                />
              </div>
            )}

            <div className="linear-task-list-container">
              {pending.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-faint)', background: 'var(--bg-base)', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.95rem' }}>
                  No pending tasks in this view. Click "＋ Quick Add" above to create one!
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {pending.map(task => renderTask(task, false))}
                </AnimatePresence>
              )}
            </div>

          </div>
        </div>

        {/* 2. COMPLETED TASKS (FULL WIDTH) */}
        <div className="yartu-card" style={{ width: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', padding: '12px 16px', gap: 8 }}>
          <div className="yartu-card-hdr">
            <span className="yartu-card-title">Completed ({completed.length})</span>
            {completed.length > 0 && (
              <button className="yartu-card-action" onClick={onClearCompleted} style={{ color: '#ef4444' }}>Clear all</button>
            )}
          </div>
          <div className="yartu-list" style={{ padding: '8px 0 0 0' }}>
            {completed.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem', background: 'var(--bg-base)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                No completed tasks yet
              </div>
            ) : (
              <div className="linear-task-list-container">
                <AnimatePresence initial={false}>
                  {completed.map(task => renderTask(task, true))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Task detail panel (portalled to body to escape framer-motion transform ancestor) ── */}
      {createPortal(
        <>
          {detailTask && <div className="task-detail-backdrop" onClick={closePanel} />}
          <div className={`task-detail-panel${detailTask ? ' tdp-open' : ''}`} aria-hidden={!detailTask}>
        {local && (
          <>
            <div className="tdp-header">
              <span className="tdp-heading">Task Details</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {savedFeedback && (
                  <span className="tdp-saved-badge">
                    <TdpIconCheck />
                    Saved
                  </span>
                )}
                <button className="tdp-close-btn" onClick={closePanel} aria-label="Close">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className="tdp-body">
              {/* Sync Conflict Resolution */}
              {local.syncConflict && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid #f59e0b', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: 4 }}>⚠️ Sync Conflict</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 8 }}>{local.syncConflict}</div>
                  <button
                    type="button"
                    style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '4px 12px', borderRadius: 6, fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}
                    onClick={() => {
                      const updated = { ...local, syncConflict: null, updatedAt: new Date().toISOString() };
                      setLocal(updated);
                      (onQuickUpdate || onUpdate)(updated);
                    }}
                  >
                    Dismiss & Keep Local
                  </button>
                </div>
              )}

              {/* Title */}
              <div className="tdp-field">
                <label className="tdp-label">Title</label>
                <input
                  ref={titleRef}
                  className="tdp-title-input"
                  value={local.name || ''}
                  onChange={e => setLocal({ ...local, name: e.target.value })}
                  onBlur={() => {
                    if ((local.name || '').trim() && local.name !== detailTask.name) {
                      (onQuickUpdate || onUpdate)(local);
                      showSaved();
                    }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                  placeholder="Task title"
                />
              </div>

              {/* Priority */}
              <div className="tdp-field">
                <label className="tdp-label">Priority</label>
                <div className="tdp-pri-pills">
                  {['none', 'high', 'medium', 'low'].map(p => {
                    const isActive = local.priority === p;
                    const pc = PRI_META[p]?.color;
                    return (
                      <button
                        key={p}
                        className="tdp-pri-pill"
                        style={isActive ? { background: pc, color: '#fff', borderColor: pc } : {}}
                        onClick={() => saveField('priority', p)}
                      >
                        {PRI_META[p].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category */}
              <div className="tdp-field">
                <label className="tdp-label">Category</label>
                <div className="tdp-cat-select" ref={catMenuRef}>
                  <button
                    type="button"
                    className={`tdp-cat-trigger${catOpen ? ' tdp-cat-open' : ''}`}
                    onClick={() => setCatOpen(o => !o)}
                  >
                    <span style={{ color: CAT_META[local.category]?.color }}>
                      {CAT_META[local.category]?.label}
                    </span>
                    <TdpIconChevron />
                  </button>
                  {catOpen && (
                    <div className="tdp-cat-menu">
                      {Object.entries(CAT_META).map(([key, meta]) => (
                        <button
                          key={key}
                          type="button"
                          className={`tdp-cat-option${local.category === key ? ' tdp-cat-active' : ''}`}
                          onClick={() => { saveField('category', key); setCatOpen(false); }}
                        >
                          <span className="tdp-cat-dot" style={{ background: meta.color }} />
                          {meta.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Due Date */}
              <div className="tdp-field">
                <label className="tdp-label">Due Date</label>
                <div ref={datePickerRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(p => !p)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'var(--bg-input)', border: `1px solid ${showDatePicker ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)', padding: '9px 12px', cursor: 'pointer',
                      color: local.dueDate ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontSize: '0.875rem', fontWeight: local.dueDate ? 600 : 400,
                      transition: 'border-color 0.13s ease', gap: 8,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: local.dueDate ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}>
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      {local.dueDate
                        ? new Date(local.dueDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Pick a date'}
                    </span>
                    {local.dueDate && (
                      <span
                        role="button"
                        onClick={e => { e.stopPropagation(); saveField('dueDate', ''); setShowDatePicker(false); }}
                        title="Clear"
                        style={{ color: '#ef4444', fontSize: '1rem', lineHeight: 1, padding: '0 2px', cursor: 'pointer' }}
                      >×</span>
                    )}
                  </button>
                  <AnimatePresence>
                    {showDatePicker && (
                      <CalendarDatePicker
                        value={local.dueDate || ''}
                        onChange={v => { saveField('dueDate', v); }}
                        onClose={() => setShowDatePicker(false)}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Recurrence */}
              <div className="tdp-field">
                <label className="tdp-label">Repeat</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { value: null,       label: 'None'     },
                    { value: 'daily',    label: 'Daily'    },
                    { value: 'weekdays', label: 'Weekdays' },
                    { value: 'weekly',   label: 'Weekly'   },
                    { value: 'monthly',  label: 'Monthly'  },
                    { value: 'custom',   label: 'Custom'   },
                  ].map(opt => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => saveField('recurrence', opt.value)}
                      style={{
                        padding: '5px 13px', borderRadius: 20, border: '1px solid',
                        borderColor: local.recurrence === opt.value ? 'var(--accent)' : 'var(--border)',
                        background:  local.recurrence === opt.value ? 'var(--accent-glow)' : 'transparent',
                        color:       local.recurrence === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                        fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.13s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {local.recurrence === 'custom' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    {['S','M','T','W','T','F','S'].map((lbl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const days = (local.recurrenceDays || []).includes(i)
                            ? (local.recurrenceDays || []).filter(d => d !== i)
                            : [...(local.recurrenceDays || []), i].sort((a,b) => a-b);
                          saveField('recurrenceDays', days);
                        }}
                        style={{
                          width: 32, height: 32, borderRadius: '50%', border: '1px solid',
                          borderColor: (local.recurrenceDays||[]).includes(i) ? 'var(--accent)' : 'var(--border)',
                          background:  (local.recurrenceDays||[]).includes(i) ? 'var(--accent)'  : 'transparent',
                          color:       (local.recurrenceDays||[]).includes(i) ? '#fff'           : 'var(--text-muted)',
                          fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.13s ease',
                        }}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}
                {local.recurrence && local.recurrence !== null && (
                  <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>🔁</span>
                    <span>Repeats {local.recurrence}{local.dueDate ? ` · next: ${new Date(local.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
                  </div>
                )}
              </div>

              {/* Subtasks */}
              <div className="tdp-field">
                <label className="tdp-label">Subtasks</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  {(local.subtasks || []).map(sub => (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                      <button
                        type="button"
                        style={{ background: 'transparent', border: '1px solid ' + (sub.completed ? '#10b981' : '#64748b'), width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#10b981', padding: 0 }}
                        onClick={() => {
                          const nextSubs = (local.subtasks || []).map(s => s.id === sub.id ? { ...s, completed: !s.completed, updatedAt: new Date().toISOString() } : s);
                          saveField('subtasks', nextSubs);
                        }}
                      >
                        {sub.completed && <TdpIconCheck />}
                      </button>
                      <input
                        type="text"
                        value={sub.text}
                        onChange={e => {
                          const nextSubs = (local.subtasks || []).map(s => s.id === sub.id ? { ...s, text: e.target.value, updatedAt: new Date().toISOString() } : s);
                          setLocal({ ...local, subtasks: nextSubs });
                        }}
                        onBlur={() => {
                          (onQuickUpdate || onUpdate)(local);
                          showSaved();
                        }}
                        style={{ background: 'transparent', border: 'none', color: sub.completed ? 'var(--text-secondary)' : '#fff', textDecoration: sub.completed ? 'line-through' : 'none', width: '100%', outline: 'none', fontSize: '0.85rem' }}
                      />
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                        onClick={() => {
                          if (sub.googleTaskId) {
                            const delStr = localStorage.getItem('focusly_deleted_tasks');
                            let deletedIds = delStr ? JSON.parse(delStr) : [];
                            if (!deletedIds.includes(sub.googleTaskId)) {
                              deletedIds.push(sub.googleTaskId);
                              localStorage.setItem('focusly_deleted_tasks', JSON.stringify(deletedIds));
                            }
                          }
                          const nextSubs = (local.subtasks || []).filter(s => s.id !== sub.id);
                          saveField('subtasks', nextSubs);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <input
                    id="subtask-input"
                    type="text"
                    placeholder="Add a subtask..."
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        const newSub = { id: Date.now().toString(), text: e.target.value.trim(), completed: false, updatedAt: new Date().toISOString() };
                        saveField('subtasks', [...(local.subtasks || []), newSub]);
                        e.target.value = '';
                      }
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Attachments */}
              <div className="tdp-field">
                <label className="tdp-label">Attachments</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  {(local.attachments || []).map(att => (
                    <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        <span style={{ color: '#e2e8f0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{att.name}</span>
                      </div>
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                        onClick={() => {
                          const nextAtts = (local.attachments || []).filter(a => a.id !== att.id);
                          saveField('attachments', nextAtts);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: '0.85rem', color: '#94a3b8', transition: 'all 0.15s ease' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>Add attachment file...</span>
                  <input
                    id="attachment-input"
                    type="file"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const newAtt = { id: Date.now().toString(), name: file.name, size: file.size };
                        saveField('attachments', [...(local.attachments || []), newAtt]);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
              </div>

              {/* Notes */}
              <div className="tdp-field">
                <label className="tdp-label">Notes</label>
                <textarea
                  ref={notesRef}
                  className="tdp-notes"
                  value={local.notes || ''}
                  onChange={e => {
                    setLocal({ ...local, notes: e.target.value });
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  onBlur={() => {
                    const cur = local.notes || '', orig = detailTask.notes || '';
                    if (cur !== orig) { (onQuickUpdate || onUpdate)(local); showSaved(); }
                  }}
                  placeholder="Add notes..."
                />
              </div>

              {/* Created */}
              <div className="tdp-created">
                Created {new Date(detailTask.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>

            <div className="tdp-footer">
              <button
                type="button"
                className="tdp-delete-btn"
                onClick={() => { onDelete(local.id); setDetailTask(null); setLocal(null); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                Delete
              </button>
              <button
                type="button"
                className="tdp-save-btn"
                onClick={() => {
                  (onQuickUpdate || onUpdate)(local);
                  closePanel();
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Save / Done
              </button>
            </div>
          </>
        )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ─── Panel-local icons (prefixed to avoid collisions) ────────────────
function TdpIconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function TdpIconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}
