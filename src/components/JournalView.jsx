import { useState, useRef, useCallback } from 'react';

// ─── Mood definitions ──────────────────────────────────────────────
const MOODS = [
  { id: 'energized', label: 'Energized', color: '#f59e0b' },
  { id: 'focused',   label: 'Focused',   color: '#818cf8' },
  { id: 'neutral',   label: 'Neutral',   color: '#64748b' },
  { id: 'tired',     label: 'Tired',     color: '#94a3b8' },
  { id: 'stressed',  label: 'Stressed',  color: '#ef4444' },
];

// ─── Storage helpers ───────────────────────────────────────────────
function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

const jKey = d => `focusly_journal_${d}`;

function emptyEntry(date) {
  return {
    date,
    mood: null,
    wins: ['', '', ''],
    blockers: ['', ''],
    tomorrowFocus: '',
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

function hasContent(e) {
  if (!e) return false;
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
  const text = [
    ...(entry.wins || []),
    ...(entry.blockers || []),
    entry.tomorrowFocus || '',
  ].join(' ').trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function moodColor(id) {
  return MOODS.find(m => m.id === id)?.color ?? 'var(--border)';
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

  const updateEntry = useCallback((patch) => {
    setEntry(prev => {
      const next = { ...prev, ...patch };
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
              <span className="jej-mood-dot" style={{ background: entry.mood ? moodColor(entry.mood) : 'var(--border)' }} />
            </div>
            <span className="jej-preview">
              {entry.wins?.[0]?.trim() || 'No entry yet'}
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
                  <span className="jej-mood-dot" style={{ background: moodColor(e.mood) }} />
                </div>
                <span className="jej-preview">{e.wins?.[0]?.trim() || '—'}</span>
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

        {/* Entry cards */}
        <div className="journal-cards">

          {/* 1. Mood check-in */}
          <MoodCard
            mood={viewedEntry.mood}
            onChange={isToday ? m => updateEntry({ mood: m }) : null}
          />

          {/* 2. Wins */}
          <BulletCard
            title="Wins Today"
            subtitle="What went well?"
            items={viewedEntry.wins?.length ? viewedEntry.wins : ['', '', '']}
            placeholder="Something that went well..."
            onChange={isToday ? wins => updateEntry({ wins }) : null}
          />

          {/* 3. Blockers */}
          <BulletCard
            title="Blockers"
            subtitle="What got in the way?"
            items={viewedEntry.blockers?.length ? viewedEntry.blockers : ['', '']}
            placeholder="Something that slowed me down..."
            onChange={isToday ? blockers => updateEntry({ blockers }) : null}
          />

          {/* 4. Tomorrow's focus */}
          <FocusCard
            value={viewedEntry.tomorrowFocus || ''}
            onChange={isToday ? tf => updateEntry({ tomorrowFocus: tf }) : null}
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

// ─── Mood card ──────────────────────────────────────────────────────
function MoodCard({ mood, onChange }) {
  return (
    <div className="j-card">
      <div className="j-card-hdr">
        <span className="j-card-title">Mood Check-In</span>
      </div>
      <div className="j-mood-pills">
        {MOODS.map(m => {
          const active = mood === m.id;
          return (
            <button
              key={m.id}
              className={`j-mood-pill${active ? ' j-mood-active' : ''}${!onChange ? ' j-readonly' : ''}`}
              style={active ? { background: '#818cf8', color: '#fff', borderColor: '#818cf8' } : {}}
              onClick={() => onChange?.(active ? null : m.id)}
              disabled={!onChange}
            >
              <span className="j-mood-ico">
                <JMoodIcon id={m.id} active={active} />
              </span>
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bullet card (wins / blockers) ─────────────────────────────────
function BulletCard({ title, subtitle, items, placeholder, onChange }) {
  const readOnly  = !onChange;
  const allFilled = items.every(s => s.trim().length > 0);

  const setItem = (i, val) => {
    const next = [...items];
    next[i] = val;
    onChange(next);
  };

  return (
    <div className="j-card">
      <div className="j-card-hdr">
        <span className="j-card-title">{title}</span>
        <span className="j-card-sub">{subtitle}</span>
      </div>
      <div className="j-bullet-list">
        {items.map((val, i) => (
          <div key={i} className="j-bullet-row">
            <span className="j-bullet-dot" />
            {readOnly ? (
              <span className="j-bullet-text">{val || '—'}</span>
            ) : (
              <input
                className="j-bullet-input"
                value={val}
                onChange={e => setItem(i, e.target.value)}
                placeholder={placeholder}
              />
            )}
          </div>
        ))}
        {!readOnly && allFilled && (
          <button className="j-add-btn" onClick={() => onChange([...items, ''])}>
            <JIcoPlus /> Add
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tomorrow's focus card ──────────────────────────────────────────
function FocusCard({ value, onChange }) {
  return (
    <div className="j-card j-card-focus">
      <div className="j-card-hdr">
        <span className="j-card-title">Tomorrow's Focus</span>
      </div>
      {onChange ? (
        <input
          className="j-focus-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="My #1 priority tomorrow is..."
        />
      ) : (
        <p className="j-focus-text">{value || '—'}</p>
      )}
    </div>
  );
}

// ─── Inline icons ───────────────────────────────────────────────────
function JMoodIcon({ id, active }) {
  const c = active ? '#fff' : (MOODS.find(m => m.id === id)?.color ?? '#64748b');
  const p = { fill: 'none', stroke: c, strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'energized':
      return <svg width="14" height="14" viewBox="0 0 24 24" {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case 'focused':
      return <svg width="14" height="14" viewBox="0 0 24 24" {...p}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.04z"/></svg>;
    case 'neutral':
      return <svg width="14" height="14" viewBox="0 0 24 24" {...p}><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case 'tired':
      return <svg width="14" height="14" viewBox="0 0 24 24" {...p}><rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="13" x2="23" y2="11"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/></svg>;
    case 'stressed':
      return <svg width="14" height="14" viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    default: return null;
  }
}

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

function JIcoPlus() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
