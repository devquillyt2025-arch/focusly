import { useState, useEffect, useRef } from 'react';
import { genId } from '../trackers/trackerUtils';
import { logActivity, diffObjects } from '../utils/activityLog';

// ─── Categories ────────────────────────────────────────────────────
const GOAL_CATS = {
  health:   { label: 'Health',   color: '#10b981' },
  work:     { label: 'Work',     color: '#3b82f6' },
  finance:  { label: 'Finance',  color: '#f59e0b' },
  personal: { label: 'Personal', color: '#ec4899' },
  learning: { label: 'Learning', color: '#6366f1' },
  growth:   { label: 'Growth',   color: '#818cf8' },
};

// ─── Storage ───────────────────────────────────────────────────────
const GOALS_KEY = 'focusly_goals';

function loadGoals() {
  try { return JSON.parse(localStorage.getItem(GOALS_KEY) || '[]'); }
  catch { return []; }
}

function saveGoals(list) {
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(list)); } catch {}
}

// ─── Helpers ───────────────────────────────────────────────────────
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function calcProgress(goal) {
  if (!goal.milestones.length) return goal.manualProgress ?? 0;
  const done = goal.milestones.filter(m => m.done).length;
  return Math.round((done / goal.milestones.length) * 100);
}

function isGoalOverdue(goal) {
  if (goal.completed || !goal.targetDate) return false;
  return goal.targetDate < todayLocal() && calcProgress(goal) < 100;
}

