import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  connectGoogleCalendar, disconnectGoogleCalendar, isGCalConnected,
  getCalendarToken, fetchGCalEvents, createGCalEvent, gcalColor,
} from '../utils/googleCalendarSync';

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const HOURS = [];
for (let i = 0; i < 24; i++) {
  const label = i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`;
  HOURS.push({ hour: i, label });
}

function GCalIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="17" rx="2" stroke="#4285f4" strokeWidth="1.5"/>
      <path d="M16 2v4M8 2v4M3 9h18" stroke="#4285f4" strokeWidth="1.5" strokeLinecap="round"/>
      <text x="12" y="18" textAnchor="middle" fontSize="8" fontWeight="700" fill="#4285f4">G</text>
    </svg>
  );
}

export default function CalendarView({ tasks, onAddTask }) {
  const [currentDate,   setCurrentDate]   = useState(() => new Date());
  const [viewMode,      setViewMode]      = useState('day');
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [modalDate,     setModalDate]     = useState(toISO(new Date()));
  const [modalTitle,    setModalTitle]    = useState('');
  const [modalCategory, setModalCategory] = useState('work');
  const [modalTime,     setModalTime]     = useState('10:00');
  const [pushToGCal,    setPushToGCal]    = useState(true);

  // Google Calendar state
  const [gcalConnected, setGcalConnected] = useState(() => isGCalConnected());
  const [gcalEvents,    setGcalEvents]    = useState([]);
  const [gcalSyncing,   setGcalSyncing]   = useState(false);
  const [gcalError,     setGcalError]     = useState(null);

  // Custom events (local)
  const [customEvents, setCustomEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem('focusly-calendar-events') || '[]'); }
    catch { return []; }
  });

  const saveCustomEvent = (newEvent) => {
    const updated = [...customEvents, newEvent];
    setCustomEvents(updated);
    localStorage.setItem('focusly-calendar-events', JSON.stringify(updated));
  };

  // ── Google Calendar fetch ──────────────────────────────────────────
  const fetchGCalRange = useCallback(async () => {
    if (!isGCalConnected()) return;
    setGcalSyncing(true);
    setGcalError(null);
    try {
      const token = await getCalendarToken();
      if (!token) { setGcalConnected(false); return; }
      const base = new Date(currentDate);
      const timeMin = new Date(base.getFullYear(), base.getMonth() - 1, 1);
      const timeMax = new Date(base.getFullYear(), base.getMonth() + 2, 0, 23, 59, 59);
      setGcalEvents(await fetchGCalEvents(token, timeMin, timeMax));
    } catch (err) {
      setGcalError('Failed to load Google Calendar events');
      console.error('[GCal]', err);
    } finally {
      setGcalSyncing(false);
    }
  }, [currentDate]);

  useEffect(() => { if (gcalConnected) fetchGCalRange(); }, [gcalConnected, fetchGCalRange]);

  const handleConnectGCal    = () => connectGoogleCalendar();
  const handleDisconnectGCal = () => { disconnectGoogleCalendar(); setGcalConnected(false); setGcalEvents([]); };

  // ── Event map ──────────────────────────────────────────────────────
  const eventsByDate = useMemo(() => {
    const map = {};
    const add = (dateStr, item) => { if (!dateStr) return; if (!map[dateStr]) map[dateStr] = []; map[dateStr].push(item); };

    tasks?.forEach(t => {
      if (t.dueDate) add(t.dueDate, { id: t.id, title: t.name || t.text, type: 'task', completed: t.completed, category: t.category || 'work' });
    });
    customEvents?.forEach(e => {
      if (e.date) add(e.date, { id: e.id, title: e.title, time: e.time, type: 'event', category: e.category || 'growth' });
    });
    gcalEvents.forEach(e => {
      if (e.date) add(e.date, { id: e.gcalId, title: e.title, time: e.time, endTime: e.endTime, type: 'gcal', source: 'google', colorId: e.colorId, description: e.description, location: e.location, htmlLink: e.htmlLink });
    });
    return map;
  }, [tasks, customEvents, gcalEvents]);

  // ── Navigation ─────────────────────────────────────────────────────
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month')     next.setMonth(next.getMonth() - 1);
    else if (viewMode === 'week') next.setDate(next.getDate() - 7);
    else                          next.setDate(next.getDate() - 1);
    setCurrentDate(next);
  };
  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month')     next.setMonth(next.getMonth() + 1);
    else if (viewMode === 'week') next.setDate(next.getDate() + 7);
    else                          next.setDate(next.getDate() + 1);
    setCurrentDate(next);
  };
  const handleToday = () => setCurrentDate(new Date());

  // ── Month grid ─────────────────────────────────────────────────────
  const monthGrid = useMemo(() => {
    const year = currentDate.getFullYear(), month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1), lastDay = new Date(year, month + 1, 0);
    const days = [];
    const startOffset = firstDay.getDay();
    const prevLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevLastDay - i);
      days.push({ date: d, isCurrentMonth: false, dateStr: toISO(d) });
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, isCurrentMonth: true, dateStr: toISO(d) });
    }
    const remaining = (Math.ceil(days.length / 7) * 7) - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, isCurrentMonth: false, dateStr: toISO(d) });
    }
    return days;
  }, [currentDate]);

  // ── Week days ──────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const d = new Date(currentDate), start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const cur = new Date(start); cur.setDate(start.getDate() + i);
      return { date: cur, dateStr: toISO(cur) };
    });
  }, [currentDate]);

  const todayStr = toISO(new Date());

  // ── Add event ──────────────────────────────────────────────────────
  const handleSlotClick = (dateStr, timeStr = '10:00') => {
    setModalDate(dateStr); setModalTime(timeStr); setShowAddModal(true);
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!modalTitle.trim()) return;
    const newEv = { id: Date.now().toString(), title: modalTitle.trim(), date: modalDate, time: modalTime, category: modalCategory };
    saveCustomEvent(newEv);
    if (onAddTask) onAddTask({ id: newEv.id, name: newEv.title, dueDate: modalDate, category: modalCategory, completed: false });
    if (gcalConnected && pushToGCal) {
      try {
        const token = await getCalendarToken();
        if (token) { await createGCalEvent(token, { title: newEv.title, date: newEv.date, time: newEv.time }); await fetchGCalRange(); }
      } catch (err) { console.error('[GCal] Failed to push event:', err); }
    }
    setModalTitle(''); setShowAddModal(false);
  };

  // ── Colors ─────────────────────────────────────────────────────────
  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'learning': return { bg: 'rgba(59,130,246,0.15)',  text: '#3b82f6', border: '#3b82f6' };
      case 'fitness':  return { bg: 'rgba(16,185,129,0.15)',  text: '#10b981', border: '#10b981' };
      case 'mental':   return { bg: 'rgba(168,85,247,0.15)',  text: '#a855f7', border: '#a855f7' };
      case 'work':     return { bg: 'rgba(99,102,241,0.15)',  text: '#6366f1', border: '#6366f1' };
      case 'finance':  return { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b', border: '#f59e0b' };
      default:         return { bg: 'rgba(236,72,153,0.15)',  text: '#ec4899', border: '#ec4899' };
    }
  };

  const getEventStyle = (ev) => {
    if (ev.type === 'gcal') {
      const c = gcalColor(ev.colorId);
      return { bg: `${c}22`, text: c, border: c };
    }
    return getCategoryColor(ev.category);
  };

  // ── Event chip ─────────────────────────────────────────────────────
  const renderChip = (ev, compact = false) => {
    const colors = getEventStyle(ev);
    return (
      <div
        key={ev.id}
        title={ev.title + (ev.location ? ` · ${ev.location}` : '')}
        onClick={e2 => { e2.stopPropagation(); if (ev.htmlLink) window.open(ev.htmlLink, '_blank'); }}
        style={{
          background: colors.bg, borderLeft: `3px solid ${colors.border}`, color: colors.text,
          padding: compact ? '3px 6px' : '4px 8px', borderRadius: '0 4px 4px 0',
          fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
          textOverflow: 'ellipsis', overflow: 'hidden',
          display: 'flex', alignItems: 'center', gap: 4,
          cursor: ev.htmlLink ? 'pointer' : 'default',
        }}
      >
        {ev.type === 'gcal' && <GCalIcon size={10} />}
        {ev.time && <span style={{ opacity: 0.75, fontSize: '0.68rem' }}>{ev.time}</span>}
        <span style={{ textDecoration: ev.completed ? 'line-through' : 'none' }}>{ev.title}</span>
      </div>
    );
  };

  return (
    <div className="calendar-view" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface)', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={handleToday} style={{ padding: '8px 16px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 10, fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}>Today</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={handlePrev} style={{ padding: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button onClick={handleNext} style={{ padding: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, minWidth: 180 }}>
            {viewMode === 'month' && `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
            {viewMode === 'week'  && `Week of ${MONTH_NAMES[weekDays[0].date.getMonth()]} ${weekDays[0].date.getDate()}, ${weekDays[0].date.getFullYear()}`}
            {viewMode === 'day'   && `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`}
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* GCal badge */}
          {gcalConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(66,133,244,0.1)', border: '1px solid rgba(66,133,244,0.3)', borderRadius: 10 }}>
              <GCalIcon size={14} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4285f4' }}>
                {gcalSyncing ? 'Syncing…' : gcalError ? 'Error' : 'Google Calendar'}
              </span>
              <button onClick={fetchGCalRange} title="Refresh" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#4285f4', padding: 0, display: 'flex', alignItems: 'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: gcalSyncing ? 'spin 1s linear infinite' : 'none' }}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              </button>
              <button onClick={handleDisconnectGCal} title="Disconnect" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, fontSize: '0.9rem', lineHeight: 1 }}>×</button>
            </div>
          ) : (
            <button onClick={handleConnectGCal} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.3)', borderRadius: 10, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#4285f4' }}>
              <GCalIcon size={14} />
              Connect Google Calendar
            </button>
          )}

          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--bg-input)', padding: 4, borderRadius: 12, border: '1px solid var(--border)' }}>
            {['month', 'week', 'day'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: '6px 14px', borderRadius: 10, border: 'none', background: viewMode === mode ? 'var(--accent)' : 'transparent', color: viewMode === mode ? '#fff' : 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                {mode}
              </button>
            ))}
          </div>

          <button onClick={() => { setModalDate(todayStr); setModalTime('12:00'); setShowAddModal(true); }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 12, fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
            ＋ Create Event
          </button>
        </div>
      </header>

      {/* ── Calendar body ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Month View */}
        {viewMode === 'month' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)', flexShrink: 0 }}>
              {DAY_NAMES.map(day => (
                <div key={day} style={{ padding: '10px 0', textAlign: 'center', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{day}</div>
              ))}
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr', background: 'var(--border)', gap: 1, overflow: 'auto' }}>
              {monthGrid.map((cell, i) => {
                const isToday = cell.dateStr === todayStr;
                const cellEvs = eventsByDate[cell.dateStr] || [];
                return (
                  <div key={i} onClick={() => handleSlotClick(cell.dateStr, '12:00')}
                    style={{ background: cell.isCurrentMonth ? 'var(--bg-surface)' : 'var(--bg-input)', padding: 8, display: 'flex', flexDirection: 'column', cursor: 'pointer', overflow: 'hidden', minHeight: 90 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = cell.isCurrentMonth ? 'var(--bg-surface)' : 'var(--bg-input)'}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', fontSize: '0.85rem', fontWeight: isToday ? 700 : 600, background: isToday ? 'var(--accent)' : 'transparent', color: isToday ? '#fff' : cell.isCurrentMonth ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: isToday ? '0 2px 6px rgba(99,102,241,0.4)' : 'none' }}>
                        {cell.date.getDate()}
                      </span>
                      {cellEvs.some(e => e.type === 'gcal') && <GCalIcon size={10} />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', flex: 1 }}>
                      {cellEvs.slice(0, 4).map(ev => renderChip(ev, true))}
                      {cellEvs.length > 4 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', paddingLeft: 4 }}>+{cellEvs.length - 4} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Week View */}
        {viewMode === 'week' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)', flexShrink: 0 }}>
              <div style={{ width: 70, borderRight: '1px solid var(--border)', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {weekDays.map((cell, ci) => {
                  const isToday = cell.dateStr === todayStr;
                  return (
                    <div key={cell.dateStr} style={{ padding: '12px 0', textAlign: 'center', borderRight: ci < 6 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{DAY_NAMES[cell.date.getDay()]}</div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', fontSize: '1rem', fontWeight: isToday ? 700 : 600, background: isToday ? 'var(--accent)' : 'transparent', color: isToday ? '#fff' : 'var(--text-primary)' }}>
                          {cell.date.getDate()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* All-day row */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ width: 70, padding: 8, borderRight: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>All Day</div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {weekDays.map((cell, ci) => (
                  <div key={cell.dateStr} style={{ padding: 6, borderRight: ci < 6 ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 40 }} onClick={() => handleSlotClick(cell.dateStr, '12:00')}>
                    {(eventsByDate[cell.dateStr] || []).filter(e => !e.time).map(ev => renderChip(ev, true))}
                  </div>
                ))}
              </div>
            </div>
            {/* Hourly grid */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {HOURS.map(({ hour, label }) => (
                <div key={hour} style={{ display: 'flex', borderBottom: '1px solid var(--border)', minHeight: 60 }}>
                  <div style={{ width: 70, padding: '8px 12px', borderRight: '1px solid var(--border)', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700 }}>{label}</div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                    {weekDays.map((cell, ci) => {
                      const hrEvs = (eventsByDate[cell.dateStr] || []).filter(e => e.time && parseInt(e.time.split(':')[0], 10) === hour);
                      return (
                        <div key={cell.dateStr} onClick={() => handleSlotClick(cell.dateStr, `${String(hour).padStart(2, '0')}:00`)}
                          style={{ borderRight: ci < 6 ? '1px solid var(--border)' : 'none', padding: 6, display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          {hrEvs.map(ev => {
                            const colors = getEventStyle(ev);
                            return (
                              <div key={ev.id} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderLeft: `4px solid ${colors.border}`, padding: '6px 8px', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 2, cursor: ev.htmlLink ? 'pointer' : 'default' }}
                                onClick={e2 => { e2.stopPropagation(); if (ev.htmlLink) window.open(ev.htmlLink, '_blank'); }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {ev.type === 'gcal' && <GCalIcon size={10} />}
                                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: ev.completed ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                                </div>
                                <span style={{ fontSize: '0.7rem', color: colors.text, fontWeight: 600 }}>🕐 {ev.time}{ev.endTime ? ` – ${ev.endTime}` : ''}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Day View */}
        {viewMode === 'day' && (() => {
          const ds       = toISO(currentDate);
          const dayEvs   = eventsByDate[ds] || [];
          const allDay   = dayEvs.filter(e => !e.time);
          const timed    = dayEvs.filter(e => e.time);
          const byHour   = {};
          timed.forEach(ev => { const hr = parseInt(ev.time.split(':')[0], 10); (byHour[hr] = byHour[hr] || []).push(ev); });

          return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: allDay.length > 0 ? 20 : 0 }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{DAY_NAMES[currentDate.getDay()]}</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>{MONTH_NAMES[currentDate.getMonth()]} {currentDate.getDate()}, {currentDate.getFullYear()}</div>
                  </div>
                  <button onClick={() => handleSlotClick(ds, '12:00')} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '10px 20px', borderRadius: 12, fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}>
                    ＋ Add to Schedule
                  </button>
                </div>
                {allDay.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>All Day / Scheduled Tasks</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                      {allDay.map(ev => {
                        const colors = getEventStyle(ev);
                        return (
                          <div key={ev.id} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderLeft: `6px solid ${colors.border}`, padding: '14px 18px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: ev.htmlLink ? 'pointer' : 'default' }}
                            onClick={() => ev.htmlLink && window.open(ev.htmlLink, '_blank')}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {ev.type === 'gcal' && <GCalIcon size={13} />}
                                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: ev.completed ? 'line-through' : 'none' }}>{ev.title}</span>
                              </div>
                              {ev.location && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>📍 {ev.location}</span>}
                              <span style={{ background: colors.bg, color: colors.text, padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: 'fit-content' }}>
                                {ev.type === 'gcal' ? 'Google Calendar' : ev.category}
                              </span>
                            </div>
                            {ev.completed && <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.8rem' }}>✓ Done</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 24-hour timeline */}
              <div style={{ flex: 1, padding: '16px 32px 32px', maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 20, background: 'var(--bg-surface)', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.03)' }}>
                  {HOURS.map(({ hour, label }) => {
                    const hrEvs = byHour[hour] || [];
                    return (
                      <div key={hour} onClick={() => handleSlotClick(ds, `${String(hour).padStart(2, '0')}:00`)}
                        style={{ display: 'flex', borderBottom: hour < 23 ? '1px solid var(--border)' : 'none', minHeight: 64, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface)'}>
                        <div style={{ width: 80, padding: '12px 16px', borderRight: '1px solid var(--border)', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700 }}>{label}</div>
                        <div style={{ flex: 1, padding: '8px 16px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                          {hrEvs.map(ev => {
                            const colors = getEventStyle(ev);
                            return (
                              <div key={ev.id} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderLeft: `5px solid ${colors.border}`, padding: '10px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 16, cursor: ev.htmlLink ? 'pointer' : 'default' }}
                                onClick={e2 => { e2.stopPropagation(); if (ev.htmlLink) window.open(ev.htmlLink, '_blank'); }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {ev.type === 'gcal' && <GCalIcon size={13} />}
                                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: ev.completed ? 'line-through' : 'none' }}>{ev.title}</span>
                                    {ev.completed && <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.75rem' }}>✓ Done</span>}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>🕐 {ev.time}{ev.endTime ? ` – ${ev.endTime}` : ''}</span>
                                    {ev.location && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>📍 {ev.location}</span>}
                                    <span style={{ background: 'rgba(255,255,255,0.08)', color: colors.text, padding: '1px 6px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                      {ev.type === 'gcal' ? 'Google Cal' : ev.category}
                                    </span>
                                  </div>
                                  {ev.description && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 400 }}>{ev.description.slice(0, 120)}{ev.description.length > 120 ? '…' : ''}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Add Event Modal ── */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => setShowAddModal(false)}>
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.97 }} transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 24, padding: 32, width: '100%', maxWidth: 460, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Create Event</h3>
                <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}>✕</button>
              </div>
              <form onSubmit={handleModalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Title</label>
                  <input type="text" value={modalTitle} onChange={e => setModalTitle(e.target.value)} placeholder="Event title…" autoFocus required style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Date</label>
                    <input type="date" value={modalDate} onChange={e => setModalDate(e.target.value)} required style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box', colorScheme: 'dark' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Time</label>
                    <input type="time" value={modalTime} onChange={e => setModalTime(e.target.value)} style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box', colorScheme: 'dark' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Category</label>
                  <select value={modalCategory} onChange={e => setModalCategory(e.target.value)} style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box' }}>
                    <option value="work">Work</option>
                    <option value="learning">Learning</option>
                    <option value="fitness">Fitness</option>
                    <option value="mental">Mental</option>
                    <option value="finance">Finance</option>
                    <option value="growth">Growth</option>
                  </select>
                </div>
                {gcalConnected && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.2)', borderRadius: 10 }}>
                    <input type="checkbox" checked={pushToGCal} onChange={e => setPushToGCal(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#4285f4' }} />
                    <GCalIcon size={14} />
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#4285f4' }}>Also add to Google Calendar</span>
                  </label>
                )}
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <button type="button" onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: 14, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" style={{ flex: 2, padding: 14, background: 'var(--accent)', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>Save Event</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
