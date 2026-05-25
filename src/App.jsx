import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import TaskList from './components/TaskList';
import Timer from './components/Timer';
import Stats from './components/Stats';
import AddTaskModal from './components/AddTaskModal';
import SettingsModal from './components/SettingsModal';
import AnalyticsModal from './components/AnalyticsModal';
import ShortcutsModal from './components/ShortcutsModal';

// ─── Constants ───────────────────────────────────────────────
const LONG_BREAK_AFTER = 4;

const DEFAULT_SETTINGS = {
  focusDuration: 25,
  shortDuration: 5,
  longDuration: 15,
  customDuration: 25,
  autoSwitch: false,
  sound: true,
};

// ─── Audio ───────────────────────────────────────────────────
let _audioCtx = null;
function initAudio() {
  if (!_audioCtx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (C) _audioCtx = new C();
  }
  if (_audioCtx?.state === 'suspended') _audioCtx.resume().catch(() => {});
}
function playAlarm() {
  const ctx = _audioCtx;
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch { /* ignore */ }
}

// ─── Storage & migration ─────────────────────────────────────
const SK = {
  tasks: 'focusly-tasks',
  settings: 'focusly-settings',
  theme: 'focusly-theme',
  pomoLog: 'focusly-pomo-log',
};

function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

const VALID_CATS = new Set(['learning', 'fitness', 'mental', 'work', 'growth']);
const CAT_KEYWORDS = [
  ['learning', ['learn', 'study', 'read', 'course', 'book', 'educat']],
  ['fitness',  ['fit', 'gym', 'exercise', 'workout', 'run', 'sport', 'health']],
  ['mental',   ['mental', 'meditat', 'mind', 'journal', 'stress', 'relax']],
  ['growth',   ['grow', 'personal', 'habit', 'skill', 'creat', 'hobby']],
];

function toCategory(raw) {
  if (!raw) return 'work';
  const lower = raw.toLowerCase().trim();
  if (VALID_CATS.has(lower)) return lower;
  for (const [cat, kws] of CAT_KEYWORDS) {
    if (kws.some(kw => lower.includes(kw))) return cat;
  }
  return 'work';
}

