import { memo,  useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { logActivity } from '../utils/activityLog';
import { localDateStr } from '../utils/date';

// Framer-motion variants — staggered fade-in for the ambient metadata panel.
const META_CONTAINER = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const META_ITEM = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } };

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

// First non-empty line of an entry, for sidebar previews.
function firstLine(e, n = 58) {
  const t = htmlToText(toHtml(e?.content ?? '')).trim();
  if (!t) return '';
  const line = t.split('\n').find(l => l.trim()) || t;
  return line.trim().slice(0, n);
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

// ─── Month grid builder (Monday-start, same convention as the week strip) ──
function firstOfMonth(today, monthOffset) {
  const d = new Date(today + 'T00:00:00');
  d.setDate(1);
  d.setMonth(d.getMonth() + monthOffset);
  return localDateStr(d);
}

function buildMonth(today, monthOffset, wcMap) {
  const first = firstOfMonth(today, monthOffset);
  const firstDate = new Date(first + 'T00:00:00');
  const monthIdx = firstDate.getMonth();
  const gridStart = mondayOf(first);                       // Monday on/before the 1st
  const daysInMonth = new Date(firstDate.getFullYear(), monthIdx + 1, 0).getDate();
  const lead = Math.round((firstDate - new Date(gridStart + 'T00:00:00')) / 86400000);
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7; // 5 or 6 rows, no empty trailing week
  const days = [];
  for (let i = 0; i < totalCells; i++) {
    const ds = addDays(gridStart, i);
    const dObj = new Date(ds + 'T12:00:00');
    const wc = wcMap[ds] || 0;
    days.push({
      date: ds,
      num: dObj.getDate(),
      inMonth: dObj.getMonth() === monthIdx,
      future: ds > today,
      wc,
      level: wcLevel(wc),
      isToday: ds === today,
    });
  }
  return { days, first, monthIdx };
}

function monthLabel(monthOffset, firstStr) {
  if (monthOffset === 0) return 'This month';
  if (monthOffset === -1) return 'Last month';
  return new Date(firstStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Atmosphere: time-of-day mood + premium date formatting ─────────
// Returns a greeting + a phase key that drives the sun/moon glyph and the
// warmth of the ambient canvas glow. Based on the *current* hour (the mood of
// the writing session), shown only for today's entry.
function timeMood(hour) {
  if (hour >= 5  && hour < 12) return { label: 'Morning',   phase: 'dawn'  };
  if (hour >= 12 && hour < 17) return { label: 'Afternoon', phase: 'day'   };
  if (hour >= 17 && hour < 21) return { label: 'Evening',   phase: 'dusk'  };
  return { label: 'Night', phase: 'night' };
}

// "July 13, 2026"
function fmtPremiumDate(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Last N days ending today, flagged by whether an entry exists — the streak "chain".
function buildStreakDots(today, wcMap, n = 7) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ds = addDays(today, -i);
    out.push({ date: ds, active: !!wcMap[ds], isToday: ds === today });
  }
  return out;
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
export default memo(function JournalView() {
  const todayDate = localDateStr();

  const [viewingDate, setViewingDate] = useState(todayDate);
  const [history,     setHistory]     = useState(loadAllEntries);
  const [iconMap,     setIconMap]     = useState(loadIcons);
  const [currentWc,   setCurrentWc]   = useState(0);
  const [saveStatus,  setSaveStatus]  = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [heatmapOpen, setHeatmapOpen] = useState(true);
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [viewMode,    setViewMode]    = useState(() => {
    try { return localStorage.getItem('nook_journal_calview') === 'week' ? 'week' : 'month'; } catch { return 'month'; }
  });
  const [zenMode,     setZenMode]     = useState(false);
  const [selToolbar,  setSelToolbar]  = useState({ show: false, x: 0, y: 0 });
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
  const month       = useMemo(() => buildMonth(todayDate, monthOffset, wcMap), [todayDate, monthOffset, wcMap]);
  const streak      = useMemo(() => computeStreak(todayDate, wcMap), [todayDate, wcMap]);
  const totalEntries = useMemo(() => Object.keys(wcMap).length, [wcMap]);
  const monthEntries = useMemo(() => {
    const ym = month.first.slice(0, 7); // 'YYYY-MM'
    return Object.keys(wcMap).filter(d => d.startsWith(ym)).length;
  }, [wcMap, month.first]);

  // Persist the chosen calendar view
  useEffect(() => { try { localStorage.setItem('nook_journal_calview', viewMode); } catch {} }, [viewMode]);

  // Period-aware nav (chevrons drive months in month view, weeks in week view)
  const isMonth = viewMode === 'month';
  const periodLabel   = isMonth ? monthLabel(monthOffset, month.first) : weekLabel(weekOffset, week.start, week.end);
  const periodEntries = isMonth ? monthEntries : totalEntries;
  const goPrevPeriod  = () => isMonth ? setMonthOffset(o => o - 1) : setWeekOffset(o => o - 1);
  const goNextPeriod  = () => isMonth ? setMonthOffset(o => Math.min(0, o + 1)) : setWeekOffset(o => Math.min(0, o + 1));
  const periodNextDisabled = isMonth ? monthOffset >= 0 : weekOffset >= 0;

  // ── Load content into editor when the viewed date changes ──
  useEffect(() => {
    const e = loadEntry(viewingDate) ?? emptyEntry(viewingDate);
    const html = toHtml(e.content ?? '');
    if (editorRef.current) {
      const el = editorRef.current;
      el.innerHTML = html;
      const isEmpty = !htmlToText(html).trim();
      el.dataset.empty = isEmpty ? 'true' : '';
      setCurrentWc(wordCountFromHtml(html));
      // Cinematic parallax fade-in on day change (restart the CSS animation)
      el.classList.remove('jnx-entry-in');
      void el.offsetWidth;
      el.classList.add('jnx-entry-in');
    }
    setSelToolbar(s => (s.show ? { ...s, show: false } : s));
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
    // Every day's entry is editable — save whichever date is being viewed.
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
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    setCurrentWc(wordCountFromHtml(html));
    editorRef.current.dataset.empty = !editorRef.current.textContent?.trim() ? 'true' : '';
    setSaveStatus('saving');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (editorRef.current) saveCurrentEntry(editorRef.current.innerHTML);
    }, 1000);
  }, [saveCurrentEntry]);

  const handleEditorBlur = useCallback(() => {
    if (!editorRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (saveStatus === 'saving') saveCurrentEntry(editorRef.current.innerHTML);
  }, [saveCurrentEntry, saveStatus]);

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
  // ── Atmosphere derived values ──
  const mood       = useMemo(() => timeMood(new Date().getHours()), []);
  const nowTime    = useMemo(() => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), []);
  const streakDots = useMemo(() => buildStreakDots(todayDate, wcMap, 7), [todayDate, wcMap]);
  // Ambient glow intensity — the canvas "breathes brighter" as the entry grows (full ~350 words).
  const auraIntensity = Math.min(1, currentWc / 350);

  const goToToday = () => setViewingDate(todayDate);
  const goPrev = () => setViewingDate(d => addDays(d, -1));
  const goNext = () => setViewingDate(d => addDays(d, 1)); // any date, incl. future
  const canGoNext = true;

  // ── Command palette (Cmd/Ctrl+K) ──
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); }
      // Cmd/Ctrl+. toggles Zen (Focus) mode
      if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); setZenMode(z => !z); }
      if (e.key === 'Escape') { setPaletteOpen(false); setIconPickerOpen(false); setZenMode(false); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ── Floating selection toolbar — appears only when text is selected in the canvas ──
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const hide = () => setSelToolbar(s => (s.show ? { ...s, show: false } : s));
    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return hide();
      const range = sel.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return hide();
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return;
      setSelToolbar({ show: true, x: rect.left + rect.width / 2, y: rect.top });
    };

    const onMouseUp = () => setTimeout(update, 0);
    const onKeyUp  = (e) => { if (e.shiftKey || e.key === 'Shift' || e.key.startsWith('Arrow')) setTimeout(update, 0); };
    editor.addEventListener('mouseup', onMouseUp);
    editor.addEventListener('keyup', onKeyUp);
    document.addEventListener('selectionchange', update);
    window.addEventListener('scroll', hide, true);
    return () => {
      editor.removeEventListener('mouseup', onMouseUp);
      editor.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('selectionchange', update);
      window.removeEventListener('scroll', hide, true);
    };
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

  return (
    <div
      className={`jnx-page jnx-mood-${mood.phase}${zenMode ? ' jnx-zen' : ''}`}
      style={{ '--jnx-aura': auraIntensity }}
    >
      <div className="jnx-split">

      {/* ═══ LEFT: the canvas — hero ═══ */}
      <div className="jnx-write-panel">
        {/* Ambient glow — radiates from the canvas, brightens with word count, tinted by time of day */}
        <div className="jnx-aura" aria-hidden="true" />

        <header className="jnx-header">
          <div className="jnx-header-lead">
            <div className="jnx-header-nav">
              <button className="jnx-nav-arrow" onClick={goPrev} title="Previous day" aria-label="Previous day">
                <svg width="18" height="18" viewBox="0 0 24 24" {...S}><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button className="jnx-nav-arrow" onClick={goNext} disabled={!canGoNext} title="Next day" aria-label="Next day">
                <svg width="18" height="18" viewBox="0 0 24 24" {...S}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            <div className="jnx-icon-slot">
              <button className="jnx-icon-btn" onClick={() => setIconPickerOpen(o => !o)} title="Change icon" aria-label="Change entry icon">
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
              <div className="jnx-eyebrow">
                <span className="jnx-mood-glyph" aria-hidden="true"><MoodGlyph phase={mood.phase} /></span>
                <span className="jnx-eyebrow-text">{isToday ? mood.label : relLabel(viewingDate, todayDate)}</span>
                {!isToday && <span className="jnx-readonly-note"><JIcoLock /> Read-only</span>}
              </div>
              <h1 className="jnx-title">{fmtPremiumDate(viewingDate)}</h1>
            </div>
          </div>

          <div className="jnx-header-actions">
            <button className="jnx-icon-action" onClick={() => setZenMode(true)} title="Focus mode (Ctrl+.)" aria-label="Enter focus mode">
              <JIcoZen />
            </button>
            <button className="jnx-icon-action" onClick={() => setPaletteOpen(true)} title="Search entries (Ctrl+K)" aria-label="Search entries">
              <JIcoSearch />
            </button>
            {!isToday && <button className="jnx-today-btn" onClick={goToToday}>Today</button>}
            <span className={`jnx-status jnx-status-${saveStatus}`}>
              {saveStatus === 'saving' && <><span className="jnx-status-dot" /> Saving…</>}
              {saveStatus === 'saved' && <><JIcoCheck /> Saved</>}
              {saveStatus === 'idle' && <span className="jnx-status-idle">Autosave</span>}
            </span>
          </div>
        </header>

        {/* ── THE CANVAS — serif writing sanctuary ── */}
        <div className="jnx-canvas">
          <div
            ref={editorRef}
            className="journal-rich-editor jnx-editor"
            contentEditable
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onBlur={handleEditorBlur}
            data-placeholder={isToday
              ? (streak > 0 ? `Keep your ${streak}-day streak alive — begin where you are…` : 'Begin where you are. Write your thoughts, reflections, or notes for today…')
              : 'Write your reflections for this day…'}
            data-empty="true"
            spellCheck
          />
        </div>
      </div>{/* /jnx-write-panel */}

      {/* ═══ RIGHT: ambient metadata — borderless, bleeds into the sanctuary ═══ */}
      <motion.aside
        className="jnx-meta"
        aria-label="Writing activity"
        variants={META_CONTAINER}
        initial="hidden"
        animate="show"
      >
        {/* Time-of-day + date */}
        <motion.div className="jnx-meta-head" variants={META_ITEM}>
          <span className="jnx-meta-eyebrow">
            <span className="jnx-mood-glyph" aria-hidden="true"><MoodGlyph phase={mood.phase} /></span>
            {isToday ? mood.label : relLabel(viewingDate, todayDate)}
          </span>
          <span className="jnx-meta-date">{fmtPremiumDate(viewingDate)}</span>
        </motion.div>

        {/* Stats — today's essence, one row, equal size */}
        <motion.div className="jnx-meta-stats" variants={META_ITEM}>
          <span className="jnx-meta-label">Today’s essence</span>
          <div className="jnx-stat-row">
            <div className="jnx-stat">
              <span className="jnx-stat-num">{currentWc}</span>
              <span className="jnx-stat-unit">{currentWc === 1 ? 'word' : 'words'}</span>
            </div>
            <div className="jnx-stat">
              <span className="jnx-stat-num">{totalEntries}</span>
              <span className="jnx-stat-unit">{totalEntries === 1 ? 'entry' : 'entries'}</span>
            </div>
            <div className="jnx-stat">
              <span className="jnx-stat-num">{streak}</span>
              <span className="jnx-stat-unit">day{streak === 1 ? '' : 's'} streak</span>
            </div>
          </div>
        </motion.div>

        {/* Activity calendar — last section */}
        <motion.div className="jnx-meta-cal" variants={META_ITEM}>
          <div className="jnx-meta-cal-head">
            <span className="jnx-meta-label">Activity</span>
            <div className="jnx-week-nav">
              <button className="jnx-nav-arrow jnx-nav-arrow-sm" onClick={() => setMonthOffset(o => o - 1)} title="Previous month" aria-label="Previous month">
                <svg width="14" height="14" viewBox="0 0 24 24" {...S}><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button className="jnx-nav-arrow jnx-nav-arrow-sm" onClick={() => setMonthOffset(o => o + 1)} title="Next month" aria-label="Next month">
                <svg width="14" height="14" viewBox="0 0 24 24" {...S}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>

          <div className="jnx-heatmap-body">
            <div className="jnx-heatmap-body-inner">
              <div className="jnx-meta-cal-sub">
                <span className="jnx-meta-period">{monthLabel(monthOffset, month.first)} · {monthEntries} entr{monthEntries === 1 ? 'y' : 'ies'}</span>
              </div>

              {/* Month grid — hollow circles, dot = entry, filled = selected */}
              <div className="jnx-month">
                <div className="jnx-month-dows">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
                    <span className="jnx-month-dow" key={i}>{l}</span>
                  ))}
                </div>
                <div className="jnx-month-grid">
                  {month.days.map(d => (
                    <button
                      key={d.date}
                      className={`jnx-mcell${d.wc ? ' jnx-has-entry' : ''}${d.isToday ? ' jnx-today' : ''}${d.date === viewingDate ? ' jnx-active' : ''}${!d.inMonth ? ' jnx-out' : ''}`}
                      onClick={() => setViewingDate(d.date)}
                      title={`${fmtDate(d.date)} — ${d.wc ? `${d.wc} words` : 'no entry'}`}
                      aria-label={`${fmtDate(d.date)}, ${d.wc ? `${d.wc} words` : 'no entry'}`}
                    >
                      <span className="jnx-mcell-num">{d.num}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.aside>

      </div>{/* /jnx-split */}

      {/* ── Focus (Zen) mode exit affordance ── */}
      {zenMode && (
        <button className="jnx-zen-exit" onClick={() => setZenMode(false)} title="Exit focus mode (Esc)" aria-label="Exit focus mode">
          <JIcoZenExit /> Exit focus
        </button>
      )}

      {/* ── Floating selection toolbar — appears only over a text selection ── */}
      {selToolbar.show && createPortal(
        <div
          className="jnx-fab"
          style={{ left: selToolbar.x, top: selToolbar.y }}
          role="toolbar"
          aria-label="Text formatting"
          onMouseDown={e => e.preventDefault()}
        >
          <button className="jnx-fab-btn" title="Bold (Ctrl+B)"   onClick={() => execFormat('bold')}><strong>B</strong></button>
          <button className="jnx-fab-btn jnx-fab-italic" title="Italic (Ctrl+I)" onClick={() => execFormat('italic')}><em>I</em></button>
          <button className="jnx-fab-btn" title="Underline (Ctrl+U)" onClick={() => execFormat('underline')}><u>U</u></button>
          <span className="jnx-fab-sep" />
          <button className="jnx-fab-btn jnx-fab-mono" title="Heading 1" onClick={() => execFormat('formatBlock', '<h1>')}>H1</button>
          <button className="jnx-fab-btn jnx-fab-mono" title="Heading 2" onClick={() => execFormat('formatBlock', '<h2>')}>H2</button>
          <button className="jnx-fab-btn jnx-fab-mono" title="Heading 3" onClick={() => execFormat('formatBlock', '<h3>')}>H3</button>
          <span className="jnx-fab-sep" />
          <button className="jnx-fab-btn" title="Bullet list"   onClick={() => execFormat('insertUnorderedList')}><JIcoUL /></button>
          <button className="jnx-fab-btn" title="Numbered list" onClick={() => execFormat('insertOrderedList')}><JIcoOL /></button>
          <button className="jnx-fab-btn" title="Quote"         onClick={() => execFormat('formatBlock', '<blockquote>')}><JIcoQuote /></button>
        </div>, document.body)}

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
});

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

// ─── Atmosphere components ──────────────────────────────────────────
// Circular word-count meter — the ring fills toward the daily goal and the
// number ticks up as you write (transition handled in CSS).
function WordMeter({ count, goal }) {
  const r = 15;
  const C = 2 * Math.PI * r;
  const pct = Math.min(1, count / goal);
  return (
    <div className="jnx-meter" title={`${count} ${count === 1 ? 'word' : 'words'} · goal ${goal}`} aria-label={`${count} words written`}>
      <svg width="38" height="38" viewBox="0 0 38 38" className="jnx-meter-svg">
        <circle className="jnx-meter-track" cx="19" cy="19" r={r} />
        <circle className="jnx-meter-fill" cx="19" cy="19" r={r} style={{ strokeDasharray: C, strokeDashoffset: C * (1 - pct) }} />
      </svg>
      <span className="jnx-meter-num">{count}</span>
    </div>
  );
}

// Sun / moon glyph reflecting the time of day.
function MoodGlyph({ phase }) {
  if (phase === 'night' || phase === 'dusk') {
    // Crescent moon (+ a small star at night)
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" {...S}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        {phase === 'night' && <path d="M18 4l.6 1.4L20 6l-1.4.6L18 8l-.6-1.4L16 6l1.4-.6z" fill="currentColor" stroke="none" />}
      </svg>
    );
  }
  // Sun
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────
const S = { fill:'none', stroke:'currentColor', strokeWidth:'2', strokeLinecap:'round', strokeLinejoin:'round' };

function JIcoHistory() {
  return <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 3"/></svg>;
}
function JIcoSpark() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2c.4 3.6 1.4 6 3.4 8S20 12.6 22 13c-3.6.4-6 1.4-8 3.4S12.4 20 12 22c-.4-3.6-1.4-6-3.4-8S3.4 13.4 2 13c3.6-.4 6-1.4 8-3.4S11.6 5.4 12 2z"/></svg>;
}
function JIcoZen() {
  return <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>;
}
function JIcoZenExit() {
  return <svg width="15" height="15" viewBox="0 0 24 24" {...S}><path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>;
}

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
