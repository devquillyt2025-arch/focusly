export default function DailyIntentions({ intentions, onUpdate, onToggle }) {
  const filled = intentions.items.filter(i => i.text.trim()).length;
  const done   = intentions.items.filter(i => i.done).length;

  return (
    <div className="intentions-panel">
      <div className="intentions-hdr">
        <div className="intentions-title-row">
          <span className="intentions-icon">✨</span>
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
  return (
    <div className={`intention-row${item.done ? ' intention-done' : ''}`}>
      <button
        className={`intention-check${item.done ? ' checked' : ''}`}
        onClick={() => item.text.trim() && onToggle(item.id)}
        disabled={!item.text.trim()}
        aria-label={item.done ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.done && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      <input
        type="text"
        className="intention-input"
        placeholder={`Intention ${index + 1}…`}
        value={item.text}
        onChange={e => onUpdate(item.id, e.target.value)}
      />
    </div>
  );
}
