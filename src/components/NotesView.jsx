import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { logActivity } from '../utils/activityLog';
import Select from './Select';

const STORAGE_KEY = 'focusly_notes';

const NOTE_COLORS = [
  { id: 'default', label: 'Default', bg: 'var(--bg-input)',       border: 'var(--border)' },
  { id: 'red',     label: 'Red',     bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.4)' },
  { id: 'orange',  label: 'Orange',  bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.4)' },
  { id: 'yellow',  label: 'Yellow',  bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.4)' },
  { id: 'green',   label: 'Green',   bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.4)' },
  { id: 'teal',    label: 'Teal',    bg: 'rgba(20,184,166,0.12)', border: 'rgba(20,184,166,0.4)' },
  { id: 'blue',    label: 'Blue',    bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.4)' },
  { id: 'purple',  label: 'Purple',  bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.4)' },
  { id: 'pink',    label: 'Pink',    bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.4)' },
];

const COLOR_DOTS = [
  '#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#a855f7','#ec4899',
];

// Solid accent color per note color id — used for tag pill text and toolbar swatch
const COLOR_ACCENT = {
  default: null,
  red:     '#ef4444',
  orange:  '#f97316',
  yellow:  '#eab308',
  green:   '#22c55e',
  teal:    '#14b8a6',
  blue:    '#3b82f6',
  purple:  '#a855f7',
  pink:    '#ec4899',
};

