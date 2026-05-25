import { useState, useEffect } from 'react';

const PRESETS = [
  { label: 'Standard',  sub: '25/5/15',  vals: { focusDuration: 25, shortDuration: 5,  longDuration: 15 } },
  { label: 'Short',     sub: '20/3/10',  vals: { focusDuration: 20, shortDuration: 3,  longDuration: 10 } },
  { label: 'Long',      sub: '50/10/20', vals: { focusDuration: 50, shortDuration: 10, longDuration: 20 } },
  { label: 'Deep Work', sub: '90/15/30', vals: { focusDuration: 90, shortDuration: 15, longDuration: 30 } },
];

export default function SettingsModal({ settings, onSave, onClose }) {
  const [form, setForm] = useState(settings);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const applyPreset = preset => setForm(f => ({ ...f, ...preset.vals }));

  const submit = e => {
    e.preventDefault();
    onSave({
      ...form,
      focusDuration:  Math.max(1, Math.min(480, Number(form.focusDuration)  || 25)),
      shortDuration:  Math.max(1, Math.min(60,  Number(form.shortDuration)  || 5)),
      longDuration:   Math.max(1, Math.min(120, Number(form.longDuration)   || 15)),
      customDuration: Math.max(1, Math.min(480, Number(form.customDuration) || 25)),
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-hdr">
          <h3>⚙️ Settings</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={submit} className="modal-form">
          <div className="form-grp">
            <label>Presets</label>
            <div className="preset-grid">
              {PRESETS.map(p => (
                <button key={p.label} type="button" className="preset-btn" onClick={() => applyPreset(p)}>
                  <span>{p.label}</span>
                  <small>{p.sub}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="form-grp">
            <label>Timer Durations (minutes)</label>
            <div className="form-row">
              <div className="form-grp">
                <label className="sub-label">Focus</label>
                <input type="number" className="form-inp" value={form.focusDuration}
                  onChange={e => set('focusDuration', e.target.value)} min="1" max="480" />
              </div>
              <div className="form-grp">
                <label className="sub-label">Short Break</label>
                <input type="number" className="form-inp" value={form.shortDuration}
                  onChange={e => set('shortDuration', e.target.value)} min="1" max="60" />
              </div>
              <div className="form-grp">
                <label className="sub-label">Long Break</label>
                <input type="number" className="form-inp" value={form.longDuration}
                  onChange={e => set('longDuration', e.target.value)} min="1" max="120" />
              </div>
              <div className="form-grp">
                <label className="sub-label">Custom</label>
                <input type="number" className="form-inp" value={form.customDuration}
                  onChange={e => set('customDuration', e.target.value)} min="1" max="480" />
              </div>
            </div>
          </div>

          <div className="form-grp toggles-grp">
            <label className="toggle-row">
              <div className="toggle-track" data-on={form.autoSwitch ? 'true' : 'false'}
                onClick={() => set('autoSwitch', !form.autoSwitch)}>
                <div className="toggle-thumb" />
              </div>
              <div>
                <div className="toggle-lbl">Auto-switch to break</div>
                <div className="toggle-sub">Automatically start break when focus timer ends</div>
              </div>
            </label>
            <label className="toggle-row">
              <div className="toggle-track" data-on={form.sound ? 'true' : 'false'}
                onClick={() => set('sound', !form.sound)}>
                <div className="toggle-thumb" />
              </div>
              <div>
                <div className="toggle-lbl">Play alarm sound</div>
                <div className="toggle-sub">Chime when timer completes</div>
              </div>
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-submit" style={{ '--submit-c': '#6366f1' }}>Apply</button>
          </div>
        </form>
      </div>
    </div>
  );
}
