// AUDIT LOG - 2026-06-04
// Bug 1: ReportsView — React.useRef used without React default imported → Fixed: useRef named import
// Bug 2: ReportsView — upsertLog/toggleMilestone not imported → Fixed: added to trackerUtils import block
// Bug 3: ReportsView ProjectDetail — milestones/targetDate destructured from computeProjectStats return (not returned) → Fixed: pull from tracker.config
// Bug 4: computeGlobalStats — project trackers inflated scheduledCount but isLoggedToday always false for incomplete projects → Fixed: exclude type==='project' from daily counts
// Bug 5: App midnight reset fired at local midnight but todayStr() uses UTC date → Fixed: use UTC midnight for timeout
// Bug 6: insightsEngine — explicit skips (val===false) counted as misses in "missed 3 days" insight → Fixed: only count val==null
// Bug 7: WeeklyReviewModal — backdrop click didn't close modal (no onClick handler on overlay) → Fixed: added onClick={onClose} + stopPropagation
// Bug 8: computeHabitStreaks — first loop (lines ~111-130) wrote into `current` which was immediately reset to 0, dead code → Fixed: removed dead loop
// Bug 9: Timer setInterval-only countdown drifts in throttled background tabs → Fixed: record timerEndAt on start/resume, derive remaining from Date.now() delta

import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { CAT_META } from './utils/categoryMeta';
import Timer from './components/Timer';
import Stats from './components/Stats';
import AddTaskModal from './components/AddTaskModal';
import ShortcutsModal from './components/ShortcutsModal';
import WeeklyReviewModal from './components/WeeklyReviewModal';
import DailyGoalsView from './components/DailyGoalsView';
import AddTrackerModal from './components/AddTrackerModal';
import {
  loadHabits, saveHabits, migrateFromTrackers, toggleCompletion,
} from './habitsStore';
import {
  loadTrackers, saveTrackers,
  isScheduledToday, isLoggedToday, computeHabitStreaks, getConfig
} from './trackers/trackerUtils';
import { handleAuthCallback, syncTasks, pushSyncQueue, directGoogleTaskUpdate, directGoogleTaskDelete } from './utils/googleTasksSync';
import { handleCalendarAuthCallback, isGCalConnected, connectGoogleCalendar, disconnectGoogleCalendar } from './utils/googleCalendarSync';
import { sendNotification } from './utils/notificationUtils';
import { getSecsForMode } from './utils/timerUtils';
import { setTickSeconds, getTickSeconds } from './utils/timerTickStore';
import { logActivity, diffObjects } from './utils/activityLog';
import { clearReminder } from './utils/reminders';
import { localDateStr, todayStr } from './utils/date';
import { genId } from './utils/id';
import FocusCompanion from './components/FocusCompanion';
import nookLogo from './nook-favicon.png';

// ── Code-split route-level views (each tab's chunk loads only when that tab is opened) ──
const ReportsView     = lazy(() => import('./components/ReportsView'));
const CalendarView    = lazy(() => import('./components/CalendarView'));
const AnalyticsModal  = lazy(() => import('./components/AnalyticsModal'));
const TaskList        = lazy(() => import('./components/TaskList'));
const SettingsView    = lazy(() => import('./components/SettingsView'));
const JournalView     = lazy(() => import('./components/JournalView'));
const CountdownsView  = lazy(() => import('./components/CountdownsView'));
const HabitsView      = lazy(() => import('./components/HabitsView'));
const NotesView       = lazy(() => import('./components/NotesView'));
const NoteModal       = lazy(() => import('./components/NotesView').then(m => ({ default: m.NoteModal })));
const ActivityLogView = lazy(() => import('./components/ActivityLogView'));
const VaultView       = lazy(() => import('./components/VaultView'));
const LinksView       = lazy(() => import('./components/LinksView'));
const RemindersView   = lazy(() => import('./components/RemindersView'));

// ─── Constants ───────────────────────────────────────────────────
const LONG_BREAK_AFTER = 4;
const PRIO_ORDER = { high: 0, medium: 1, low: 2, none: 3 };
const DEFAULT_SETTINGS = {
  focusDuration: 25, shortDuration: 5, longDuration: 15, customDuration: 25,
  autoSwitch: false, sound: true,
};