function fmtGoalDate(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function makeGoal(data) {
  return {
    id: genId(),
    title: data.title,
    category: data.category,
    timeframe: data.timeframe,
    targetDate: data.targetDate,
    description: data.description,
    milestones: data.milestones,
    manualProgress: 0,
    completed: false,
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
}

// ─── Main view ─────────────────────────────────────────────────────
export default function GoalsView() {
  const [goals,         setGoals]         = useState(loadGoals);
  const [showModal,     setShowModal]     = useState(false);
  const [editingGoal,   setEditingGoal]   = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => { saveGoals(goals); }, [goals]);

  // ── Derived ──
  const activeGoals    = goals.filter(g => !g.completed);
  const completedGoals = goals.filter(g =>  g.completed);

  const now            = new Date();
  const thisMonth      = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const completedMonth = completedGoals.filter(g => g.completedAt?.slice(0, 7) === thisMonth).length;
  const avgProgress    = activeGoals.length
    ? Math.round(activeGoals.reduce((s, g) => s + calcProgress(g), 0) / activeGoals.length)
    : 0;

  // ── Handlers ──
  const handleSave = (goalData) => {
    const isEdit = !!editingGoal;
    const changes = isEdit ? diffObjects(editingGoal, goalData, ['title', 'category', 'description', 'targetDate', 'timeframe']) : null;
    logActivity({ module: 'goals', entity_type: 'goal', entity_id: goalData.id, action: isEdit ? 'updated' : 'created', title: goalData.title, field_changes: changes });
    setGoals(prev =>
      isEdit
        ? prev.map(g => g.id === goalData.id ? goalData : g)
        : [goalData, ...prev]
    );
    setShowModal(false);
    setEditingGoal(null);
  };

  const openEdit = (goal) => { setEditingGoal(goal); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditingGoal(null); };

  const toggleMilestone = (goalId, msId) => {
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      return { ...g, milestones: g.milestones.map(m => m.id === msId ? { ...m, done: !m.done } : m) };
    }));
  };

  const updateProgress = (goalId, pct) => {
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, manualProgress: pct } : g));
  };

  const completeGoal = (goalId) => {
    const goal = goals.find(g => g.id === goalId);
    if (goal) logActivity({ module: 'goals', entity_type: 'goal', entity_id: goalId, action: 'completed', title: goal.title });
    setGoals(prev => prev.map(g =>
      g.id === goalId ? { ...g, completed: true, completedAt: new Date().toISOString() } : g
    ));
  };

  const deleteGoal = (goalId) => {
    const goal = goals.find(g => g.id === goalId);
    if (goal) logActivity({ module: 'goals', entity_type: 'goal', entity_id: goalId, action: 'deleted', title: goal.title });
    setGoals(prev => prev.filter(g => g.id !== goalId));
  };

  return (
    <div className="gvp">

      {/* ── Page header ── */}
      <div className="gvp-hdr">
        <h2 className="gvp-title">Goals</h2>
        <button className="add-task-btn" onClick={() => setShowModal(true)}>＋ New Goal</button>
      </div>

      {/* ── Stat cards ── */}
      <div className="gvp-stats">
        <div className="gvp-stat"><div className="gvp-stat-val">{activeGoals.length}</div><div className="gvp-stat-lbl">Active Goals</div></div>
        <div className="gvp-stat"><div className="gvp-stat-val">{completedMonth}</div><div className="gvp-stat-lbl">Completed This Month</div></div>
        <div className="gvp-stat"><div className="gvp-stat-val">{avgProgress}%</div><div className="gvp-stat-lbl">Avg Progress</div></div>
      </div>

      {/* ── Active goals ── */}
      {activeGoals.length === 0 ? (
        <GoalsEmptyState onAdd={() => setShowModal(true)} />
      ) : (
        <div className="gvp-grid">
          {activeGoals.map(g => (
            <GoalCard
              key={g.id}
              goal={g}
              onToggleMilestone={toggleMilestone}
              onUpdateProgress={updateProgress}
              onEdit={openEdit}
              onComplete={completeGoal}
              onDelete={deleteGoal}
            />
          ))}
        </div>
      )}

      {/* ── Completed section ── */}
      {completedGoals.length > 0 && (
        <div className="gvp-completed-section">
          <button
            className="gvp-completed-toggle"
            onClick={() => setShowCompleted(s => !s)}
          >
            <span className="gvp-chevron">{showCompleted ? '▾' : '▸'}</span>
            Completed Goals ({completedGoals.length})
          </button>
          {showCompleted && (
            <div className="gvp-grid" style={{ marginTop: 12 }}>
              {completedGoals.map(g => (
                <GoalCard key={g.id} goal={g} onDelete={deleteGoal} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <GoalModal
          onSave={handleSave}
          onClose={closeModal}
          editGoal={editingGoal}
          onDelete={editingGoal ? () => { deleteGoal(editingGoal.id); closeModal(); } : null}
        />
      )}
    </div>
  );
}

// ─── Goal card ─────────────────────────────────────────────────────
function GoalCard({ goal, onToggleMilestone, onUpdateProgress, onEdit, onComplete, onDelete }) {
  const [showAll, setShowAll] = useState(false);

  const progress  = calcProgress(goal);
  const cat       = GOAL_CATS[goal.category] ?? GOAL_CATS.work;
  const overdue   = isGoalOverdue(goal);
  const shown     = showAll ? goal.milestones : goal.milestones.slice(0, 5);
  const hasMore   = goal.milestones.length > 5;
  const isActive  = !!onToggleMilestone; // false for completed read-only cards

  return (
    <div className={`gc${overdue ? ' gc-overdue' : ''}${goal.completed ? ' gc-completed' : ''}`}>

      {/* Title row */}
      <div className="gc-head">
        <h3 className="gc-title">{goal.title}</h3>
        {goal.completed && (
          <span className="gc-done-badge">
            <GIcoCheckCircle size={16} color="#22c55e" />
          </span>
        )}
      </div>

      {/* Badges */}
      <div className="gc-meta">
        <span className="cat-badge" style={{ background: cat.color+'22', color: cat.color, border: `1px solid ${cat.color}44` }}>
          {cat.label}
        </span>
        <span className="gc-timeframe">{goal.timeframe.charAt(0).toUpperCase() + goal.timeframe.slice(1)}</span>
        {goal.targetDate && (
          <span className={`gc-due${overdue ? ' gc-due-overdue' : ''}`}>
            Due {fmtGoalDate(goal.targetDate)}
          </span>
        )}
      </div>

      {/* Progress */}
      <div className="gc-progress">
        <div className="gc-prog-row">
          <span className="gc-prog-lbl">Progress</span>
          <span className="gc-prog-pct">{progress}%</span>
        </div>
        <div className="gc-bar-track">
          <div className="gc-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Milestones or manual slider */}
      {goal.milestones.length > 0 ? (
        <div className="gc-milestones">
          {shown.map(m => (
            <button
              key={m.id}
              className={`gc-ms-row${m.done ? ' gc-ms-done' : ''}`}
              onClick={() => isActive && onToggleMilestone(goal.id, m.id)}
              style={{ cursor: isActive ? 'pointer' : 'default' }}
            >
              <span className={`gc-ms-box${m.done ? ' gc-ms-checked' : ''}`}>
                {m.done && '✓'}
              </span>
              <span className="gc-ms-text">{m.text}</span>
            </button>
          ))}
          {hasMore && (
            <button className="gc-ms-more" onClick={() => setShowAll(s => !s)}>
              {showAll ? 'Show less' : `+ ${goal.milestones.length - 5} more`}
            </button>
          )}
        </div>
      ) : (
        isActive && (
          <div className="gc-slider-row">
            <input
              type="range" min="0" max="100"
              value={goal.manualProgress ?? 0}
              className="goal-slider"
              onChange={e => onUpdateProgress(goal.id, Number(e.target.value))}
            />
          </div>
        )
      )}

      {/* Action buttons — only for active goals */}
      {isActive && (
        <div className="gc-actions">
          <button className="gc-btn gc-btn-edit" onClick={() => onEdit(goal)}>
            <GIcoPencil /> Edit
          </button>
          <button className="gc-btn gc-btn-complete" onClick={() => onComplete(goal.id)}>
            <GIcoCheckCircle size={14} color="currentColor" /> Complete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────
function GoalsEmptyState({ onAdd }) {
  return (
    <div className="gvp-empty">
      <GIcoTarget />
      <p className="gvp-empty-title">Set your first goal</p>
      <p className="gvp-empty-sub">Break big ambitions into trackable milestones</p>
      <button className="add-task-btn" onClick={onAdd}>＋ New Goal</button>
    </div>
  );
}

// ─── Goal modal ────────────────────────────────────────────────────
function GoalModal({ onSave, onClose, editGoal = null, onDelete }) {
  const isEdit = !!editGoal;
  const dateRef = useRef(null);

  const [form, setForm] = useState(() => isEdit ? {
    title:       editGoal.title,
    category:    editGoal.category,
    timeframe:   editGoal.timeframe,
    targetDate:  editGoal.targetDate ?? '',
    description: editGoal.description ?? '',
    milestones:  editGoal.milestones.map(m => m.text),
  } : {
    title: '', category: 'work', timeframe: 'monthly',
    targetDate: '', description: '', milestones: [''],
  });

  const [titleError, setTitleError] = useState('');

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setMilestone = (i, val) => {
    const next = [...form.milestones];
    next[i] = val;
    setF('milestones', next);
  };
  const addMilestone    = () => { if (form.milestones.length < 10) setF('milestones', [...form.milestones, '']); };
  const removeMilestone = (i) => { if (form.milestones.length > 1) setF('milestones', form.milestones.filter((_, idx) => idx !== i)); };

  const save = () => {
    if (!form.title.trim()) { setTitleError('Title is required'); return; }

    const milestones = form.milestones
      .filter(t => t.trim())
      .map(text => {
        const trimmed = text.trim();
        const existing = isEdit ? editGoal.milestones.find(m => m.text === trimmed) : null;
        return existing ?? { id: genId(), text: trimmed, done: false };
      });

    const data = {
      title:       form.title.trim(),
      category:    form.category,
      timeframe:   form.timeframe,
      targetDate:  form.targetDate,
      description: form.description.trim(),
      milestones,
    };

    onSave(isEdit ? { ...editGoal, ...data } : makeGoal(data));
  };

  const catColor = GOAL_CATS[form.category]?.color ?? '#818cf8';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-wide" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-hdr">
          <h3>{isEdit ? 'Edit Goal' : 'New Goal'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-form">
          {/* Title */}
          <div className="form-grp">
            <label>Title <span className="req">*</span></label>
            <input
              autoFocus
              className={`form-inp${titleError ? ' form-inp-error' : ''}`}
              value={form.title}
              onChange={e => { setF('title', e.target.value); if (titleError) setTitleError(''); }}
              placeholder="What do you want to achieve?"
            />
            {titleError && <span className="form-error">{titleError}</span>}
          </div>

          {/* Category */}
          <div className="form-grp">
            <label>Category</label>
            <div className="cat-picker">
              {Object.entries(GOAL_CATS).map(([key, m]) => (
                <button key={key} type="button"
                  className={`cat-pick-btn${form.category === key ? ' cat-pick-active' : ''}`}
                  style={form.category === key ? { background: m.color+'22', borderColor: m.color, color: m.color } : {}}
                  onClick={() => setF('category', key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe + Target date */}
          <div className="form-row">
            <div className="form-grp">
              <label>Timeframe</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['monthly', 'quarterly', 'yearly'].map(tf => (
                  <button key={tf} type="button"
                    className={`cat-pick-btn${form.timeframe === tf ? ' cat-pick-active' : ''}`}
                    style={form.timeframe === tf ? { background: 'var(--accent-glow)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
                    onClick={() => setF('timeframe', tf)}
                  >
                    {tf.charAt(0).toUpperCase() + tf.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-grp">
              <label>Target Date</label>
              <div className="tdp-date-wrap">
                <div
                  className="tdp-date-display"
                  onClick={() => { try { dateRef.current?.showPicker?.(); } catch {} }}
                >
                  <span>
                    {form.targetDate
                      ? new Date(form.targetDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Choose a date'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {form.targetDate && (
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 6px', fontSize: '1.1rem', position: 'relative', zIndex: 10 }}
                        onClick={e => {
                          e.stopPropagation();
                          e.preventDefault();
                          setF('targetDate', '');
                        }}
                        title="Clear target date"
                      >
                        ×
                      </button>
                    )}
                    <GIcoCalendarSm />
                  </div>
                </div>
                <input
                  ref={dateRef}
                  type="date"
                  className="tdp-date-hidden"
                  value={form.targetDate}
                  onChange={e => setF('targetDate', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Milestones */}
          <div className="form-grp">
            <label>Milestones</label>
            <div className="gm-ms-list">
              {form.milestones.map((text, i) => (
                <div key={i} className="gm-ms-row">
                  <span className="gm-ms-num">{i + 1}.</span>
                  <input
                    className="form-inp"
                    value={text}
                    onChange={e => setMilestone(i, e.target.value)}
                    placeholder="Describe this milestone…"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && i === form.milestones.length - 1) {
                        e.preventDefault(); addMilestone();
                      }
                    }}
                  />
                  {form.milestones.length > 1 && (
                    <button type="button" className="gm-ms-del" onClick={() => removeMilestone(i)}>×</button>
                  )}
                </div>
              ))}
            </div>
            {form.milestones.length < 10 && (
              <button type="button" className="j-add-btn" style={{ marginLeft: 0, marginTop: 4 }} onClick={addMilestone}>
                <GIcoPlus /> Add milestone
              </button>
            )}
          </div>

          {/* Description */}
          <div className="form-grp">
            <label>Description <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', fontSize: '0.7rem' }}>(optional)</span></label>
            <textarea
              className="form-inp form-textarea"
              rows={2}
              value={form.description}
              onChange={e => setF('description', e.target.value)}
              placeholder="Why does this goal matter to you?"
            />
          </div>

          {/* Footer */}
          <div className="modal-footer">
            {onDelete && (
              <button
                type="button"
                className="gc-delete-modal-btn"
                onClick={() => { if (confirm('Delete this goal?')) onDelete(); }}
              >
                Delete
              </button>
            )}
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
              <button className="btn-cancel" onClick={onClose}>Cancel</button>
              <button
                className="btn-submit"
                style={{ '--submit-c': catColor }}
                disabled={!form.title.trim()}
                onClick={save}
              >
                {isEdit ? 'Save Changes' : 'Create Goal'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline SVG icons ──────────────────────────────────────────────
const GP = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

function GIcoCheckCircle({ size = 14, color = '#22c55e' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...GP} stroke={color} strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

function GIcoPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" {...GP} stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function GIcoTarget() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" {...GP} stroke="#2d2d44" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  );
}

function GIcoCalendarSm() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...GP} stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function GIcoPlus() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" {...GP} stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