function getColor(id) {
  return NOTE_COLORS.find(c => c.id === id) || NOTE_COLORS[0];
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function newNote(overrides = {}) {
  return {
    id:        Date.now().toString(),
    title:     '',
    content:   '',
    color:     'default',
    pinned:    false,
    tags:      [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Content deduplication ────────────────────────────────────────────────
// Removes storage-level duplication: content = A + B where B is a prefix of A.
// Only fires when B is ≥20 chars so normal notes with repeated short phrases
// are never touched. This is a safe one-time migration for a specific data
// corruption pattern (second occurrence cut off mid-sentence).
function deduplicateContent(content) {
  if (!content || content.length < 40 || content.length > 20000) return content;
  const half = Math.floor(content.length / 2);
  // Exact duplication: content = A + A
  if (content.length % 2 === 0) {
    const A = content.slice(0, half);
    if (content.slice(half) === A) return A;
  }
  // Truncated duplication: content = A + B where B is a non-trivial prefix of A
  for (let splitAt = half; splitAt <= content.length - 20; splitAt++) {
    const A = content.slice(0, splitAt);
    const B = content.slice(splitAt);
    if (A.startsWith(B)) return A;
  }
  return content;
}

// ── Note Editor Modal ──────────────────────────────────────────────────────
export function NoteModal({ note, onSave, onClose, onDelete }) {
  const [title,   setTitle]   = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [color,   setColor]   = useState(note.color);
  const [pinned,  setPinned]  = useState(note.pinned);
  const [tagInput, setTagInput] = useState('');
  const [tags,    setTags]    = useState(note.tags || []);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorBtnRef  = useRef(null);  // for getBoundingClientRect-based portal positioning
  const contentRef   = useRef(null);
  const [colorPopupPos, setColorPopupPos] = useState(null); // { bottom, left } in viewport px

  useEffect(() => { contentRef.current?.focus(); }, []);

  // Auto-resize textarea to content height — no fixed-height dead space
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [content]);

  // Close color-picker portal on outside click
  useEffect(() => {
    if (!showColorPicker) return;
    const close = (e) => {
      if (!e.target.closest('[data-cpop]') && !e.target.closest('[data-cbtn]'))
        setShowColorPicker(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showColorPicker]);

  const handleSave = () => {
    if (!title.trim() && !content.trim()) { onClose(); return; }
    onSave({ ...note, title: title.trim(), content, color, pinned, tags, updatedAt: new Date().toISOString() });
    onClose();
  };

  const addTag = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      const t = tagInput.trim().replace(/^#/, '').toLowerCase();
      if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
      setTagInput('');
    }
    if (e.key === 'Backspace' && !tagInput && tags.length) {
      setTags(prev => prev.slice(0, -1));
    }
  };

  const colStyle   = getColor(color);
  const accentHex  = COLOR_ACCENT[color] ?? null;
  const isNew      = !note.createdAt || note.id === note.createdAt;
  // Always opaque — colStyle.bg values use rgba(r,g,b,0.12) which makes the modal transparent.
  // Color is conveyed by the top border accent instead.
  const modalBg    = 'var(--bg-elevated)';

  // Bug 1 fix: NoteModal is rendered directly from App.jsx (outside the tab-transition
  // motion.div that has transform:translateY applied by framer-motion at rest).
  // A position:fixed overlay inside a transformed ancestor is scoped to that ancestor,
  // not the viewport. Rendering at the App level — same as AddTaskModal — fixes this.
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={handleSave}>
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        style={{
          background: modalBg,
          border: `1px solid ${colStyle.border}`,
          borderTop: accentHex ? `3px solid ${accentHex}` : `1px solid ${colStyle.border}`,
          borderRadius: 20,
          width: '100%', maxWidth: 560,
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column',
          maxHeight: '88vh',
          overflow: 'hidden',
        }}>

        {/* Title — fixed, never scrolls */}
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            style={{ width: '100%', background: 'none', border: 'none', outline: 'none', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        {/* Title / body separator */}
        <div style={{ height: 1, background: 'var(--border)', margin: '12px 20px 0', opacity: 0.5, flexShrink: 0 }} />

        {/* Bug 2 fix: block layout (not flex) means the textarea keeps its JS-set height
            and overflows the container instead of being flex-shrunk to fit it. The container's
            overflowY:auto then correctly shows a scrollbar. */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

          {/* Auto-growing body textarea */}
          <textarea
            ref={contentRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Take a note…"
            style={{
              resize: 'none',
              minHeight: 72,
              overflow: 'hidden',
              background: 'none', border: 'none', outline: 'none',
              padding: '12px 20px 6px',
              fontSize: '0.92rem', color: 'var(--text-secondary)',
              fontFamily: 'inherit', lineHeight: 1.65,
              boxSizing: 'border-box', width: '100%',
            }}
          />

          {/* Tags — sits directly below body, no floating */}
          <div style={{ padding: '6px 20px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {tags.map(t => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600 }}>
                #{t}
                <button onClick={() => setTags(prev => prev.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: '0.8rem', lineHeight: 1, marginLeft: 2 }}>×</button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={addTag}
              placeholder={tags.length ? '' : '+ add tag'}
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'inherit', minWidth: 60, flex: 1 }}
            />
          </div>
        </div>

        {/* Toolbar — always pinned at bottom */}
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>

            {/* Pin */}
            <button onClick={() => setPinned(p => !p)} title={pinned ? 'Unpin' : 'Pin note'}
              style={{ background: pinned ? 'rgba(99,102,241,0.15)' : 'none', border: 'none', cursor: 'pointer', color: pinned ? 'var(--accent)' : 'var(--text-muted)', padding: '6px 8px', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </button>

            {/* Color picker — portal, anchored to button via getBoundingClientRect */}
            <div style={{ position: 'relative' }}>
              <button
                ref={colorBtnRef}
                data-cbtn="1"
                onClick={() => {
                  if (colorBtnRef.current) {
                    const r = colorBtnRef.current.getBoundingClientRect();
                    // Open upward: bottom of popover aligns to top of button, left-aligned
                    setColorPopupPos({
                      bottom: window.innerHeight - r.top + 8,
                      left: r.left,
                    });
                  }
                  setShowColorPicker(s => !s);
                }}
                title="Change color"
                style={{ background: showColorPicker ? 'rgba(99,102,241,0.08)' : 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                {/* Active color swatch */}
                <span style={{
                  width: 11, height: 11, borderRadius: '50%', flexShrink: 0,
                  background: accentHex ?? 'transparent',
                  border: accentHex ? 'none' : '1.5px dashed var(--text-muted)',
                  display: 'inline-block',
                }} />
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
                </svg>
              </button>
              {/* Portal is rendered directly — AnimatePresence can't track a ReactPortal
                  as its direct child, so we rely on motion.div's own initial→animate
                  for the enter fade; close is instant (acceptable UX trade-off). */}
              {showColorPicker && colorPopupPos && createPortal(
                <motion.div
                  data-cpop="1"
                  initial={{ opacity: 0, scale: 0.92, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.12 }}
                    style={{
                      position: 'fixed',
                      bottom: colorPopupPos.bottom,
                      left: colorPopupPos.left,
                      zIndex: 400,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'row',   // single horizontal row — no wrap
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
                    }}>
                    {/* Default (no color) */}
                    <button
                      onClick={() => { setColor('default'); setShowColorPicker(false); }}
                      title="Default"
                      style={{ width: 24, height: 24, borderRadius: '50%', border: color === 'default' ? '2px solid var(--accent)' : '1.5px solid var(--border)', background: 'var(--bg-input)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}>
                      {color === 'default' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                    {COLOR_DOTS.map((c, i) => (
                      <button
                        key={c}
                        title={NOTE_COLORS[i + 1].label}
                        onClick={() => { setColor(NOTE_COLORS[i + 1].id); setShowColorPicker(false); }}
                        style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === NOTE_COLORS[i + 1].id ? '2.5px solid white' : '2px solid transparent', cursor: 'pointer', boxShadow: color === NOTE_COLORS[i + 1].id ? `0 0 0 2px ${c}` : 'none', flexShrink: 0, padding: 0 }}
                      />
                    ))}
                  </motion.div>,
                  document.body
                )}
            </div>

            {/* Delete (only for existing notes) */}
            {!isNew && (
              <button onClick={() => { onDelete(note.id); onClose(); }} title="Delete note"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px 8px', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {note.updatedAt && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Edited {timeAgo(note.updatedAt)}
              </span>
            )}
            <button onClick={handleSave}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 20px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────
export function NoteCard({ note, onOpen, onPin, onDelete, onTagClick }) {
  const [hovered, setHovered] = useState(false);
  const isColored = note.color && note.color !== 'default';
  const colStyle = getColor(note.color);
  const accent = COLOR_ACCENT[note.color];

  // Reset on id change to prevent stuck hover after grid reflow
  useEffect(() => { setHovered(false); }, [note.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98, y: 4 }}
      animate={{
        opacity: 1, scale: 1,
        y: 0,
        boxShadow: hovered ? '0 4px 12px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
      }}
      exit={{ opacity: 0, scale: 0.98, y: 4 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerLeave={() => setHovered(false)}
      onClick={() => onOpen(note)}
      style={{
        background: isColored ? colStyle.bg : 'var(--bg-surface)',
        border: `1px solid ${isColored ? colStyle.border : 'var(--border)'}`,
        borderRadius: 12,
        padding: '12px',
        cursor: 'pointer',
        height: 160,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}>

      {/* Pinned indicator */}
      {note.pinned && (
        <div style={{ position: 'absolute', top: 12, right: 12, color: 'var(--accent)', opacity: 0.6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>
        </div>
      )}

      {/* ── Top block: title + tags + body, grows to fill available space ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>

      {/* Title — max 1 line, then ellipsis */}
      <div style={{
        fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)',
        lineHeight: 1.35, paddingRight: note.pinned ? 20 : 0,
        display: '-webkit-box', WebkitLineClamp: 1,
        WebkitBoxOrient: 'vertical', overflow: 'hidden', flexShrink: 0,
      }}>
        {note.title || 'Untitled'}
      </div>

      {/* Content preview — hard-clamped to 1 line */}
      {note.content && (
        <div style={{
          display: '-webkit-box',
          WebkitLineClamp: 1,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontSize: '0.81rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          wordBreak: 'break-word',
          flexShrink: 0,
        }}>
          {note.content.substring(0, 40)}{note.content.length > 40 ? '...' : ''}
        </div>
      )}

      {/* Tags — single overflow-hidden row */}
      {note.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, overflow: 'hidden' }}>
          {note.tags.map(t => (
            <span key={t} onClick={(e) => { e.stopPropagation(); onTagClick && onTagClick(t); }} style={{
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              padding: '2px 8px', borderRadius: 12,
              fontSize: '0.68rem', fontWeight: 600, lineHeight: 1.6,
              whiteSpace: 'nowrap', cursor: onTagClick ? 'pointer' : 'default',
            }}>#{t}</span>
          ))}
        </div>
      )}

      {/* Spacer — pushes footer to card bottom */}
      <div style={{ flex: 1 }} />
      </div>

      {/* Footer — always pinned at the card bottom */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: `1px solid ${isColored ? colStyle.border : 'var(--border)'}`, flexShrink: 0 }}>
        <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)', letterSpacing: '0.01em' }}>{timeAgo(note.updatedAt)}</span>
        <AnimatePresence>
          {hovered && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}
              style={{ display: 'flex', gap: 4 }}>
              <button onClick={e => { e.stopPropagation(); onPin(note.id); }} title={note.pinned ? 'Unpin' : 'Pin'}
                style={{ background: 'rgba(99,102,241,0.08)', border: 'none', cursor: 'pointer', color: note.pinned ? 'var(--accent)' : 'var(--text-muted)', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill={note.pinned?'currentColor':'none'} stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </button>
              <button onClick={e => { e.stopPropagation(); onDelete(note.id); }} title="Delete"
                style={{ background: 'rgba(239,68,68,0.08)', border: 'none', cursor: 'pointer', color: '#ef4444', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Main NotesView ─────────────────────────────────────────────────────────
export default function NotesView({ onOpenNoteEditor, globalSearchQuery = '' }) {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [notes,       setNotes]       = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  });
  const [sortOrder,   setSortOrder]   = useState('updated');
  const [activeTag,   setActiveTag]   = useState(null);
  const [activeColor, setActiveColor] = useState(null);
  const [viewMode,    setViewMode]    = useState('grid'); // 'grid' | 'list'
  const [quickTitle,  setQuickTitle]  = useState('');
  const quickRef = useRef(null);
  
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [dateOpen, setDateOpen] = useState(false);
  const dateBtnRef = useRef(null);

  const persist = (updated) => {
    setNotes(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  // Bug 3 fix: one-time migration that removes content duplicated at the data
  // level (stored note has the text block twice, second copy possibly truncated).
  // Runs once on mount, only persists when something actually changed.
  useEffect(() => {
    const cleaned = notes.map(n => ({
      ...n,
      content: deduplicateContent(n.content),
    }));
    if (JSON.stringify(cleaned) !== JSON.stringify(notes)) {
      persist(cleaned);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── CRUD ───────────────────────────────────────────────────────────
  const saveNote = (note) => {
    setNotes(prev => {
      const exists = prev.find(n => n.id === note.id);
      logActivity({ module: 'notes', entity_type: 'note', entity_id: note.id, action: exists ? 'updated' : 'created', title: note.title || '(untitled)' });
      const updated = exists ? prev.map(n => n.id === note.id ? note : n) : [note, ...prev];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const deleteNote = (id) => {
    // Functional update avoids stale closure when called via App.jsx-level modal context.
    setNotes(prev => {
      const note = prev.find(n => n.id === id);
      if (note) logActivity({ module: 'notes', entity_type: 'note', entity_id: id, action: 'deleted', title: note.title || '(untitled)' });
      const updated = prev.filter(n => n.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const togglePin = (id) => {
    const updated = notes.map(n => n.id === id ? { ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() } : n);
    persist(updated);
  };

  const openNew = (overrides = {}) => onOpenNoteEditor({ note: newNote(overrides), onSave: saveNote, onDelete: deleteNote });
  const openEdit = (note) => onOpenNoteEditor({ note, onSave: saveNote, onDelete: deleteNote });

  // Quick create from the top bar input
  const handleQuickCreate = (e) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    const note = newNote({ title: quickTitle.trim() });
    saveNote(note);
    setQuickTitle('');
    onOpenNoteEditor({ note, onSave: saveNote, onDelete: deleteNote }); // immediately open for more editing
  };

  // ── Derived data ───────────────────────────────────────────────────
  const allTags = useMemo(() => {
    const set = new Set();
    notes.forEach(n => n.tags?.forEach(t => set.add(t)));
    return [...set].sort();
  }, [notes]);

  const filtered = useMemo(() => {
    let result = [...notes];
    const searchStr = (localSearchQuery || globalSearchQuery).trim().toLowerCase();
    if (searchStr) {
      result = result.filter(n =>
        (n.title && n.title.toLowerCase().includes(searchStr)) ||
        (n.content && n.content.toLowerCase().includes(searchStr)) ||
        n.tags?.some(t => t.toLowerCase().includes(searchStr))
      );
    }
    if (activeTag)   result = result.filter(n => n.tags?.includes(activeTag));
    if (activeColor) result = result.filter(n => n.color === activeColor);
    
    if (dateRange.start) {
      result = result.filter(n => new Date(n.updatedAt) >= dateRange.start);
    }
    if (dateRange.end) {
      const eOfDay = new Date(dateRange.end); eOfDay.setHours(23, 59, 59, 999);
      result = result.filter(n => new Date(n.updatedAt) <= eOfDay);
    }
    
    if (sortOrder === 'alpha') result.sort((a,b) => a.title.localeCompare(b.title));
    else if (sortOrder === 'oldest') result.sort((a,b) => new Date(a.updatedAt) - new Date(b.updatedAt));
    else result.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    return result;
  }, [notes, globalSearchQuery, activeTag, activeColor, sortOrder, dateRange]);

  const pinned   = filtered.filter(n => n.pinned);
  const unpinned = filtered.filter(n => !n.pinned);

  const gridStyle = viewMode === 'grid'
    ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, alignItems: 'start' }
    : { display: 'flex', flexDirection: 'column', gap: 10 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface)', overflow: 'hidden' }}>

      {/* ── Top Bar ── */}
      <div style={{ padding: '0 24px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        
        {/* ROW 1: Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingTop: 16, flexWrap: 'nowrap' }}>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input 
              type="text" 
              placeholder="Search notes..." 
              value={localSearchQuery}
              onChange={e => setLocalSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', outline: 'none', fontSize: '0.875rem' }} 
            />
          </div>
          <Select 
            value={activeColor || 'all'}
            options={[{value:'all',label:'All Colors'}, ...NOTE_COLORS.slice(1).map(c => ({value:c.id, label:c.label, color: c.bg}))]}
            onChange={e => setActiveColor(e.target.value === 'all' ? null : e.target.value)}
            style={{ width: 140, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem' }}
          />
          <Select 
            value={activeTag || 'all'}
            options={[{value:'all',label:'All Tags'}, ...allTags.map(t => ({value:t, label:`#${t}`}))]}
            onChange={e => setActiveTag(e.target.value === 'all' ? null : e.target.value)}
            style={{ width: 140, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem' }}
          />
          <div style={{ position: 'relative' }}>
            <button
              ref={dateBtnRef}
              type="button"
              onClick={() => setDateOpen(!dateOpen)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {fmtRangeLabel(dateRange)}
            </button>
            {dateOpen && (
              <DateRangePicker
                dateRange={dateRange}
                triggerRef={dateBtnRef}
                onChange={r => { setDateRange(r); setDateOpen(false); }}
                onClose={() => setDateOpen(false)}
              />
            )}
          </div>
          <button type="button" onClick={handleQuickCreate} title="Create New Note" style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(99,102,241,0.2)', whiteSpace: 'nowrap', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}>
            <span style={{ fontSize: '1.1rem' }}>➕</span> New Note
          </button>
        </div>

        {/* Row 2: Header & Tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Notes</h2>
          <Select
            value={sortOrder}
            options={[
              {value: 'updated', label: 'Recently Updated'},
              {value: 'oldest', label: 'Oldest'},
              {value: 'alpha', label: 'Alphabetical (A-Z)'}
            ]}
            onChange={e => setSortOrder(e.target.value)}
            style={{ width: 180, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem' }}
          />
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {(localSearchQuery.trim() || globalSearchQuery.trim() || activeTag || activeColor)
              ? `${filtered.length} of ${notes.length} entries`
              : `${notes.length} entries`}
          </div>
          {allTags.length > 0 && (
            <>
              <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }}>
                {allTags.map(t => (
                  <button key={t} onClick={() => setActiveTag(activeTag === t ? null : t)}
                    style={{ background: activeTag === t ? 'var(--accent)' : 'rgba(99,102,241,0.08)', color: activeTag === t ? '#fff' : 'var(--accent)', border: activeTag === t ? 'none' : '1px solid rgba(99,102,241,0.15)', borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s' }}>
                    #{t}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Row 3: Create */}
        <form onSubmit={handleQuickCreate} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
            <span style={{ fontSize: '1.2rem' }}>✏️</span>
            <input
              ref={quickRef}
              type="text"
              value={quickTitle}
              onChange={e => setQuickTitle(e.target.value)}
              placeholder="Write a new note... (⌘ + Enter to save)"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', fontFamily: 'inherit' }}
            />
          </div>
        </form>

      </div>

      {/* ── Notes Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 40px' }}>

        {notes.length === 0 ? (
          /* Empty state */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 16, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, background: 'rgba(99,102,241,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No notes yet</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: 280 }}>Capture ideas, reminders, and things to remember. Click "New Note" to get started.</div>
            </div>
            <button onClick={() => openNew()} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 12, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
              Create your first note
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40%', gap: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No notes match your search</div>
            <button onClick={() => { setSearch(''); setActiveTag(null); setActiveColor(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: '0.85rem' }}>Clear filters</button>
          </div>
        ) : (
          <>
            {/* Pinned section */}
            {pinned.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--text-muted)"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="var(--bg-surface)"/></svg>
                  Pinned
                </div>
                <div style={gridStyle}>
                  <AnimatePresence>
                    {pinned.map(n => <NoteCard key={n.id} note={n} onOpen={openEdit} onPin={togglePin} onDelete={deleteNote} onTagClick={setActiveTag} />)}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* All / Other notes */}
            {unpinned.length > 0 && (
              <div>
                {pinned.length > 0 && (
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                    {search || activeTag || activeColor ? 'Results' : 'Others'}
                  </div>
                )}
                <div style={gridStyle}>
                  <AnimatePresence>
                    {unpinned.map(n => <NoteCard key={n.id} note={n} onOpen={openEdit} onPin={togglePin} onDelete={deleteNote} onTagClick={setActiveTag} />)}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}


// ── Date helpers ──────────────────────────────────────────────────
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function startOfDay(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function endOfDay(d)   { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }

function thisWeekRange() {
  const end   = new Date();
  const start = startOfDay(new Date()); start.setDate(start.getDate() - 6);
  return { start, end };
}

function fmtRangeLabel({ start, end }) {
  if (!start && !end) return 'Date Range';
  const o = { month: 'short', day: 'numeric' };
  const s = start ? start.toLocaleDateString('en-US', o) : '…';
  const e = end   ? end.toLocaleDateString('en-US', o)   : '…';
  if (start && end && sameDay(start, end)) return s;
  return `${s} – ${e}`;
}

// ── Date range picker popover ─────────────────────────────────────
function DateRangePicker({ dateRange, triggerRef, onChange, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose, triggerRef]);

  const [calMonth,  setCalMonth]  = useState(() => {
    const d = dateRange.start || new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [tempRange, setTempRange] = useState({ start: dateRange.start, end: dateRange.end });
  const [picking,   setPicking]   = useState('start');
  const [hoverDay,  setHoverDay]  = useState(null);

  const yr  = calMonth.getFullYear();
  const mo  = calMonth.getMonth();
  const firstDow    = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  const quick = (type) => {
    const now = new Date();
    if (type === 'all')   { onChange({ start: null, end: null }); return; }
    if (type === 'today') { onChange({ start: startOfDay(now), end: now }); return; }
    if (type === 'week')  { onChange(thisWeekRange()); return; }
    if (type === 'month') { onChange({ start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }); return; }
  };

  const handleDayClick = (day) => {
    const d = new Date(yr, mo, day);
    if (picking === 'start' || !tempRange.start) {
      setTempRange({ start: d, end: null });
      setPicking('end');
    } else {
      const s = tempRange.start;
      onChange({ start: d < s ? d : s, end: d < s ? s : d });
    }
  };

  const effectiveEnd = tempRange.end || hoverDay;

  const dayClass = (day) => {
    const d    = new Date(yr, mo, day);
    const isSel  = (tempRange.start && sameDay(d, tempRange.start)) || (tempRange.end && sameDay(d, tempRange.end));
    const isHov  = hoverDay && sameDay(d, hoverDay) && picking === 'end';
    const isBet  = tempRange.start && effectiveEnd && d > tempRange.start && d < effectiveEnd;
    const isTod  = sameDay(d, new Date());
    return ['al-cal-day', isSel ? 'sel' : isHov ? 'hov' : '', isBet ? 'bet' : '', isTod ? 'tod' : '']
      .filter(Boolean).join(' ');
  };

  return (
    <div ref={menuRef} className="al-cal-pop"
      style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50 }}>
      <div className="al-cal-qs">
        {[['today','Today'],['week','This Week'],['month','This Month'],['all','All Time']].map(([v, l]) => (
          <button key={v} className="al-cal-sc" onClick={() => quick(v)}>{l}</button>
        ))}
      </div>
      <div className="al-cal-hr" />

      <div className="al-cal-nav">
        <button className="al-cal-nb" onClick={() => setCalMonth(new Date(yr, mo - 1))}>‹</button>
        <span className="al-cal-ml">{calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button className="al-cal-nb" onClick={() => setCalMonth(new Date(yr, mo + 1))}>›</button>
      </div>

      <div className="al-cal-grid">
        {DOW.map(d => <span key={d} className="al-cal-dow">{d}</span>)}
        {Array.from({ length: firstDow }).map((_, i) => <span key={`_${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          return (
            <button key={day} className={dayClass(day)}
              onMouseEnter={() => picking === 'end' && setHoverDay(new Date(yr, mo, day))}
              onMouseLeave={() => setHoverDay(null)}
              onClick={() => handleDayClick(day)}>
              {day}
            </button>
          );
        })}
      </div>

      <div className="al-cal-hint">
        <span>{picking === 'start' ? 'Select start date' : 'Select end date'}</span>
        {tempRange.start && picking === 'end' && (
          <button className="al-cal-rst"
            onClick={() => { setTempRange({ start: null, end: null }); setPicking('start'); }}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
