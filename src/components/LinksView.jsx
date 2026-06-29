import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STORAGE_KEY = 'focusly_links';
const BASE_CATS = ['Personal', 'Work', 'Finance', 'Read Later', 'Entertainment'];

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function load()  { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function save(e) { localStorage.setItem(STORAGE_KEY, JSON.stringify(e)); }

function domain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function faviconSrc(url) {
  const d = domain(url);
  return d ? `https://www.google.com/s2/favicons?domain=${d}&sz=32` : null;
}

// ── Favicon with fallback ─────────────────────────────────────────
function FaviconIcon({ url, size = 28 }) {
  const [err, setErr] = useState(false);
  const src = faviconSrc(url);
  if (!src || err) {
    return (
      <div style={{ width: size, height: size, borderRadius: 7, background: 'rgba(99,102,241,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width={size * .56} height={size * .56} viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      </div>
    );
  }
  return <img src={src} alt="" width={size} height={size} onError={() => setErr(true)} style={{ borderRadius: 7, flexShrink: 0, objectFit: 'contain' }} />;
}

// ── Copy button ───────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1800); });
  };
  return (
    <button onClick={copy} aria-label="Copy URL" title="Copy URL"
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: ok ? '#10b981' : 'var(--text-muted)', padding: 6, display: 'flex', borderRadius: 6, flexShrink: 0, transition: 'color .15s' }}>
      {ok
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      }
    </button>
  );
}

// ── Category colour map ───────────────────────────────────────────
const CAT_COLORS = {
  personal:      { bg: 'rgba(99,102,241,.1)',  color: '#6366f1' },
  work:          { bg: 'rgba(245,158,11,.1)',  color: '#d97706' },
  finance:       { bg: 'rgba(16,185,129,.1)',  color: '#059669' },
  'read later':  { bg: 'rgba(236,72,153,.1)',  color: '#db2777' },
  entertainment: { bg: 'rgba(239,68,68,.1)',   color: '#dc2626' },
};
function catStyle(cat) {
  return CAT_COLORS[(cat || '').toLowerCase()] || { bg: 'rgba(107,114,128,.1)', color: '#6b7280' };
}

