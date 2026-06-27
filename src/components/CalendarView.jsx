import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  connectGoogleCalendar, disconnectGoogleCalendar, isGCalConnected,
  getCalendarToken, fetchGCalEvents, createGCalEvent, gcalColor,
} from '../utils/googleCalendarSync';
import Select from './Select';

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

// Helper to parse HH:MM to minutes from midnight
function parseTime(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

// Helper to format minutes from midnight to HH:MM
function formatTime(mins) {
  const m = Math.max(0, Math.min(1439, mins));
  const h = Math.floor(m / 60);
  const rem = Math.floor(m % 60);
  return `${String(h).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export default function CalendarView({ tasks, onAddTask, onUpdateTask }) {
  const [currentDate,   setCurrentDate]   = useState(() => new Date());
  const [viewMode,      setViewMode]      = useState('day');
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [modalDate,     setModalDate]     = useState(toISO(new Date()));
  const [modalTitle,    setModalTitle]    = useState('');
  const [modalCategory, setModalCategory] = useState('work');
  const [modalTime,     setModalTime]     = useState('10:00');
  const [pushToGCal,    setPushToGCal]    = useState(true);

  // Detail / Edit modal state
  const [detailEvent, setDetailEvent] = useState(null);

  // Collapsible unscheduled panel state (default hidden on smaller viewports, toggleable via toolbar)
  const [showUnscheduled, setShowUnscheduled] = useState(() => window.innerWidth > 1024);

  // Live resize state: { id, type, startMin, endMin }
  const [resizing, setResizing] = useState(null);

  // Current time indicator state
  const [currentTimeMin, setCurrentTimeMin] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTimeMin(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

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
      if (t.dueDate) add(t.dueDate, { id: t.id, title: t.name || t.text, time: t.time, endTime: t.endTime, isAllDay: t.isAllDay, type: 'task', completed: t.completed, category: t.category || 'work', description: t.description });
    });
    customEvents?.forEach(e => {
      if (e.date) add(e.date, { id: e.id, title: e.title, time: e.time, endTime: e.endTime, isAllDay: e.isAllDay, type: 'event', category: e.category || 'growth' });
    });
    gcalEvents.forEach(e => {
      if (e.date) add(e.date, { id: e.gcalId, title: e.title, time: e.time, endTime: e.endTime, type: 'gcal', source: 'google', colorId: e.colorId, description: e.description, location: e.location, htmlLink: e.htmlLink });
    });
    return map;
  }, [tasks, customEvents, gcalEvents]);

  // Unscheduled tasks for sidebar
  const unscheduledTasks = useMemo(() => {
    return (tasks || []).filter(t => !t.time && !t.isAllDay && (!t.dueDate || t.dueDate === toISO(currentDate))).map(t => ({
      id: t.id, title: t.name || t.text, type: 'task', completed: t.completed, category: t.category || 'work', description: t.description
    }));
  }, [tasks, currentDate]);

  const updateEventSchedule = useCallback((id, type, newDate, newTime, newEndTime, isAllDay) => {
    if (type === 'task') {
      const task = tasks?.find(t => t.id === id);
      if (task && onUpdateTask) {
        onUpdateTask({ ...task, dueDate: newDate, time: newTime, endTime: newEndTime, isAllDay });
      }
    } else if (type === 'event') {
      const updated = customEvents.map(e => e.id === id ? { ...e, date: newDate, time: newTime, endTime: newEndTime, isAllDay } : e);
      setCustomEvents(updated);
      localStorage.setItem('focusly-calendar-events', JSON.stringify(updated));
    }
  }, [tasks, customEvents, onUpdateTask]);

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
    const newEv = { id: Date.now().toString(), title: modalTitle.trim(), date: modalDate, time: modalTime, endTime: modalTime ? `${String((parseInt(modalTime.split(':')[0],10)+1)%24).padStart(2,'0')}:${modalTime.split(':')[1]}` : null, isAllDay: !modalTime, category: modalCategory };
    saveCustomEvent(newEv);
    if (onAddTask) onAddTask({ id: newEv.id, name: newEv.title, dueDate: modalDate, time: newEv.time, endTime: newEv.endTime, isAllDay: newEv.isAllDay, category: modalCategory, completed: false });
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
      case 'learning': return { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', border: '#3b82f6' };
      case 'fitness':  return { bg: 'rgba(16,185,129,0.15)',  text: '#34d399', border: '#10b981' };
      case 'mental':   return { bg: 'rgba(168,85,247,0.15)',  text: '#c084fc', border: '#a855f7' };
      case 'work':     return { bg: 'rgba(120,105,252,0.15)', text: '#9d93ff', border: '#7869fc' };
      case 'finance':  return { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24', border: '#f59e0b' };
      default:         return { bg: 'rgba(236,72,153,0.15)',  text: '#f472b6', border: '#ec4899' };
    }
  };

  const getEventStyle = (ev) => {
    if (ev.type === 'gcal') {
      const c = gcalColor(ev.colorId);
      return { bg: `${c}1a`, text: c, border: c };
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
        onClick={e2 => { e2.stopPropagation(); if (ev.htmlLink) window.open(ev.htmlLink, '_blank'); else setDetailEvent(ev); }}
        style={{
          background: colors.bg, borderLeft: `3px solid ${colors.border}`, color: colors.text,
          padding: compact ? '4px 8px' : '6px 10px', borderRadius: '0 6px 6px 0',
          fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
          textOverflow: 'ellipsis', overflow: 'hidden',
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: 'pointer', transition: 'background 0.15s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}
      >
        {ev.type === 'gcal' && <GCalIcon size={12} />}
        {ev.time && <span style={{ opacity: 0.75, fontSize: '0.68rem', fontWeight: 700 }}>{ev.time}</span>}
        <span style={{ textDecoration: ev.completed ? 'line-through' : 'none', color: 'var(--text-primary)' }}>{ev.title}</span>
      </div>
    );
  };

  // Handle drag to resize start
  const handleResizeStart = (e, ev, startMin, endMin, edge) => {
    e.stopPropagation();
    e.preventDefault();
    const initialY = e.clientY;
    const initialStartMin = startMin;
    const initialEndMin = endMin;
    const ds = toISO(currentDate);
    
    const handleMouseMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - initialY;
      if (edge === 'bottom') {
        let newEnd = initialEndMin + deltaY;
        newEnd = Math.max(initialStartMin + 15, Math.min(1440, Math.round(newEnd / 15) * 15));
        setResizing({ id: ev.id, type: ev.type, startMin: initialStartMin, endMin: newEnd });
      } else {
        let newStart = initialStartMin + deltaY;
        newStart = Math.min(initialEndMin - 15, Math.max(0, Math.round(newStart / 15) * 15));
        setResizing({ id: ev.id, type: ev.type, startMin: newStart, endMin: initialEndMin });
      }
    };

    const handleMouseUp = (upEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      const deltaY = upEvent.clientY - initialY;
      if (edge === 'bottom') {
        let newEnd = initialEndMin + deltaY;
        newEnd = Math.max(initialStartMin + 15, Math.min(1440, Math.round(newEnd / 15) * 15));
        updateEventSchedule(ev.id, ev.type, ds, formatTime(initialStartMin), formatTime(newEnd), false);
      } else {
        let newStart = initialStartMin + deltaY;
        newStart = Math.min(initialEndMin - 15, Math.max(0, Math.round(newStart / 15) * 15));
        updateEventSchedule(ev.id, ev.type, ds, formatTime(newStart), formatTime(initialEndMin), false);
      }
      setResizing(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="calendar-view" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* ── Compact Premium Toolbar (Notion Calendar / Motion Style) ── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={handleToday} style={{ padding: '6px 12px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}>
            Today
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button onClick={handlePrev} style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }} title="Previous">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button onClick={handleNext} style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }} title="Next">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, minWidth: 160, letterSpacing: '-0.01em' }}>
            {viewMode === 'month' && `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
            {viewMode === 'week'  && `Week of ${MONTH_NAMES[weekDays[0].date.getMonth()]} ${weekDays[0].date.getDate()}, ${weekDays[0].date.getFullYear()}`}
            {viewMode === 'day'   && `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`}
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* GCal badge */}
          {gcalConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'rgba(66,133,244,0.1)', border: '1px solid rgba(66,133,244,0.3)', borderRadius: 8 }}>
              <GCalIcon size={13} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#4285f4' }}>
                {gcalSyncing ? 'Syncing…' : gcalError ? 'Error' : 'Google Calendar'}
              </span>
              <button onClick={fetchGCalRange} title="Refresh" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#4285f4', padding: 0, display: 'flex', alignItems: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: gcalSyncing ? 'spin 1s linear infinite' : 'none' }}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              </button>
              <button onClick={handleDisconnectGCal} title="Disconnect" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, fontSize: '0.9rem', lineHeight: 1 }}>×</button>
            </div>
          ) : (
            <button onClick={handleConnectGCal} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.3)', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#4285f4' }}>
              <GCalIcon size={13} />
              Connect Google Calendar
            </button>
          )}

          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--bg-input)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
            {['month', 'week', 'day'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: viewMode === mode ? 'var(--accent)' : 'transparent', color: viewMode === mode ? '#fff' : 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, textTransform: 'capitalize', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                {mode}
              </button>
            ))}
          </div>

          {/* Create Event Button */}
          <button onClick={() => { setModalDate(todayStr); setModalTime('12:00'); setShowAddModal(true); }} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(120,105,252,0.3)' }}>
            ＋ Create Event
          </button>

          {/* Collapsible Sidebar Toggle (Todoist / Notion Calendar Vibe) */}
          <button
            onClick={() => setShowUnscheduled(!showUnscheduled)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: showUnscheduled ? 'var(--bg-hover)' : 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: showUnscheduled ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.15s ease' }}
            title="Toggle Unscheduled Tasks Drawer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
            <span>Unscheduled</span>
            <span style={{ background: unscheduledTasks.length > 0 ? 'var(--accent)' : 'var(--bg-elevated)', color: unscheduledTasks.length > 0 ? '#fff' : 'var(--text-muted)', padding: '1px 6px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 700 }}>
              {unscheduledTasks.length}
            </span>
          </button>
        </div>
      </header>

      {/* ── Main Continuous Workspace ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', background: 'var(--bg-base)' }}>

        {/* ── Left Calendar Workspace (75–85% width) ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface)' }}>

          {/* Month View */}
          {viewMode === 'month' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
                {DAY_NAMES.map(day => (
                  <div key={day} style={{ padding: '10px 0', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{day}</div>
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
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', fontSize: '0.82rem', fontWeight: isToday ? 700 : 600, background: isToday ? 'var(--accent)' : 'transparent', color: isToday ? '#fff' : cell.isCurrentMonth ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: isToday ? '0 2px 6px rgba(120,105,252,0.4)' : 'none' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
                <div style={{ width: 64, borderRight: '1px solid var(--border)', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {weekDays.map((cell, ci) => {
                    const isToday = cell.dateStr === todayStr;
                    return (
                      <div key={cell.dateStr} style={{ padding: '10px 0', textAlign: 'center', borderRight: ci < 6 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{DAY_NAMES[cell.date.getDay()]}</div>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', fontSize: '0.95rem', fontWeight: isToday ? 700 : 600, background: isToday ? 'var(--accent)' : 'transparent', color: isToday ? '#fff' : 'var(--text-primary)' }}>
                            {cell.date.getDate()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* All-day row */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
                <div style={{ width: 64, padding: '6px 10px', borderRight: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', boxSizing: 'border-box' }}>All Day</div>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {weekDays.map((cell, ci) => (
                    <div key={cell.dateStr} style={{ padding: 4, borderRight: ci < 6 ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 36 }} onClick={() => handleSlotClick(cell.dateStr, '12:00')}>
                      {(eventsByDate[cell.dateStr] || []).filter(e => !e.time).map(ev => renderChip(ev, true))}
                    </div>
                  ))}
                </div>
              </div>
              {/* Hourly grid */}
              <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-surface)' }}>
                {HOURS.map(({ hour, label }) => (
                  <div key={hour} style={{ display: 'flex', borderBottom: '1px solid var(--border)', minHeight: 60 }}>
                    <div style={{ width: 64, padding: '8px 10px', borderRight: '1px solid var(--border)', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, boxSizing: 'border-box' }}>{label}</div>
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
                                  onClick={e2 => { e2.stopPropagation(); if (ev.htmlLink) window.open(ev.htmlLink, '_blank'); else setDetailEvent(ev); }}>
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

          {/* Day View (Google Calendar / Notion Calendar / Motion Interaction Pattern) */}
          {viewMode === 'day' && (() => {
            const ds     = toISO(currentDate);
            const dayEvs = eventsByDate[ds] || [];
            const allDay = dayEvs.filter(e => e.isAllDay || (e.type !== 'task' && !e.time));
            const timed  = dayEvs.filter(e => e.time);

            // Calculate geometry for timed events (overlapping tasks side by side)
            const timedWithGeometry = useMemo(() => {
              const list = timed.map(ev => {
                const startMin = parseTime(ev.time);
                const endMin = ev.endTime ? parseTime(ev.endTime) : startMin + 60;
                return { ...ev, startMin, endMin };
              }).sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

              const columns = [];
              list.forEach(ev => {
                let placed = false;
                for (let i = 0; i < columns.length; i++) {
                  if (!columns[i].some(other => ev.startMin < other.endMin && ev.endMin > other.startMin)) {
                    columns[i].push(ev);
                    ev.colIdx = i;
                    placed = true;
                    break;
                  }
                }
                if (!placed) {
                  ev.colIdx = columns.length;
                  columns.push([ev]);
                }
              });

              const totalCols = columns.length || 1;
              return list.map(ev => {
                const colWidth = 100 / totalCols;
                const left = ev.colIdx * colWidth;
                return { ...ev, left, width: colWidth };
              });
            }, [timed]);

            return (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--bg-surface)' }}>
                
                {/* Compact All-Day Tasks Row */}
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    try {
                      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                      updateEventSchedule(data.id, data.type, ds, null, null, true);
                    } catch (err) { console.error(err); }
                  }}
                  style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', minHeight: 38, flexShrink: 0, boxSizing: 'border-box' }}
                >
                  <div style={{ width: 64, padding: '6px 10px', borderRight: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', boxSizing: 'border-box', height: '100%' }}>
                    All Day
                  </div>
                  <div style={{ flex: 1, padding: '6px 14px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 38, boxSizing: 'border-box' }}>
                    {allDay.length === 0 ? (
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-faint)', fontStyle: 'italic' }}>Drag unscheduled tasks here to make them all-day</span>
                    ) : (
                      allDay.map(ev => {
                        const colors = getEventStyle(ev);
                        return (
                          <div
                            key={ev.id}
                            draggable={ev.type !== 'gcal'}
                            onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ id: ev.id, type: ev.type }))}
                            onClick={e => { e.stopPropagation(); if (ev.type === 'gcal' && ev.htmlLink) window.open(ev.htmlLink, '_blank'); else setDetailEvent(ev); }}
                            style={{
                              background: colors.bg, border: `1px solid ${colors.border}`, borderLeft: `3px solid ${colors.border}`, color: colors.text,
                              padding: '4px 10px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'transform 0.1s ease'
                            }}
                          >
                            {ev.type === 'gcal' && <GCalIcon size={12} />}
                            <span style={{ textDecoration: ev.completed ? 'line-through' : 'none', color: 'var(--text-primary)' }}>{ev.title}</span>
                            {ev.completed && <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.75rem' }}>✓</span>}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 24-Hour Timeline Grid with Inline Event Blocks */}
                <div style={{ position: 'relative', height: 1440, width: '100%', background: 'var(--bg-surface)', flexShrink: 0, overflow: 'hidden' }}>
                  
                  {/* Background Grid Rows */}
                  {HOURS.map(({ hour, label }) => (
                    <div
                      key={hour}
                      onClick={() => handleSlotClick(ds, `${String(hour).padStart(2, '0')}:00`)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        try {
                          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                          const timeStr = `${String(hour).padStart(2, '0')}:00`;
                          const endTimeStr = `${String((hour + 1) % 24).padStart(2, '0')}:00`;
                          updateEventSchedule(data.id, data.type, ds, timeStr, endTimeStr, false);
                        } catch (err) { console.error(err); }
                      }}
                      style={{ position: 'absolute', top: hour * 60, left: 0, right: 0, height: 60, borderBottom: '1px solid var(--border)', display: 'flex', boxSizing: 'border-box', cursor: 'pointer' }}
                    >
                      <div style={{ width: 64, padding: '8px 10px', borderRight: '1px solid var(--border)', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, boxSizing: 'border-box' }}>
                        {label}
                      </div>
                      <div style={{ flex: 1, background: 'transparent' }} />
                    </div>
                  ))}

                  {/* Live Current Time Indicator Line (Google Calendar / Notion Calendar Premium Feature) */}
                  {ds === todayStr && (
                    <div style={{ position: 'absolute', top: currentTimeMin, left: 64, right: 0, height: 2, background: 'var(--color-red, #ef4444)', zIndex: 40, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-red, #ef4444)', marginLeft: -5, boxShadow: '0 0 8px rgba(239,68,68,0.6)' }} />
                    </div>
                  )}

                  {/* Absolute Scheduled Event Blocks */}
                  <div style={{ position: 'absolute', top: 0, left: 64, right: 0, height: 1440, pointerEvents: 'none' }}>
                    {timedWithGeometry.map(ev => {
                      const isResizing = resizing?.id === ev.id;
                      const startMin = isResizing ? resizing.startMin : ev.startMin;
                      const endMin = isResizing ? resizing.endMin : ev.endMin;
                      const top = startMin;
                      const height = Math.max(20, endMin - startMin);
                      const colors = getEventStyle(ev);

                      return (
                        <div
                          key={ev.id}
                          draggable={ev.type !== 'gcal'}
                          onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ id: ev.id, type: ev.type }))}
                          onClick={e => { e.stopPropagation(); if (ev.type === 'gcal' && ev.htmlLink) window.open(ev.htmlLink, '_blank'); else setDetailEvent(ev); }}
                          style={{
                            position: 'absolute',
                            top: `${top}px`,
                            height: `${height}px`,
                            left: `calc(${ev.left}% + 3px)`,
                            width: `calc(${ev.width}% - 6px)`,
                            background: colors.bg,
                            border: `1px solid ${colors.border}`,
                            borderLeft: `4px solid ${colors.border}`,
                            borderRadius: 8,
                            padding: '6px 10px',
                            boxSizing: 'border-box',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                            zIndex: isResizing ? 50 : 10,
                            pointerEvents: 'auto',
                            transition: isResizing ? 'none' : 'box-shadow 0.15s ease',
                          }}
                          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'}
                          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'}
                        >
                          {/* Top resize handle */}
                          {ev.type !== 'gcal' && (
                            <div
                              onMouseDown={e => handleResizeStart(e, ev, startMin, endMin, 'top')}
                              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', background: 'rgba(255,255,255,0.15)', zIndex: 20 }}
                            />
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                            {ev.type === 'gcal' && <GCalIcon size={12} />}
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: ev.completed ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
                            {ev.completed && <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.7rem', marginLeft: 'auto' }}>✓</span>}
                          </div>
                          {height >= 35 && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>
                              {formatTime(startMin)} – {formatTime(endMin)}
                            </span>
                          )}
                          {/* Bottom resize handle */}
                          {ev.type !== 'gcal' && (
                            <div
                              onMouseDown={e => handleResizeStart(e, ev, startMin, endMin, 'bottom')}
                              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize', background: 'rgba(255,255,255,0.15)', zIndex: 20 }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Collapsible Unscheduled Tasks Drawer (Todoist / Motion Style) ── */}
        <div style={{ width: showUnscheduled ? 300 : 0, transition: 'width 0.2s cubic-bezier(0.2, 0, 0, 1)', borderLeft: showUnscheduled ? '1px solid var(--border)' : 'none', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', width: 300 }}>
            <div style={{ padding: '0 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 38, boxSizing: 'border-box', flexShrink: 0 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unscheduled ({unscheduledTasks.length})</span>
              <button onClick={() => setShowUnscheduled(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px' }} title="Close drawer">✕</button>
            </div>
            <div style={{ padding: 16, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>Drag items directly into the timeline or All-Day row to schedule them.</span>
              {unscheduledTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-faint)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  No unscheduled tasks remaining!
                </div>
              ) : (
                unscheduledTasks.map(t => {
                  const colors = getCategoryColor(t.category);
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ id: t.id, type: t.type }))}
                      onClick={() => setDetailEvent(t)}
                      style={{
                        background: 'var(--bg-input)', border: '1px solid var(--border)', borderLeft: `4px solid ${colors.border}`, padding: '10px 12px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'grab', boxShadow: '0 1px 4px rgba(0,0,0,0.03)', transition: 'transform 0.1s ease, border-color 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = colors.border}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden', paddingRight: 8 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: t.completed ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        <span style={{ background: colors.bg, color: colors.text, padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', width: 'fit-content' }}>{t.category}</span>
                      </div>
                      <button
                        title="Quick Schedule to 12 PM"
                        onClick={e => { e.stopPropagation(); updateEventSchedule(t.id, t.type, toISO(currentDate), '12:00', '13:00', false); }}
                        style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                      >
                        ＋
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

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
                  <Select 
                    value={modalCategory} 
                    onChange={e => setModalCategory(e.target.value)} 
                    options={[
                      { value: 'work', label: 'Work' },
                      { value: 'learning', label: 'Learning' },
                      { value: 'fitness', label: 'Fitness' },
                      { value: 'mental', label: 'Mental' },
                      { value: 'finance', label: 'Finance' },
                      { value: 'growth', label: 'Growth' },
                    ]}
                    style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box' }}
                  />
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
                  <button type="submit" style={{ flex: 2, padding: 14, background: 'var(--accent)', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(120,105,252,0.3)' }}>Save Event</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Event / Task Detail Modal ── */}
      <AnimatePresence>
        {detailEvent && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => setDetailEvent(null)}>
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.97 }} transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 24, padding: 32, width: '100%', maxWidth: 460, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 20 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Task Details</h3>
                <button onClick={() => setDetailEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Title</label>
                  <input
                    type="text"
                    value={detailEvent.title || ''}
                    onChange={e => setDetailEvent({ ...detailEvent, title: e.target.value })}
                    style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Start Time</label>
                    <input
                      type="time"
                      value={detailEvent.time || ''}
                      onChange={e => setDetailEvent({ ...detailEvent, time: e.target.value, isAllDay: !e.target.value })}
                      style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box', colorScheme: 'dark' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>End Time</label>
                    <input
                      type="time"
                      value={detailEvent.endTime || ''}
                      onChange={e => setDetailEvent({ ...detailEvent, endTime: e.target.value })}
                      style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box', colorScheme: 'dark' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Category</label>
                  <Select
                    value={detailEvent.category || 'work'}
                    onChange={e => setDetailEvent({ ...detailEvent, category: e.target.value })}
                    options={[
                      { value: 'work', label: 'Work' },
                      { value: 'learning', label: 'Learning' },
                      { value: 'fitness', label: 'Fitness' },
                      { value: 'mental', label: 'Mental' },
                      { value: 'finance', label: 'Finance' },
                      { value: 'growth', label: 'Growth' },
                    ]}
                    style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '0.95rem', boxSizing: 'border-box' }}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <input
                    type="checkbox"
                    checked={!!detailEvent.completed}
                    onChange={e => setDetailEvent({ ...detailEvent, completed: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: '#10b981' }}
                  />
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Mark as Completed</span>
                </label>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      updateEventSchedule(detailEvent.id, detailEvent.type, null, null, null, false);
                      setDetailEvent(null);
                    }}
                    style={{ flex: 1, padding: 14, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 14, color: '#ef4444', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Unschedule
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (detailEvent.type === 'task') {
                        const task = tasks?.find(t => t.id === detailEvent.id);
                        if (task && onUpdateTask) {
                          onUpdateTask({ ...task, name: detailEvent.title, time: detailEvent.time, endTime: detailEvent.endTime, isAllDay: detailEvent.isAllDay, category: detailEvent.category, completed: detailEvent.completed });
                        }
                      } else {
                        updateEventSchedule(detailEvent.id, detailEvent.type, toISO(currentDate), detailEvent.time, detailEvent.endTime, detailEvent.isAllDay);
                      }
                      setDetailEvent(null);
                    }}
                    style={{ flex: 2, padding: 14, background: 'var(--accent)', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(120,105,252,0.3)' }}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
