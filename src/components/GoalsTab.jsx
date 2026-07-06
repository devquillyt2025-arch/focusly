import { useState, useEffect } from 'react';

export const GOAL_CATS = {
  work:     { label: 'Work',     color: 'var(--color-blue)' },
  health:   { label: 'Health',   color: 'var(--color-green)' },
  finance:  { label: 'Finance',  color: 'var(--color-amber)' },
  personal: { label: 'Personal', color: '#ec4899' },
};

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().split('T')[0];
}

// ─── Main export ───────────────────────────────────────────────
export default function GoalsTab({ goals, onAddGoal, onUpdateGoal, onDeleteGoal, checkIns, onAddCheckIn, onOpenCheckIn }) {
  const [showAdd,      setShowAdd]      = useState(false);
  const [showLimitMsg, setShowLimitMsg] = useState(false);

  const handleAddClick = () => {
    if (goals.length >= 10) {
      setShowLimitMsg(true);
      setTimeout(() => setShowLimitMsg(false), 4000);
      return;
    }
    setShowAdd(true);
  };

  return (
    <div className="goals-layout-inner">
      {/* Goals section */}
      <div className="goals-section">
        <div className="goals-section-hdr">
          <h2 className="section-title">
            Goals
            <span className="task-count-badge">{goals.length}/10</span>
          </h2>
          <div className="goals-actions">
            <button className="btn-checkin" onClick={onOpenCheckIn}>
              📝 Check-in
            </button>
            <button className="add-task-btn" onClick={handleAddClick}>
              ＋ Add Goal
            </button>
          </div>
        </div>

        {showLimitMsg && (
          <div className="goal-limit-msg">
            🎯 You have 10 active goals — complete or remove one before adding more.
            <button className="goal-limit-dismiss" onClick={() => setShowLimitMsg(false)}>×</button>
          </div>
        )}

        {goals.length === 0 ? (
          <div className="empty-state" style={{ paddingTop: 60 }}>
            <span>🎯</span>
            <p>{'No goals yet.\nAdd one to start tracking your progress!'}</p>
          </div>
        ) : (
          <div className="goals-grid">
            {goals.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onUpdate={onUpdateGoal}
                onDelete={onDeleteGoal}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reflections section */}
      {checkIns.length > 0 && (
        <div className="reflections-section">
          <h3 className="section-title">Reflections</h3>
          <div className="reflections-grid">
            {checkIns.slice(0, 4).map(ci => (
              <CheckInCard key={ci.id} checkIn={ci} />
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <AddGoalModal
          onAdd={goal => { onAddGoal(goal); setShowAdd(false); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

// ─── GoalCard ──────────────────────────────────────────────────
function GoalCard({ goal, onUpdate, onDelete }) {
  const meta = GOAL_CATS[goal.category] ?? GOAL_CATS.work;
  const [localProgress, setLocalProgress] = useState(goal.progress);

  useEffect(() => { setLocalProgress(goal.progress); }, [goal.progress]);

  const commit = () => {
    if (localProgress !== goal.progress) {
      onUpdate({ ...goal, progress: localProgress });
    }
  };

  const isComplete = goal.progress >= 100;
  const isOverdue  = goal.targetDate && goal.targetDate < new Date().toISOString().split('T')[0];

  return (
    <div className={`goal-card${isComplete ? ' goal-complete' : ''}`}>
      <div className="goal-card-top">
        <div className="goal-card-badges">
          <span
            className="goal-cat-badge"
            style={{ background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}44` }}
          >
            {meta.label}
          </span>
          {isComplete && <span className="goal-done-badge">✓ Complete</span>}
        </div>
        <button
          className="task-del-btn"
          style={{ opacity: 1 }}
          onClick={() => onDelete(goal.id)}
          aria-label="Delete goal"
        >×</button>
      </div>

      <h4 className="goal-title">{goal.title}</h4>

      {goal.targetDate && (
        <div className="goal-date" style={{ color: isOverdue && !isComplete ? 'var(--color-red)' : 'var(--text-muted)' }}>
          📅 {goal.targetDate}{isOverdue && !isComplete ? '  ·  Overdue' : ''}
        </div>
      )}

      <div className="goal-progress-section">
        <div className="goal-progress-hdr">
          <span className="goal-progress-lbl">Progress</span>
          <span className="goal-progress-pct" style={{ color: meta.color }}>{localProgress}%</span>
        </div>
        <div className="goal-bar-track">
          <div className="goal-bar-fill" style={{ width: `${localProgress}%`, background: meta.color }} />
        </div>
        <input
          type="range"
          min="0" max="100"
          value={localProgress}
          onChange={e => setLocalProgress(Number(e.target.value))}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          className="goal-slider"
          aria-label="Update progress"
        />
      </div>
    </div>
  );
}

// ─── CheckInCard ───────────────────────────────────────────────
function CheckInCard({ checkIn }) {
  return (
    <div className="checkin-card">
      <div className="checkin-card-hdr">
        <span className="checkin-week-lbl">Week of {checkIn.weekStart}</span>
        <span className="checkin-stars">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} style={{ color: i < checkIn.rating ? 'var(--color-amber)' : 'var(--border-strong)' }}>★</span>
          ))}
        </span>
      </div>
      {checkIn.wentWell && (
        <div className="checkin-entry">
          <div className="checkin-entry-lbl">✅ Went well</div>
          <p className="checkin-entry-text">{checkIn.wentWell}</p>
        </div>
      )}
      {checkIn.toImprove && (
        <div className="checkin-entry">
          <div className="checkin-entry-lbl">💡 To improve</div>
          <p className="checkin-entry-text">{checkIn.toImprove}</p>
        </div>
      )}
    </div>
  );
}

// ─── AddGoalModal ──────────────────────────────────────────────
function AddGoalModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ title: '', category: 'work', targetDate: '', progress: 0 });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = e => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onAdd({
      id:         genId(),
      title:      form.title.trim(),
      category:   form.category,
      targetDate: form.targetDate,
      progress:   Number(form.progress),
      createdAt:  new Date().toISOString(),
    });
  };

  const meta = GOAL_CATS[form.category];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-hdr">
          <h3>New Goal</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={submit} className="modal-form" noValidate>
          <div className="form-grp">
            <label>Title <span className="req">*</span></label>
            <input
              autoFocus
              type="text"
              className="form-inp"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="What do you want to achieve?"
            />
          </div>

          <div className="form-grp">
            <label>Category</label>
            <div className="cat-picker">
              {Object.entries(GOAL_CATS).map(([key, m]) => (
                <button
                  key={key}
                  type="button"
                  className={`cat-pick-btn${form.category === key ? ' cat-pick-active' : ''}`}
                  style={form.category === key ? { background: m.color + '22', borderColor: m.color, color: m.color } : {}}
                  onClick={() => set('category', key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-grp">
              <label>Target Date</label>
              <input
                type="date"
                className="form-inp"
                value={form.targetDate}
                onChange={e => set('targetDate', e.target.value)}
              />
            </div>
            <div className="form-grp">
              <label>Initial Progress: {form.progress}%</label>
              <input
                type="range"
                min="0" max="100"
                value={form.progress}
                onChange={e => set('progress', Number(e.target.value))}
                className="goal-slider"
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="btn-submit"
              style={{ '--submit-c': meta.color }}
              disabled={!form.title.trim()}
            >
              Add Goal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
