import { useState } from 'react';

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().split('T')[0];
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function WeeklyCheckInModal({ onSave, onClose }) {
  const [form, setForm] = useState({ wentWell: '', toImprove: '', rating: 3 });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = e => {
    e.preventDefault();
    onSave({
      id: genId(),
      weekStart: getWeekStart(),
      wentWell:  form.wentWell.trim(),
      toImprove: form.toImprove.trim(),
      rating:    form.rating,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-hdr">
          <h3>Weekly Check-in</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <p className="checkin-week-subtitle">Week of {getWeekStart()}</p>

          <div className="form-grp">
            <label>What went well this week?</label>
            <textarea
              autoFocus
              className="form-inp form-textarea"
              value={form.wentWell}
              onChange={e => set('wentWell', e.target.value)}
              placeholder="Wins, progress, moments to celebrate…"
              rows={3}
            />
          </div>

          <div className="form-grp">
            <label>What's one thing to improve?</label>
            <textarea
              className="form-inp form-textarea"
              value={form.toImprove}
              onChange={e => set('toImprove', e.target.value)}
              placeholder="A habit, mindset, or approach to work on…"
              rows={3}
            />
          </div>

          <div className="form-grp">
            <label>Rate your week</label>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  className={`star-btn${n <= form.rating ? ' star-active' : ''}`}
                  onClick={() => set('rating', n)}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                >★</button>
              ))}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Skip</button>
            <button type="submit" className="btn-submit">Save Check-in</button>
          </div>
        </form>
      </div>
    </div>
  );
}
