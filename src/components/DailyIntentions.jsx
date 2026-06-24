import { useState } from 'react';

export default function DailyIntentions({ intentions, onUpdate, onToggle }) {
  const filled = intentions.items.filter(i => i.text.trim()).length;
  const done   = intentions.items.filter(i => i.done).length;

  return (
    <div className="intentions-panel">
      <div className="intentions-hdr">
        <div className="intentions-title-row">
          <svg className="intentions-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.937A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/>
          </svg>
          <h3 className="intentions-title">Today's 3 Intentions</h3>
        </div>
        {filled > 0 && (
          <span className="intentions-progress-badge">{done}/{filled} done</span>
        )}
      </div>
      <div className="intentions-list">
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
      className={`intention-row${item.done ? ' intention-done' : ''}`}
      onClick={!editing ? startEdit : undefined}
      style={{ cursor: item.done ? 'default' : editing ? 'default' : 'text' }}
    >
      <button
        className={`intention-check${item.done ? ' checked' : ''}`}
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
          className="intention-input intention-input-active"
          placeholder={`Intention ${index + 1}…`}
          value={item.text}
          onChange={e => onUpdate(item.id, e.target.value)}
          onBlur={stopEdit}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <span className={`intention-display${!item.text.trim() ? ' intention-placeholder' : ''}${item.done ? ' intention-display-done' : ''}`}>
          {item.text.trim() || `Tap to write intention ${index + 1}…`}
        </span>
      )}
    </div>
  );
}
