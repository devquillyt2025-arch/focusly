import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

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
function NoteModal({ note, onSave, onClose, onDelete }) {
  const [title,   setTitle]   = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [color,   setColor]   = useState(note.color);
  const [pinned,  setPinned]  = useState(note.pinned);
  const [tagInput, setTagInput] = useState('');
  const [tags,    setTags]    = useState(note.tags || []);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => { contentRef.current?.focus(); }, []);

  // Auto-resize textarea to content height — no fixed-height dead space
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [content]);

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

  // Bug 1 fix: portal renders directly into document.body, completely outside
  // the framer-motion <motion.div> wrapper in App.jsx that has transform:translateY(0px)
  // at rest. That transform creates a CSS containing block for position:fixed,
  // making the overlay only cover the tab content area instead of the full viewport.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={handleSave}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }}
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
          // Bug 2 fix: overflow:hidden gives the flex container a hard clip boundary
          // at maxHeight. Without it, flex children can visually expand the container
          // past the max, so the inner scrollable div never gets a bounded height to
          // scroll against.
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

        {/* Scrollable content area — grows with note, scrolls only when modal hits maxHeight */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>

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

            {/* Color picker — swatch shows active color at all times */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowColorPicker(s => !s)} title="Change color"
                style={{ background: showColorPicker ? 'rgba(99,102,241,0.08)' : 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                {/* Active color swatch — visible without opening picker */}
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
              <AnimatePresence>
                {showColorPicker && (
                  <motion.div initial={{ opacity: 0, y: -6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.95 }} transition={{ duration: 0.12 }}
                    style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, display: 'flex', gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 10, flexWrap: 'wrap', maxWidth: 220 }}>
                    {/* Default (no color) */}
                    <button onClick={() => { setColor('default'); setShowColorPicker(false); }}
                      style={{ width: 28, height: 28, borderRadius: '50%', border: color === 'default' ? '2px solid var(--accent)' : '2px solid var(--border)', background: 'var(--bg-input)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {color === 'default' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                    {COLOR_DOTS.map((c, i) => (
                      <button key={c} onClick={() => { setColor(NOTE_COLORS[i+1].id); setShowColorPicker(false); }}
                        style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: color === NOTE_COLORS[i+1].id ? '3px solid white' : '2px solid transparent', cursor: 'pointer', boxShadow: color === NOTE_COLORS[i+1].id ? `0 0 0 2px ${c}` : 'none' }} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
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
    </motion.div>,
    document.body
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────
function NoteCard({ note, onOpen, onPin, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const accent    = COLOR_ACCENT[note.color] ?? null;
  const colStyle  = getColor(note.color);
  const isColored = note.color !== 'default';

  // Reset on id change to prevent stuck hover after grid reflow
  useEffect(() => { setHovered(false); }, [note.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
      animate={{
        opacity: 1, scale: 1,
        y: hovered ? -2 : 0,
        boxShadow: hovered ? '0 8px 20px rgba(0,0,0,0.09)' : '0 1px 4px rgba(0,0,0,0.04)',
      }}
      exit={{ opacity: 0, scale: 0.95, y: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerLeave={() => setHovered(false)}
      onClick={() => onOpen(note)}
      style={{
        background: isColored ? colStyle.bg : 'var(--bg-surface)',
        border: `1px solid ${isColored ? colStyle.border : 'var(--border)'}`,
        borderRadius: 16,
        padding: '14px 16px',
        cursor: 'pointer',
        height: 200,
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

      {/* Title — max 2 lines, then ellipsis */}
      {note.title && (
        <div style={{
          fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)',
          lineHeight: 1.35, paddingRight: note.pinned ? 20 : 0,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden', flexShrink: 0,
        }}>
          {note.title}
        </div>
      )}

      {/* Content preview — hard-clamped to 3 lines */}
      {note.content && (
        <div style={{
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontSize: '0.81rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          wordBreak: 'break-word',
          flexShrink: 0,
        }}>
          {note.content}
        </div>
      )}

      {/* Tags — single overflow-hidden row */}
      {note.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, overflow: 'hidden' }}>
          {note.tags.map(t => (
            <span key={t} style={{
              // On colored cards use a semi-white background so the pill reads
              // against the tinted card fill; on default cards use accent tint.
              background: isColored ? 'rgba(255,255,255,0.58)' : 'rgba(99,102,241,0.08)',
              color: accent ?? 'var(--accent)',
              padding: '2px 8px', borderRadius: 20,
              fontSize: '0.68rem', fontWeight: 600, lineHeight: 1.6,
              whiteSpace: 'nowrap',
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
export default function NotesView() {
  const [notes,       setNotes]       = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  });
  const [search,      setSearch]      = useState('');
  const [activeTag,   setActiveTag]   = useState(null);
  const [activeColor, setActiveColor] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [viewMode,    setViewMode]    = useState('grid'); // 'grid' | 'list'
  const [quickTitle,  setQuickTitle]  = useState('');
  const quickRef = useRef(null);

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
      const updated = exists ? prev.map(n => n.id === note.id ? note : n) : [note, ...prev];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const deleteNote = (id) => {
    const updated = notes.filter(n => n.id !== id);
    persist(updated);
  };

  const togglePin = (id) => {
    const updated = notes.map(n => n.id === id ? { ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() } : n);
    persist(updated);
  };

  const openNew = (overrides = {}) => setEditingNote(newNote(overrides));
  const openEdit = (note) => setEditingNote(note);

  // Quick create from the top bar input
  const handleQuickCreate = (e) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    const note = newNote({ title: quickTitle.trim() });
    saveNote(note);
    setQuickTitle('');
    setEditingNote(note); // immediately open for more editing
  };

  // ── Derived data ───────────────────────────────────────────────────
  const allTags = useMemo(() => {
    const set = new Set();
    notes.forEach(n => n.tags?.forEach(t => set.add(t)));
    return [...set].sort();
  }, [notes]);

  const filtered = useMemo(() => {
    let result = [...notes];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags?.some(t => t.includes(q))
      );
    }
    if (activeTag)   result = result.filter(n => n.tags?.includes(activeTag));
    if (activeColor) result = result.filter(n => n.color === activeColor);
    return result;
  }, [notes, search, activeTag, activeColor]);

  const pinned   = filtered.filter(n => n.pinned);
  const unpinned = filtered.filter(n => !n.pinned);

  const gridStyle = viewMode === 'grid'
    ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, alignItems: 'start' }
    : { display: 'flex', flexDirection: 'column', gap: 10 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface)', overflow: 'hidden' }}>

      {/* ── Top Bar ── */}
      <div style={{ padding: '16px 24px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>

        {/* Heading row — title left, controls right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Notes</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* View toggle */}
            <div style={{ display: 'flex', background: 'var(--bg-input)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
              {[
                { mode: 'grid', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
                { mode: 'list', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
              ].map(({ mode, icon }) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  style={{ padding: '5px 8px', borderRadius: 8, border: 'none', background: viewMode === mode ? 'var(--accent)' : 'transparent', color: viewMode === mode ? '#fff' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  {icon}
                </button>
              ))}
            </div>
            <button onClick={() => openNew()}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 12, fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
              ＋ New Note
            </button>
          </div>
        </div>

        {/* Quick capture — capped width, compact height, accent left-border signals "creates" */}
        <form onSubmit={handleQuickCreate} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 680, background: 'rgba(99,102,241,0.08)', border: '1.5px solid rgba(99,102,241,0.30)', borderLeft: '3px solid var(--accent)', borderRadius: 10, padding: '8px 12px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <input
              ref={quickRef}
              type="text"
              value={quickTitle}
              onChange={e => setQuickTitle(e.target.value)}
              placeholder="Quick note… (press Enter to save)"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.875rem', color: 'var(--text-primary)', fontFamily: 'inherit' }}
            />
            {quickTitle && (
              <button type="submit" style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Save</button>
            )}
          </div>
        </form>

        {/* ── Single combined filter row: search | color dots | active pills | counter ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 34 }}>

          {/* Search input — compact fixed width */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', width: 260, flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes…"
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.82rem', color: 'var(--text-primary)', fontFamily: 'inherit', flex: 1, minWidth: 0 }}
            />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>}
          </div>

          {/* Thin divider */}
          <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

          {/* Color filter dots — no persistent label, tooltips on hover */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button onClick={() => setActiveColor(null)}
              style={{ width: 18, height: 18, borderRadius: '50%', border: !activeColor ? '2px solid var(--accent)' : '2px solid var(--border)', background: 'var(--bg-input)', cursor: 'pointer', flexShrink: 0 }}
              title="All colors" />
            {COLOR_DOTS.map((c, i) => (
              <button key={c} onClick={() => setActiveColor(activeColor === NOTE_COLORS[i+1].id ? null : NOTE_COLORS[i+1].id)}
                title={NOTE_COLORS[i+1].label}
                style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: activeColor === NOTE_COLORS[i+1].id ? '2px solid white' : '2px solid transparent', cursor: 'pointer', boxShadow: activeColor === NOTE_COLORS[i+1].id ? `0 0 0 2px ${c}` : 'none', transition: 'all 0.12s', flexShrink: 0 }} />
            ))}
          </div>

          {/* Active filter pills — color pill */}
          {activeColor && (
            <button onClick={() => setActiveColor(null)} title="Clear color filter"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${COLOR_ACCENT[activeColor]}18`, color: COLOR_ACCENT[activeColor], border: `1px solid ${COLOR_ACCENT[activeColor]}55`, padding: '3px 9px 3px 7px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLOR_ACCENT[activeColor], display: 'inline-block' }} />
              {getColor(activeColor).label}
              <span style={{ opacity: 0.6, fontSize: '0.76rem', marginLeft: 2 }}>×</span>
            </button>
          )}

          {/* Active filter pills — tag pill */}
          {activeTag && (
            <button onClick={() => setActiveTag(null)} title="Clear tag filter"
              style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(99,102,241,0.09)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.22)', padding: '3px 9px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
              #{activeTag}
              <span style={{ opacity: 0.6, fontSize: '0.76rem', marginLeft: 2 }}>×</span>
            </button>
          )}

          {/* Clear all — only when both filters active */}
          {activeColor && activeTag && (
            <button onClick={() => { setActiveColor(null); setActiveTag(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.72rem', padding: '2px 4px', textDecoration: 'underline', textUnderlineOffset: 2, flexShrink: 0 }}>
              Clear all
            </button>
          )}

          {/* Note counter — pushed to far right */}
          <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {(search.trim() || activeTag || activeColor)
              ? `${filtered.length} of ${notes.length} note${notes.length !== 1 ? 's' : ''}`
              : `${notes.length} note${notes.length !== 1 ? 's' : ''}`}
          </div>

          {/* Tag pills — appear after counter as a second wrapped line when tags exist */}
          {allTags.length > 0 && (
            <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 5, paddingTop: 4 }}>
              {allTags.map(t => (
                <button key={t} onClick={() => setActiveTag(activeTag === t ? null : t)}
                  style={{ background: activeTag === t ? 'var(--accent)' : 'rgba(99,102,241,0.08)', color: activeTag === t ? '#fff' : 'var(--accent)', border: activeTag === t ? 'none' : '1px solid rgba(99,102,241,0.15)', borderRadius: 20, padding: activeTag === t ? '2px 9px' : '2px 9px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 3 }}>
                  #{t}{activeTag === t && <span style={{ opacity: 0.75, fontSize: '0.74rem' }}>×</span>}
                </button>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* ── Notes Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 40px' }}>

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
                    {pinned.map(n => <NoteCard key={n.id} note={n} onOpen={openEdit} onPin={togglePin} onDelete={deleteNote} />)}
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
                    {unpinned.map(n => <NoteCard key={n.id} note={n} onOpen={openEdit} onPin={togglePin} onDelete={deleteNote} />)}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Note Editor Modal ── */}
      <AnimatePresence>
        {editingNote && (
          <NoteModal
            note={editingNote}
            onSave={saveNote}
            onClose={() => setEditingNote(null)}
            onDelete={deleteNote}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