// ─── Audio ───────────────────────────────────────────────────────
let _audioCtx = null;
function initAudio() {
  if (!_audioCtx) { const C = window.AudioContext || window.webkitAudioContext; if (C) _audioCtx = new C(); }
  if (_audioCtx?.state === 'suspended') _audioCtx.resume().catch(() => {});
}
function playAlarm() {
  const ctx = _audioCtx; if (!ctx) return;
  try {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

// ─── Storage keys ────────────────────────────────────────────────
const SK = {
  tasks: 'nook-tasks', settings: 'nook-settings',
  theme: 'nook-theme', pomoLog: 'nook-pomo-log',
  intentions: 'nook-intentions',
};

function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

// ─── Helpers ─────────────────────────────────────────────────────
function makeItems() { return ['1','2','3'].map(id => ({ id, text: '', done: false })); }

// ─── Loaders ─────────────────────────────────────────────────────
const VALID_CATS = new Set(['learning','fitness','mental','work','growth']);
const CAT_KW = [
  ['learning',['learn','study','read','course','book','educat']],
  ['fitness', ['fit','gym','exercise','workout','run','sport','health']],
  ['mental',  ['mental','meditat','mind','journal','stress','relax']],
  ['growth',  ['grow','personal','habit','skill','creat','hobby']],
];
function toCategory(raw) {
  if (!raw) return 'work';
  const lo = raw.toLowerCase().trim();
  if (VALID_CATS.has(lo)) return lo;
  for (const [cat,kws] of CAT_KW) if (kws.some(kw => lo.includes(kw))) return cat;
  return 'work';
}
function migrateTask(t) {
  if (t.name !== undefined) return t;
  return {
    id: t.id || String(Date.now()+Math.random()), name: t.text||'Untitled',
    category: toCategory(t.category),
    priority: ['none','low','medium','high'].includes(t.priority)?t.priority:'none',
    timeEstimate:(t.estPomodoros||1)*25, notes:t.notes||'', dueDate:'',
    completed:Boolean(t.completed), timeLogged:(t.actPomodoros||0)*25*60,
    pomodorosCompleted:t.actPomodoros||0,
    createdAt:t.createdAt?new Date(t.createdAt).toISOString():new Date().toISOString(),
    completedAt:t.completed?new Date().toISOString():null,
  };
}
function loadTasks() {
  try { const r=localStorage.getItem(SK.tasks); return r?JSON.parse(r).map(migrateTask):[]; } catch { return []; }
}
function loadSettings() {
  try {
    const r=localStorage.getItem(SK.settings); if(!r) return {...DEFAULT_SETTINGS};
    const p=JSON.parse(r);
    return {
      focusDuration: p.focusDuration||p.pomodoroDuration||DEFAULT_SETTINGS.focusDuration,
      shortDuration: p.shortDuration||p.shortBreakDuration||DEFAULT_SETTINGS.shortDuration,
      longDuration:  p.longDuration||p.longBreakDuration||DEFAULT_SETTINGS.longDuration,
      customDuration:p.customDuration||DEFAULT_SETTINGS.customDuration,
      autoSwitch:    p.autoSwitch??DEFAULT_SETTINGS.autoSwitch,
      sound:         p.sound??p.soundEnabled??DEFAULT_SETTINGS.sound,
    };
  } catch { return {...DEFAULT_SETTINGS}; }
}
function loadPomoLog() {
  try {
    const r=localStorage.getItem(SK.pomoLog); if(r) return JSON.parse(r);
    const ar=localStorage.getItem('nook-analytics'); if(!ar) return [];
    const analytics=JSON.parse(ar); const log=[];
    for(const [ds,data] of Object.entries(analytics)) {
      const c=data.pomodoros||0;
      for(let i=0;i<c;i++) log.push(`${ds}T${String(12+Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}:00.000Z`);
    }
    if(log.length) persist(SK.pomoLog,log); return log;
  } catch { return []; }
}
function loadIntentions() {
  try {
    const r=localStorage.getItem(SK.intentions); const today=todayStr();
    if(!r) return {date:today,items:makeItems(),history:{}};
    const d=JSON.parse(r);
    if(d.date!==today) {
      const history={...(d.history||{}),[d.date]:(d.items||[]).some(i=>i.done)};
      return {date:today,items:makeItems(),history};
    }
    return d;
  } catch { return {date:todayStr(),items:makeItems(),history:{}}; }
}



// Compute next due date string (YYYY-MM-DD) for a recurring task
function nextDueDate(dueDateStr, recurrence, recurrenceDays) {
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const toISO   = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const base    = dueDateStr ? new Date(dueDateStr + 'T00:00:00') : new Date();
  if (recurrence === 'daily')    return toISO(addDays(base, 1));
  if (recurrence === 'weekly')   return toISO(addDays(base, 7));
  if (recurrence === 'monthly')  { const r = new Date(base); r.setMonth(r.getMonth() + 1); return toISO(r); }
  if (recurrence === 'weekdays') {
    let next = addDays(base, 1);
    while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
    return toISO(next);
  }
  if (recurrence === 'custom' && recurrenceDays?.length) {
    let next = addDays(base, 1);
    for (let i = 0; i < 7; i++, next = addDays(next, 1))
      if (recurrenceDays.includes(next.getDay())) return toISO(next);
  }
  return '';
}

// Real relative-time label for a genuine past event (e.g. a logged pomodoro timestamp).
function fmtRelativeTime(isoOrDate) {
  const then = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const mins = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// ─── App ─────────────────────────────────────────────────────────
export default function App() {
  const isMac = typeof window !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');
  const initSettings = useMemo(loadSettings, []); // eslint-disable-line

  // ── Existing state ──
  const [tasks,       setTasks]       = useState(loadTasks);
  const [syncStatus,  setSyncStatus]  = useState(() => localStorage.getItem('nook_sync_enabled') === 'true' ? 'Synced' : 'Not connected');

  const [theme,       setTheme]       = useState(() => { try { const t = localStorage.getItem(SK.theme); return t ? JSON.parse(t) : 'dark'; } catch { return 'dark'; } });
  const [settings,    setSettings]    = useState(initSettings);
  const [pomodoroLog, setPomodoroLog] = useState(loadPomoLog);

  // ── OAuth Callback & Initial Sync ──
  useEffect(() => {
    // Handle Google Calendar OAuth callback first (state=gcal), then Tasks
    handleCalendarAuthCallback().then(calSuccess => {
      if (calSuccess) {
        showToast('Connected to Google Calendar!', 'success');
        return;
      }
      handleAuthCallback().then(success => {
        if (success) {
          showToast('Connected to Google Tasks!', 'success');
          setSyncStatus('Syncing...');
          syncTasks(tasks, setTasks, setSyncStatus);
        } else if (localStorage.getItem('nook_sync_enabled') === 'true') {
          syncTasks(tasks, setTasks, setSyncStatus);
        }
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── One-Time Cleanup for Keystroke Bug Duplicates ──
  useEffect(() => {
    if (localStorage.getItem('nook_cleaned_w_duplicates') !== 'true') {
      const badNames = ["W", "Wo", "Wor", "Work", "Work ", "Work O", "Work On", "Work On.", "Work On..", "Work On..."];
      setTasks(prev => {
        const toDelete = prev.filter(t => badNames.includes(t.name) && t.completed === false);
        if (toDelete.length === 0) return prev;
        
        let next = [...prev];
        toDelete.forEach(dup => {
          next = next.filter(t => t.id !== dup.id);
          pushSyncQueue({ type: 'DELETE', taskId: dup.id, googleTaskId: dup.googleTaskId });
        });
        setTimeout(() => syncTasks(next, setTasks, setSyncStatus), 1000);
        return next;
      });
      localStorage.setItem('nook_cleaned_w_duplicates', 'true');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Window Focus Sync Trigger ──
  useEffect(() => {
    const handleFocus = () => {
      if (localStorage.getItem('nook_sync_enabled') === 'true') {
        syncTasks(tasks, setTasks, setSyncStatus, true);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [tasks]);

  const [timerMode,       setTimerMode]       = useState('focus');
  const [activeTimerMode, setActiveTimerMode] = useState('focus'); // mode actually running
  const [timerState,   setTimerState]   = useState('idle');
  const [timerSeconds, setTimerSeconds] = useState(() => getSecsForMode('focus',initSettings));
  const [totalSeconds, setTotalSeconds] = useState(() => getSecsForMode('focus',initSettings));
  // Seed the external tick store so Timer/FocusCompanion/DailyGoalsView show the
  // right value on first render, before any tick/start/switch has run.
  useEffect(() => { setTickSeconds(timerSeconds); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeTaskId, setActiveTaskId] = useState(null);
  const [openModal,    setOpenModal]    = useState(null);
  const [toast,        setToast]        = useState(null);

  // ── New state ──
  const [activeTab,      setActiveTab]      = useState('daily');
  const [pendingOpenTaskId, setPendingOpenTaskId] = useState(null); // deep-link from Reminders tab
  const [trackers,       setTrackers]       = useState(loadTrackers);
  const [intentions,     setIntentions]     = useState(loadIntentions);
  const [editingTracker, setEditingTracker] = useState(null);
  const [showAddTracker, setShowAddTracker] = useState(false);
  const [editingTask,    setEditingTask]    = useState(null);
  const [noteEditorCtx,  setNoteEditorCtx]  = useState(null); // { note, onSave, onDelete }
  const [habits,         setHabits]         = useState(() => loadHabits() ?? []);

  // ── PWA Install State ──
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);


  const handleImportData = useCallback((data) => {
    if (confirm("This will replace your current data. Are you sure?")) {
      for (const key in data) {
        localStorage.setItem(key, data[key]);
      }
      window.location.reload();
    }
  }, []);

  const handleClearData = useCallback(() => {
    if (confirm("Are you sure you want to clear ALL data? This cannot be undone.")) {
      // Nook keys use BOTH prefixes: 'nook-' (tasks, settings, calendar…) and
      // 'nook_' (notes, links, countdowns, journal, goals, Google tokens/sync).
      // Match both so "Clear all data" actually clears everything — leaving the
      // underscore keys behind previously kept content and live OAuth tokens.
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('nook-') || k.startsWith('nook_'))) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
      window.location.reload();
    }
  }, []);

  const handleSettingsSyncToggle = useCallback((enabled) => {
    if (enabled) {
      localStorage.setItem('nook_sync_enabled', 'true');
      setSyncStatus('Syncing...');
      syncTasks(tasks, setTasks, setSyncStatus);
    } else {
      localStorage.setItem('nook_sync_enabled', 'false');
      setSyncStatus('Not connected');
    }
  }, [tasks, setTasks, setSyncStatus]);

  const handleSettingsDisconnect = useCallback(() => {
    setSyncStatus('Not connected');
  }, [setSyncStatus]);

  const handleSettingsSyncNow = useCallback(() => {
    syncTasks(tasks, setTasks, setSyncStatus);
  }, [tasks, setTasks, setSyncStatus]);

  const handleUpdateProfile = useCallback((name, email, av) => {
    // Profile name/email/avatar are stored in localStorage by SettingsView directly.
    // Nothing to sync into App state here.
  }, []);

  const handleConnectGCal = useCallback(() => connectGoogleCalendar(), []);
  const handleDisconnectGCal = useCallback(() => disconnectGoogleCalendar(), []);

  // ── Handlers ──
  const intervalRef        = useRef(null);
  const toastTimerRef      = useRef(null);
  const activeTaskRef      = useRef(activeTaskId);
  const timerModeRef       = useRef(timerMode);
  const activeTimerModeRef = useRef('focus');
  const timerStateRef      = useRef('idle');
  const timerSecsRef       = useRef(timerSeconds);
  const timerEndAtRef      = useRef(null); // wall-clock ms when current session should complete
  const settingsRef        = useRef(settings);
  const pomoLogRef         = useRef(pomodoroLog);
  const switchModeRef      = useRef(null);
  const onCompleteRef      = useRef(null);

  useEffect(() => { activeTaskRef.current      = activeTaskId;    }, [activeTaskId]);
  useEffect(() => { timerModeRef.current       = timerMode;       }, [timerMode]);
  useEffect(() => { activeTimerModeRef.current = activeTimerMode; }, [activeTimerMode]);
  useEffect(() => { timerStateRef.current      = timerState;      }, [timerState]);
  useEffect(() => { timerSecsRef.current       = timerSeconds;    }, [timerSeconds]);
  useEffect(() => { settingsRef.current        = settings;        }, [settings]);
  useEffect(() => { pomoLogRef.current         = pomodoroLog;     }, [pomodoroLog]);

  // ── Persistence ──
  useEffect(() => { persist(SK.tasks,      tasks);      }, [tasks]);
  useEffect(() => { persist(SK.settings,   settings);   }, [settings]);
  useEffect(() => { persist(SK.pomoLog,    pomodoroLog); }, [pomodoroLog]);
  useEffect(() => { persist(SK.intentions, intentions); }, [intentions]);
  useEffect(() => { saveTrackers(trackers);              }, [trackers]);
  useEffect(() => { saveHabits(habits);                  }, [habits]);
  useEffect(() => {
    // One-time migration: copy type='habit' trackers into the habits store
    const migrated = migrateFromTrackers(trackers);
    if (migrated !== null) setHabits(migrated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    persist(SK.theme, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Midnight reset ──
  // Rolls intentions over to the new day in place (no reload) so an open note/journal/task
  // editor isn't discarded. Re-arms itself after each fire so it keeps working across
  // multiple midnights in a long-lived tab, not just the first one after page load.
  useEffect(() => {
    let t;
    const armNext = () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      t = setTimeout(() => {
        setIntentions(prev => {
          const today = todayStr();
          if (prev.date === today) return prev;
          const history = {...(prev.history||{}), [prev.date]: prev.items.some(i=>i.done)};
          return { date: today, items: makeItems(), history };
        });
        armNext();
      }, midnight - now);
    };
    armNext();
    return () => clearTimeout(t);
  }, []);

  // ── PWA Install tracking ──
  useEffect(() => {
    let visits = parseInt(localStorage.getItem('nook-visits') || '0', 10);
    if (!sessionStorage.getItem('nook-session-visited')) {
      visits += 1;
      localStorage.setItem('nook-visits', visits.toString());
      sessionStorage.setItem('nook-session-visited', 'true');
    }
    
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (visits >= 3 && localStorage.getItem('nook-install-dismissed') !== 'true') {
        setShowInstallBanner(true);
      }
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
      localStorage.setItem('nook-install-dismissed', 'true');
    }
    setDeferredPrompt(null);
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('nook-install-dismissed', 'true');
  };

  // ── Scheduled Notifications Engine ──
  useEffect(() => {
    const checkNotifications = () => {
      const masterEnabled = localStorage.getItem('nook-notif-master') !== 'false';
      if (!masterEnabled) return;

      const now = new Date();
      const today = localDateStr(now);
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      let notifState = { date: today, triggered: {} };
      try {
        const savedState = JSON.parse(localStorage.getItem('nook-notif-state'));
        if (savedState && savedState.date === today) {
          notifState = savedState;
        }
      } catch (e) {}

      let updated = false;

      // 1. Morning Briefing
      const briefingEnabled = localStorage.getItem('nook-notif-morning') !== 'false';
      const briefingTime = localStorage.getItem('nook-notif-morning-time') || '08:00';
      if (briefingEnabled && currentTime === briefingTime && !notifState.triggered.briefing) {
        const scheduled = trackers.filter(t => isScheduledToday(t) && !isLoggedToday(t));
        if (scheduled.length > 0) {
          const profileName = localStorage.getItem('nook-profile-name') || 'there';
          sendNotification(`Good morning, ${profileName}!`, {
            body: `You have ${scheduled.length} tracker${scheduled.length > 1 ? 's' : ''} to log today. Let's get started!`
          });
          notifState.triggered.briefing = true;
          updated = true;
        }
      }

      // 2. Habit Reminders
      trackers.forEach(t => {
        if (t.type === 'habit' && t.config?.reminderTime === currentTime && !notifState.triggered[`habit_${t.id}`]) {
          if (isScheduledToday(t) && !isLoggedToday(t)) {
            const { current: streak } = computeHabitStreaks(t);
            sendNotification(`Time to log: ${t.name}`, {
              body: streak > 0 ? `Current streak: ${streak} days. Keep it going!` : 'Log it now to start your streak!'
            });
            notifState.triggered[`habit_${t.id}`] = true;
            updated = true;
          }
        }
      });

      // 3. Streak At-Risk Alerts
      const streakAlertsEnabled = localStorage.getItem('nook-notif-streak') !== 'false';
      if (streakAlertsEnabled && currentTime === '20:00' && !notifState.triggered.streak_alerts) {
        trackers.forEach(t => {
          if (t.type === 'habit' && isScheduledToday(t) && !isLoggedToday(t)) {
            const { current: streak } = computeHabitStreaks(t);
            if (streak >= 3) {
              sendNotification('Streak at risk! 🔥', {
                body: `Don't break your ${streak}-day streak for "${t.name}".`
              });
            }
          }
        });
        notifState.triggered.streak_alerts = true;
        updated = true;
      }

      if (updated) {
        localStorage.setItem('nook-notif-state', JSON.stringify(notifState));
      }
    };

    // Check immediately, then every minute
    checkNotifications();
    const timerId = setInterval(checkNotifications, 60000);
    return () => clearInterval(timerId);
  }, [trackers]);

  // ── Toast ──
  const showToast = useCallback((msg, type='info') => {
    setToast({ msg, type, key: Date.now() });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    const handleAppToast = (e) => {
      if (e.detail && e.detail.msg) {
        showToast(e.detail.msg, e.detail.type || 'info');
      }
    };
    window.addEventListener('app-toast', handleAppToast);
    return () => window.removeEventListener('app-toast', handleAppToast);
  }, [showToast]);

  // ── Timer ──
  // Batched focus-time accrual: the ticking interval no longer calls setTasks (and
  // therefore doesn't persist to localStorage) every single second. Elapsed seconds
  // accumulate in a ref and get flushed in one write every FLUSH_EVERY_N_SECS ticks,
  // plus immediately on pause/reset/completion/task-switch so nothing is lost.
  const FLUSH_EVERY_N_SECS = 10;
  const pendingFocusSecondsRef = useRef(0);
  const pendingFocusTaskIdRef  = useRef(null);
  const focusTickCountRef      = useRef(0);

  const flushFocusTime = useCallback(() => {
    const taskId = pendingFocusTaskIdRef.current;
    const secs   = pendingFocusSecondsRef.current;
    pendingFocusSecondsRef.current = 0;
    focusTickCountRef.current = 0;
    if (taskId && secs > 0) {
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, timeLogged: t.timeLogged + secs } : t));
    }
  }, []);

  const accrueFocusSecond = useCallback(() => {
    const currentTaskId = activeTaskRef.current;
    if (pendingFocusTaskIdRef.current !== currentTaskId) {
      flushFocusTime(); // commit whatever was pending for the previous task first
      pendingFocusTaskIdRef.current = currentTaskId;
    }
    if (!currentTaskId) return;
    pendingFocusSecondsRef.current += 1;
    focusTickCountRef.current += 1;
    if (focusTickCountRef.current >= FLUSH_EVERY_N_SECS) flushFocusTime();
  }, [flushFocusTime]);

  const switchMode = useCallback((mode) => {
    setTimerMode(mode);
    // Only update seconds/totalSeconds when no timer is actively running/paused
    if (timerStateRef.current === 'idle') {
      const secs = getSecsForMode(mode, settingsRef.current);
      setTimerSeconds(secs); setTotalSeconds(secs);
      setTickSeconds(secs);
      setActiveTimerMode(mode);
    }
  }, []);
  useEffect(() => { switchModeRef.current = switchMode; }, [switchMode]);

  onCompleteRef.current = () => {
    const mode=activeTimerModeRef.current, sett=settingsRef.current;
    if (sett.sound) playAlarm();
    
    // Push notification if enabled
    const pomoAlertsEnabled = localStorage.getItem('nook-notif-pomo') !== 'false';
    if (pomoAlertsEnabled) {
      if (mode === 'focus') {
        sendNotification('Focus session complete!', { body: 'Time for a break.' });
      } else {
        sendNotification('Break over.', { body: 'Ready for the next session?' });
      }
    }

    if (mode==='focus') {
      logActivity({ module: 'focus', entity_type: 'focus_session', entity_id: new Date().getTime().toString(), action: 'completed', title: 'Focus Session Completed' });
      setPomodoroLog(prev=>[...prev, new Date().toISOString()]);
      flushFocusTime();
      if (activeTaskRef.current) {
        setTasks(ts=>ts.map(t=>t.id===activeTaskRef.current?{...t,pomodorosCompleted:(t.pomodorosCompleted||0)+1}:t));
      }
      const nextPos=(pomoLogRef.current.length+1)%LONG_BREAK_AFTER;
      const isLong=nextPos===0;
      showToast(isLong?`${LONG_BREAK_AFTER} sessions done! Long break 🎉`:'Focus done! Short break 🌿','success');
      setTimeout(()=>switchModeRef.current(isLong?'long':'short'), sett.autoSwitch?800:300);
    } else {
      showToast('Break over! Ready to focus? 💪','info');
      setTimeout(()=>switchModeRef.current('focus'), sett.autoSwitch?800:300);
    }
  };

  useEffect(() => {
    if (timerState!=='running') { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      // Use wall-clock delta so the timer stays accurate in throttled background tabs.
      const remaining = Math.ceil((timerEndAtRef.current - Date.now()) / 1000);
      if (activeTimerModeRef.current==='focus') accrueFocusSecond();
      // Per-second display goes through an external store, not React state, so this
      // tick never re-renders App (or the sidebar/header/other tabs) — only the
      // few components that actually show the countdown subscribe to it.
      setTickSeconds(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        setTimerSeconds(0);
        setTimerState('idle');
        setTimeout(() => onCompleteRef.current(), 0);
      }
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [timerState, accrueFocusSecond]);

  const adjustDuration = useCallback((secs) => {
    const clamped = Math.max(60, secs);
    setTimerSeconds(clamped);
    setTotalSeconds(clamped);
    setTickSeconds(clamped);
  }, []);

  const startTimer  = useCallback(() => {
    initAudio();
    const viewedMode = timerModeRef.current;
    const isResume = timerStateRef.current === 'paused' && viewedMode === activeTimerModeRef.current;
    if (isResume) {
      // Resume with remaining seconds
      timerEndAtRef.current = Date.now() + timerSecsRef.current * 1000;
      setTickSeconds(timerSecsRef.current);
    } else {
      // Fresh start — use timerSecsRef (respects user edits; switchMode already set the default)
      clearInterval(intervalRef.current);
      const secs = timerSecsRef.current;
      setTimerSeconds(secs); setTotalSeconds(secs);
      setTickSeconds(secs);
      timerSecsRef.current = secs;
      setActiveTimerMode(viewedMode);
      activeTimerModeRef.current = viewedMode;
      timerEndAtRef.current = Date.now() + secs * 1000;
    }
    pendingFocusTaskIdRef.current = activeTaskRef.current;
    pendingFocusSecondsRef.current = 0;
    focusTickCountRef.current = 0;
    setTimerState('running');
  }, []);
  const pauseTimer  = useCallback(() => {
    const remaining = getTickSeconds();
    setTimerSeconds(remaining);
    flushFocusTime();
    setTimerState('paused');
  }, [flushFocusTime]);
  const resetTimer  = useCallback(() => {
    clearInterval(intervalRef.current); setTimerState('idle');
    flushFocusTime();
    const s=getSecsForMode(timerMode,settings); setTimerSeconds(s); setTotalSeconds(s); setTickSeconds(s);
    setActiveTimerMode(timerMode);
  }, [timerMode, settings, flushFocusTime]);

  // ── Task operations ──
  const selectTask = useCallback((id) => {
    if (timerState==='running') { showToast('Pause the timer first','warn'); return; }
    setActiveTaskId(prev=>prev===id?null:id);
  }, [timerState, showToast]);

  const addTask = useCallback((data) => {
    const t = {
      id:genId(), name:data.name.trim(), category:data.category, priority:data.priority,
      timeEstimate:Math.max(1,Math.min(480,Number(data.timeEstimate)||25)),
      notes:data.notes.trim(), dueDate:data.dueDate, completed:false, status: 'needsAction',
      timeLogged:0, pomodorosCompleted:0, createdAt:new Date().toISOString(), completedAt:null,
      recurrence: data.recurrence || null,
      recurrenceDays: data.recurrenceDays || [],
      googleTaskId: null,
      lastSyncedAt: null,
      updatedAt: new Date().toISOString(),
      syncConflict: null
    };
    logActivity({ module: 'tasks', entity_type: 'task', entity_id: t.id, action: 'created', title: t.name });
    setTasks(prev => {
      const next = [t, ...prev];
      pushSyncQueue({ type: 'CREATE', taskId: t.id });
      setTimeout(() => syncTasks(next, setTasks, setSyncStatus), 500);
      return next;
    });
    setOpenModal(null);
    showToast(`"${t.name}" added ✓`,'success');
  }, [showToast]);

  const updateTaskData = useCallback((updated) => {
    const nextUpdated = { ...updated, name: updated.name.trim(), notes: (updated.notes||'').trim(), updatedAt: new Date().toISOString() };
    setTasks(prev => {
      const old = prev.find(t => t.id === updated.id);
      const changes = old ? diffObjects(old, nextUpdated, ['name', 'notes', 'priority', 'category', 'dueDate', 'timeEstimate']) : null;
      logActivity({ module: 'tasks', entity_type: 'task', entity_id: updated.id, action: 'updated', title: nextUpdated.name, field_changes: changes });
      if (nextUpdated.completed && !old?.completed) clearReminder('task', updated.id).catch(() => {});
      const next = prev.map(t => t.id === updated.id ? { ...t, ...nextUpdated } : t);
      pushSyncQueue({ type: 'UPDATE', taskId: updated.id });
      setTimeout(() => syncTasks(next, setTasks, setSyncStatus), 500);
      return next;
    });
    setEditingTask(null);
    showToast(`"${updated.name.trim()}" updated ✓`, 'success');
  }, [showToast]);

  // Silent update for detail-panel auto-saves (no toast, no modal side-effects)
  const quickUpdateTask = useCallback((updated) => {
    const nextUpdated = { ...updated, name: (updated.name||'').trim(), notes: (updated.notes||'').trim(), updatedAt: new Date().toISOString() };
    setTasks(prev => {
      const old = prev.find(t => t.id === updated.id);
      if (nextUpdated.completed && !old?.completed) clearReminder('task', updated.id).catch(() => {});
      const next = prev.map(t => t.id === updated.id ? { ...t, ...nextUpdated } : t);
      pushSyncQueue({ type: 'UPDATE', taskId: updated.id });
      setTimeout(() => syncTasks(next, setTasks, setSyncStatus), 500);
      return next;
    });
  }, []);

  // Stable handlers passed to the memoized TaskList (keep its props referentially stable)
  const openAddTaskModal = useCallback(() => setOpenModal('add'), []);
  const openEditTask     = useCallback((task) => setEditingTask(task), []);
  const handleSyncNow    = useCallback(() => syncTasks(tasks, setTasks, setSyncStatus), [tasks]);

  // Reminders tab → jump to the task that owns a reminder, opened straight to its Scheduling tab.
  const navigateToReminderSource = useCallback((sourceType, sourceId) => {
    if (sourceType === 'task') {
      setActiveTab('tasks');
      setPendingOpenTaskId(sourceId);
    }
  }, []);
  const clearPendingOpenTaskId = useCallback(() => setPendingOpenTaskId(null), []);

  // Deep link from a reminder push notification's notificationclick handler
  // (see public/sw.js), e.g. /?reminder=task:abc123 — opens once on load,
  // then cleans the URL so a refresh doesn't re-trigger it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reminder = params.get('reminder');
    if (!reminder) return;
    const [sourceType, sourceId] = reminder.split(':');
    if (sourceType && sourceId) navigateToReminderSource(sourceType, sourceId);
    params.delete('reminder');
    const next = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (next ? `?${next}` : ''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Habit callbacks ──
  const addHabit = useCallback((h) => {
    logActivity({ module: 'habits', entity_type: 'habit', entity_id: h.id, action: 'created', title: h.name });
    setHabits(prev => [h, ...prev]);
  }, []);
  const updateHabit = useCallback((h) => {
    logActivity({ module: 'habits', entity_type: 'habit', entity_id: h.id, action: 'updated', title: h.name });
    setHabits(prev => prev.map(x => x.id === h.id ? h : x));
  }, []);
  const deleteHabit = useCallback((id) => {
    setHabits(prev => {
      const h = prev.find(x => x.id === id);
      if (h) logActivity({ module: 'habits', entity_type: 'habit', entity_id: id, action: 'deleted', title: h.name });
      return prev.filter(x => x.id !== id);
    });
  }, []);
  const markHabitDone = useCallback((id) => {
    setHabits(prev => {
      const h = prev.find(x => x.id === id);
      if (h) {
        const wasCompleted = h.completions?.includes(localDateStr());
        logActivity({ module: 'habits', entity_type: 'habit', entity_id: id, action: wasCompleted ? 'updated' : 'completed', title: h.name, field_changes: wasCompleted ? [{ field: 'completed_today', from: 'true', to: 'false' }] : null });
      }
      return prev.map(x => x.id === id ? toggleCompletion(x) : x);
    });
  }, []);

  const toggleComplete = useCallback(async (id) => {
    const isSyncEnabled = localStorage.getItem('nook_sync_enabled') === 'true';
    const currentTask = tasks.find(t => t.id === id);
    if (!currentTask) return;

    const done = !currentTask.completed;
    logActivity({ module: 'tasks', entity_type: 'task', entity_id: id, action: done ? 'completed' : 'updated', title: currentTask.name, field_changes: done ? null : [{ field: 'completed', from: 'true', to: 'false' }] });
    // A completed task shouldn't still fire a reminder — clear it server-side.
    // Fire-and-forget: a Supabase hiccup here shouldn't block completing the task.
    if (done) clearReminder('task', id).catch(() => {});

    const performLocalUpdate = (forceSync = false) => {
      setTasks(prev => {
        const task = prev.find(t => t.id === id);
        const mapped = prev.map(t => {
          if (t.id !== id) return t;
          return { ...t, completed: done, status: done ? 'completed' : 'needsAction', completedAt: done ? new Date().toISOString() : null, updatedAt: new Date().toISOString() };
        });
        let finalTasks = mapped;
        // Auto-create next occurrence when completing a recurring task
        if (done && task?.recurrence) {
          const due  = nextDueDate(task.dueDate, task.recurrence, task.recurrenceDays);
          const next = {
            ...task,
            id: genId(), completed: false, status: 'needsAction', completedAt: null,
            dueDate: due, timeLogged: 0, pomodorosCompleted: 0,
            createdAt: new Date().toISOString(),
            googleTaskId: null, lastSyncedAt: null, updatedAt: new Date().toISOString(), syncConflict: null
          };
          finalTasks = [...mapped, next];
          pushSyncQueue({ type: 'CREATE', taskId: next.id });
        }
        pushSyncQueue({ type: 'UPDATE', taskId: id });
        setTimeout(() => syncTasks(finalTasks, setTasks, setSyncStatus), forceSync ? 10 : 500);
        return finalTasks;
      });
      if (id===activeTaskId && timerState==='running') pauseTimer();
    };

    if (isSyncEnabled && currentTask.googleTaskId) {
      setSyncStatus('Updating Task Status...');

      const success = await directGoogleTaskUpdate(currentTask.googleTaskId, {
        status: done ? 'completed' : 'needsAction'
      });
      
      if (success) {

        // Handle recurrence locally immediately. Track the freshly-built list so
        // the sync below runs on an array that INCLUDES the new occurrence —
        // passing the stale `tasks` closure here dropped it (pull rebuilds state
        // from whatever array it's given, erasing the just-added next occurrence).
        let nextTasks = tasks;
        if (done && currentTask.recurrence) {
           const due = nextDueDate(currentTask.dueDate, currentTask.recurrence, currentTask.recurrenceDays);
           const next = {
             ...currentTask,
             id: genId(), completed: false, status: 'needsAction', completedAt: null,
             dueDate: due, timeLogged: 0, pomodorosCompleted: 0,
             createdAt: new Date().toISOString(),
             googleTaskId: null, lastSyncedAt: null, updatedAt: new Date().toISOString(), syncConflict: null
           };
           nextTasks = [...tasks, next];
           setTasks(prev => [...prev, next]);
           pushSyncQueue({ type: 'CREATE', taskId: next.id });
        }

        // Force a fresh sync to pull the status update from Google. Pass the list
        // that includes any new occurrence so the pull's setTasks doesn't erase it.
        await syncTasks(nextTasks, setTasks, setSyncStatus);
        if (id===activeTaskId && timerState==='running') pauseTimer();
      } else {
        setSyncStatus('Sync failed');
        performLocalUpdate(); // Fallback to offline queue behavior
      }
    } else {
      performLocalUpdate();
    }
  }, [tasks, activeTaskId, timerState, pauseTimer, setTasks]);

  const deleteTask = useCallback((id) => {
    clearReminder('task', id).catch(() => {});
    setTasks(prev => {
      const task = prev.find(t => t.id === id);
      if (task) logActivity({ module: 'tasks', entity_type: 'task', entity_id: id, action: 'deleted', title: task.name });
      if (task && task.googleTaskId) {
        pushSyncQueue({ type: 'DELETE', googleTaskId: task.googleTaskId, taskId: id });
      }
      const next = prev.filter(t => t.id !== id);
      setTimeout(() => syncTasks(next, setTasks, setSyncStatus), 500);
      return next;
    });
    if (activeTaskId===id) { setActiveTaskId(null); if(timerState==='running') pauseTimer(); }
  }, [activeTaskId, timerState, pauseTimer]);

  const clearCompleted = useCallback(async () => {
    const isSyncEnabled = localStorage.getItem('nook_sync_enabled') === 'true';
    const completedTasks = tasks.filter(t => t.completed || t.status === 'completed');
    if (!completedTasks.length) return;

    if (isSyncEnabled) {
      setSyncStatus('Deleting Completed Tasks...');
      const withGid = completedTasks.filter(t => t.googleTaskId);
      // Delete on Google in bounded-concurrency batches instead of one sequential
      // await per task (N round-trips) — much faster when clearing many at once.
      const LIMIT = 5;
      for (let i = 0; i < withGid.length; i += LIMIT) {
        await Promise.all(withGid.slice(i, i + LIMIT).map(t => directGoogleTaskDelete(t.googleTaskId)));
      }
      // Record all deletions once (was re-parsing/writing localStorage per task) so
      // the next pull doesn't re-create them.
      if (withGid.length) {
        const delStr = localStorage.getItem('nook_deleted_tasks');
        let deletedIds = [];
        try { deletedIds = delStr ? JSON.parse(delStr) : []; } catch {}
        for (const t of withGid) if (!deletedIds.includes(t.googleTaskId)) deletedIds.push(t.googleTaskId);
        localStorage.setItem('nook_deleted_tasks', JSON.stringify(deletedIds));
      }
      const filtered = tasks.filter(t => !t.completed && t.status !== 'completed');
      setTasks(filtered);
      await syncTasks(filtered, setTasks, setSyncStatus);
    } else {
      setTasks(prev => prev.filter(t => !t.completed && t.status !== 'completed'));
    }
    showToast(`Cleared ${completedTasks.length} completed task${completedTasks.length > 1 ? 's' : ''}`, 'info');
  }, [tasks, showToast]);

  const saveSettings = useCallback((next) => {
    setSettings(next);
    if (timerState==='idle') { const s=getSecsForMode(timerMode,next); setTimerSeconds(s); setTotalSeconds(s); setTickSeconds(s); }
    setOpenModal(null); showToast('Settings saved','success');
  }, [timerState, timerMode, showToast]);

  // ── Intention callbacks ──
  const updateIntention = useCallback((id, text) => {
    setIntentions(prev => {
      const existing = prev.items.find(i => i.id === id);
      const isNew = !existing?.text && text;
      if (isNew || (existing && existing.text !== text)) {
        logActivity({ module: 'intentions', entity_type: 'intention', entity_id: id, action: isNew ? 'created' : 'updated', title: text });
      }
      return {...prev, items:prev.items.map(i=>i.id===id?{...i,text}:i)};
    });
  }, []);
  const toggleIntention = useCallback((id) => {
    setIntentions(prev => {
      const intention = prev.items.find(i => i.id === id);
      if (intention && intention.text) {
        logActivity({ module: 'intentions', entity_type: 'intention', entity_id: id, action: intention.done ? 'updated' : 'completed', title: intention.text, field_changes: intention.done ? [{ field: 'done', from: 'true', to: 'false' }] : null });
      }
      return {...prev, items:prev.items.map(i=>i.id===id?{...i,done:!i.done}:i)};
    });
  }, []);

  // ── Tracker callbacks ──
  const addTracker = useCallback((t) => {
    logActivity({ module: 'trackers', entity_type: 'tracker', entity_id: t.id, action: 'created', title: t.name });
    setTrackers(prev=>[t,...prev]);
    showToast(`"${t.name}" tracker created ✓`,'success');
  }, [showToast]);
  const updateTracker = useCallback((newTracker) => {
    setTrackers(prev => {
      const oldTracker = prev.find(t => t.id === newTracker.id);
      if (oldTracker) {
        const today = localDateStr();
        const oldLog = (oldTracker.logs || []).find(l => l.date === today);
        const newLog = (newTracker.logs || []).find(l => l.date === today);
        
        // General update
        if (oldTracker.name !== newTracker.name || oldTracker.target !== newTracker.target) {
           logActivity({ module: 'trackers', entity_type: 'tracker', entity_id: newTracker.id, action: 'updated', title: newTracker.name });
        }

        // Habit logged or Target/Average updated
        if (!oldLog && newLog) {
          logActivity({ module: 'trackers', entity_type: 'tracker', entity_id: newTracker.id, action: 'completed', title: newTracker.name });
          if (navigator.vibrate) navigator.vibrate(50);
          showToast(`Logged "${newTracker.name}"`, 'success');
          
          if (newTracker.type === 'habit') {
            const { current: streak } = computeHabitStreaks(newTracker);
            if ([7, 14, 30, 60, 100].includes(streak)) {
              import('canvas-confetti').then(({ default: confetti }) => confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } }));
              showToast(`🔥 ${streak} day streak on ${newTracker.name}!`, 'success');
            }
          }
        }
        
        // Project Goal completed
        if (newTracker.type === 'project') {
          const oldDone = (getConfig(oldTracker).milestones || []).filter(m => m.done).length;
          const newDone = (getConfig(newTracker).milestones || []).filter(m => m.done).length;
          const total = (getConfig(newTracker).milestones || []).length;
          if (oldDone < total && newDone === total && total > 0) {
            if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
            import('canvas-confetti').then(({ default: confetti }) => confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } }));
            showToast(`🎉 Project completed: ${newTracker.name}!`, 'success');
          } else if (newDone > oldDone) {
            if (navigator.vibrate) navigator.vibrate(50);
          }
        }
      }
      return prev.map(x => x.id === newTracker.id ? newTracker : x);
    });
  }, [showToast]);
  const deleteTracker = useCallback((id) => {
    setTrackers(prev => {
      const t = prev.find(x => x.id === id);
      if (t) logActivity({ module: 'trackers', entity_type: 'tracker', entity_id: id, action: 'deleted', title: t.name });
      return prev.filter(x => x.id !== id);
    });
    showToast('Tracker deleted','info');
  }, [showToast]);

  const handleTrackerSave = useCallback((tracker) => {
    if (editingTracker) updateTracker(tracker);
    else addTracker(tracker);
    setShowAddTracker(false);
    setEditingTracker(null);
  }, [editingTracker, addTracker, updateTracker]);

  const openAddTracker = useCallback(() => {
    setEditingTracker(null); setShowAddTracker(true);
  }, []);
  const openEditTracker = useCallback((tracker) => {
    setEditingTracker(tracker); setShowAddTracker(true);
  }, []);

  // ── Escape closes open modals/drawers ──
  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape' && (openModal || showAddTracker)) {
        setOpenModal(null); setShowAddTracker(false); setEditingTracker(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openModal, showAddTracker]);

  const activeTask    = tasks.find(t=>t.id===activeTaskId)??null;
  const pomodoroCount = pomodoroLog.length%LONG_BREAK_AFTER;

  // Tab badge counts
  const scheduledToday = trackers.filter(t=>isScheduledToday(t));
  const unloggedToday  = scheduledToday.filter(t=>!isLoggedToday(t));

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifsCleared, setNotifsCleared] = useState(false);
  const [snoozedIds, setSnoozedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);
  const avatarRef = useRef(null);
  const notifRef  = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const [isPushEnabled, setIsPushEnabled] = useState(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    return localStorage.getItem('nook-push-enabled') === 'true' && Notification.permission === 'granted';
  });
  const [profileName, setProfileName] = useState(() => localStorage.getItem('nook-profile-name') || 'Productivity User');
  const [profileEmail, setProfileEmail] = useState(() => {
    const saved = localStorage.getItem('nook-profile-email');
    if (saved) return saved;
    const name = localStorage.getItem('nook-profile-name') || 'user';
    return `${name.toLowerCase().replace(/\s+/g, '')}@gmail.com`;
  });
  const [profileAvatar, setProfileAvatar] = useState(() => localStorage.getItem('nook-profile-avatar') || '😎');

  // Push notification helper
  const triggerDesktopNotification = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/nook-favicon.png' });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') new Notification(title, { body, icon: '/nook-favicon.png' });
      });
    }
  };

  const handlePushToggle = () => {
    if (!('Notification' in window)) {
      return;
    }
    if (isPushEnabled) {
      setIsPushEnabled(false);
      localStorage.setItem('nook-push-enabled', 'false');
    } else {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          setIsPushEnabled(true);
          localStorage.setItem('nook-push-enabled', 'true');
          new Notification('Nook Notifications Enabled', {
            body: 'You will receive task reminders and updates here.',
            icon: '/nook-favicon.png',
          });
        } else {
          setIsPushEnabled(false);
          localStorage.setItem('nook-push-enabled', 'false');
        }
      });
    }
  };

  const pendingTasksCount = tasks.filter(t => !t.completed).length;
  const activeHabitsCount = habits.filter(h => !h.archived).length;

  // ── Notification derived data ──
  const notifYesterdayStr = localDateStr(new Date(Date.now() - 86400000));
  const yesterdayPomos = pomodoroLog.filter(ts => ts.startsWith(notifYesterdayStr)).length;
  const completedToday = tasks.filter(t => t.completed && t.completedAt?.startsWith(todayStr())).length;
  const totalTasksForPct = tasks.filter(t => !t.completed || t.completedAt?.startsWith(todayStr())).length;
  const completionPct = totalTasksForPct > 0 ? Math.round((completedToday / totalTasksForPct) * 100) : 0;
  const { urgentTask, urgentDueHrs, quickestTask } = useMemo(() => {
    const urgent = tasks.filter(t => !t.completed && t.dueDate)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0]
      || tasks.filter(t => !t.completed)
        .sort((a, b) => (PRIO_ORDER[a.priority] ?? 3) - (PRIO_ORDER[b.priority] ?? 3))[0];
    const dueHrs = urgent?.dueDate
      ? Math.round((new Date(urgent.dueDate + 'T23:59:59') - Date.now()) / 3600000)
      : null;
    const quickest = tasks.filter(t => !t.completed)
      .sort((a, b) => (a.timeEstimate || 25) - (b.timeEstimate || 25))[0];
    return { urgentTask: urgent, urgentDueHrs: dueHrs, quickestTask: quickest };
  }, [tasks]);

  const notifItems = useMemo(() => [
    {
      // Live summaries, not discrete past events — 'Live' reflects that honestly
      // instead of a fabricated elapsed time.
      id: 1, title: '🎯 Tasks Reminder', time: 'Live', type: 'task',
      desc: urgentTask
        ? `You have ${pendingTasksCount} pending. "${urgentTask.name}"${urgentDueHrs !== null ? ` is due in ${urgentDueHrs}h.` : ' needs your attention.'}`
        : `You have ${pendingTasksCount} pending tasks. Keep up the momentum!`,
    },
    {
      id: 2, title: '⚡ Habit Tracker', time: 'Live', type: 'habit',
      desc: `You have ${activeHabitsCount || 0} habit${activeHabitsCount !== 1 ? 's' : ''} active today. Remember to maintain your daily streaks!`,
    },
    {
      // Real relative time from the most recent logged pomodoro, when one exists.
      id: 3, title: '📊 Analytics Insight', time: pomodoroLog.length ? fmtRelativeTime(pomodoroLog[pomodoroLog.length - 1]) : 'Live', type: 'analytics',
      desc: pomodoroLog.length === 0
        ? 'Ready for your first focus session? Tap to start.'
        : yesterdayPomos > 0
          ? `Yesterday you did ${yesterdayPomos} pomodoro${yesterdayPomos !== 1 ? 's' : ''}! Beat that today?`
          : `Great focus! You've logged ${pomodoroLog.length} session${pomodoroLog.length !== 1 ? 's' : ''} today.`,
      progressPct: completionPct,
    },
  ], [urgentTask, urgentDueHrs, pendingTasksCount, activeHabitsCount, pomodoroLog, yesterdayPomos, completionPct]);

  // Automated trigger for notifications when enabled
  useEffect(() => {
    if (localStorage.getItem('nook-notif-master') !== 'false') {
      const timer = setTimeout(() => {
        if ('Notification' in window && Notification.permission === 'granted') {
          triggerDesktopNotification('Nook Daily Summary', `🎯 ${pendingTasksCount} pending tasks | ⚡ ${activeHabitsCount} active habits`);
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pendingTasksCount, activeHabitsCount]);

  const getInitials = (name) => {
    if (!name) return 'PU'; // matches the 'Productivity User' default profile name
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (q.length < 2) return [];
    const results = [];

    tasks.forEach(t => {
      if (t.name?.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q)) {
        results.push({ type: 'task', id: t.id, title: t.name, sub: t.notes?.slice(0, 60) || t.category, tab: 'tasks' });
      }
    });

    try {
      JSON.parse(localStorage.getItem('nook_notes') || '[]').forEach(n => {
        if (n.title?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q)) {
          results.push({ type: 'note', id: n.id, title: n.title || 'Untitled note', sub: n.content?.slice(0, 60), tab: 'notes' });
        }
      });
    } catch {}

    try {
      JSON.parse(localStorage.getItem('nook_countdowns') || '[]').forEach(c => {
        if (c.name?.toLowerCase().includes(q)) {
          results.push({ type: 'countdown', id: c.id, title: c.name, sub: `${c.startDate} – ${c.endDate}`, tab: 'countdowns' });
        }
      });
    } catch {}

    habits.forEach(h => {
      if (h.name?.toLowerCase().includes(q)) {
        results.push({ type: 'habit', id: h.id, title: h.name, sub: 'Habit tracker', tab: 'habits' });
      }
    });

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('nook_journal_')) continue;
      try {
        const e = JSON.parse(localStorage.getItem(key));
        const content = e?.content || '';
        if (content.toLowerCase().includes(q)) {
          const idx = content.toLowerCase().indexOf(q);
          const preview = content.slice(Math.max(0, idx - 20), idx + 60).trim();
          results.push({ type: 'journal', id: e.date, title: `Journal — ${e.date}`, sub: preview, tab: 'journal' });
        }
      } catch {}
    }

    try {
      JSON.parse(localStorage.getItem('nook_vault') || '[]').forEach(v => {
        if (v.name?.toLowerCase().includes(q) || v.username?.toLowerCase().includes(q) || v.url?.toLowerCase().includes(q)) {
          results.push({ type: 'vault', id: v.id, title: v.name, sub: v.username || v.url, tab: 'vault' });
        }
      });
    } catch {}

    try {
      JSON.parse(localStorage.getItem('nook_links') || '[]').forEach(l => {
        if (l.title?.toLowerCase().includes(q) || l.url?.toLowerCase().includes(q) || l.category?.toLowerCase().includes(q)) {
          results.push({ type: 'link', id: l.id, title: l.title, sub: l.url, tab: 'links' });
        }
      });
    } catch {}

    const allTabs = [
      { id: 'daily', label: 'Today' },
      { id: 'tasks', label: 'Tasks' },
      { id: 'notes', label: 'Notes' },
      { id: 'calendar', label: 'Calendar' },
      { id: 'reminders', label: 'Reminders' },
      { id: 'vault', label: 'Saved Logins' },
      { id: 'links', label: 'Links' },
      { id: 'countdowns', label: 'Countdowns' },
      { id: 'habits', label: 'Habits' },
      { id: 'timer', label: 'Focus Timer' },
      { id: 'journal', label: 'Journal' },
      { id: 'reports', label: 'Reports' },
      { id: 'activity', label: 'Activity Log' },
      { id: 'settings', label: 'Settings' }
    ];
    allTabs.forEach(t => {
      if (t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)) {
        results.push({ type: 'tab', id: 'nav-' + t.id, title: `Go to ${t.label}`, sub: 'Navigation', tab: t.id });
      }
    });

    return results.slice(0, 8);
  }, [searchQuery, tasks, habits]);

  useEffect(() => {
    const handler = e => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false);
      if (notifRef.current  && !notifRef.current.contains(e.target))  setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeNotifs = notifsCleared ? [] : notifItems.filter(item => !snoozedIds.has(item.id));
  const notifCount = activeNotifs.length;

  return (
    <div className={`app${sidebarOpen ? ' sidebar-open' : ''}`}>
      <header className="app-header">
        {!sidebarOpen && (
          <button className="hdr-btn sidebar-reopen-btn" onClick={() => setSidebarOpen(true)} title="Open Sidebar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        )}
        {/* ── Timestamp on far left ── */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <HeaderClock />
        </div>

        <div className="yartu-top-search-wrapper">
          <div className="yartu-top-search" ref={searchRef} onClick={() => searchInputRef.current?.focus()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search for anything..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => { if (searchQuery.length >= 2) setSearchOpen(true); }}
              onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); e.target.blur(); } }}
            />
            {searchQuery ? (
              <button className="search-clear-btn" onClick={() => { setSearchQuery(''); setSearchOpen(false); }} title="Clear">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            ) : (
              <span className="search-shortcut-badge">{isMac ? '⌘K' : 'Ctrl K'}</span>
            )}

            {searchOpen && searchQuery.length >= 2 && (
              <div className="search-dropdown" onMouseDown={e => e.stopPropagation()}>
                {searchResults.length === 0 ? (
                  <div className="search-empty">No results for "{searchQuery}"</div>
                ) : (
                  searchResults.map(r => (
                    <button key={r.type + r.id} className="search-result-item" onMouseDown={e => e.preventDefault()} onClick={() => { setActiveTab(r.tab); setSearchOpen(false); setSearchQuery(''); }}>
                      <span className="search-result-icon" data-type={r.type}>
                        {r.type === 'task'    && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
                        {r.type === 'note'    && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
                        {r.type === 'goal'    && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>}
                        {r.type === 'habit'   && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>}
                        {r.type === 'journal' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>}
                        {r.type === 'countdown' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>}
                        {r.type === 'vault'   && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                        {r.type === 'link'    && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>}
                        {r.type === 'tab'     && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>}
                      </span>
                      <div className="search-result-text">
                        <span className="search-result-title">{r.title}</span>
                        {r.sub && <span className="search-result-sub">{r.sub}</span>}
                      </div>
                      <span className="search-result-badge">{r.type}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div className="header-right">
          <HeaderGreeting />
          <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />
          <button className="hdr-btn" title="Analytics" onClick={() => setOpenModal('analytics')}>
            <IconChart />
          </button>
          <div style={{ position: 'relative' }} ref={notifRef}>
            <button className="hdr-btn" style={{ position: 'relative' }} title="Notifications" onClick={() => setNotifOpen(n => !n)}>
              <svg width="18" height="18" viewBox="0 0 24 24" {...S}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {notifCount > 0 ? (
                <span className="hdr-notif-badge is-number">{notifCount}</span>
              ) : (
                <span className="hdr-notif-badge is-dot" />
              )}
            </button>

            <AnimatePresence>
            {notifOpen && (
              <motion.div
                className="yartu-avatar-dropdown"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{ width: 340, right: 0, padding: 16, cursor: 'default' }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 12px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notifications</div>
                    {!notifsCleared && notifItems.length > 0 && (
                      <button
                        onClick={() => setNotifsCleared(true)}
                        style={{ background: 'transparent', border: 'none', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2 }}
                      >Clear all</button>
                    )}
                  </div>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'Notification' in window ? 'pointer' : 'not-allowed', opacity: 'Notification' in window ? 1 : 0.4 }}
                    title={!('Notification' in window) ? 'Notifications not supported in this browser' : isPushEnabled ? 'Disable push notifications' : 'Enable push notifications'}
                    onClick={handlePushToggle}
                  >
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Push</span>
                    <div style={{ width: 36, height: 20, borderRadius: 10, background: isPushEnabled ? '#22c55e' : 'var(--border-strong, #cbd5e1)', position: 'relative', transition: 'background 0.18s ease', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 3, left: isPushEnabled ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.18s ease' }} />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {notifsCleared ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No notifications</div>
                  ) : (() => {
                    const visible = notifItems.filter(item => !snoozedIds.has(item.id));
                    if (visible.length === 0) return <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>All snoozed · back in 15 min</div>;
                    return visible.map(item => (
                      <div key={item.id} style={{ background: 'var(--bg-input)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 12px 8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--text-primary)' }}>{item.title}</span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{item.time}</span>
                          </div>
                          <div
                            style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45, cursor: item.type === 'analytics' && pomodoroLog.length === 0 ? 'pointer' : 'default' }}
                            onClick={() => { if (item.type === 'analytics' && pomodoroLog.length === 0) { setActiveTab('timer'); setNotifOpen(false); } }}
                          >{item.desc}</div>
                          {item.progressPct !== undefined && (
                            <div style={{ marginTop: 7, width: '100%', height: 5, background: 'var(--ring-track)', borderRadius: 9999, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(100, item.progressPct)}%`, background: 'var(--accent)', borderRadius: 9999, transition: 'width 0.4s ease' }} />
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', gap: 6, padding: '6px 10px 8px', borderTop: '1px solid var(--border)' }}>
                          {item.type === 'task' && (<>
                            <button
                              style={{ background: 'transparent', color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 500, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-strong)', cursor: 'pointer' }}
                              onClick={() => { if (quickestTask) { toggleComplete(quickestTask.id); showToast(`"${quickestTask.name}" done ✓`, 'success'); } }}
                            >Mark Quickest Done</button>
                            <button
                              style={{ background: 'transparent', color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 500, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-strong)', cursor: 'pointer' }}
                              onClick={() => { setActiveTab('tasks'); setNotifOpen(false); }}
                            >View All</button>
                          </>)}
                          {item.type === 'habit' && (<>
                            <button
                              style={{ background: 'transparent', color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 500, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-strong)', cursor: 'pointer' }}
                              onClick={() => { setActiveTab('habits'); setNotifOpen(false); }}
                            >Log Habit</button>
                            <button
                              style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 500, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-strong)', cursor: 'pointer' }}
                              onClick={() => {
                                setSnoozedIds(prev => new Set([...prev, item.id]));
                                setTimeout(() => setSnoozedIds(prev => { const n = new Set(prev); n.delete(item.id); return n; }), 15 * 60 * 1000);
                              }}
                            >Snooze 15m</button>
                          </>)}
                          {item.type === 'analytics' && (
                            <button
                              style={{ background: 'transparent', color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 500, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-strong)', cursor: 'pointer' }}
                              onClick={() => { switchMode('focus'); setActiveTab('timer'); setNotifOpen(false); }}
                            >Start 25-min Timer</button>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
                <div className="nav-divider" style={{ margin: '12px 0 8px' }} />
                <button className="main-nav-btn" style={{ justifyContent: 'center', width: '100%', padding: '8px 0' }} onClick={() => { setActiveTab('settings'); setNotifOpen(false); }}>
                  <span className="nav-label" style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>Configure in Settings</span>
                </button>
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          <div className="yartu-top-avatar" ref={avatarRef} onClick={() => setAvatarOpen(a => !a)}>
            <div className="yartu-avatar-circle" style={{ padding: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {profileAvatar.startsWith('data:image') ? <img src={profileAvatar} alt="avatar" style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : profileAvatar !== '😎' ? profileAvatar : getInitials(profileName)}
            </div>
            
            <AnimatePresence>
            {avatarOpen && (
              <motion.div
                className="yartu-avatar-dropdown"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Preferences</div>
                <button className="main-nav-btn" onClick={() => { setOpenModal('shortcuts'); setAvatarOpen(false); }}>
                  <span className="nav-icon"><IconKeyboard /></span>
                  <span className="nav-label">Shortcuts (?)</span>
                </button>
                <button className="main-nav-btn" onClick={() => { setTheme(t => t === 'dark' ? 'light' : 'dark'); setAvatarOpen(false); }}>
                  <span className="nav-icon">{theme === 'dark' ? <IconSun /> : <IconMoon />}</span>
                  <span className="nav-label">Theme: {theme === 'dark' ? 'Dark' : 'Light'}</span>
                </button>
                <div className="nav-divider" style={{ margin: '8px 0' }} />
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 11px', marginBottom: -6 }}>Connections</div>
                <button className="main-nav-btn" style={{ justifyContent: 'space-between' }} onClick={() => { setActiveTab('settings'); setAvatarOpen(false); }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="nav-icon"><NavIcoCheckSquare /></span>
                    <span className="nav-label">Tasks</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className={`status-dot ${syncStatus === 'Sync failed' ? 'red' : syncStatus !== 'Not connected' ? 'green' : 'gray'}`} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {syncStatus === 'Sync failed' ? 'Error' : syncStatus !== 'Not connected' ? 'Synced' : 'Not connected'}
                    </span>
                  </span>
                </button>
                <button className="main-nav-btn" style={{ justifyContent: 'space-between' }} onClick={() => { if (!isGCalConnected()) { connectGoogleCalendar(); } else { setActiveTab('calendar'); setAvatarOpen(false); } }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="nav-icon"><NavIcoCalendar /></span>
                    <span className="nav-label">Calendar</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className={`status-dot ${isGCalConnected() ? 'green' : 'gray'}`} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {isGCalConnected() ? 'Connected' : 'Not connected'}
                    </span>
                  </span>
                </button>
                <div className="nav-divider" style={{ margin: '8px 0' }} />
                <button className="hdr-cta-btn" style={{ width: '100%' }} onClick={() => { setAvatarOpen(false); if (activeTab === 'tasks') setOpenModal('add'); else openAddTracker(); }}>
                  {activeTab === 'tasks' ? '＋ Add Task' : '＋ Add Tracker'}
                </button>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* ── Body: sidebar nav + content ── */}
      <div className="app-body">

      <AnimatePresence>
        {sidebarOpen && (
          <motion.nav
            className="main-nav desktop-only"
            initial={{ x: -240, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -240, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
          <div className="sidebar-brand">
            <img src={nookLogo} className="sidebar-brand-logo" alt="Nook Logo" />
            <span className="sidebar-brand-name">Nook</span>
            <button className="hdr-btn sidebar-close-btn" onClick={() => setSidebarOpen(false)} title="Close Sidebar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>
          {/* ── Section: Main ── */}
          <span className="nav-section-label">Main</span>
          {[
            { id:'daily',    label:'Today',    Icon: NavIcoSun,         badge: unloggedToday.length || 0 },
            { id:'tasks',    label:'Tasks',    Icon: NavIcoCheckSquare, badge: tasks.filter(t=>!t.completed).length || 0 },
            { id:'notes',    label:'Notes',    Icon: NavIcoNotes },
            { id:'calendar', label:'Calendar', Icon: NavIcoCalendar },
            { id:'reminders', label:'Reminders', Icon: NavIcoBell },
            { id:'links',    label:'Links',    Icon: NavIcoLinks },
            { id:'countdowns', label:'Countdowns', Icon: NavIcoHourglass },
          ].map(tab => (
            <button key={tab.id}
              className={`main-nav-btn${activeTab===tab.id?' nav-active':''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon"><tab.Icon /></span>
              <span className="nav-label">{tab.label}</span>
              {tab.badge > 0 && <span className="nav-badge">{tab.badge}</span>}
            </button>
          ))}

          {/* ── Section: More ── */}
          <div className="nav-divider" />
          <span className="nav-section-label">More</span>
          {[
            { id:'habits',   label:'Habits',       Icon: NavIcoRepeat },
            { id:'timer',    label:'Focus',         Icon: NavIcoTimerIcon },
            { id:'journal',  label:'Journal',       Icon: NavIcoBookOpen },
            { id:'vault',    label:'Saved Logins', Icon: NavIcoVault },
            { id:'reports',  label:'Reports',       Icon: NavIcoBarChart },
            { id:'activity', label:'Activity Log',  Icon: NavIcoHistory },
          ].map(tab => (
            <button key={tab.id}
              className={`main-nav-btn${activeTab===tab.id?' nav-active':''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon"><tab.Icon /></span>
              <span className="nav-label">{tab.label}</span>
            </button>
          ))}

          {/* ── Settings pinned to bottom ── */}
          <div className="nav-spacer" />
          <div className="nav-settings-separator" />
          <button
            className={`main-nav-btn${activeTab==='settings'?' nav-active':''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span className="nav-icon"><NavIcoSettings /></span>
            <span className="nav-label">Settings</span>
          </button>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="mobile-bottom-nav">
        {[
          { id:'daily',    label:'Today',    Icon: NavIcoSun,         badge: unloggedToday.length || 0 },
          { id:'tasks',    label:'Tasks',    Icon: NavIcoCheckSquare, badge: tasks.filter(t=>!t.completed).length || 0 },
          { id:'journal',  label:'Journal',  Icon: NavIcoBookOpen },
          { id:'habits',   label:'Habits',   Icon: NavIcoRepeat },
        ].map(tab => (
          <button key={tab.id}
            className={`main-nav-btn${activeTab===tab.id?' nav-active':''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="nav-icon"><tab.Icon /></span>
            <span className="nav-label">{tab.label}</span>
            {tab.badge > 0 && <span className="nav-badge">{tab.badge}</span>}
          </button>
        ))}
        <button className={`main-nav-btn${openModal === 'mobile-more' ? ' nav-active' : ''}`} onClick={() => setOpenModal('mobile-more')}>
          <span className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/></svg>
          </span>
          <span className="nav-label">More</span>
        </button>
      </nav>

      {/* ── Tab content ── */}
      <div className="tab-content">
        <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          className={`sunsama-tab-transition${activeTab === 'daily' ? ' yartu-tab-active' : ''}${activeTab === 'calendar' ? ' calendar-tab-active' : ''}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.13, ease: 'easeOut' }}
        >
          <Suspense fallback={<TabFallback />}>
          {activeTab === 'daily' && (
            <DailyGoalsView
              trackers={trackers}
              onUpdateTracker={updateTracker}
              onAddTracker={openAddTracker}
              intentions={intentions}
              onIntentionUpdate={updateIntention}
              onIntentionToggle={toggleIntention}
              pomodoroLog={pomodoroLog}
              tasks={tasks}
              onTriggerWeeklyReview={() => setOpenModal('weekly-review')}
              habits={habits}
              onMarkHabitDone={markHabitDone}
              activeTaskId={activeTaskId}
              timerRunning={timerState==='running'}
              selectTask={selectTask}
              toggleComplete={toggleComplete}
              deleteTask={deleteTask}
              clearCompleted={clearCompleted}
              setOpenModal={setOpenModal}
              addTask={addTask}
              setEditingTask={setEditingTask}
              updateTaskData={updateTaskData}
              quickUpdateTask={quickUpdateTask}
              syncStatus={syncStatus}
              syncTasks={() => syncTasks(tasks, setTasks, setSyncStatus)}
              startTimer={startTimer}
              pauseTimer={pauseTimer}
              resetTimer={resetTimer}
              timerState={timerState}
              timerMode={timerMode}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              trackers={trackers}
              tasks={tasks}
              pomodoroLog={pomodoroLog}
              onUpdateTracker={updateTracker}
              onDeleteTracker={deleteTracker}
              onEditTracker={openEditTracker}
              onAddTracker={openAddTracker}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onSaveSettings={saveSettings}
              theme={theme}
              onSetTheme={setTheme}
              onClearData={handleClearData}
              onImportData={handleImportData}
              syncStatus={syncStatus}
              onSyncToggle={handleSettingsSyncToggle}
              onDisconnect={handleSettingsDisconnect}
              onSyncNow={handleSettingsSyncNow}
              initialProfileName={profileName}
              initialProfileEmail={profileEmail}
              initialProfileAvatar={profileAvatar}
              onUpdateProfile={handleUpdateProfile}
              gcalConnected={isGCalConnected()}
              onConnectGCal={handleConnectGCal}
              onDisconnectGCal={handleDisconnectGCal}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView
              tasks={tasks}
              onAddTask={addTask}
              onUpdateTask={updateTaskData}
              trackers={trackers}
              habits={habits}
            />
          )}

          {activeTab === 'timer' && (
            <div className="timer-tab-wrap">
            <div className="timer-tab">
              <div className="timer-left-col">
                <Timer
                  task={activeTask}
                  timerMode={timerMode}
                  activeTimerMode={activeTimerMode}
                  timerState={timerState}
                  totalSeconds={totalSeconds}
                  pomodoroCount={pomodoroCount}
                  onSwitchMode={switchMode}
                  onStart={startTimer}
                  onPause={pauseTimer}
                  onReset={resetTimer}
                  onAdjustDuration={adjustDuration}
                />
              </div>
              <div className="timer-right-col">
                <FocusCompanion
                  tasks={tasks}
                  activeTaskId={activeTaskId}
                  onSelectTask={selectTask}
                  onToggle={toggleComplete}
                  pomodoroLog={pomodoroLog}
                  timerState={timerState}
                  timerMode={timerMode}
                />
                <TodayBreakdown tasks={tasks} />
                <Stats tasks={tasks} pomodoroLog={pomodoroLog} settings={settings} />
              </div>
            </div>
            </div>
          )}

          {activeTab === 'habits'  && (
            <HabitsView
              habits={habits}
              onAddHabit={addHabit}
              onUpdateHabit={updateHabit}
              onDeleteHabit={deleteHabit}
            />
          )}
          {activeTab === 'journal'  && <JournalView />}
          {activeTab === 'countdowns' && <CountdownsView />}
          {activeTab === 'notes'    && <NotesView onOpenNoteEditor={setNoteEditorCtx} globalSearchQuery={searchQuery} />}
          {activeTab === 'vault'    && <VaultView />}
          {activeTab === 'links'   && <LinksView />}
          {activeTab === 'reminders' && <RemindersView onNavigateToSource={navigateToReminderSource} />}
          {activeTab === 'activity' && <ActivityLogView setActiveTab={setActiveTab} />}

          {activeTab === 'tasks' && (
            <div className="tasks-tab">
              <TaskList
                tasks={tasks}
                activeTaskId={activeTaskId}
                timerRunning={timerState==='running'}
                onSelect={selectTask}
                onToggle={toggleComplete}
                onDelete={deleteTask}
                onClearCompleted={clearCompleted}
                onAdd={openAddTaskModal}
                onAddTask={addTask}
                onEdit={openEditTask}
                onUpdate={updateTaskData}
                onQuickUpdate={quickUpdateTask}
                syncStatus={syncStatus}
                onSyncNow={handleSyncNow}
                openTaskId={pendingOpenTaskId}
                onOpenTaskIdHandled={clearPendingOpenTaskId}
              />
            </div>
          )}
          </Suspense>
        </motion.div>
        </AnimatePresence>

        {/* PWA Install Banner */}
        {showInstallBanner && (
          <div className="install-banner" style={{
            position: 'fixed', bottom: 20, left: 20, right: 20, zIndex: 999,
            background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 16,
            boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 16,
            border: '1px solid var(--border-strong)'
          }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 192 192" fill="none"><circle cx="96" cy="96" r="50" stroke="#fff" strokeWidth="12"/><circle cx="96" cy="96" r="24" fill="#fff"/></svg>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Install Nook for quick access</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleInstallClick} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Install</button>
              <button onClick={dismissInstallBanner} style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>×</button>
            </div>
          </div>
        )}
      </div>
      </div>{/* end app-body */}

      {/* ── Toast ── */}
      {toast && <div key={toast.key} className={`app-toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* ── Modals ── */}
      <AnimatePresence>
        {noteEditorCtx && (
          <Suspense fallback={null}>
            <NoteModal
              key={noteEditorCtx.note.id}
              note={noteEditorCtx.note}
              onSave={(savedNote) => noteEditorCtx.onSave(savedNote)}
              onClose={() => setNoteEditorCtx(null)}
              onDelete={(id) => noteEditorCtx.onDelete(id)}
              onColorChange={noteEditorCtx.onColorChange}
            />
          </Suspense>
        )}
        {openModal==='add'       && <AddTaskModal  key="add-task" onAdd={addTask}     onClose={()=>setOpenModal(null)} existingTasks={tasks} />}
        {openModal==='mobile-more' && <MobileMoreModal key="mobile-more" onClose={() => setOpenModal(null)} onSelect={(id) => { setActiveTab(id); setOpenModal(null); }} />}
        {editingTask             && <AddTaskModal  key="edit-task" onEdit={updateTaskData} onClose={()=>setEditingTask(null)} editTask={editingTask} />}
        {openModal==='analytics' && <Suspense fallback={null}><AnalyticsModal key="analytics" tasks={tasks} pomodoroLog={pomodoroLog} settings={settings} onClose={()=>setOpenModal(null)} /></Suspense>}
        {openModal==='shortcuts' && <ShortcutsModal key="shortcuts" onClose={()=>setOpenModal(null)} />}
        {openModal==='weekly-review' && (
          <WeeklyReviewModal
            key="weekly-review"
            trackers={trackers} tasks={tasks} pomodoroLog={pomodoroLog}
            onClose={() => setOpenModal(null)}
            onSave={(reviewData) => {
              let currentReviews = [];
              try { currentReviews = JSON.parse(localStorage.getItem('nook-weekly-reviews') || '[]'); }
              catch { console.warn('[WeeklyReview] nook-weekly-reviews was corrupted, resetting.'); }
              localStorage.setItem('nook-weekly-reviews', JSON.stringify([reviewData, ...currentReviews]));
              showToast('Weekly review saved!', 'success');
              setOpenModal(null);
            }}
          />
        )}
        {showAddTracker && (
          <AddTrackerModal
            key="add-tracker"
            onSave={handleTrackerSave}
            onClose={() => { setShowAddTracker(false); setEditingTracker(null); }}
            editTracker={editingTracker}
            existingTrackers={trackers}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Header clock (isolated 1s tick so the app tree doesn't re-render every second) ──
function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const dayStr  = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  return (
    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {timeStr} • {dayStr}
    </span>
  );
}

// ─── Header greeting (updates hourly; own slow tick keeps it out of the app re-render) ──
function HeaderGreeting() {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60000);
    return () => clearInterval(id);
  }, []);
  const greeting = hour >= 5 && hour < 12 ? 'Good Morning'
    : hour >= 12 && hour < 17 ? 'Good Afternoon'
    : hour >= 17 && hour < 21 ? 'Good Evening'
    : 'Good Night';
  return <span className="header-greeting-text" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{greeting}</span>;
}

// ─── Lazy-view loading fallback ───────────────────────────────────
function TabFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, color: 'var(--text-muted)' }}>
      <span className="tab-fallback-spinner" aria-label="Loading" />
    </div>
  );
}

// ─── Mobile More Navigation Drawer ────────────────────────────────
function MobileMoreModal({ onClose, onSelect }) {
  const tabs = [
    { id: 'notes', label: 'Notes', Icon: NavIcoNotes },
    { id: 'calendar', label: 'Calendar', Icon: NavIcoCalendar },
    { id: 'reminders', label: 'Reminders', Icon: NavIcoBell },
    { id: 'links', label: 'Links', Icon: NavIcoLinks },
    { id: 'countdowns', label: 'Countdowns', Icon: NavIcoHourglass },
    { id: 'timer', label: 'Focus', Icon: NavIcoTimerIcon },
    { id: 'vault', label: 'Saved Logins', Icon: NavIcoVault },
    { id: 'reports', label: 'Reports', Icon: NavIcoBarChart },
    { id: 'activity', label: 'Activity Log', Icon: NavIcoHistory },
    { id: 'settings', label: 'Settings', Icon: NavIcoSettings },
  ];
  return (
    <div className="mobile-more-overlay" onClick={onClose}>
      <motion.div 
        className="mobile-more-drawer"
        onClick={e => e.stopPropagation()}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      >
        <div className="mobile-more-header">
          <h3>More</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mobile-more-grid">
          {tabs.map(t => (
            <button key={t.id} className="mobile-more-item" onClick={() => onSelect(t.id)}>
              <span className="mobile-more-icon"><t.Icon /></span>
              <span className="mobile-more-label">{t.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Today's task breakdown ───────────────────────────────────────
function TodayBreakdown({ tasks }) {
  const today = todayStr();
  const done  = tasks.filter(t=>t.completed && t.completedAt?.startsWith(today));
  const byCat = {};
  for (const t of done) byCat[t.category]=(byCat[t.category]||0)+1;
  const entries = Object.entries(byCat);
  if (!entries.length) return null;
  return (
    <div className="today-breakdown">
      <span className="today-breakdown-lbl">Today's completions</span>
      <div className="today-breakdown-chips">
        {entries.map(([cat,n]) => {
          const m=CAT_META[cat]??{label:cat,color:'#6366f1'};
          return (
            <span key={cat} className="today-cat-chip"
              style={{background:m.color+'22',color:m.color,border:`1px solid ${m.color}44`}}>
              {m.label} {n}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Inline SVG icons ─────────────────────────────────────────────
const S = { fill:'none', stroke:'currentColor', strokeWidth:'1.75', strokeLinecap:'round', strokeLinejoin:'round' };

// App logo — crosshair/focus mark
// Header action icons (16px)
function IconChart()    { return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>; }
function IconKeyboard() { return <svg width="16" height="16" viewBox="0 0 24 24" {...S}><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>; }
function IconSun()      { return <svg width="16" height="16" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>; }
function IconMoon()     { return <svg width="16" height="16" viewBox="0 0 24 24" {...S}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>; }

// ─── Sidebar nav icons (18px) ─────────────────────────────────────
// Section 1 — Daily
function NavIcoSun() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
}
function NavIcoRepeat() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;
}
function NavIcoCheckSquare() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
}
function NavIcoTimerIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 15 16"/><line x1="9" y1="2" x2="15" y2="2"/><line x1="12" y1="2" x2="12" y2="5"/></svg>;
}
function NavIcoBookOpen() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
}
// Section 2 — Planning
function NavIcoHourglass() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><path d="M5 2h14"/><path d="M5 22h14"/><path d="M5 2c0 6 6 6 6 10s-6 4-6 10"/><path d="M19 2c0 6-6 6-6 10s6 4 6 10"/></svg>;
}
function NavIcoBarChart() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>;
}
function NavIcoCalendar() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
}
function NavIcoNotes() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>;
}
function NavIcoHistory() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function NavIcoVault() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
}
function NavIcoLinks() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
}
function NavIcoBell() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
// Bottom
function NavIcoSettings() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}
