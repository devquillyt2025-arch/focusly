import { useState, useMemo, useRef, useEffect } from 'react';
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

  const colStyle = getColor(color);
  const isNew    = !note.createdAt || note.id === note.createdAt; // freshly created

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={handleSave}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        style={{ background: colStyle.bg !== 'var(--bg-input)' ? colStyle.bg : 'var(--bg-elevated)', border: `1px solid ${colStyle.border}`, borderRadius: 20, width: '100%', maxWidth: 560, boxShadow: '0 24px 48px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>

        {/* Title */}
        <div style={{ padding: '20px 20px 0' }}>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            style={{ width: '100%', background: 'none', border: 'none', outline: 'none', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        {/* Content */}
        <textarea
          ref={contentRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Take a note…"
          style={{ flex: 1, minHeight: 160, maxHeight: 400, resize: 'none', background: 'none', border: 'none', outline: 'none', padding: '12px 20px', fontSize: '0.92rem', color: 'var(--text-secondary)', fontFamily: 'inherit', lineHeight: 1.65, overflowY: 'auto' }}
        />

        {/* Tags row */}
        <div style={{ padding: '0 20px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: 36 }}>
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

        {/* Toolbar */}
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>

            {/* Pin */}
            <button onClick={() => setPinned(p => !p)} title={pinned ? 'Unpin' : 'Pin note'}
              style={{ background: pinned ? 'rgba(99,102,241,0.15)' : 'none', border: 'none', cursor: 'pointer', color: pinned ? 'var(--accent)' : 'var(--text-muted)', padding: '6px 8px', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </button>

            {/* Color picker */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowColorPicker(s => !s)} title="Change color"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px 8px', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────
function NoteCard({ note, onOpen, onPin, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const colStyle = getColor(note.color);
  const preview  = note.content.slice(0, 300);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1,    y: 0 }}
      exit={{    opacity: 0, scale: 0.95, y: 8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(note)}
      style={{
        background: colStyle.bg, border: `1px solid ${hovered ? colStyle.border.replace('0.4','0.8') : colStyle.border}`,
        borderRadius: 16, padding: '16px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'all 0.15s ease',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.12)' : '0 2px 8px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        breakInside: 'avoid',
        position: 'relative',
      }}>

      {/* Pinned indicator */}
      {note.pinned && (
        <div style={{ position: 'absolute', top: 12, right: 12, color: 'var(--accent)', opacity: 0.7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>
        </div>
      )}

      {/* Title */}
      {note.title && (
        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, paddingRight: note.pinned ? 20 : 0 }}>
          {note.title}
        </div>
      )}

      {/* Content preview */}
      {preview && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {preview}{note.content.length > 300 && '…'}
        </div>
      )}

      {/* Tags */}
      {note.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {note.tags.map(t => (
            <span key={t} style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600 }}>#{t}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 4 }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{timeAgo(note.updatedAt)}</span>
        {/* Hover actions */}
        <AnimatePresence>
          {hovered && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}
              style={{ display: 'flex', gap: 2 }}>
              <button onClick={e => { e.stopPropagation(); onPin(note.id); }} title={note.pinned ? 'Unpin' : 'Pin'}
                style={{ background: 'rgba(99,102,241,0.1)', border: 'none', cursor: 'pointer', color: note.pinned ? 'var(--accent)' : 'var(--text-muted)', padding: '4px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill={note.pinned?'currentColor':'none'} stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </button>
              <button onClick={e => { e.stopPropagation(); onDelete(note.id); }} title="Delete"
                style={{ background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
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
    ? { columns: 'repeat(auto-fill, minmax(240px, 1fr))', columnGap: 16, rowGap: 0 }
    : { display: 'flex', flexDirection: 'column', gap: 10 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface)', overflow: 'hidden' }}>

      {/* ── Top Bar ── */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Notes</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
          </div>
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

        {/* Quick capture row */}
        <form onSubmit={handleQuickCreate} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <input
              ref={quickRef}
              type="text"
              value={quickTitle}
              onChange={e => setQuickTitle(e.target.value)}
              placeholder="Quick note… (press Enter to save)"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--text-primary)', fontFamily: 'inherit' }}
            />
            {quickTitle && (
              <button type="submit" style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Save</button>
            )}
          </div>
        </form>

        {/* Search + filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '7px 12px', flex: 1, minWidth: 180 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes…"
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'inherit', flex: 1 }}
            />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1, padding: 0 }}>×</button>}
          </div>

          {/* Color filters */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setActiveColor(null)}
              style={{ width: 24, height: 24, borderRadius: '50%', border: !activeColor ? '2px solid var(--accent)' : '2px solid var(--border)', background: 'var(--bg-input)', cursor: 'pointer' }}
              title="All colors" />
            {COLOR_DOTS.map((c, i) => (
              <button key={c} onClick={() => setActiveColor(activeColor === NOTE_COLORS[i+1].id ? null : NOTE_COLORS[i+1].id)}
                title={NOTE_COLORS[i+1].label}
                style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: activeColor === NOTE_COLORS[i+1].id ? '2px solid white' : '2px solid transparent', cursor: 'pointer', boxShadow: activeColor === NOTE_COLORS[i+1].id ? `0 0 0 2px ${c}` : 'none', transition: 'all 0.15s' }} />
            ))}
          </div>
        </div>

        {/* Tag pills */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {allTags.map(t => (
              <button key={t} onClick={() => setActiveTag(activeTag === t ? null : t)}
                style={{ background: activeTag === t ? 'var(--accent)' : 'rgba(99,102,241,0.1)', color: activeTag === t ? '#fff' : 'var(--accent)', border: 'none', borderRadius: 20, padding: '3px 12px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                #{t}
              </button>
            ))}
          </div>
        )}
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
                {viewMode === 'grid' ? (
                  <div style={{ ...gridStyle }}>
                    <AnimatePresence>
                      {pinned.map(n => (
                        <div key={n.id} style={{ marginBottom: 16 }}>
                          <NoteCard note={n} onOpen={openEdit} onPin={togglePin} onDelete={deleteNote} />
                        </div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <AnimatePresence>
                      {pinned.map(n => <NoteCard key={n.id} note={n} onOpen={openEdit} onPin={togglePin} onDelete={deleteNote} />)}
                    </AnimatePresence>
                  </div>
                )}
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
                {viewMode === 'grid' ? (
                  <div style={{ ...gridStyle }}>
                    <AnimatePresence>
                      {unpinned.map(n => (
                        <div key={n.id} style={{ marginBottom: 16 }}>
                          <NoteCard note={n} onOpen={openEdit} onPin={togglePin} onDelete={deleteNote} />
                        </div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <AnimatePresence>
                      {unpinned.map(n => <NoteCard key={n.id} note={n} onOpen={openEdit} onPin={togglePin} onDelete={deleteNote} />)}
                    </AnimatePresence>
                  </div>
                )}
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
