import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { logActivity } from '../utils/activityLog';
import { localDateStr } from '../utils/date';

// ─── Storage helpers ────────────────────────────────────────────────
const jKey = d => `nook_journal_${d}`;
const ICONS_KEY = 'nook_journal_icons';

function emptyEntry(date) {
  return { date, content: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

function loadEntry(date) {
  try { const raw = localStorage.getItem(jKey(date)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function persistEntry(date, entry) {
  try { localStorage.setItem(jKey(date), JSON.stringify({ ...entry, updatedAt: new Date().toISOString() })); } catch {}
}

function loadAllEntries() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('nook_journal_')) continue;
    try { const e = JSON.parse(localStorage.getItem(key)); if (e?.date) out.push(e); } catch {}
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function loadIcons() {
  try { return JSON.parse(localStorage.getItem(ICONS_KEY) || '{}'); } catch { return {}; }
}
function persistIcons(map) {
  try { localStorage.setItem(ICONS_KEY, JSON.stringify(map)); } catch {}
}

// ─── Content helpers ────────────────────────────────────────────────
function isHtmlContent(str) {
  return /<[a-z][\s\S]*>/i.test(str);
}

function toHtml(content) {
  if (!content) return '';
  if (isHtmlContent(content)) return content;
  return content.split('\n').map(line =>
    line.trim()
      ? `<p>${line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`
      : '<p><br></p>'
  ).join('');
}

function htmlToText(html) {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

function wordCountFromHtml(html) {
  const text = htmlToText(html).trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function hasContentHtml(e) {
  if (!e) return false;
  return htmlToText(e.content ?? '').trim().length > 0;
}

// ─── Date helpers ───────────────────────────────────────────────────
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}
function fmtDate(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTitleDate(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function relLabel(ds, today) {
  const diff = Math.round((new Date(ds + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  const yr = new Date(ds + 'T12:00:00').getFullYear();
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: yr !== new Date().getFullYear() ? 'numeric' : undefined });
}

// ─── Heatmap builder — single Monday-start week ─────────────────────
function wcLevel(wc) {
  if (!wc) return 0;
  if (wc < 50) return 1;
  if (wc < 150) return 2;
  if (wc < 300) return 3;
  return 4;
}

// App convention (App.jsx getWeekStart) is Monday-start weeks.
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
  d.setDate(d.getDate() - dow);
  return localDateStr(d);
}

function buildWeek(today, weekOffset, wcMap) {
  const start = addDays(mondayOf(today), weekOffset * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const ds = addDays(start, i);
    const dObj = new Date(ds + 'T12:00:00');
    const wc = wcMap[ds] || 0;
    days.push({
      date: ds,
      dow: dObj.toLocaleDateString('en-US', { weekday: 'short' }),
      num: dObj.getDate(),
      future: ds > today,
      wc,
      level: wcLevel(wc),
      isToday: ds === today,
    });
  }
  return { days, start, end: addDays(start, 6) };
}

function weekLabel(weekOffset, start, end) {
  if (weekOffset === 0) return 'This week';
  if (weekOffset === -1) return 'Last week';
  const opt = { month: 'short', day: 'numeric' };
  const s = new Date(start + 'T12:00:00').toLocaleDateString('en-US', opt);
  const e = new Date(end + 'T12:00:00').toLocaleDateString('en-US', opt);
  return `${s} – ${e}`;
}

function computeStreak(today, wcMap) {
  // Count consecutive days with an entry, ending today (or yesterday if today is still blank).
  let cursor = today;
  if (!wcMap[cursor]) cursor = addDays(today, -1);
  let streak = 0;
  while (wcMap[cursor]) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// ─── Component ──────────────────────────────────────────────────────
export default function JournalView() {
  const todayDate = localDateStr();

  const [viewingDate, setViewingDate] = useState(todayDate);
  const [history,     setHistory]     = useState(loadAllEntries);
  const [iconMap,     setIconMap]     = useState(loadIcons);
  const [currentWc,   setCurrentWc]   = useState(0);
  const [saveStatus,  setSaveStatus]  = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [heatmapOpen, setHeatmapOpen] = useState(true);
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const editorRef        = useRef(null);
  const savedTimerRef    = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const viewingDateRef   = useRef(viewingDate);

  const isToday = viewingDate === todayDate;

  useEffect(() => { viewingDateRef.current = viewingDate; }, [viewingDate]);

  // ── Word-count map + derived heatmap/streak (single source: history) ──
  const wcMap = useMemo(() => {
    const m = {};
    history.forEach(e => { const wc = wordCountFromHtml(toHtml(e.content ?? '')); if (wc > 0) m[e.date] = wc; });
    return m;
  }, [history]);

  const week        = useMemo(() => buildWeek(todayDate, weekOffset, wcMap), [todayDate, weekOffset, wcMap]);
  const streak      = useMemo(() => computeStreak(todayDate, wcMap), [todayDate, wcMap]);
  const totalEntries = useMemo(() => Object.keys(wcMap).length, [wcMap]);

  // ── Load content into editor when the viewed date changes ──
  useEffect(() => {
    const e = loadEntry(viewingDate) ?? emptyEntry(viewingDate);
    const html = toHtml(e.content ?? '');
    if (editorRef.current) {
      editorRef.current.innerHTML = html;
      const isEmpty = !htmlToText(html).trim();
      editorRef.current.dataset.empty = isEmpty ? 'true' : '';
      setCurrentWc(wordCountFromHtml(html));
    }
    setSaveStatus('idle');
  }, [viewingDate]);

  // ── Save helpers ──
  const flagSaved = useCallback(() => {
    setSaveStatus('saved');
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
  }, []);

  const saveCurrentEntry = useCallback((html) => {
    const date = viewingDateRef.current;
    if (date !== todayDate) return; // only today's entry is editable
    const existing = loadEntry(date) ?? emptyEntry(date);
    const isNew = !hasContentHtml(existing);
    persistEntry(date, { ...existing, content: html });
    if (isNew && htmlToText(html).trim()) {
      logActivity({ module: 'journal', entity_type: 'journal_entry', entity_id: date, action: 'created', title: `Journal — ${date}` });
    } else if (!isNew) {
      logActivity({ module: 'journal', entity_type: 'journal_entry', entity_id: date, action: 'updated', title: `Journal — ${date}` });
    }
    flagSaved();
    setTimeout(() => setHistory(loadAllEntries()), 0);
  }, [todayDate, flagSaved]);

  // ── Editor events ──
  const handleEditorInput = useCallback(() => {
    if (!editorRef.current || !isToday) return;
    const html = editorRef.current.innerHTML;
    setCurrentWc(wordCountFromHtml(html));
    editorRef.current.dataset.empty = !editorRef.current.textContent?.trim() ? 'true' : '';
    setSaveStatus('saving');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (editorRef.current) saveCurrentEntry(editorRef.current.innerHTML);
    }, 1000);
  }, [isToday, saveCurrentEntry]);

  const handleEditorBlur = useCallback(() => {
    if (!editorRef.current || !isToday) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (saveStatus === 'saving') saveCurrentEntry(editorRef.current.innerHTML);
  }, [isToday, saveCurrentEntry, saveStatus]);

  useEffect(() => () => {
    clearTimeout(autoSaveTimerRef.current);
    clearTimeout(savedTimerRef.current);
  }, []);

  // ── Formatting toolbar ──
  const execFormat = useCallback((cmd, value = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    handleEditorInput();
  }, [handleEditorInput]);

  // ── Navigation ──
  const goToToday = () => setViewingDate(todayDate);
  const goPrev = () => setViewingDate(d => addDays(d, -1));
  const goNext = () => { if (viewingDate < todayDate) setViewingDate(d => addDays(d, 1)); };
  const canGoNext = viewingDate < todayDate;

  // ── Command palette (Cmd/Ctrl+K) ──
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); }
      if (e.key === 'Escape') { setPaletteOpen(false); setIconPickerOpen(false); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ── Emoji / icon per entry ──
  const setEntryIcon = (emoji) => {
    setIconMap(prev => {
      const next = { ...prev };
      if (emoji) next[viewingDate] = emoji; else delete next[viewingDate];
      persistIcons(next);
      return next;
    });
    setIconPickerOpen(false);
  };

  const jumpTo = (date) => { setViewingDate(date); setPaletteOpen(false); };

  const entryIcon = iconMap[viewingDate];
  const dow = new Date(viewingDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <div className="jnx-page">

      {/* ── HEATMAP (compact weekly widget) ── */}
      <section className={`jnx-heatmap-wrap${heatmapOpen ? '' : ' jnx-heatmap-collapsed'}`}>
        <div className="jnx-heatmap-head">
          <div className="jnx-heatmap-stats">
            <div className="jnx-heatmap-title-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="jnx-heatmap-title">Writing activity</span>
              <div className="jnx-week-nav">
                <button className="jnx-nav-arrow jnx-nav-arrow-sm" onClick={() => setWeekOffset(o => o - 1)} title="Previous week" aria-label="Previous week">
                  <svg width="14" height="14" viewBox="0 0 24 24" {...S}><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <button className="jnx-nav-arrow jnx-nav-arrow-sm" onClick={() => setWeekOffset(o => Math.min(0, o + 1))} disabled={weekOffset >= 0} title="Next week" aria-label="Next week">
                  <svg width="14" height="14" viewBox="0 0 24 24" {...S}><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
            <span className="jnx-heatmap-sub">
              {weekLabel(weekOffset, week.start, week.end)}
              <span className="jnx-dot-sep">·</span>
              <span className="jnx-streak"><JIcoFlame /> {streak} day{streak === 1 ? '' : 's'} streak</span>
              <span className="jnx-dot-sep">·</span>
              {totalEntries} entr{totalEntries === 1 ? 'y' : 'ies'}
            </span>
          </div>
          <div className="jnx-heatmap-head-right">
            <button
              className="jnx-collapse-btn"
              onClick={() => setHeatmapOpen(o => !o)}
              title={heatmapOpen ? 'Collapse activity' : 'Expand activity'}
              aria-label={heatmapOpen ? 'Collapse activity' : 'Expand activity'}
              aria-expanded={heatmapOpen}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" {...S} style={{ transform: heatmapOpen ? 'none' : 'rotate(180deg)', transition: 'transform 0.25s ease' }}><polyline points="18 15 12 9 6 15"/></svg>
            </button>
          </div>
        </div>

        <div className="jnx-heatmap-body">
          <div className="jnx-heatmap-body-inner">
            <div className="jnx-week">
              {week.days.map(d => (
                <div className="jnx-week-day" key={d.date}>
                  <span className="jnx-week-dow">{d.dow}</span>
                  <button
                    className={`jnx-week-cell jnx-lvl-${d.level}${d.isToday ? ' jnx-today' : ''}${d.date === viewingDate ? ' jnx-active' : ''}`}
                    disabled={d.future}
                    onClick={() => !d.future && setViewingDate(d.date)}
                    title={d.future ? '' : `${fmtDate(d.date)} — ${d.wc ? `${d.wc} words` : 'no entry'}`}
                    aria-label={`${fmtDate(d.date)}, ${d.wc ? `${d.wc} words` : 'no entry'}`}
                  >
                    <span className="jnx-week-date">{d.num}</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="jnx-heatmap-legend">
              <span>Less</span>
              <span className="jnx-cell jnx-lvl-0" />
              <span className="jnx-cell jnx-lvl-1" />
              <span className="jnx-cell jnx-lvl-2" />
              <span className="jnx-cell jnx-lvl-3" />
              <span className="jnx-cell jnx-lvl-4" />
              <span>More</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── ENTRY HEADER (Notion-style) ── */}
      <header className="jnx-header">
        <div className="jnx-header-top">
          <div className="jnx-header-nav">
            <button className="jnx-nav-arrow" onClick={goPrev} title="Previous day" aria-label="Previous day">
              <svg width="18" height="18" viewBox="0 0 24 24" {...S}><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button className="jnx-nav-arrow" onClick={goNext} disabled={!canGoNext} title="Next day" aria-label="Next day">
              <svg width="18" height="18" viewBox="0 0 24 24" {...S}><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <div className="jnx-icon-slot">
            <button className="jnx-icon-btn" onClick={() => setIconPickerOpen(o => !o)} title="Change icon">
              {entryIcon ? <span className="jnx-icon-emoji">{entryIcon}</span> : <JIcoBook />}
            </button>
            {iconPickerOpen && (
              <div className="jnx-icon-picker" onMouseLeave={() => setIconPickerOpen(false)}>
                {['📓','✍️','🌤️','🌙','💭','🔥','🎯','🌱','☕','🎉','😌','📌'].map(em => (
                  <button key={em} className="jnx-icon-choice" onClick={() => setEntryIcon(em)}>{em}</button>
                ))}
                <button className="jnx-icon-choice jnx-icon-clear" onClick={() => setEntryIcon(null)} title="Default icon">✕</button>
              </div>
            )}
          </div>

          <div className="jnx-title-col">
            <h1 className="jnx-title">{fmtTitleDate(viewingDate)}</h1>
            <div className="jnx-subtitle">
              <span>{dow}</span>
              <span className="jnx-dot-sep">·</span>
              <span>{currentWc} {currentWc === 1 ? 'word' : 'words'}</span>
              {!isToday && (
                <>
                  <span className="jnx-dot-sep">·</span>
                  <span className="jnx-readonly-note"><JIcoLock /> Read-only</span>
                </>
              )}
            </div>
          </div>

          <div className="jnx-header-actions">
            {isToday ? (
              <span className={`jnx-status jnx-status-${saveStatus}`}>
                {saveStatus === 'saving' && <><span className="jnx-status-dot" /> Saving…</>}
                {saveStatus === 'saved' && <><JIcoCheck /> Saved</>}
                {saveStatus === 'idle' && <span className="jnx-status-idle">Autosave on</span>}
              </span>
            ) : (
              <button className="jnx-today-btn" onClick={goToToday}>Back to Today</button>
            )}
            <button className="jnx-search-btn" onClick={() => setPaletteOpen(true)} title="Search entries (Ctrl+K)">
              <JIcoSearch /> <span className="jnx-kbd">⌘K</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── TOOLBAR (minimal, only when editable) ── */}
      {isToday && (
        <div className="jnx-toolbar">
          <button className="journal-toolbar-btn journal-tb-bold"   title="Bold (Ctrl+B)"      onMouseDown={e => e.preventDefault()} onClick={() => execFormat('bold')}><strong>B</strong></button>
          <button className="journal-toolbar-btn journal-tb-italic" title="Italic (Ctrl+I)"    onMouseDown={e => e.preventDefault()} onClick={() => execFormat('italic')}><em>I</em></button>
          <button className="journal-toolbar-btn"                   title="Underline (Ctrl+U)" onMouseDown={e => e.preventDefault()} onClick={() => execFormat('underline')}><u>U</u></button>
          <span className="jnx-tb-sep" />
          <button className="journal-toolbar-btn journal-tb-mono" title="Heading 1" onMouseDown={e => e.preventDefault()} onClick={() => execFormat('formatBlock', '<h1>')}>H1</button>
          <button className="journal-toolbar-btn journal-tb-mono" title="Heading 2" onMouseDown={e => e.preventDefault()} onClick={() => execFormat('formatBlock', '<h2>')}>H2</button>
          <button className="journal-toolbar-btn journal-tb-mono" title="Heading 3" onMouseDown={e => e.preventDefault()} onClick={() => execFormat('formatBlock', '<h3>')}>H3</button>
          <span className="jnx-tb-sep" />
          <button className="journal-toolbar-btn" title="Bullet List"   onMouseDown={e => e.preventDefault()} onClick={() => execFormat('insertUnorderedList')}><JIcoUL /></button>
          <button className="journal-toolbar-btn" title="Numbered List" onMouseDown={e => e.preventDefault()} onClick={() => execFormat('insertOrderedList')}><JIcoOL /></button>
          <button className="journal-toolbar-btn" title="Blockquote"    onMouseDown={e => e.preventDefault()} onClick={() => execFormat('formatBlock', '<blockquote>')}><JIcoQuote /></button>
        </div>
      )}

      {/* ── CONTENT (borderless, full-width) ── */}
      <div
        ref={editorRef}
        className={`journal-rich-editor jnx-editor${!isToday ? ' journal-editor-readonly' : ''}`}
        contentEditable={isToday}
        suppressContentEditableWarning
        onInput={handleEditorInput}
        onBlur={handleEditorBlur}
        data-placeholder={isToday ? (streak > 0 ? `Keep your ${streak} day streak alive!\n\nWrite your thoughts, reflections, or notes for today…` : 'Write your thoughts, reflections, or notes for today…') : 'No entry for this day.'}
        data-empty="true"
        spellCheck
      />

      {/* ── COMMAND PALETTE ── */}
      {paletteOpen && createPortal(
        <CommandPalette
          entries={history}
          todayDate={todayDate}
          onClose={() => setPaletteOpen(false)}
          onJump={jumpTo}
        />, document.body)}
    </div>
  );
}

// ─── Command palette ────────────────────────────────────────────────
function CommandPalette({ entries, todayDate, onClose, onJump }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const list = [];
    // Always allow jumping to today
    const seen = new Set();
    entries.forEach(e => seen.add(e.date));
    const base = [...entries];
    if (!seen.has(todayDate)) base.unshift({ date: todayDate, content: '' });
    const query = q.toLowerCase().trim();
    for (const e of base) {
      const preview = htmlToText(toHtml(e.content ?? '')).trim();
      if (query) {
        const hit = e.date.includes(query)
          || fmtDate(e.date).toLowerCase().includes(query)
          || relLabel(e.date, todayDate).toLowerCase().includes(query)
          || preview.toLowerCase().includes(query);
        if (!hit) continue;
      }
      list.push({ date: e.date, preview: preview.slice(0, 80) });
    }
    return list.slice(0, 40);
  }, [entries, q, todayDate]);

  useEffect(() => { setActive(0); }, [q]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) onJump(results[active].date); }
  };

  return (
    <div className="jnx-palette-overlay" onClick={onClose}>
      <div className="jnx-palette" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="jnx-palette-search">
          <JIcoSearch />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a date or search entries…"
            className="jnx-palette-input"
          />
          <span className="jnx-kbd">Esc</span>
        </div>
        <div className="jnx-palette-list">
          {results.length === 0 ? (
            <div className="jnx-palette-empty">No entries match "{q}"</div>
          ) : results.map((r, i) => (
            <button
              key={r.date}
              className={`jnx-palette-item${i === active ? ' jnx-palette-item-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => onJump(r.date)}
            >
              <div className="jnx-palette-item-top">
                <span className="jnx-palette-date">{fmtTitleDate(r.date)}</span>
                <span className="jnx-palette-rel">{relLabel(r.date, todayDate)}</span>
              </div>
              <span className="jnx-palette-preview">{r.preview || 'No entry yet…'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────
const S = { fill:'none', stroke:'currentColor', strokeWidth:'2', strokeLinecap:'round', strokeLinejoin:'round' };

function JIcoSearch() {
  return <svg width="15" height="15" viewBox="0 0 24 24" {...S} style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function JIcoBook() {
  return <svg width="22" height="22" viewBox="0 0 24 24" {...S} style={{ color: 'var(--accent)' }}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
}
function JIcoUL() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...S}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
}
function JIcoOL() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...S}><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>;
}
function JIcoQuote() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...S}><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>;
}
function JIcoLock() {
  return <svg width="11" height="11" viewBox="0 0 24 24" {...S}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
}
function JIcoCheck() {
  return <svg width="12" height="12" viewBox="0 0 24 24" {...S} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>;
}
function JIcoFlame() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ flexShrink: 0 }}><path d="M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1 .3-1.8.5-2.3C7 8 6 9.5 6 12a6 6 0 0 0 12 0c0-4.5-3.5-7-6-10z"/></svg>;
}
