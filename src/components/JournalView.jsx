import { useState, useRef, useCallback } from 'react';

// ─── Storage helpers ───────────────────────────────────────────────
function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

const jKey = d => `focusly_journal_${d}`;

function emptyEntry(date) {
  return {
    date,
    content: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadEntry(date) {
  try {
    const raw = localStorage.getItem(jKey(date));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function persistEntry(date, entry) {
  try {
    localStorage.setItem(jKey(date), JSON.stringify({ ...entry, updatedAt: new Date().toISOString() }));
  } catch {}
}

function loadAllEntries() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('focusly_journal_')) continue;
    try {
      const e = JSON.parse(localStorage.getItem(key));
      if (e?.date) out.push(e);
    } catch {}
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function getDocContent(e) {
  if (!e) return '';
  if (e.content != null) return e.content;
  // Fallback for old structured entries if any exist
  const parts = [
    ...(e.wins || []).filter(Boolean),
    ...(e.blockers || []).filter(Boolean),
    e.tomorrowFocus || ''
  ].filter(Boolean);
  return parts.join('\n\n');
}

function hasContent(e) {
  if (!e) return false;
  if (e.content != null) return e.content.trim().length > 0;
  return e.mood != null
    || (e.wins   || []).some(w => w.trim())
    || (e.blockers || []).some(b => b.trim())
    || (e.tomorrowFocus || '').trim().length > 0;
}

function calcStreak(todayDate) {
  // If today has content, count from today; otherwise start from yesterday
  const todayHasContent = hasContent(loadEntry(todayDate));
  const startOffset = todayHasContent ? 0 : 1;
  let streak = 0;
  const base = new Date(todayDate + 'T12:00:00');
  for (let i = startOffset; i < 365; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    if (hasContent(loadEntry(localDateStr(d)))) streak++;
    else break;
  }
  return streak;
}

function wordCount(entry) {
  if (!entry) return 0;
  const text = getDocContent(entry).trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function fmtHistoryDate(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ─── Main component ────────────────────────────────────────────────
export default function JournalView() {
  const todayDate  = localDateStr();
  const dateLabel  = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const [entry,        setEntry]        = useState(() => loadEntry(todayDate) ?? emptyEntry(todayDate));
  const [viewingDate,  setViewingDate]  = useState(todayDate);
  const [history,      setHistory]      = useState(loadAllEntries);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const savedTimerRef = useRef(null);

  const isToday     = viewingDate === todayDate;
  const streak      = calcStreak(todayDate);
  const wc          = wordCount(entry);

  // For past-entry reading, load directly (they don't mutate)
  const viewedEntry = isToday
    ? entry
    : (loadEntry(viewingDate) ?? emptyEntry(viewingDate));

  const showSaved = useCallback(() => {
    setSavedFeedback(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedFeedback(false), 1500);
  }, []);

  const updateContent = useCallback((text) => {
    setEntry(prev => {
      const next = { ...prev, content: text };
      persistEntry(todayDate, next);
      showSaved();
      return next;
    });
    // Refresh history list (deferred so state settles first)
    setTimeout(() => setHistory(loadAllEntries()), 0);
  }, [todayDate, showSaved]);

  const pastEntries = history.filter(e => e.date !== todayDate);

  return (
    <div className="journal-layout">

      {/* ── Left: entry history ── */}
      <aside className="journal-sidebar">
        <div className="journal-sidebar-hdr">Entries</div>
        <div className="journal-entry-list">

          {/* Today row — always pinned at top */}
          <button
            className={`jej-row${viewingDate === todayDate ? ' jej-active' : ''}`}
            onClick={() => setViewingDate(todayDate)}
          >
            <div className="jej-meta">
              <span className="jej-today-tag">Today</span>
            </div>
            <span className="jej-preview">
              {getDocContent(entry).trim() || 'No entry yet'}
            </span>
          </button>

          {/* Past entries */}
          {pastEntries.length === 0 ? (
            <div className="jej-empty-hint">Your reflections will appear here</div>
          ) : (
            pastEntries.map(e => (
              <button
                key={e.date}
                className={`jej-row${viewingDate === e.date ? ' jej-active' : ''}`}
                onClick={() => setViewingDate(e.date)}
              >
                <div className="jej-meta">
                  <span className="jej-date-lbl">{fmtHistoryDate(e.date)}</span>
                </div>
                <span className="jej-preview">{getDocContent(e).trim() || '—'}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Right: editor / viewer ── */}
      <div className="journal-main">

        {/* Header */}
        <div className="journal-hdr">
          <div className="journal-hdr-left">
            <h2 className="journal-page-title">Journal</h2>
            {streak > 0 && (
              <div className="journal-streak">
                <JIcoFlame />
                {streak} day streak
              </div>
            )}
          </div>
          <span className="journal-date-display">
            {isToday ? dateLabel : fmtHistoryDate(viewingDate)}
          </span>
        </div>

        {/* Past-entry reading banner */}
        {!isToday && (
          <div className="journal-past-banner">
            <span>Viewing {fmtHistoryDate(viewingDate)}</span>
            <button className="journal-back-btn" onClick={() => setViewingDate(todayDate)}>
              ← Back to Today
            </button>
          </div>
        )}

        {/* Entry doc */}
        <div className="journal-doc-container">
          <textarea
            className="journal-doc-textarea"
            value={getDocContent(viewedEntry)}
            onChange={isToday ? e => setEntry(prev => ({ ...prev, content: e.target.value })) : undefined}
            onBlur={isToday ? e => updateContent(e.target.value) : undefined}
            readOnly={!isToday}
            placeholder={isToday ? "Write your thoughts, reflections, or notes for the day..." : "No content for this day."}
          />
        </div>

        {/* Footer: word count + saved badge */}
        <div className="journal-footer">
          {wc > 0 && <span className="journal-wc">{wc} words</span>}
          {savedFeedback && isToday && (
            <span className="journal-saved-badge">
              <JIcoCheck />
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inline icons ───────────────────────────────────────────────────
function JIcoFlame() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  );
}

function JIcoCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
