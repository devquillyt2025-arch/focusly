import { useState, useMemo, useRef, useEffect } from 'react';

export const CAT_META = {
  learning: { label: 'Learning', color: '#6366f1' },
  fitness:  { label: 'Fitness',  color: '#10b981' },
  mental:   { label: 'Mental',   color: '#f59e0b' },
  work:     { label: 'Work',     color: '#3b82f6' },
  growth:   { label: 'Growth',   color: '#ec4899' },
};

const PRI_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#64748b', none: 'transparent' };
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
    return { text: `Overdue · ${label}`, overdue: true,  color: '#ef4444' };
  }
  if (diff === 0) return { text: 'Due today',    overdue: false, color: '#f59e0b' };
  if (diff === 1) return { text: 'Due tomorrow', overdue: false, color: '#94a3b8' };
  if (diff <= 7)  return { text: `In ${diff} days`, overdue: false, color: '#94a3b8' };
  return {
    text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    overdue: false, color: '#64748b',
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
  const catMenuRef   = useRef(null);
  const dateInputRef = useRef(null);

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
    created:  (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    az:       (a, b) => a.name.localeCompare(b.name),
  };

  const { pending, completed } = useMemo(() => {
    let base = catFilter === 'all' ? tasks : tasks.filter(t => t.category === catFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      base = base.filter(t => t.name.toLowerCase().includes(q));
    }
    // Sort applies to pending only; completed stays newest-completedAt-first
    const pendingSorted   = base.filter(t => !t.completed).sort(sortFns[sortBy]);
    const completedSorted = base.filter(t =>  t.completed)
                                .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));
    return { pending: pendingSorted, completed: completedSorted };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, catFilter, sortBy, query]);

  const pendingCount = tasks.filter(t => !t.completed).length;

  // Count pending tasks per category (always from full task list, ignoring current filter)
  const catCounts = useMemo(() => {
    const c = {};
    for (const t of tasks) {
      if (!t.completed) c[t.category] = (c[t.category] || 0) + 1;
    }
    return c;
  }, [tasks]);

  const renderTask = (task, isDone) => {
    const meta        = CAT_META[task.category] ?? CAT_META.work;
    const isActive    = task.id === activeTaskId;
    const isConfirming = confirmDeleteId === task.id;
    const due         = fmtDue(task.dueDate);
    const isOverdue   = !isDone && due?.overdue;

    return (
      <div
        key={task.id}
        className={`sunsama-item${isActive ? ' task-active' : ''}${isDone ? ' item-completed sunsama-check-anim' : ''}${isOverdue ? ' task-overdue' : ''}`}
        onClick={() => { if (!isConfirming) openDetail(task); }}
        title={timerRunning && !isActive && !isConfirming ? 'Pause timer to switch tasks' : undefined}
      >
        {isConfirming ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0 8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Delete this task?</span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                onClick={e => { e.stopPropagation(); onDelete(task.id); setConfirmDeleteId(null); }}>Yes</button>
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', padding: 0 }}
                onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="sunsama-item-left">
              <div
                className={`sunsama-checkbox${isDone ? ' checked' : ''}`}
                onClick={e => { e.stopPropagation(); onToggle(task.id); }}
                aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
              >
                {isDone ? '✓' : ''}
              </div>

              <div className="sunsama-item-content">
                <div className="sunsama-item-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {task.priority && task.priority !== 'none' && (
                    <span className="pri-dot" style={{ background: PRI_COLOR[task.priority] ?? 'transparent', width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} title={task.priority} />
                  )}
                  <span>{displayName(task.name)}</span>
                </div>
                {task.notes && <div className="sunsama-item-notes">{task.notes}</div>}
                <div className="sunsama-item-meta">
                  <span className="sunsama-meta-tag" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  {task.recurrence && (
                    <span className="sunsama-meta-text">
                      🔁 {task.recurrence}
                    </span>
                  )}
                  {task.subtasks?.length > 0 && (
                    <span className="sunsama-meta-text">
                      ☑️ {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
                    </span>
                  )}
                  {task.attachments?.length > 0 && (
                    <span className="sunsama-meta-text">
                      📎 {task.attachments.length}
                    </span>
                  )}
                  {task.timeLogged > 0 && <span className="sunsama-meta-text">⏱ {fmtTime(task.timeLogged)}</span>}
                  {task.pomodorosCompleted > 0 && <span className="sunsama-meta-text">🍅 {task.pomodorosCompleted}</span>}
                  {due && (
                    <span className="sunsama-meta-text" style={{
                      color: due.color,
                      ...(due.overdue ? { color: '#ef4444', fontWeight: '600' } : {}),
                    }}>
                      {due.text}
                    </span>
                  )}
                  {task.syncConflict && (
                    <span className="sunsama-meta-text" style={{ color: '#f59e0b' }} title={task.syncConflict}>
                      ⚠️ Sync Conflict
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="sunsama-item-right" style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
              {/* Star Button */}
              <button
                className="task-action-btn star-btn"
                style={{ background: 'transparent', border: 'none', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: task.starred ? '#f59e0b' : 'var(--text-secondary)' }}
                onClick={e => { e.stopPropagation(); (onQuickUpdate || onUpdate)({ ...task, starred: !task.starred }); }}
                aria-label={task.starred ? 'Unstar task' : 'Star task'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={task.starred ? '#f59e0b' : 'none'} stroke={task.starred ? '#f59e0b' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </button>

              {/* Kebab Menu Button */}
              <button
                className="task-action-btn kebab-btn"
                style={{ background: kebabOpenId === task.id ? 'var(--bg-surface)' : 'transparent', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                onClick={e => { e.stopPropagation(); setKebabOpenId(kebabOpenId === task.id ? null : task.id); }}
                aria-label="More actions"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    onClick={e => { e.stopPropagation(); setKebabOpenId(null); openDetail(task); setTimeout(() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click(), 100); }}
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
      </div>
    );
  };

  return (
    <div className="task-list-panel" style={{ background: 'transparent', border: 'none' }}>
      <div className="tl-header" style={{ padding: '0 0 24px 0', borderBottom: '1px solid var(--border)' }}>
        <div className="tl-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}>
            Tasks
            <span className="task-count-badge" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '700', marginLeft: '6px', verticalAlign: 'super', lineHeight: 1 }}>
              {pendingCount}
            </span>
          </h2>
          <div className="tl-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <style>{`@keyframes customSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            {/* Cluster 1: Sync status indicator */}
            <div className="sync-status-indicator" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '0 12px', borderRadius: 18, border: '1px solid var(--border)', height: 36, boxSizing: 'border-box' }}>
              {syncStatus === 'Syncing...' ? (
                <svg style={{ animation: 'customSpin 1s linear infinite', width: 12, height: 12, color: '#6366f1' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"></circle>
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <span style={{
                  width: 6, height: 6, borderRadius: 3,
                  background: syncStatus.startsWith('Synced') ? '#10b981' : syncStatus === 'Sync failed — retry' ? '#ef4444' : '#64748b',
                  boxShadow: syncStatus.startsWith('Synced') ? '0 0 8px #10b981' : syncStatus === 'Sync failed — retry' ? '0 0 8px #ef4444' : 'none'
                }} />
              )}
              <span style={{ fontWeight: 600 }}>{syncStatus}</span>
              {syncStatus !== 'Not connected' && syncStatus !== 'Syncing...' && (
                <button
                  type="button"
                  onClick={onSyncNow}
                  style={{ background: 'transparent', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '0 2px', fontWeight: 700, fontSize: '0.82rem', marginLeft: 4 }}
                  title="Sync Now"
                >
                  Sync Now
                </button>
              )}
            </div>
            {/* Cluster 2: Sort dropdown + Add button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Sort dropdown */}
              <div className="sort-dropdown" ref={sortRef} style={{ position: 'relative' }}>
                <button className="sort-btn" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0 16px', height: 36, borderRadius: '12px', fontSize: '0.9rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', boxSizing: 'border-box' }} onClick={() => setSortOpen(o => !o)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M3 12h7M3 16h4M17 8v8M14 5l3-3 3 3M14 19l3 3 3-3"/>
                  </svg>
                  Sort
                </button>
                {sortOpen && (
                  <div className="sort-menu" style={{ position: 'absolute', top: 42, right: 0, zIndex: 100, background: '#0f172a', border: '1px solid var(--border-strong)', borderRadius: '12px', padding: '8px 0', width: '160px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                    {SORT_OPTIONS.map(opt => {
                      const isActive = sortBy === opt.value;
                      return (
                        <button
                          key={opt.value}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', width: '100%', background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent', border: 'none', color: '#f8fafc', fontSize: '0.9rem', cursor: 'pointer', textAlign: 'left' }}
                          onClick={() => {
                            setSortBy(opt.value);
                            localStorage.setItem(LS_SORT_KEY, opt.value);
                            setSortOpen(false);
                          }}
                          onMouseEnter={e => !isActive && (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                          onMouseLeave={e => !isActive && (e.currentTarget.style.background = 'transparent')}
                        >
                          <span>{opt.label}</span>
                          {isActive && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button className="add-task-btn" style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '0 20px', height: 36, borderRadius: '12px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, boxSizing: 'border-box' }} onClick={onAdd}>＋ Add</button>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="task-search-wrap" style={{ position: 'relative', marginTop: 16 }}>
          <svg className="task-search-icon" style={{ position: 'absolute', left: 14, top: 13, color: 'var(--text-secondary)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={searchRef}
            className="task-search-input"
            style={{ width: '100%', padding: '10px 14px 10px 40px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '0.95rem', color: 'var(--text-primary)', outline: 'none' }}
            type="text"
            placeholder="Search tasks..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search tasks"
          />
          {query && (
            <button className="task-search-clear" style={{ position: 'absolute', right: 14, top: 12, background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => { setQuery(''); searchRef.current?.focus(); }} aria-label="Clear search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Body Area */}
      <div className="task-list-scroll-area" style={{ flex: 1, overflowY: 'auto', padding: '24px 0 32px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Category Filter Pills */}
        <div className="task-cat-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={`cat-filter-btn${catFilter === 'all' ? ' active' : ''}`}
            onClick={() => setCatFilter('all')}
            style={{
              height: 32, padding: '0 16px', borderRadius: 16, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', margin: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
              background: catFilter === 'all' ? '#0f172a' : 'var(--bg-surface)',
              color: catFilter === 'all' ? '#fff' : 'var(--text-secondary)',
              border: '1px solid ' + (catFilter === 'all' ? '#0f172a' : 'var(--border)'),
              transition: 'all 0.15s ease'
            }}
          >
            All ({tasks.filter(t => !t.completed).length})
          </button>
          {ALL_CATS.map(cat => {
            const meta = CAT_META[cat];
            const count = catCounts[cat] || 0;
            const isActive = catFilter === cat;
            const hasContent = count > 0;
            return (
              <button
                key={cat}
                type="button"
                className={`cat-filter-btn${isActive ? ' active' : ''}`}
                onClick={() => setCatFilter(cat)}
                style={{
                  height: 32, padding: '0 16px', borderRadius: 16, fontSize: '0.85rem', fontWeight: isActive || hasContent ? 600 : 500, cursor: 'pointer', margin: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                  background: isActive ? meta.color : 'var(--bg-surface)',
                  color: isActive ? '#fff' : hasContent ? 'var(--text-primary)' : 'var(--text-muted, #94a3b8)',
                  border: '1px solid ' + (isActive ? meta.color : hasContent ? 'var(--border-strong, #cbd5e1)' : 'var(--border-light, #e2e8f0)'),
                  opacity: isActive || hasContent ? 1 : 0.65,
                  transition: 'all 0.15s ease'
                }}
              >
                {meta.label} ({count})
              </button>
            );
          })}
        </div>

        {/* ONE single "+ Add a task" inline action at the top of the list */}
        <div className="inline-add-container" style={{ width: '100%' }}>
          {inlineAddCat === 'top' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', padding: '12px 18px', borderRadius: '12px', border: '1px solid #6366f1', boxShadow: '0 4px 12px rgba(99,102,241,0.1)' }}>
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
          ) : (
            <button
              type="button"
              onClick={() => { setInlineAddCat('top'); setInlineAddText(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)',
                border: '1px solid var(--border)', color: '#6366f1', fontSize: '0.95rem', fontWeight: 600,
                cursor: 'pointer', padding: '12px 18px', borderRadius: '12px', width: '100%',
                textAlign: 'left', transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Add a task {catFilter !== 'all' ? `to ${CAT_META[catFilter]?.label}` : ''}
            </button>
          )}
        </div>

        {/* ONE single list container, full width, no separate cards */}
        <div className="sunsama-list" style={{ width: '100%' }}>
          {pending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-faint)', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.95rem' }}>
              No tasks found. Click "+ Add a task" above to create one!
            </div>
          ) : (
            pending.map(task => renderTask(task, false))
          )}
        </div>

        {/* Completed Section */}
        {completed.length > 0 && (
          <div className="completed-section" style={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)', padding: 20 }}>
            <div className="completed-section-hdr" onClick={() => setShowCompleted(s => !s)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="completed-chevron">
                  {showCompleted
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  }
                </span>
                <span className="completed-label" style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>Completed ({completed.length})</span>
              </div>
              <button
                className="clear-all-link"
                onClick={e => { e.stopPropagation(); onClearCompleted(); }}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600' }}
              >
                Clear all
              </button>
            </div>
            {showCompleted && (
              <div className="sunsama-list" style={{ marginTop: 16 }}>
                {completed.map(task => renderTask(task, true))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Task detail panel ── */}
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
                  onChange={e => saveField('name', e.target.value)}
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
                  {['high', 'medium', 'low'].map(p => (
                    <button
                      key={p}
                      className={`tdp-pri-pill${local.priority === p ? ' tdp-pri-active' : ''}`}
                      onClick={() => saveField('priority', p)}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
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
                <div className="tdp-date-wrap">
                  <div
                    className="tdp-date-display"
                    onClick={() => { try { dateInputRef.current?.showPicker?.(); } catch {} }}
                  >
                    <span>
                      {local.dueDate
                        ? new Date(local.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'No due date'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {local.dueDate && (
                        <button
                          type="button"
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 6px', fontSize: '1.1rem', position: 'relative', zIndex: 10 }}
                          onClick={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            saveField('dueDate', '');
                          }}
                          title="Clear due date"
                        >
                          ×
                        </button>
                      )}
                      <TdpIconCalendar />
                    </div>
                  </div>
                  <input
                    ref={dateInputRef}
                    type="date"
                    className="tdp-date-hidden"
                    value={local.dueDate || ''}
                    onChange={e => saveField('dueDate', e.target.value)}
                  />
                </div>
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
                          saveField('subtasks', nextSubs);
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
                    saveField('notes', e.target.value);
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
                className="tdp-delete-btn"
                onClick={() => { onDelete(local.id); setDetailTask(null); setLocal(null); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                Delete Task
              </button>
            </div>
          </>
        )}
      </div>
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
function TdpIconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
