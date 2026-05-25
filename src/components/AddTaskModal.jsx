import { useState, useEffect, useRef } from 'react';
import { CAT_META } from './TaskList';

const PRIORITIES = [
  { value: 'none',   label: 'None'   },
  { value: 'low',    label: 'Low'    },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High'   },
];

const PRI_COLOR = { none: '#8b949e', low: '#3b82f6', medium: '#f59e0b', high: '#ef4444' };

const DEFAULT = { name: '', category: 'work', priority: 'none', timeEstimate: 25, notes: '', dueDate: '' };

export default function AddTaskModal({ onAdd, onClose }) {
  const [form, setForm] = useState(DEFAULT);
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onAdd(form);
  };

  const selectedCat = CAT_META[form.category];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-hdr">
          <h3>New Task</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={submit} className="modal-form" noValidate>
          <div className="form-grp">
            <label>Name <span className="req">*</span></label>
            <input ref={nameRef} type="text" className="form-inp" value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="What are you working on?" required />
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
            <label>Notes</label>
            <textarea className="form-inp form-textarea" value={form.notes}
              onChange={e => set('notes', e.target.value)} placeholder="Optional…" rows={3} />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-submit"
              style={{ '--submit-c': selectedCat?.color ?? '#6366f1' }}
              disabled={!form.name.trim()}>
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
