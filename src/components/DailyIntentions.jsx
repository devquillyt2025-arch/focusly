import { useState } from 'react';

export default function DailyIntentions({ intentions, onUpdate, onToggle }) {
  const filled = intentions.items.filter(i => i.text.trim()).length;
  const done   = intentions.items.filter(i => i.done).length;

  return (
    <div className="yartu-card">
      <div className="yartu-card-header">
        <div className="yartu-card-title-group">
          <div className="yartu-badge-circle purple">⚡</div>
          <div className="yartu-card-title">TODAY'S INTENTIONS</div>
        </div>
        {filled > 0 ? (
          <span className="yartu-affordance">{done}/{filled} done</span>
        ) : (
          <span className="yartu-affordance">0/3</span>
        )}
      </div>
      <div className="yartu-card-body">
        {intentions.items.map((item, idx) => (
          <IntentionRow
            key={item.id}
            item={item}
            index={idx}
            onUpdate={onUpdate}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

function IntentionRow({ item, index, onUpdate, onToggle }) {
  const [editing, setEditing] = useState(false);

  const startEdit = () => {
    if (!item.done) setEditing(true);
  };

  const stopEdit = () => setEditing(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); stopEdit(); }
    if (e.key === 'Escape') stopEdit();
  };

  return (
    <div
      className={`yartu-intention-row${item.done ? ' intention-done' : ''}`}
      onClick={!editing ? startEdit : undefined}
      style={{ cursor: item.done ? 'default' : editing ? 'default' : 'text' }}
    >
      <button
        className={`yartu-intention-check${item.done ? ' checked' : ''}`}
        onClick={e => { e.stopPropagation(); item.text.trim() && onToggle(item.id); }}
        disabled={!item.text.trim()}
        aria-label={item.done ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.done && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {editing ? (
        <input
          type="text"
          className="yartu-intention-input"
          placeholder={`Intention ${index + 1}…`}
          value={item.text}
          onChange={e => onUpdate(item.id, e.target.value)}
          onBlur={stopEdit}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <span className={`yartu-intention-display${!item.text.trim() ? ' intention-placeholder' : ''}${item.done ? ' intention-display-done' : ''}`}>
          {item.text.trim() || `Tap to write intention ${index + 1}…`}
        </span>
      )}
    </div>
  );
}
