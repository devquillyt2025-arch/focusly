import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { logActivity } from '../utils/activityLog';

// ─── Storage helpers ────────────────────────────────────────────────
function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

const jKey = d => `focusly_journal_${d}`;

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
    if (!key?.startsWith('focusly_journal_')) continue;
    try { const e = JSON.parse(localStorage.getItem(key)); if (e?.date) out.push(e); } catch {}
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
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

function fmtDate(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtFullDate(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── Component ──────────────────────────────────────────────────────
export default function JournalView() {
  const todayDate = localDateStr();

  const [viewingDate, setViewingDate]     = useState(todayDate);
  const [history,     setHistory]         = useState(loadAllEntries);
  const [searchQuery, setSearchQuery]     = useState('');
  const [sortOrder,   setSortOrder]       = useState('newest');
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [currentWc,   setCurrentWc]       = useState(0);

  const editorRef       = useRef(null);
  const savedTimerRef   = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const viewingDateRef  = useRef(viewingDate);

  const isToday = viewingDate === todayDate;

  useEffect(() => { viewingDateRef.current = viewingDate; }, [viewingDate]);

  // ── Load content into editor when selected date changes ──
  useEffect(() => {
    const e = loadEntry(viewingDate) ?? emptyEntry(viewingDate);
    const html = toHtml(e.content ?? '');
    if (editorRef.current) {
      editorRef.current.innerHTML = html;
      const isEmpty = !htmlToText(html).trim();
      editorRef.current.dataset.empty = isEmpty ? 'true' : '';
      setCurrentWc(wordCountFromHtml(html));
    }
  }, [viewingDate]);


  // ── Save helpers ──
  const showSaved = useCallback(() => {
    setSavedFeedback(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedFeedback(false), 2200);
  }, []);

  const saveCurrentEntry = useCallback((html) => {
    const date = viewingDateRef.current;
    if (date !== todayDate) return;
    const existing = loadEntry(date) ?? emptyEntry(date);
    const isNew = !hasContentHtml(existing);
    persistEntry(date, { ...existing, content: html });
    if (isNew && htmlToText(html).trim()) {
      logActivity({ module: 'journal', entity_type: 'journal_entry', entity_id: date, action: 'created', title: `Journal — ${date}` });
    } else if (!isNew) {
      logActivity({ module: 'journal', entity_type: 'journal_entry', entity_id: date, action: 'updated', title: `Journal — ${date}` });
    }
    showSaved();
    setTimeout(() => setHistory(loadAllEntries()), 0);
  }, [todayDate, showSaved]);

  // ── Editor events ──
  const handleEditorInput = useCallback(() => {
    if (!editorRef.current || !isToday) return;
    const html = editorRef.current.innerHTML;
    const wc = wordCountFromHtml(html);
    setCurrentWc(wc);
    const isEmpty = !editorRef.current.textContent?.trim();
    editorRef.current.dataset.empty = isEmpty ? 'true' : '';
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (editorRef.current) saveCurrentEntry(editorRef.current.innerHTML);
    }, 1200);
  }, [isToday, saveCurrentEntry]);

  const handleEditorBlur = useCallback(() => {
    if (!editorRef.current || !isToday) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveCurrentEntry(editorRef.current.innerHTML);
  }, [isToday, saveCurrentEntry]);

  const handleManualSave = useCallback(() => {
    if (!editorRef.current || !isToday) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveCurrentEntry(editorRef.current.innerHTML);
  }, [isToday, saveCurrentEntry]);

  // ── Formatting toolbar ──
  const execFormat = useCallback((cmd, value = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }, []);

  // ── Filtered + sorted entries ──
  const filteredEntries = useMemo(() => {
    let entries = history;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(e =>
        e.date.includes(q) ||
        fmtDate(e.date).toLowerCase().includes(q) ||
        htmlToText(e.content ?? '').toLowerCase().includes(q)
      );
    }
    return sortOrder === 'oldest' ? [...entries].reverse() : entries;
  }, [history, searchQuery, sortOrder]);

  const goToToday = () => setViewingDate(todayDate);

  return (
    <div className="journal-v2-layout">

      {/* ── Sidebar ── */}
      <aside className="journal-v2-sidebar">

        {/* Sidebar header */}
        <div className="journal-sidebar-hdr-row">
          <span className="journal-sidebar-title">Entries</span>
          <button className="journal-sidebar-new-btn" onClick={goToToday} title="New entry for today">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New
          </button>
        </div>

        {/* Search */}
        <div className="journal-v2-search-bar">
          <JIcoSearch />
          <input
            type="text"
            placeholder="Search entries..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="journal-search-input"
          />
          {searchQuery && (
            <button className="journal-search-clear" onClick={() => setSearchQuery('')} title="Clear">×</button>
          )}
        </div>

        {/* Sort */}
        <div className="journal-sort-row">
          <span className="journal-sort-lbl">Sort:</span>
          <select className="journal-sort-select" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
            <option value="newest">Date (Newest)</option>
            <option value="oldest">Date (Oldest)</option>
          </select>
        </div>

        {/* Entry list */}
        <div className="journal-v2-entry-list">
          {!searchQuery && (
            <button
              className={`journal-v2-entry-item${viewingDate === todayDate ? ' jej-v2-active' : ''}`}
              onClick={goToToday}
            >
              <div className="jej-v2-top">
                <span className="jej-v2-date-tag">Today</span>
                <span className="jej-v2-wc">
                  {(() => { const wc = wordCountFromHtml(toHtml(loadEntry(todayDate)?.content ?? '')); return wc > 0 ? `${wc}w` : ''; })()}
                </span>
              </div>
              <span className="jej-v2-preview">
                {htmlToText(toHtml(loadEntry(todayDate)?.content ?? '')).trim().slice(0, 75) || 'No entry yet…'}
              </span>
            </button>
          )}

          {filteredEntries.filter(e => e.date !== todayDate).map(e => {
            const html = toHtml(e.content ?? '');
            const preview = htmlToText(html).trim().slice(0, 75);
            const wc = wordCountFromHtml(html);
            return (
              <button
                key={e.date}
                className={`journal-v2-entry-item${viewingDate === e.date ? ' jej-v2-active' : ''}`}
                onClick={() => setViewingDate(e.date)}
              >
                <div className="jej-v2-top">
                  <span className="jej-v2-date-tag">{fmtDate(e.date)}</span>
                  {wc > 0 && <span className="jej-v2-wc">{wc}w</span>}
                </div>
                <span className="jej-v2-preview">{preview || '—'}</span>
              </button>
            );
          })}

          {filteredEntries.filter(e => e.date !== todayDate).length === 0 && searchQuery && (
            <div className="jej-v2-empty">No entries match "{searchQuery}"</div>
          )}
          {!searchQuery && filteredEntries.filter(e => e.date !== todayDate).length === 0 && (
            <div className="jej-v2-empty">Start writing — your entries will appear here</div>
          )}
        </div>

      </aside>

      {/* ── Main editor ── */}
      <div className="journal-v2-main">

        {/* Entry header */}
        <div className="journal-v2-entry-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <JIcoBook />
            <span className="journal-v2-entry-date">
              {isToday ? `Today — ${fmtFullDate(todayDate)}` : fmtFullDate(viewingDate)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isToday && (
              <button className="journal-back-today-btn" onClick={goToToday}>← Back to Today</button>
            )}
            {isToday && (
              <span className="journal-editing-badge">
                <JIcoEdit />
                Editing
              </span>
            )}
          </div>
        </div>

        {/* Editor card */}
        <div className="journal-editor-card">

          {/* Formatting toolbar */}
          <div className={`journal-formatting-toolbar${!isToday ? ' journal-toolbar-disabled' : ''}`}>
            <div className="journal-toolbar-group">
              <button className="journal-toolbar-btn journal-tb-bold"   title="Bold (Ctrl+B)"    onClick={() => execFormat('bold')}    disabled={!isToday}><strong>B</strong></button>
              <button className="journal-toolbar-btn journal-tb-italic" title="Italic (Ctrl+I)"  onClick={() => execFormat('italic')}  disabled={!isToday}><em>I</em></button>
              <button className="journal-toolbar-btn"                   title="Underline (Ctrl+U)" onClick={() => execFormat('underline')} disabled={!isToday}><u>U</u></button>
            </div>
            <div className="journal-toolbar-sep" />
            <div className="journal-toolbar-group">
              <button className="journal-toolbar-btn journal-tb-mono" title="Heading 1" onClick={() => execFormat('formatBlock', '<h1>')} disabled={!isToday}>H1</button>
              <button className="journal-toolbar-btn journal-tb-mono" title="Heading 2" onClick={() => execFormat('formatBlock', '<h2>')} disabled={!isToday}>H2</button>
              <button className="journal-toolbar-btn journal-tb-mono" title="Heading 3" onClick={() => execFormat('formatBlock', '<h3>')} disabled={!isToday}>H3</button>
            </div>
            <div className="journal-toolbar-sep" />
            <div className="journal-toolbar-group">
              <button className="journal-toolbar-btn" title="Bullet List"    onClick={() => execFormat('insertUnorderedList')} disabled={!isToday}><JIcoUL /></button>
              <button className="journal-toolbar-btn" title="Numbered List"  onClick={() => execFormat('insertOrderedList')}  disabled={!isToday}><JIcoOL /></button>
              <button className="journal-toolbar-btn" title="Blockquote"     onClick={() => execFormat('formatBlock', '<blockquote>')} disabled={!isToday}><JIcoQuote /></button>
            </div>
            <button
              className={`journal-save-btn${savedFeedback ? ' journal-save-btn-saved' : ''}`}
              onClick={handleManualSave}
              disabled={!isToday}
              title="Save"
            >
              {savedFeedback ? <><JIcoCheck /> Saved</> : 'Save'}
            </button>
          </div>

          {/* Rich editor */}
          <div
            ref={editorRef}
            className={`journal-rich-editor${!isToday ? ' journal-editor-readonly' : ''}`}
            contentEditable={isToday}
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onBlur={handleEditorBlur}
            data-placeholder={isToday ? 'Write your thoughts, reflections, or notes for today…' : 'No entry for this day.'}
            data-empty="true"
            spellCheck
          />

          {/* Footer */}
          <div className="journal-editor-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!isToday && (
                <span className="journal-readonly-badge"><JIcoLock /> Read-only</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="journal-wc-badge">{currentWc} {currentWc === 1 ? 'word' : 'words'}</span>
              {savedFeedback && isToday && (
                <span className="journal-saved-badge"><JIcoCheck /> Saved</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────
const S = { fill:'none', stroke:'currentColor', strokeWidth:'2', strokeLinecap:'round', strokeLinejoin:'round' };

function JIcoSearch() {
  return <svg width="15" height="15" viewBox="0 0 24 24" {...S} style={{ color: 'var(--text-muted)', flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function JIcoBook() {
  return <svg width="16" height="16" viewBox="0 0 24 24" {...S} style={{ color: 'var(--accent)' }}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
}
function JIcoEdit() {
  return <svg width="12" height="12" viewBox="0 0 24 24" {...S}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
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
  return <svg width="12" height="12" viewBox="0 0 24 24" {...S}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
}
function JIcoCheck() {
  return <svg width="12" height="12" viewBox="0 0 24 24" {...S} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>;
}