function migrateTask(t) {
  if (t.name !== undefined) return t; // already new format
  return {
    id: t.id || String(Date.now() + Math.random()),
    name: t.text || 'Untitled',
    category: toCategory(t.category),
    priority: ['none', 'low', 'medium', 'high'].includes(t.priority) ? t.priority : 'none',
    timeEstimate: (t.estPomodoros || 1) * 25,
    notes: t.notes || '',
    dueDate: '',
    completed: Boolean(t.completed),
    timeLogged: (t.actPomodoros || 0) * 25 * 60,
    pomodorosCompleted: t.actPomodoros || 0,
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
    completedAt: t.completed ? new Date().toISOString() : null,
  };
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(SK.tasks);
    if (!raw) return [];
    return JSON.parse(raw).map(migrateTask);
  } catch { return []; }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SK.settings);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw);
    return {
      focusDuration:  p.focusDuration  || p.pomodoroDuration    || DEFAULT_SETTINGS.focusDuration,
      shortDuration:  p.shortDuration  || p.shortBreakDuration   || DEFAULT_SETTINGS.shortDuration,
      longDuration:   p.longDuration   || p.longBreakDuration    || DEFAULT_SETTINGS.longDuration,
      customDuration: p.customDuration || DEFAULT_SETTINGS.customDuration,
      autoSwitch:     p.autoSwitch     ?? DEFAULT_SETTINGS.autoSwitch,
      sound:          p.sound          ?? p.soundEnabled         ?? DEFAULT_SETTINGS.sound,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function loadPomoLog() {
  try {
    const raw = localStorage.getItem(SK.pomoLog);
    if (raw) return JSON.parse(raw);
    // Migrate old focusly-analytics
    const aRaw = localStorage.getItem('focusly-analytics');
    if (!aRaw) return [];
    const analytics = JSON.parse(aRaw);
    const log = [];
    for (const [dateStr, data] of Object.entries(analytics)) {
      const count = data.pomodoros || 0;
      for (let i = 0; i < count; i++) {
        log.push(`${dateStr}T${String(12 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`);
      }
    }
    if (log.length) persist(SK.pomoLog, log);
    return log;
  } catch { return []; }
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function getSecsForMode(mode, sett) {
  switch (mode) {
    case 'focus':  return (sett.focusDuration  || 25) * 60;
    case 'short':  return (sett.shortDuration  || 5)  * 60;
    case 'long':   return (sett.longDuration   || 15) * 60;
    case 'custom': return (sett.customDuration || 25) * 60;
    default: return 25 * 60;
  }
}

// ─── App ─────────────────────────────────────────────────────
export default function App() {
  const initSettings = useMemo(loadSettings, []); // eslint-disable-line

  const [tasks,       setTasks]       = useState(loadTasks);
  const [theme,       setTheme]       = useState(() => { try { return JSON.parse(localStorage.getItem(SK.theme)) || 'dark'; } catch { return 'dark'; } });
  const [settings,    setSettings]    = useState(initSettings);
  const [pomodoroLog, setPomodoroLog] = useState(loadPomoLog);

  const [timerMode,    setTimerMode]    = useState('focus');
  const [timerState,   setTimerState]   = useState('idle');
  const [timerSeconds, setTimerSeconds] = useState(() => getSecsForMode('focus', initSettings));
  const [totalSeconds, setTotalSeconds] = useState(() => getSecsForMode('focus', initSettings));

  const [activeTaskId, setActiveTaskId] = useState(null);
  const [openModal,    setOpenModal]    = useState(null);
  const [toast,        setToast]        = useState(null);

  // ── Refs (always-fresh values for callbacks) ──
  const intervalRef       = useRef(null);
  const toastTimerRef     = useRef(null);
  const activeTaskIdRef   = useRef(activeTaskId);
  const timerModeRef      = useRef(timerMode);
  const settingsRef       = useRef(settings);
  const pomodoroLogRef    = useRef(pomodoroLog);
  const switchModeRef     = useRef(null);
  const onCompleteRef     = useRef(null);

  useEffect(() => { activeTaskIdRef.current   = activeTaskId;   }, [activeTaskId]);
  useEffect(() => { timerModeRef.current      = timerMode;      }, [timerMode]);
  useEffect(() => { settingsRef.current       = settings;       }, [settings]);
  useEffect(() => { pomodoroLogRef.current    = pomodoroLog;    }, [pomodoroLog]);

  // ── Persistence ──
  useEffect(() => { persist(SK.tasks,    tasks);    }, [tasks]);
  useEffect(() => { persist(SK.settings, settings); }, [settings]);
  useEffect(() => { persist(SK.pomoLog,  pomodoroLog); }, [pomodoroLog]);
  useEffect(() => {
    persist(SK.theme, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []); // eslint-disable-line

  // ── Toast ──
  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type, key: Date.now() });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Switch mode ──
  const switchMode = useCallback((mode) => {
    clearInterval(intervalRef.current);
    setTimerState('idle');
    setTimerMode(mode);
    const secs = getSecsForMode(mode, settingsRef.current);
    setTimerSeconds(secs);
    setTotalSeconds(secs);
  }, []);
  useEffect(() => { switchModeRef.current = switchMode; }, [switchMode]);

  // ── On-complete handler (fresh ref, avoids stale closure in interval) ──
  onCompleteRef.current = () => {
    const mode = timerModeRef.current;
    const sett = settingsRef.current;

    if (sett.sound) playAlarm();

    if (mode === 'focus') {
      setPomodoroLog(prev => [...prev, new Date().toISOString()]);

      if (activeTaskIdRef.current) {
        setTasks(ts =>
          ts.map(t =>
            t.id === activeTaskIdRef.current
              ? { ...t, pomodorosCompleted: (t.pomodorosCompleted || 0) + 1 }
              : t
          )
        );
      }

      const nextPos = (pomodoroLogRef.current.length + 1) % LONG_BREAK_AFTER;
      const isLong  = nextPos === 0;
      const next    = isLong ? 'long' : 'short';

      showToast(
        isLong
          ? `${LONG_BREAK_AFTER} sessions done! Long break time 🎉`
          : 'Focus done! Take a short break 🌿',
        'success'
      );

      const delay = sett.autoSwitch ? 800 : 300;
      setTimeout(() => switchModeRef.current(next), delay);
    } else {
      showToast('Break over! Ready to focus? 💪', 'info');
      const delay = sett.autoSwitch ? 800 : 300;
      setTimeout(() => switchModeRef.current('focus'), delay);
    }
  };

  // ── Timer tick ──
  useEffect(() => {
    if (timerState !== 'running') {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimerSeconds(prev => {
        if (timerModeRef.current === 'focus' && activeTaskIdRef.current) {
          setTasks(ts =>
            ts.map(t =>
              t.id === activeTaskIdRef.current
                ? { ...t, timeLogged: t.timeLogged + 1 }
                : t
            )
          );
        }
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(intervalRef.current);
          setTimerState('idle');
          setTimeout(() => onCompleteRef.current(), 0);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [timerState]);

  // ── Timer controls ──
  const startTimer = useCallback(() => {
    initAudio();
    setTimerState('running');
  }, []);
  const pauseTimer  = useCallback(() => setTimerState('paused'), []);
  const resetTimer  = useCallback(() => {
    clearInterval(intervalRef.current);
    setTimerState('idle');
    const secs = getSecsForMode(timerMode, settings);
    setTimerSeconds(secs);
    setTotalSeconds(secs);
  }, [timerMode, settings]);

  // ── Task operations ──
  const selectTask = useCallback((taskId) => {
    if (timerState === 'running') {
      showToast('Pause the timer first', 'warn');
      return;
    }
    setActiveTaskId(prev => (prev === taskId ? null : taskId));
  }, [timerState, showToast]);

  const addTask = useCallback((data) => {
    const t = {
      id: genId(),
      name: data.name.trim(),
      category: data.category,
      priority: data.priority,
      timeEstimate: Number(data.timeEstimate) || 25,
      notes: data.notes.trim(),
      dueDate: data.dueDate,
      completed: false,
      timeLogged: 0,
      pomodorosCompleted: 0,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    setTasks(prev => [t, ...prev]);
    setOpenModal(null);
    showToast(`"${t.name}" added ✓`, 'success');
  }, [showToast]);

  const toggleComplete = useCallback((taskId) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id !== taskId) return t;
        const done = !t.completed;
        return { ...t, completed: done, completedAt: done ? new Date().toISOString() : null };
      })
    );
    if (taskId === activeTaskId && timerState === 'running') pauseTimer();
  }, [activeTaskId, timerState, pauseTimer]);

  const deleteTask = useCallback((taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (activeTaskId === taskId) {
      setActiveTaskId(null);
      if (timerState === 'running') pauseTimer();
    }
  }, [activeTaskId, timerState, pauseTimer]);

  const clearCompleted = useCallback(() => {
    setTasks(prev => {
      const n = prev.filter(t => t.completed).length;
      if (!n) return prev;
      showToast(`Cleared ${n} completed task${n > 1 ? 's' : ''}`, 'info');
      return prev.filter(t => !t.completed);
    });
  }, [showToast]);

  const saveSettings = useCallback((next) => {
    setSettings(next);
    if (timerState === 'idle') {
      const secs = getSecsForMode(timerMode, next);
      setTimerSeconds(secs);
      setTotalSeconds(secs);
    }
    setOpenModal(null);
    showToast('Settings saved', 'success');
  }, [timerState, timerMode, showToast]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = e => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (openModal) { if (e.key === 'Escape') setOpenModal(null); return; }
      switch (e.key) {
        case ' ':  e.preventDefault(); timerState === 'running' ? pauseTimer() : startTimer(); break;
        case 'r': case 'R': resetTimer(); break;
        case 'n': case 'N': setOpenModal('add'); break;
        case 's': case 'S': setOpenModal('settings'); break;
        case 'a': case 'A': setOpenModal('analytics'); break;
        case '?':           setOpenModal('shortcuts'); break;
        case 'd': case 'D': setTheme(t => t === 'dark' ? 'light' : 'dark'); break;
        case '1': switchMode('focus');  break;
        case '2': switchMode('short');  break;
        case '3': switchMode('long');   break;
        case '4': switchMode('custom'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [timerState, openModal, startTimer, pauseTimer, resetTimer, switchMode]);

  const activeTask     = tasks.find(t => t.id === activeTaskId) ?? null;
  const pomodoroCount  = pomodoroLog.length % LONG_BREAK_AFTER;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <span>🌱</span>
          <h1>Focusly</h1>
        </div>
        <div className="header-right">
          <StreakBadge pomodoroLog={pomodoroLog} tasks={tasks} />
          <div className="header-actions">
            <button className="hdr-btn" onClick={() => setOpenModal('analytics')} title="Analytics (A)">
              <IconChart />
            </button>
            <button className="hdr-btn" onClick={() => setOpenModal('shortcuts')} title="Shortcuts (?)">
              <IconKeyboard />
            </button>
            <button className="hdr-btn" onClick={() => setOpenModal('settings')} title="Settings (S)">
              <IconSettings />
            </button>
            <button className="hdr-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Theme (D)">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      <div className="app-layout">
        <aside className="sidebar">
          <TaskList
            tasks={tasks}
            activeTaskId={activeTaskId}
            timerRunning={timerState === 'running'}
            onSelect={selectTask}
            onToggle={toggleComplete}
            onDelete={deleteTask}
            onClearCompleted={clearCompleted}
            onAdd={() => setOpenModal('add')}
          />
        </aside>
        <main className="main-area">
          <Timer
            task={activeTask}
            timerMode={timerMode}
            timerState={timerState}
            timerSeconds={timerSeconds}
            totalSeconds={totalSeconds}
            pomodoroCount={pomodoroCount}
            onSwitchMode={switchMode}
            onStart={startTimer}
            onPause={pauseTimer}
            onReset={resetTimer}
          />
          <Stats tasks={tasks} pomodoroLog={pomodoroLog} settings={settings} />
        </main>
      </div>

      {toast && (
        <div key={toast.key} className={`app-toast toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {openModal === 'add'       && <AddTaskModal  onAdd={addTask}     onClose={() => setOpenModal(null)} />}
      {openModal === 'settings'  && <SettingsModal settings={settings} onSave={saveSettings} onClose={() => setOpenModal(null)} />}
      {openModal === 'analytics' && <AnalyticsModal tasks={tasks}      pomodoroLog={pomodoroLog} settings={settings} onClose={() => setOpenModal(null)} />}
      {openModal === 'shortcuts' && <ShortcutsModal onClose={() => setOpenModal(null)} />}
    </div>
  );
}

// ─── Streak badge ─────────────────────────────────────────────
function StreakBadge({ pomodoroLog, tasks }) {
  const streak = useMemo(() => {
    const days = new Set([
      ...pomodoroLog.map(ts => ts.split('T')[0]),
      ...tasks.filter(t => t.completedAt).map(t => t.completedAt.split('T')[0]),
    ]);
    let s = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      if (days.has(key)) s++;
      else if (i > 0) break;
    }
    return s;
  }, [pomodoroLog, tasks]);

  if (streak < 2) return null;
  return <div className="streak-badge">{streak}d streak 🔥</div>;
}

// ─── Inline SVG icons ──────────────────────────────────────────
function IconChart()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>; }
function IconKeyboard() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>; }
function IconSettings() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>; }
