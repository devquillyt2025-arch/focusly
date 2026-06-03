import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import TaskList, { CAT_META } from './components/TaskList';
import Timer from './components/Timer';
import Stats from './components/Stats';
import AddTaskModal from './components/AddTaskModal';
import SettingsView from './components/SettingsView';
import OnboardingFlow from './components/OnboardingFlow';
import AnalyticsModal from './components/AnalyticsModal';
import ShortcutsModal from './components/ShortcutsModal';
import WeeklyReviewModal from './components/WeeklyReviewModal';
import DailyGoalsView from './components/DailyGoalsView';
import ReportsView from './components/ReportsView';
import AddTrackerModal from './components/AddTrackerModal';
import {
  loadTrackers, saveTrackers,
  isScheduledToday, isLoggedToday, computeHabitStreaks
} from './trackers/trackerUtils';
import { sendNotification } from './utils/notificationUtils';

// ─── Constants ───────────────────────────────────────────────────
const LONG_BREAK_AFTER = 4;
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
  tasks: 'focusly-tasks', settings: 'focusly-settings',
  theme: 'focusly-theme', pomoLog: 'focusly-pomo-log',
  intentions: 'focusly-intentions',
};

function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

// ─── Helpers ─────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0]; }
function getWeekStart() {
  const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().split('T')[0];
}
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
    const ar=localStorage.getItem('focusly-analytics'); if(!ar) return [];
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

export function getSecsForMode(mode, sett) {
  switch(mode) {
    case 'focus':  return (sett.focusDuration||25)*60;
    case 'short':  return (sett.shortDuration||5)*60;
    case 'long':   return (sett.longDuration||15)*60;
    case 'custom': return (sett.customDuration||25)*60;
    default: return 25*60;
  }
}

function genId() { return Date.now().toString(36)+Math.random().toString(36).slice(2); }

