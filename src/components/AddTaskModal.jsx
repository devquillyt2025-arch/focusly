import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CAT_META } from './TaskList';

const PRIORITIES = [
  { value: 'none',   label: 'None'   },
  { value: 'low',    label: 'Low'    },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High'   },
];

const PRI_COLOR = { none: '#8b949e', low: '#3b82f6', medium: '#f59e0b', high: '#ef4444' };

const RECURRENCE_OPTIONS = [
  { value: null,       label: 'None'     },
  { value: 'daily',    label: 'Daily'    },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly',   label: 'Weekly'   },
  { value: 'monthly',  label: 'Monthly'  },
  { value: 'custom',   label: 'Custom'   },
];

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const DEFAULT = { name: '', category: 'work', priority: 'medium', timeEstimate: 25, notes: '', dueDate: '', recurrence: null, recurrenceDays: [] };

export default function AddTaskModal({ onAdd, onEdit, onClose, editTask, existingTasks = [] }) {
  const isEditing = Boolean(editTask);
  const [form, setForm] = useState(() => isEditing ? {
    name: editTask.name ?? '',
    category: editTask.category ?? 'work',
    priority: editTask.priority ?? 'none',
    timeEstimate: editTask.timeEstimate ?? 25,
    notes: editTask.notes ?? '',
    dueDate: editTask.dueDate ?? '',
    recurrence: editTask.recurrence ?? null,
    recurrenceDays: editTask.recurrenceDays ?? [],
  } : DEFAULT);
  const [nameError, setNameError] = useState('');
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (k === 'name' && nameError) setNameError('');
  };

  const submit = e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!isEditing) {
      const key = form.name.trim().toLowerCase();
      const dupe = existingTasks.some(t => t.name.trim().toLowerCase() === key);
      if (dupe) { setNameError('A task with this name already exists'); return; }
    }
    if (isEditing) onEdit({ ...editTask, ...form, timeEstimate: Math.max(1, Math.min(480, Number(form.timeEstimate) || 25)) });
    else onAdd(form);
  };

  const selectedCat = CAT_META[form.category];

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-hdr">
          <h3>{isEditing ? 'Edit Task' : 'New Task'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={submit} className="modal-form" noValidate>
          <div className="form-grp">
            <label>Name <span className="req">*</span></label>
            <input ref={nameRef} type="text" className={`form-inp${nameError ? ' form-inp-error' : ''}`} value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="What are you working on?" required />
            {nameError && <span className="form-error">{nameError}</span>}
          </div>

          <div className="form-grp">
            <label>Category</label>
            <div className="cat-picker">
              {Object.entries(CAT_META).map(([key, meta]) => (
                <button key={key} type="button"
                  className={`cat-pick-btn${form.category === key ? ' cat-pick-active' : ''}`}
                  style={form.category === key ? { background: meta.color + '22', borderColor: meta.color, color: meta.color } : {}}
                  onClick={() => set('category', key)}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grp">
            <label>Priority</label>
            <div className="pri-picker">
              {PRIORITIES.map(p => (
                <button key={p.value} type="button"
                  className={`pri-btn${form.priority === p.value ? ' pri-btn-active' : ''}`}
                  style={form.priority === p.value ? { borderColor: PRI_COLOR[p.value], color: PRI_COLOR[p.value], background: PRI_COLOR[p.value] + '18' } : {}}
                  onClick={() => set('priority', p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-grp">
              <label>Duration (min)</label>
              <input type="number" className="form-inp" value={form.timeEstimate}
                onChange={e => set('timeEstimate', e.target.value)} min="1" max="480" />
            </div>
            <div className="form-grp">
              <label>Due Date</label>
              <input type="date" className="form-inp" value={form.dueDate}
                onChange={e => set('dueDate', e.target.value)} />
            </div>
          </div>

          <div className="form-grp">
            <label>Repeat</label>
            <div className="recur-picker">
              {RECURRENCE_OPTIONS.map(opt => (
                <button key={String(opt.value)} type="button"
                  className={`recur-btn${form.recurrence === opt.value ? ' recur-btn-active' : ''}`}
                  onClick={() => set('recurrence', opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {form.recurrence === 'custom' && (
              <div className="recur-days">
                {DOW.map((lbl, i) => (
                  <button key={i} type="button"
                    className={`recur-day${form.recurrenceDays.includes(i) ? ' recur-day-active' : ''}`}
                    onClick={() => {
                      const days = form.recurrenceDays.includes(i)
                        ? form.recurrenceDays.filter(d => d !== i)
                        : [...form.recurrenceDays, i].sort((a, b) => a - b);
                      set('recurrenceDays', days);
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-grp">
            <label>Notes</label>
            <textarea className="form-inp form-textarea" value={form.notes}
              onChange={e => set('notes', e.target.value)} placeholder="Optional…" rows={3} />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-submit"
              style={{ '--submit-c': selectedCat?.color ?? '#6366f1' }}
              disabled={!form.name.trim()}>
              {isEditing ? 'Save Changes' : 'Add Task'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