// ── Link Card ─────────────────────────────────────────────────────
function LinkCard({ link, onEdit, onDelete, onToggleStar }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const cs = catStyle(link.category);

  const openLink = () => window.open(link.url, '_blank', 'noopener,noreferrer');

  const iconBtn = (label, col, hBg, hCol, svg, onClick) => (
    <button onClick={e => { e.stopPropagation(); onClick(); }} aria-label={label} title={label}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: col, padding: 6, display: 'flex', borderRadius: 6, flexShrink: 0, transition: 'all .12s' }}
      onMouseEnter={e => { e.currentTarget.style.background = hBg; e.currentTarget.style.color = hCol; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = col; }}>
      {svg}
    </button>
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: .98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: .96 }}
      transition={{ duration: .16 }}
      onClick={openLink}
      role="link"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLink(); } }}
      aria-label={`Open ${link.name}`}
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 1px 4px rgba(0,0,0,.06)', cursor: 'pointer', transition: 'box-shadow .15s, transform .12s', position: 'relative' }}
      whileHover={{ boxShadow: '0 4px 14px rgba(0,0,0,.1)', y: -1 }}
    >
      {/* Star */}
      <button
        onClick={e => { e.stopPropagation(); onToggleStar(link.id); }}
        aria-label={link.starred ? 'Unstar' : 'Star'}
        title={link.starred ? 'Remove from favourites' : 'Add to favourites'}
        style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: link.starred ? '#f59e0b' : 'var(--text-muted)', padding: 4, display: 'flex', borderRadius: 5, transition: 'color .15s' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill={link.starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </button>

      {/* Top row: favicon + name + category */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingRight: 24 }}>
        <FaviconIcon url={link.url} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.93rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link.name}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{domain(link.url) || link.url}</div>
        </div>
      </div>

      {/* Bottom row: category pill + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {link.category ? (
          <span style={{ borderRadius: 9999, background: cs.bg, color: cs.color, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{link.category}</span>
        ) : <span />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <CopyBtn text={link.url} />
          {iconBtn('Edit', 'var(--text-muted)', 'var(--bg-hover)', 'var(--accent)',
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
            () => onEdit(link)
          )}
          {confirmDel ? (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(239,68,68,.1)', borderRadius: 6, padding: '2px 7px' }}>
              <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 600 }}>Delete?</span>
              <button onClick={e => { e.stopPropagation(); onDelete(link.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700, fontSize: '0.7rem', padding: '2px 3px' }}>Yes</button>
              <button onClick={e => { e.stopPropagation(); setConfirmDel(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.7rem', padding: '2px 3px' }}>No</button>
            </div>
          ) : (
            iconBtn('Delete', 'var(--text-muted)', 'rgba(239,68,68,.08)', '#ef4444',
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>,
              () => setConfirmDel(true)
            )
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────
function LinksModal({ entry, existingCats, onSave, onClose }) {
  const [name,     setName]     = useState(entry?.name     || '');
  const [url,      setUrl]      = useState(entry?.url      || '');
  const [catSel,   setCatSel]   = useState(entry?.category || '');
  const [newCat,   setNewCat]   = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const firstRef = useRef(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  const allCats = useMemo(() => {
    const merged = [...new Set([...BASE_CATS, ...existingCats])];
    return merged.sort();
  }, [existingCats]);

  const effectiveCat = addingCat ? newCat.trim() : catSel;

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl;
    onSave({
      id:        entry?.id || genId(),
      name:      name.trim(),
      url:       finalUrl,
      category:  effectiveCat,
      starred:   entry?.starred || false,
      createdAt: entry?.createdAt || new Date().toISOString(),
    });
    onClose();
  };

  const inp = { style: { width: '100%', padding: '11px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color .13s' }, onFocus: e => (e.target.style.borderColor = '#6366f1'), onBlur: e => (e.target.style.borderColor = 'var(--border)') };
  const lbl = { style: { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' } };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 20, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
        transition={{ duration: .2 }}
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-elevated)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,.35)', width: '100%', maxWidth: 480 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 0' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{entry ? 'Edit Link' : 'Add Link'}</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', borderRadius: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label {...lbl}>Name *</label>
            <input ref={firstRef} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Google Drive" required {...inp} />
          </div>
          <div>
            <label {...lbl}>URL *</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." required {...inp} />
          </div>
          <div>
            <label {...lbl}>Category</label>
            {addingCat ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New category name" autoFocus
                  style={{ ...inp.style, flex: 1 }} onFocus={inp.onFocus} onBlur={inp.onBlur} />
                <button type="button" onClick={() => { setAddingCat(false); if (!newCat.trim()) setCatSel(''); }}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={catSel} onChange={e => setCatSel(e.target.value)}
                  style={{ ...inp.style, flex: 1, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 36 }}
                  onFocus={inp.onFocus} onBlur={inp.onBlur}>
                  <option value="">— None —</option>
                  {allCats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button type="button" onClick={() => { setAddingCat(true); setCatSel(''); }}
                  aria-label="Add new category"
                  style={{ width: 40, flexShrink: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700, transition: 'background .12s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <button type="submit" style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', transition: 'background .13s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#4f46e5')}
              onMouseLeave={e => (e.currentTarget.style.background = '#6366f1')}>
              {entry ? 'Save Changes' : 'Add Link'}
            </button>
            <button type="button" onClick={onClose} style={{ flex: 1, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 0', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Main LinksView ────────────────────────────────────────────────
export default function LinksView() {
  const [links,   setLinks]   = useState(load);
  const [query,   setQuery]   = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [modal,   setModal]   = useState(null); // null | 'add' | entry

  const persist = (next) => { setLinks(next); save(next); };

  const saveLink = (link) => {
    setLinks(prev => {
      const exists = prev.find(l => l.id === link.id);
      const next = exists ? prev.map(l => l.id === link.id ? link : l) : [link, ...prev];
      save(next); return next;
    });
  };

  const deleteLink = (id) => {
    setLinks(prev => { const next = prev.filter(l => l.id !== id); save(next); return next; });
  };

  const toggleStar = (id) => {
    setLinks(prev => {
      const next = prev.map(l => l.id === id ? { ...l, starred: !l.starred } : l);
      save(next); return next;
    });
  };

  const allCats = useMemo(() => [...new Set(links.map(l => l.category).filter(Boolean))].sort(), [links]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = links;
    if (q)         out = out.filter(l => l.name.toLowerCase().includes(q) || l.url.toLowerCase().includes(q) || (l.category||'').toLowerCase().includes(q));
    if (catFilter) out = out.filter(l => l.category === catFilter);
    // starred first
    return [...out.filter(l => l.starred), ...out.filter(l => !l.starred)];
  }, [links, query, catFilter]);

  const catCount = allCats.length;
  const countLabel = (() => {
    const n = filtered.length;
    const parts = [`${n} link${n !== 1 ? 's' : ''}`];
    if (catCount) parts.push(`${catCount} categor${catCount !== 1 ? 'ies' : 'y'}`);
    return parts.join(' · ');
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface)', overflow: 'hidden' }}>

      {/* ── Toolbar ── */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Search */}
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" aria-label="Search links" placeholder="Search links..."
              value={query} onChange={e => setQuery(e.target.value)}
              style={{ width: '100%', height: 38, padding: '0 10px 0 32px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.84rem', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Category filter */}
          {allCats.length > 0 && (
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} aria-label="Filter by category"
              style={{ height: 38, padding: '0 32px 0 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.82rem', color: catFilter ? 'var(--accent)' : 'var(--text-secondary)', outline: 'none', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', minWidth: 130, fontFamily: 'inherit' }}>
              <option value="">All categories</option>
              {allCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flex: 1 }}>{countLabel}</span>

          <button onClick={() => setModal('add')}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(99,102,241,.3)', whiteSpace: 'nowrap', flexShrink: 0, transition: 'background .13s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#4f46e5')}
            onMouseLeave={e => (e.currentTarget.style.background = '#6366f1')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Link
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>

          {links.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 16, textAlign: 'center' }}>
              <div style={{ width: 68, height: 68, background: 'rgba(99,102,241,.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No links saved yet</div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', maxWidth: 300, lineHeight: 1.55 }}>Save your favourite websites, tools, and resources here for quick one-click access.</div>
              </div>
              <button onClick={() => setModal('add')}
                style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 10, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,.3)' }}>
                Add First Link
              </button>
            </div>

          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>No links match your filters</div>
              <button onClick={() => { setQuery(''); setCatFilter(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: '0.85rem' }}>Clear filters</button>
            </div>

          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              <AnimatePresence>
                {filtered.map(link => (
                  <LinkCard key={link.id} link={link}
                    onEdit={l => setModal(l)}
                    onDelete={deleteLink}
                    onToggleStar={toggleStar} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modal && (
          <LinksModal
            key={modal === 'add' ? 'new' : modal.id}
            entry={modal === 'add' ? null : modal}
            existingCats={allCats}
            onSave={saveLink}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