// ─── App ─────────────────────────────────────────────────────────
export default function App() {
  const initSettings = useMemo(loadSettings, []); // eslint-disable-line

  // ── Existing state ──
  const [tasks,       setTasks]       = useState(loadTasks);
  const [theme,       setTheme]       = useState(() => { try { return JSON.parse(localStorage.getItem(SK.theme))||'dark'; } catch { return 'dark'; } });
  const [settings,    setSettings]    = useState(initSettings);
  const [pomodoroLog, setPomodoroLog] = useState(loadPomoLog);

  const [timerMode,    setTimerMode]    = useState('focus');
  const [timerState,   setTimerState]   = useState('idle');
  const [timerSeconds, setTimerSeconds] = useState(() => getSecsForMode('focus',initSettings));
  const [totalSeconds, setTotalSeconds] = useState(() => getSecsForMode('focus',initSettings));

  const [activeTaskId, setActiveTaskId] = useState(null);
  const [openModal,    setOpenModal]    = useState(null);
  const [toast,        setToast]        = useState(null);

  // ── New state ──
  const [activeTab,      setActiveTab]      = useState('daily');
  const [trackers,       setTrackers]       = useState(loadTrackers);
  const [intentions,     setIntentions]     = useState(loadIntentions);
  const [editingTracker, setEditingTracker] = useState(null);
  const [showAddTracker, setShowAddTracker] = useState(false);

  // ── PWA Install State ──
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // ── Onboarding State ──
  const [onboardingComplete, setOnboardingComplete] = useState(() => localStorage.getItem('focusly-onboarding-complete') === 'true');

  const handleImportData = (data) => {
    if (confirm("This will replace your current data. Are you sure?")) {
      for (const key in data) {
        localStorage.setItem(key, data[key]);
      }
      window.location.reload();
    }
  };

  const handleClearData = () => {
    if (confirm("Are you sure you want to clear ALL data? This cannot be undone.")) {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i).startsWith('focusly-')) keys.push(localStorage.key(i));
      }
      keys.forEach(k => localStorage.removeItem(k));
      window.location.reload();
    }
  };

  // ── Handlers ──
  const intervalRef    = useRef(null);
  const toastTimerRef  = useRef(null);
  const activeTaskRef  = useRef(activeTaskId);
  const timerModeRef   = useRef(timerMode);
  const settingsRef    = useRef(settings);
  const pomoLogRef     = useRef(pomodoroLog);
  const switchModeRef  = useRef(null);
  const onCompleteRef  = useRef(null);

  useEffect(() => { activeTaskRef.current  = activeTaskId;   }, [activeTaskId]);
  useEffect(() => { timerModeRef.current   = timerMode;      }, [timerMode]);
  useEffect(() => { settingsRef.current    = settings;       }, [settings]);
  useEffect(() => { pomoLogRef.current     = pomodoroLog;    }, [pomodoroLog]);

  // ── Persistence ──
  useEffect(() => { persist(SK.tasks,      tasks);      }, [tasks]);
  useEffect(() => { persist(SK.settings,   settings);   }, [settings]);
  useEffect(() => { persist(SK.pomoLog,    pomodoroLog); }, [pomodoroLog]);
  useEffect(() => { persist(SK.intentions, intentions); }, [intentions]);
  useEffect(() => { saveTrackers(trackers);              }, [trackers]);
  useEffect(() => {
    persist(SK.theme, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── Midnight reset ──
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
    const t = setTimeout(() => {
      setIntentions(prev => {
        const today = todayStr();
        if (prev.date === today) return prev;
        const history = {...(prev.history||{}), [prev.date]: prev.items.some(i=>i.done)};
        return { date: today, items: makeItems(), history };
      });
      window.location.reload();
    }, midnight - now);
    return () => clearTimeout(t);
  }, []);

  // ── PWA Install tracking ──
  useEffect(() => {
    let visits = parseInt(localStorage.getItem('focusly-visits') || '0', 10);
    if (!sessionStorage.getItem('focusly-session-visited')) {
      visits += 1;
      localStorage.setItem('focusly-visits', visits.toString());
      sessionStorage.setItem('focusly-session-visited', 'true');
    }
    
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (visits >= 3 && localStorage.getItem('focusly-install-dismissed') !== 'true') {
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
      localStorage.setItem('focusly-install-dismissed', 'true');
    }
    setDeferredPrompt(null);
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('focusly-install-dismissed', 'true');
  };

  // ── Scheduled Notifications Engine ──
  useEffect(() => {
    const checkNotifications = () => {
      const masterEnabled = localStorage.getItem('focusly-notif-master') !== 'false';
      if (!masterEnabled) return;

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      let notifState = { date: today, triggered: {} };
      try {
        const savedState = JSON.parse(localStorage.getItem('focusly-notif-state'));
        if (savedState && savedState.date === today) {
          notifState = savedState;
        }
      } catch (e) {}

      let updated = false;

      // 1. Morning Briefing
      const briefingEnabled = localStorage.getItem('focusly-notif-morning') !== 'false';
      const briefingTime = localStorage.getItem('focusly-notif-morning-time') || '08:00';
      if (briefingEnabled && currentTime === briefingTime && !notifState.triggered.briefing) {
        const scheduled = trackers.filter(t => isScheduledToday(t) && !isLoggedToday(t));
        if (scheduled.length > 0) {
          const profileName = localStorage.getItem('focusly-profile-name') || 'there';
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
      const streakAlertsEnabled = localStorage.getItem('focusly-notif-streak') !== 'false';
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
        localStorage.setItem('focusly-notif-state', JSON.stringify(notifState));
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

  // ── Timer ──
  const switchMode = useCallback((mode) => {
    clearInterval(intervalRef.current);
    setTimerState('idle'); setTimerMode(mode);
    const secs = getSecsForMode(mode, settingsRef.current);
    setTimerSeconds(secs); setTotalSeconds(secs);
  }, []);
  useEffect(() => { switchModeRef.current = switchMode; }, [switchMode]);

  onCompleteRef.current = () => {
    const mode=timerModeRef.current, sett=settingsRef.current;
    if (sett.sound) playAlarm();
    
    // Push notification if enabled
    const pomoAlertsEnabled = localStorage.getItem('focusly-notif-pomo') !== 'false';
    if (pomoAlertsEnabled) {
      if (mode === 'focus') {
        sendNotification('Focus session complete!', { body: 'Time for a break.' });
      } else {
        sendNotification('Break over.', { body: 'Ready for the next session?' });
      }
    }

    if (mode==='focus') {
      setPomodoroLog(prev=>[...prev, new Date().toISOString()]);
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
      setTimerSeconds(prev => {
        if (timerModeRef.current==='focus' && activeTaskRef.current) {
          setTasks(ts=>ts.map(t=>t.id===activeTaskRef.current?{...t,timeLogged:t.timeLogged+1}:t));
        }
        const next = prev-1;
        if (next<=0) { clearInterval(intervalRef.current); setTimerState('idle'); setTimeout(()=>onCompleteRef.current(),0); return 0; }
        return next;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [timerState]);

  const startTimer  = useCallback(() => { initAudio(); setTimerState('running'); }, []);
  const pauseTimer  = useCallback(() => setTimerState('paused'), []);
  const resetTimer  = useCallback(() => {
    clearInterval(intervalRef.current); setTimerState('idle');
    const s=getSecsForMode(timerMode,settings); setTimerSeconds(s); setTotalSeconds(s);
  }, [timerMode, settings]);

  // ── Task operations ──
  const selectTask = useCallback((id) => {
    if (timerState==='running') { showToast('Pause the timer first','warn'); return; }
    setActiveTaskId(prev=>prev===id?null:id);
  }, [timerState, showToast]);

  const addTask = useCallback((data) => {
    const t = {
      id:genId(), name:data.name.trim(), category:data.category, priority:data.priority,
      timeEstimate:Math.max(1,Math.min(480,Number(data.timeEstimate)||25)),
      notes:data.notes.trim(), dueDate:data.dueDate, completed:false,
      timeLogged:0, pomodorosCompleted:0, createdAt:new Date().toISOString(), completedAt:null,
    };
    setTasks(prev=>[t,...prev]); setOpenModal(null);
    showToast(`"${t.name}" added ✓`,'success');
  }, [showToast]);

  const toggleComplete = useCallback((id) => {
    setTasks(prev=>prev.map(t=>{
      if(t.id!==id) return t;
      const done=!t.completed;
      return {...t,completed:done,completedAt:done?new Date().toISOString():null};
    }));
    if (id===activeTaskId && timerState==='running') pauseTimer();
  }, [activeTaskId, timerState, pauseTimer]);

  const deleteTask = useCallback((id) => {
    setTasks(prev=>prev.filter(t=>t.id!==id));
    if (activeTaskId===id) { setActiveTaskId(null); if(timerState==='running') pauseTimer(); }
  }, [activeTaskId, timerState, pauseTimer]);

  const clearCompleted = useCallback(() => {
    setTasks(prev=>{
      const n=prev.filter(t=>t.completed).length; if(!n) return prev;
      showToast(`Cleared ${n} completed task${n>1?'s':''}`, 'info');
      return prev.filter(t=>!t.completed);
    });
  }, [showToast]);

  const saveSettings = useCallback((next) => {
    setSettings(next);
    if (timerState==='idle') { const s=getSecsForMode(timerMode,next); setTimerSeconds(s); setTotalSeconds(s); }
    setOpenModal(null); showToast('Settings saved','success');
  }, [timerState, timerMode, showToast]);

  // ── Intention callbacks ──
  const updateIntention = useCallback((id, text) => {
    setIntentions(prev=>({...prev, items:prev.items.map(i=>i.id===id?{...i,text}:i)}));
  }, []);
  const toggleIntention = useCallback((id) => {
    setIntentions(prev=>({...prev, items:prev.items.map(i=>i.id===id?{...i,done:!i.done}:i)}));
  }, []);

  // ── Tracker callbacks ──
  const addTracker = useCallback((t) => {
    setTrackers(prev=>[t,...prev]);
    showToast(`"${t.name}" tracker created ✓`,'success');
  }, [showToast]);
  const updateTracker = useCallback((newTracker) => {
    setTrackers(prev => {
      const oldTracker = prev.find(t => t.id === newTracker.id);
      if (oldTracker) {
        const today = new Date().toISOString().split('T')[0];
        const oldLog = (oldTracker.logs || []).find(l => l.date === today);
        const newLog = (newTracker.logs || []).find(l => l.date === today);

        // Habit logged or Target/Average updated
        if (!oldLog && newLog) {
          if (navigator.vibrate) navigator.vibrate(50);
          showToast(`Logged "${newTracker.name}"`, 'success');
          
          if (newTracker.type === 'habit') {
            const { current: streak } = computeHabitStreaks(newTracker);
            if ([7, 14, 30, 60, 100].includes(streak)) {
              if (window.confetti) window.confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
              showToast(`🔥 ${streak} day streak on ${newTracker.name}!`, 'success');
            }
          }
        }
        
        // Project Goal completed
        if (newTracker.type === 'project') {
          const oldDone = (oldTracker.config.milestones || []).filter(m => m.done).length;
          const newDone = (newTracker.config.milestones || []).filter(m => m.done).length;
          const total = (newTracker.config.milestones || []).length;
          if (oldDone < total && newDone === total && total > 0) {
            if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
            if (window.confetti) window.confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } });
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
    setTrackers(prev=>prev.filter(t=>t.id!==id));
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

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = e => {
      if (openModal || showAddTracker) {
        if (e.key==='Escape') { setOpenModal(null); setShowAddTracker(false); setEditingTracker(null); }
        return;
      }
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      switch(e.key) {
        case ' ':  e.preventDefault(); timerState==='running'?pauseTimer():startTimer(); break;
        case 'r': case 'R': resetTimer(); break;
        case 'n': case 'N': if(activeTab==='tasks') setOpenModal('add'); else openAddTracker(); break;
        case 's': case 'S': setActiveTab('settings'); break;
        case 'a': case 'A': setOpenModal('analytics'); break;
        case '?':           setOpenModal('shortcuts'); break;
        case 'd': case 'D': setTheme(t=>t==='dark'?'light':'dark'); break;
        case '1': switchMode('focus');  break;
        case '2': switchMode('short');  break;
        case '3': switchMode('long');   break;
        case '4': switchMode('custom'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [timerState, openModal, showAddTracker, activeTab, startTimer, pauseTimer, resetTimer, switchMode, openAddTracker]);

  const activeTask    = tasks.find(t=>t.id===activeTaskId)??null;
  const pomodoroCount = pomodoroLog.length%LONG_BREAK_AFTER;

  // Tab badge counts
  const scheduledToday = trackers.filter(t=>isScheduledToday(t));
  const unloggedToday  = scheduledToday.filter(t=>!isLoggedToday(t));

  if (!onboardingComplete) {
    return (
      <OnboardingFlow onComplete={() => {
        localStorage.setItem('focusly-onboarding-complete', 'true');
        setOnboardingComplete(true);
        // Refresh to load newly created trackers/settings
        window.location.reload();
      }} />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <span>🌱</span>
          <h1>Focusly</h1>
        </div>
        <div className="header-right">
          <div className="header-actions">
            <button className="hdr-btn" onClick={()=>setOpenModal('analytics')} title="Analytics (A)"><IconChart /></button>
            <button className="hdr-btn" onClick={()=>setOpenModal('shortcuts')} title="Shortcuts (?)"><IconKeyboard /></button>
            <button className={`hdr-btn ${activeTab==='settings'?'active':''}`} onClick={()=>setActiveTab('settings')} title="Settings (S)"><IconSettings /></button>
            <button className="hdr-btn" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} title="Theme (D)">
              {theme==='dark'?'☀️':'🌙'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main navigation ── */}
      <nav className="main-nav">
        {[
          { id:'daily',   label:'Daily Goals', icon:'🎯', badge: unloggedToday.length || 0 },
          { id:'reports', label:'Reports',     icon:'📊' },
          { id:'timer',   label:'Timer',       icon:'🍅' },
          { id:'tasks',   label:'Tasks',       icon:'✓',  badge: tasks.filter(t=>!t.completed).length || 0 },
        ].map(tab => (
          <button key={tab.id}
            className={`main-nav-btn${activeTab===tab.id?' nav-active':''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
            {tab.badge > 0 && <span className="nav-badge">{tab.badge}</span>}
          </button>
        ))}
      </nav>

      {/* ── Tab content ── */}
      <div className="tab-content">
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
          />
        )}

        {activeTab === 'timer' && (
          <div className="timer-tab">
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
            <TodayBreakdown tasks={tasks} />
          </div>
        )}

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
              onAdd={()=>setOpenModal('add')}
            />
          </div>
        )}

        {/* PWA Install Banner */}
        {showInstallBanner && (
          <div className="install-banner" style={{
            position: 'fixed', bottom: 20, left: 20, right: 20, zIndex: 999,
            background: 'var(--c-bg-card)', padding: '16px 20px', borderRadius: 16,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 16,
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 192 192" fill="none"><circle cx="96" cy="96" r="50" stroke="#fff" strokeWidth="12"/><circle cx="96" cy="96" r="24" fill="#fff"/></svg>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Install Focusly for quick access</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleInstallClick} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Install</button>
              <button onClick={dismissInstallBanner} style={{ background: 'rgba(255,255,255,0.1)', color: '#94a3b8', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>×</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && <div key={toast.key} className={`app-toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* ── Modals ── */}
      {openModal==='add'       && <AddTaskModal  onAdd={addTask}     onClose={()=>setOpenModal(null)} />}
      {openModal==='analytics' && <AnalyticsModal tasks={tasks}      pomodoroLog={pomodoroLog} settings={settings} onClose={()=>setOpenModal(null)} />}
      {openModal==='shortcuts' && <ShortcutsModal onClose={()=>setOpenModal(null)} />}
      {openModal==='weekly-review' && (
        <WeeklyReviewModal
          trackers={trackers} tasks={tasks} pomodoroLog={pomodoroLog}
          onClose={() => setOpenModal(null)}
          onSave={(reviewData) => {
            const currentReviews = JSON.parse(localStorage.getItem('focusly-weekly-reviews') || '[]');
            localStorage.setItem('focusly-weekly-reviews', JSON.stringify([reviewData, ...currentReviews]));
            showToast('Weekly review saved!', 'success');
            setOpenModal(null);
          }}
        />
      )}
      {showAddTracker && (
        <AddTrackerModal
          onSave={handleTrackerSave}
          onClose={() => { setShowAddTracker(false); setEditingTracker(null); }}
          editTracker={editingTracker}
        />
      )}
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
function IconChart()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>; }
function IconKeyboard() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>; }
function IconSettings() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>; }
