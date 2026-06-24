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

// FIX 5: normalise display name — fixes "GEn AI" → "Gen AI", preserves acronyms like "AI", "HTML"
function displayName(name) {
  return name.replace(/\b(\w+)\b/g, w => {
    if (w.length > 1 && w === w.toUpperCase()) return w; // keep all-caps acronyms intact
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}

const ALL_CATS = Object.keys(CAT_META);

export default function TaskList({ tasks, activeTaskId, timerRunning, onSelect, onToggle, onDelete, onClearCompleted, onAdd, onEdit, onUpdate, onQuickUpdate, syncStatus, onSyncNow }) {
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
  const sortRef      = useRef(null);
  const searchRef    = useRef(null);
  const savedTimerRef = useRef(null);
  const titleRef     = useRef(null);
  const notesRef     = useRef(null);
  const catMenuRef   = useRef(null);
  const dateInputRef = useRef(null);

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

  const setLocalField = (k, v) => setLocal(prev => ({ ...prev, [k]: v }));

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
    const priColor    = PRI_COLOR[task.priority] ?? 'transparent';
    const isConfirming = confirmDeleteId === task.id;
    const due         = fmtDue(task.dueDate);

    const isOverdue = !isDone && due?.overdue;

    return (
      <div
        key={task.id}
        className={`task-item${isActive ? ' task-active' : ''}${isDone ? ' task-done' : ''}${isOverdue ? ' task-overdue' : ''}`}
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
            <button
              className={`task-check${isDone ? ' checked' : ''}`}
              onClick={e => { e.stopPropagation(); onToggle(task.id); }}
              aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
            >
              {isDone && '✓'}
            </button>

            <div className="task-body">
              <div className="task-name-row">
                {task.priority && task.priority !== 'none' && (
                  <span className="pri-dot" style={{ background: PRI_COLOR[task.priority] ?? 'transparent' }} title={task.priority} />
                )}
                <span className="task-name">{displayName(task.name)}</span>
              </div>
              <div className="task-badges">
                <span className="cat-badge" style={{ background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}44` }}>
                  {meta.label}
                </span>
                {task.recurrence && (
                  <svg className="recur-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" title={`Repeats ${task.recurrence}`}>
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                )}
                {task.timeLogged > 0 && <span className="info-badge">⏱ {fmtTime(task.timeLogged)}</span>}
                {task.pomodorosCompleted > 0 && <span className="info-badge">🍅 {task.pomodorosCompleted}</span>}
                {due && (
                  <span className="info-badge" style={{
                    color: due.color,
                    ...(due.overdue ? { borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' } : {}),
                  }}>
                    {due.text}
                  </span>
                )}
                {task.syncConflict && (
                  <span className="info-badge" style={{ color: '#f59e0b', borderColor: '#f59e0b', background: 'rgba(245,158,11,0.1)' }} title={task.syncConflict}>
                    ⚠️ Sync Conflict
                  </span>
                )}
              </div>
            </div>

            <div className="task-actions">
              <button className="task-action-btn" onClick={e => { e.stopPropagation(); onEdit(task); }} aria-label="Edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button className="task-action-btn task-del-btn" onClick={e => { e.stopPropagation(); setConfirmDeleteId(task.id); }} aria-label="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="task-list-panel">
      <div className="tl-header">
        <div className="tl-title-row">
          <h2>Tasks <span className="task-count-badge">{pendingCount}</span></h2>
          <div className="tl-header-actions">
            {/* Sync status indicator */}
            <div className="sync-status-indicator" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'var(--c-bg-card)', padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{
                width: 8, height: 8, borderRadius: 4,
                background: syncStatus === 'Synced' ? '#10b981' : syncStatus === 'Syncing...' ? '#f59e0b' : syncStatus === 'Sync failed — retry' ? '#ef4444' : '#64748b',
                boxShadow: syncStatus === 'Synced' ? '0 0 8px #10b981' : syncStatus === 'Syncing...' ? '0 0 8px #f59e0b' : syncStatus === 'Sync failed — retry' ? '0 0 8px #ef4444' : 'none'
              }} />
              <span>{syncStatus}</span>
              {syncStatus !== 'Not connected' && (
                <button
                  type="button"
                  onClick={onSyncNow}
                  style={{ background: 'transparent', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '0 4px', fontWeight: 600, fontSize: '0.8rem' }}
                  title="Sync Now"
                >
                  Sync Now
                </button>
              )}
            </div>
            {/* Sort dropdown */}
            <div className="sort-dropdown" ref={sortRef}>
              <button className="sort-btn" onClick={() => setSortOpen(o => !o)}>
                {/* ArrowUpDown icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8h10M3 12h7M3 16h4M17 8v8M14 5l3-3 3 3M14 19l3 3 3-3"/>
                </svg>
                Sort
              </button>
              {sortOpen && (
                <div className="sort-menu">
                  {SORT_OPTIONS.map(opt => {
                    const isActive = sortBy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        className={`sort-item${isActive ? ' sort-item-active' : ''}`}
                        onClick={() => {
                          setSortBy(opt.value);
                          localStorage.setItem(LS_SORT_KEY, opt.value);
                          setSortOpen(false);
                        }}
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
            <button className="add-task-btn" onClick={onAdd}>＋ Add</button>
          </div>
        </div>

        {/* Search bar */}
        <div className="task-search-wrap">
          <svg className="task-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={searchRef}
            className="task-search-input"
            type="text"
            placeholder="Search tasks..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search tasks"
          />
          {query && (
            <button className="task-search-clear" onClick={() => { setQuery(''); searchRef.current?.focus(); }} aria-label="Clear search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Category filter pills — hidden while search is active */}
        {!query && (
        <div className="cat-filter-row">
          <button
            className={`cat-chip${catFilter === 'all' ? ' cat-chip-active' : ''}`}
            onClick={() => setCatFilter('all')}
          >
            All ({pendingCount})
          </button>
          {ALL_CATS.map(cat => {
            const count = catCounts[cat] || 0;
            return (
              <button
                key={cat}
                className={`cat-chip${catFilter === cat ? ' cat-chip-active' : ''}`}
                style={{
                  ...(catFilter === cat ? { background: CAT_META[cat].color, borderColor: CAT_META[cat].color, color: '#fff' } : {}),
                  opacity: count === 0 ? 0.5 : 1,
                }}
                onClick={() => setCatFilter(cat)}
              >
                {CAT_META[cat].label} ({count})
              </button>
            );
          })}
        </div>
        )}
      </div>

      <div className="task-items">
        {pending.length === 0 && completed.length === 0 && (
          <div className="empty-state">
            {query.trim() ? (
              /* Search empty state */
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  No tasks match "{query}"
                </p>
              </>
            ) : catFilter !== 'all' ? (
              /* Category empty state */
              <>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2d2d44" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                <p className="empty-state-title">No {CAT_META[catFilter]?.label} tasks</p>
                <p className="empty-state-sub">Add one with the + button above</p>
              </>
            ) : (
              /* All-tasks empty state */
              <>
                <span>🌱</span>
                <p>No tasks yet.{'\n'}Add one to start!</p>
              </>
            )}
          </div>
        )}

        {pending.map(task => renderTask(task, false))}

        {completed.length > 0 && (
          <div className="completed-section">
            <div className="completed-section-hdr" onClick={() => setShowCompleted(s => !s)}>
              <span className="completed-chevron">
                {showCompleted
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                }
              </span>
              <span className="completed-label">Completed ({completed.length})</span>
              <button
                className="clear-all-link"
                onClick={e => { e.stopPropagation(); onClearCompleted(); }}
              >
                Clear all
              </button>
            </div>
            {showCompleted && completed.map(task => renderTask(task, true))}
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

              {/* Title — FIX 1 */}
              <div className="tdp-field">
                <label className="tdp-label">Title</label>
                <input
                  ref={titleRef}
                  className="tdp-title-input"
                  value={local.name || ''}
                  onChange={e => setLocalField('name', e.target.value)}
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

              {/* Priority — FIX 3 */}
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

              {/* Category — FIX 4 */}
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

              {/* Due Date — FIX 2 */}
              <div className="tdp-field">
                <label className="tdp-label">Due Date</label>
                <div className="tdp-date-wrap">
                  <div
                    className="tdp-date-display"
                    onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()}
                  >
                    <span>
                      {local.dueDate
                        ? new Date(local.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'No due date'}
                    </span>
                    <TdpIconCalendar />
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

              {/* Notes — FIX 6 */}
              <div className="tdp-field">
                <label className="tdp-label">Notes</label>
                <textarea
                  ref={notesRef}
                  className="tdp-notes"
                  value={local.notes || ''}
                  onChange={e => {
                    setLocalField('notes', e.target.value);
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
