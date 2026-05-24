// ── Settings ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    pomodoroDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoSwitch: false,
    soundEnabled: true
};

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
    try {
        const saved = localStorage.getItem('focusly-settings');
        if (saved) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {}
    applySettingsToModes();
}

function saveSettings() {
    try { localStorage.setItem('focusly-settings', JSON.stringify(settings)); } catch (e) {}
}

function applySettingsToModes() {
    MODES.pomodoro.time  = settings.pomodoroDuration  * 60;
    MODES.shortBreak.time = settings.shortBreakDuration * 60;
    MODES.longBreak.time  = settings.longBreakDuration  * 60;
    Object.keys(timerStates).forEach(mode => {
        if (mode !== 'custom') timerStates[mode].timeLeft = MODES[mode].time;
    });
}

// ── Timer Core ───────────────────────────────────────────────────────────────

const MODES = {
    pomodoro:   { time: 25 * 60, id: 'btn-pomodoro',    class: 'mode-pomodoro'   },
    shortBreak: { time:  5 * 60, id: 'btn-short-break', class: 'mode-short-break' },
    longBreak:  { time: 15 * 60, id: 'btn-long-break',  class: 'mode-long-break'  },
    custom:     { time: 10 * 60, id: 'btn-custom',       class: 'mode-custom'     }
};

let currentMode = 'pomodoro';
const timerStates = {
    pomodoro:   { timeLeft: MODES.pomodoro.time,   isRunning: false, interval: null },
    shortBreak: { timeLeft: MODES.shortBreak.time, isRunning: false, interval: null },
    longBreak:  { timeLeft: MODES.longBreak.time,  isRunning: false, interval: null },
    custom:     { timeLeft: MODES.custom.time,      isRunning: false, interval: null }
};

let pomodorosThisSession = 0;
const LONG_BREAK_AFTER = 4;

// Web Worker
let timerWorker = null;
if (window.Worker && window.location.protocol !== 'file:') {
    try {
        timerWorker = new Worker('worker.js');
        timerWorker.onmessage = function(e) {
            if (e.data !== 'tick') return;
            Object.keys(timerStates).forEach(mode => {
                const state = timerStates[mode];
                if (!state.isRunning) return;
                state.timeLeft--;
                if (mode === currentMode) updateDisplay();
                if (state.timeLeft <= 0) {
                    state.isRunning = false;
                    checkWorkerStatus();
                    if (settings.soundEnabled) playAlarm(mode);
                    onTimerComplete(mode);
                    resetTimer(mode);
                }
            });
        };
    } catch (e) { timerWorker = null; }
}

function checkWorkerStatus() {
    if (!timerWorker) return;
    timerWorker.postMessage(Object.values(timerStates).some(s => s.isRunning) ? 'start' : 'stop');
}

// DOM
const timeDisplay = document.getElementById('time-left');
const startBtn    = document.getElementById('start-btn');
const resetBtn    = document.getElementById('reset-btn');
const circle      = document.querySelector('.progress-ring__circle');
const radius      = parseFloat(circle.getAttribute('r')) || 110;
const circumference = radius * 2 * Math.PI;

circle.style.strokeDasharray = `${circumference} ${circumference}`;
circle.style.strokeDashoffset = 0;

// Mode buttons
Object.keys(MODES).forEach(mode => {
    document.getElementById(MODES[mode].id).addEventListener('click', () => switchMode(mode));
});

startBtn.addEventListener('click', () => {
    initAudio();
    requestNotificationPerm();
    timerStates[currentMode].isRunning ? pauseTimer(currentMode) : startTimer(currentMode);
});

resetBtn.addEventListener('click', () => resetTimer(currentMode));

timeDisplay.addEventListener('blur', applyCustomTime);
timeDisplay.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); timeDisplay.blur(); } });

function applyCustomTime() {
    if (currentMode !== 'custom') return;
    const parts = timeDisplay.textContent.trim().split(':');
    let mins = parseInt(parts[0]) || 0;
    let secs = parts.length >= 2 ? (parseInt(parts[1]) || 0) : 0;
    if (mins > 999) mins = 999;
    if (secs > 59)  secs = 59;
    let total = Math.max(1, mins * 60 + secs);
    MODES.custom.time = total;
    timerStates.custom.timeLeft = total;
    updateDisplay();
}

function switchMode(mode) {
    if (mode === currentMode) return;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(MODES[mode].id).classList.add('active');
    document.body.classList.remove('mode-pomodoro', 'mode-short-break', 'mode-long-break', 'mode-custom');
    document.body.classList.add(MODES[mode].class);
    currentMode = mode;
    updateDisplay();
    updateStartButton();
}

function updateStartButton() {
    const state = timerStates[currentMode];
    const isCustomIdle = currentMode === 'custom' && !state.isRunning;
    timeDisplay.setAttribute('contenteditable', isCustomIdle ? 'true' : 'false');
    timeDisplay.classList.toggle('editable', isCustomIdle);

    if (state.isRunning) {
        startBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
        startBtn.classList.replace('primary-btn', 'pause-btn');
    } else {
        startBtn.innerHTML = state.timeLeft < MODES[currentMode].time
            ? '<i class="fa-solid fa-play"></i> Resume'
            : '<i class="fa-solid fa-play"></i> Start';
        startBtn.classList.replace('pause-btn', 'primary-btn');
    }
}

function startTimer(mode) {
    const state = timerStates[mode];
    if (state.isRunning) return;
    state.isRunning = true;
    if (mode === currentMode) updateStartButton();

    if (timerWorker) {
        checkWorkerStatus();
    } else {
        state.interval = setInterval(() => {
            state.timeLeft--;
            if (mode === currentMode) updateDisplay();
            if (state.timeLeft <= 0) {
                clearInterval(state.interval); state.interval = null;
                state.isRunning = false;
                if (settings.soundEnabled) playAlarm(mode);
                onTimerComplete(mode);
                resetTimer(mode);
            }
        }, 1000);
    }
}

function pauseTimer(mode) {
    timerStates[mode].isRunning = false;
    if (timerWorker) {
        checkWorkerStatus();
    } else if (timerStates[mode].interval) {
        clearInterval(timerStates[mode].interval);
        timerStates[mode].interval = null;
    }
    if (mode === currentMode) updateStartButton();
}

function resetTimer(mode) {
    pauseTimer(mode);
    timerStates[mode].timeLeft = MODES[mode].time;
    if (mode === currentMode) updateDisplay();
}

function updateDisplay() {
    const state = timerStates[currentMode];
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    const str = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    timeDisplay.textContent = str;
    document.title = `${str} - Focusly`;
    setProgress(state.timeLeft / MODES[currentMode].time);
    updateStartButton();
}

function setProgress(pct) {
    circle.style.strokeDashoffset = circumference - pct * circumference;
}

// ── Audio / Notifications ────────────────────────────────────────────────────

let audioCtx = null;

function initAudio() {
    try {
        if (!audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audioCtx = new Ctx();
        }
        if (audioCtx?.state === 'suspended') audioCtx.resume();
    } catch (e) {}
}

function requestNotificationPerm() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }
}

function playAlarm(mode) {
    try {
        if (audioCtx) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.4);
            gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(); osc.stop(audioCtx.currentTime + 0.6);
        }
    } catch (e) {}

    if ('Notification' in window && Notification.permission === 'granted') {
        const labels = { pomodoro: 'Focus', shortBreak: 'Short Break', longBreak: 'Long Break', custom: 'Custom' };
        try { new Notification('Focusly', { body: `${labels[mode] || mode} session complete!`, icon: 'favicon.ico' }); } catch (e) {}
    }
}

// ── Timer Completion ─────────────────────────────────────────────────────────

function onTimerComplete(mode) {
    if (mode !== 'pomodoro') return;

    pomodorosThisSession++;
    renderPomoDots();
    logAnalytics('pomodoro', 1);

    const activeTask = tasks.find(t => t.isActive && !t.completed);
    if (activeTask) {
        HistoryManager.pushState();
        activeTask.actPomodoros = (activeTask.actPomodoros || 0) + 1;
        saveTasks(); renderTasks();
    }

    const isLongBreak = pomodorosThisSession % LONG_BREAK_AFTER === 0;
    const nextMode = isLongBreak ? 'longBreak' : 'shortBreak';
    const msg = isLongBreak
        ? `${pomodorosThisSession} pomodoros done! Time for a long break.`
        : 'Focus session done! Take a short break.';

    showToast(msg, 'success');

    if (settings.autoSwitch) {
        setTimeout(() => { switchMode(nextMode); startTimer(nextMode); }, 800);
    } else {
        setTimeout(() => switchMode(nextMode), 400);
    }
}

function renderPomoDots() {
    const container = document.getElementById('pomodoro-dots');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < LONG_BREAK_AFTER; i++) {
        const dot = document.createElement('div');
        dot.className = `pomo-dot${i < (pomodorosThisSession % LONG_BREAK_AFTER || (pomodorosThisSession > 0 && pomodorosThisSession % LONG_BREAK_AFTER === 0 ? LONG_BREAK_AFTER : 0)) ? ' filled' : ''}`;
        container.appendChild(dot);
    }
}

// ── Task Management ──────────────────────────────────────────────────────────

const HistoryManager = {
    undoStack: [], redoStack: [],
    pushState() { this.undoStack.push(JSON.stringify(tasks)); this.redoStack = []; },
    undo() {
        if (!this.undoStack.length) return;
        this.redoStack.push(JSON.stringify(tasks));
        tasks = JSON.parse(this.undoStack.pop());
        saveTasks(); renderTasks();
    },
    redo() {
        if (!this.redoStack.length) return;
        this.undoStack.push(JSON.stringify(tasks));
        tasks = JSON.parse(this.redoStack.pop());
        saveTasks(); renderTasks();
    }
};

const taskInput   = document.getElementById('task-input');
const addTaskBtn  = document.getElementById('add-task-btn');
const taskList    = document.getElementById('task-list');

let tasks = [];
let activeFilter = 'all';

addTaskBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

document.getElementById('sort-select').addEventListener('change', renderTasks);
document.getElementById('clear-completed-btn').addEventListener('click', clearCompleted);

function loadTasks() {
    try {
        const saved = localStorage.getItem('focusly-tasks');
        if (saved) tasks = JSON.parse(saved);
    } catch (e) { tasks = []; }
    renderTasks();
    renderCategoryFilter();
}

function saveTasks() {
    try { localStorage.setItem('focusly-tasks', JSON.stringify(tasks)); } catch (e) {}
}

function addTask() {
    const text = taskInput.value.trim();
    if (!text) return;
    HistoryManager.pushState();

    const priority = document.getElementById('quick-priority').value;
    tasks.push({
        id: Date.now().toString(),
        text, completed: false, priority,
        estPomodoros: 1, actPomodoros: 0,
        category: '', notes: '',
        recurring: 'none', isActive: false,
        createdAt: Date.now()
    });
    saveTasks(); renderTasks(); renderCategoryFilter();
    taskInput.value = '';
    document.getElementById('quick-priority').value = 'none';
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    HistoryManager.pushState();
    task.completed = !task.completed;
    if (task.completed) {
        logAnalytics('task', 1);
        logHistory(task.text);
        if (task.recurring !== 'none') {
            tasks.push({ ...task, id: Date.now().toString() + '-rec', completed: false, actPomodoros: 0, createdAt: Date.now() });
        }
    } else {
        logAnalytics('task', -1);
    }
    saveTasks(); renderTasks();
}

function deleteTask(id) {
    HistoryManager.pushState();
    tasks = tasks.filter(t => t.id !== id);
    saveTasks(); renderTasks(); renderCategoryFilter();
}

function setActiveTask(id) {
    HistoryManager.pushState();
    tasks.forEach(t => t.isActive = false);
    const t = tasks.find(t => t.id === id);
    if (t) { t.isActive = true; showToast(`Active: ${t.text}`, 'info'); }
    saveTasks(); renderTasks();
}

function clearCompleted() {
    const count = tasks.filter(t => t.completed).length;
    if (!count) return;
    HistoryManager.pushState();
    tasks = tasks.filter(t => !t.completed);
    saveTasks(); renderTasks(); renderCategoryFilter();
    showToast(`Cleared ${count} completed task${count > 1 ? 's' : ''}`, 'info');
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };

function getSortedTasks() {
    const sort = document.getElementById('sort-select').value;
    const visible = activeFilter === 'all'
        ? [...tasks]
        : tasks.filter(t => (t.category || '').toLowerCase() === activeFilter.toLowerCase());

    return visible.sort((a, b) => {
        if (sort === 'priority') {
            if (a.completed !== b.completed) return a.completed - b.completed;
            return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
        }
        if (sort === 'category') {
            if (a.completed !== b.completed) return a.completed - b.completed;
            return (a.category || '').localeCompare(b.category || '');
        }
        if (sort === 'pomodoros') {
            if (a.completed !== b.completed) return a.completed - b.completed;
            return (b.actPomodoros || 0) - (a.actPomodoros || 0);
        }
        // default
        if (a.completed !== b.completed) return a.completed - b.completed;
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
    });
}

function renderTasks() {
    taskList.innerHTML = '';
    getSortedTasks().forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item${task.completed ? ' completed' : ''}${task.isActive ? ' active-task' : ''}`;

        const catColor = task.category ? getCategoryColor(task.category) : null;
        const catBadge = task.category
            ? `<span class="cat-badge" style="background:${catColor}88;border:1px solid ${catColor}60">${escapeHtml(task.category)}</span>`
            : '';
        const pomoBadge = (task.estPomodoros > 1 || task.actPomodoros > 0)
            ? `<span class="badge"><i class="fa-solid fa-clock" style="margin-right:3px"></i>${task.actPomodoros}/${task.estPomodoros}</span>`
            : '';
        const recurBadge = task.recurring !== 'none'
            ? `<span class="badge"><i class="fa-solid fa-repeat" style="margin-right:3px"></i>${task.recurring}</span>`
            : '';
        const metaHtml = (catBadge || pomoBadge || recurBadge)
            ? `<div class="task-meta">${catBadge}${pomoBadge}${recurBadge}</div>` : '';
        const notesHtml = task.notes
            ? `<div class="task-notes">${escapeHtml(task.notes)}</div>` : '';

        li.innerHTML = `
            <div class="task-content" onclick="toggleTask('${task.id}')">
                <div class="task-checkbox"><i class="fa-solid fa-check"></i></div>
                <div class="task-body">
                    <div class="task-title-row">
                        <span class="priority-indicator priority-${task.priority || 'none'}"></span>
                        <span class="task-text">${escapeHtml(task.text)}</span>
                    </div>
                    ${metaHtml}${notesHtml}
                </div>
            </div>
            <div class="task-item-actions">
                <button class="edit-task-btn" title="Set active" onclick="setActiveTask('${task.id}')"><i class="fa-solid fa-crosshairs"></i></button>
                <button class="edit-task-btn" title="Edit" onclick="openTaskModal('${task.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="delete-btn" title="Delete" onclick="deleteTask('${task.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        taskList.appendChild(li);
    });
}

// ── Category System ──────────────────────────────────────────────────────────

const CATEGORY_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];

function getCategoryColor(cat) {
    let hash = 0;
    for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
    return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

function getUniqueCategories() {
    return [...new Set(tasks.map(t => t.category).filter(Boolean))].sort();
}

function renderCategoryFilter() {
    const container = document.getElementById('category-filter');
    const categories = getUniqueCategories();
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = `filter-chip${activeFilter === 'all' ? ' active' : ''}`;
    allBtn.dataset.cat = 'all';
    allBtn.textContent = 'All';
    allBtn.onclick = () => setFilter('all');
    container.appendChild(allBtn);

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `filter-chip${activeFilter === cat.toLowerCase() ? ' active' : ''}`;
        btn.dataset.cat = cat;
        btn.textContent = cat;
        btn.style.setProperty('--chip-color', getCategoryColor(cat));
        if (activeFilter === cat.toLowerCase()) {
            btn.style.background = getCategoryColor(cat);
            btn.style.borderColor = getCategoryColor(cat);
            btn.style.color = 'white';
        }
        btn.onclick = () => setFilter(cat.toLowerCase());
        container.appendChild(btn);
    });

    container.style.display = categories.length ? 'flex' : 'none';
}

function setFilter(cat) {
    activeFilter = cat;
    renderCategoryFilter();
    renderTasks();
}

// ── Analytics ────────────────────────────────────────────────────────────────

let analytics = {};
let historyList = [];

function loadAnalytics() {
    try {
        const saved = localStorage.getItem('focusly-analytics');
        if (saved) analytics = JSON.parse(saved);
    } catch (e) {}
    updateAnalyticsUI();
}

function saveAnalytics() {
    try { localStorage.setItem('focusly-analytics', JSON.stringify(analytics)); } catch (e) {}
}

function logAnalytics(type, value) {
    const today = todayStr();
    if (!analytics[today]) analytics[today] = { pomodoros: 0, tasks: 0 };
    analytics[today][type] = Math.max(0, (analytics[today][type] || 0) + value);
    saveAnalytics();
    updateAnalyticsUI();
    updateStreakBadge();
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

function getStreak() {
    let streak = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const entry = analytics[key];
        if (entry && (entry.pomodoros > 0 || entry.tasks > 0)) streak++;
        else if (i > 0) break;
    }
    return streak;
}

function updateStreakBadge() {
    const streak = getStreak();
    const badge = document.getElementById('streak-badge');
    if (!badge) return;
    if (streak >= 2) {
        badge.textContent = `${streak} day streak 🔥`;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function updateAnalyticsUI() {
    const today = todayStr();
    const now = new Date();
    let weekPomodoros = 0, weekTasks = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        if (analytics[key]) {
            weekPomodoros += analytics[key].pomodoros || 0;
            weekTasks     += analytics[key].tasks || 0;
        }
    }

    const todayData = analytics[today] || { pomodoros: 0, tasks: 0 };
    const focusMinutes = weekPomodoros * (settings.pomodoroDuration || 25);
    const focusHours = (focusMinutes / 60).toFixed(1);

    const el = id => document.getElementById(id);
    if (el('stat-pomodoros-today')) {
        el('stat-pomodoros-today').textContent = todayData.pomodoros;
        el('stat-tasks-today').textContent     = todayData.tasks;
        el('stat-focus-time').textContent      = `${focusHours}h`;
        el('stat-streak').textContent          = `${getStreak()} 🔥`;
    }

    renderBarChart();
}

function renderBarChart() {
    const container = document.getElementById('bar-chart');
    if (!container) return;
    container.innerHTML = '';

    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push(d);
    }

    const maxPomo  = Math.max(1, ...days.map(d => analytics[d.toISOString().split('T')[0]]?.pomodoros || 0));
    const maxTasks = Math.max(1, ...days.map(d => analytics[d.toISOString().split('T')[0]]?.tasks || 0));
    const maxVal   = Math.max(maxPomo, maxTasks);

    const dayLabels = ['Su','Mo','Tu','We','Th','Fr','Sa'];

    days.forEach(d => {
        const key = d.toISOString().split('T')[0];
        const data = analytics[key] || { pomodoros: 0, tasks: 0 };
        const pomoH  = Math.round((data.pomodoros / maxVal) * 72);
        const taskH  = Math.round((data.tasks     / maxVal) * 72);

        const col = document.createElement('div');
        col.className = 'bar-col';
        col.innerHTML = `
            <div class="bar-tracks">
                <div class="bar-fill bar-fill-focus" style="height:${pomoH}px" title="${data.pomodoros} focus sessions"></div>
                <div class="bar-fill bar-fill-tasks" style="height:${taskH}px" title="${data.tasks} tasks done"></div>
            </div>
            <div class="bar-label">${dayLabels[d.getDay()]}</div>`;
        container.appendChild(col);
    });
}

function loadHistory() {
    try {
        const saved = localStorage.getItem('focusly-history');
        if (saved) historyList = JSON.parse(saved);
        renderHistory();
    } catch (e) {}
}

function saveHistory() {
    try { localStorage.setItem('focusly-history', JSON.stringify(historyList)); } catch (e) {}
}

function logHistory(text) {
    historyList.unshift({ text, time: new Date().toLocaleString() });
    if (historyList.length > 50) historyList.pop();
    saveHistory(); renderHistory();
}

function renderHistory() {
    const ul = document.getElementById('history-list');
    if (!ul) return;
    ul.innerHTML = historyList.length
        ? historyList.map(h => `<li class="history-item"><span>${escapeHtml(h.text)}</span><span>${h.time}</span></li>`).join('')
        : '<li style="color:var(--text-secondary);font-size:0.85rem;padding:8px 0">No completions yet.</li>';
}

// ── Settings UI ──────────────────────────────────────────────────────────────

const PRESETS = {
    standard: { pomodoroDuration: 25, shortBreakDuration: 5,  longBreakDuration: 15 },
    short:    { pomodoroDuration: 20, shortBreakDuration: 3,  longBreakDuration: 10 },
    long:     { pomodoroDuration: 50, shortBreakDuration: 10, longBreakDuration: 20 },
    90:       { pomodoroDuration: 90, shortBreakDuration: 15, longBreakDuration: 30 }
};

function openSettingsModal() {
    document.getElementById('setting-pomodoro').value = settings.pomodoroDuration;
    document.getElementById('setting-short').value    = settings.shortBreakDuration;
    document.getElementById('setting-long').value     = settings.longBreakDuration;
    document.getElementById('setting-autoswitch').checked = settings.autoSwitch;
    document.getElementById('setting-sound').checked      = settings.soundEnabled;
    openModal('settings-modal');
}

document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const preset = PRESETS[btn.dataset.preset];
        if (!preset) return;
        document.getElementById('setting-pomodoro').value = preset.pomodoroDuration;
        document.getElementById('setting-short').value    = preset.shortBreakDuration;
        document.getElementById('setting-long').value     = preset.longBreakDuration;
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

document.getElementById('save-settings-btn').addEventListener('click', () => {
    const pomo  = parseInt(document.getElementById('setting-pomodoro').value) || 25;
    const short = parseInt(document.getElementById('setting-short').value)    || 5;
    const long  = parseInt(document.getElementById('setting-long').value)     || 15;
    settings.pomodoroDuration   = Math.min(120, Math.max(1, pomo));
    settings.shortBreakDuration = Math.min(30,  Math.max(1, short));
    settings.longBreakDuration  = Math.min(60,  Math.max(1, long));
    settings.autoSwitch   = document.getElementById('setting-autoswitch').checked;
    settings.soundEnabled = document.getElementById('setting-sound').checked;
    saveSettings();
    applySettingsToModes();
    // Reset non-running timers
    Object.keys(timerStates).forEach(mode => {
        if (!timerStates[mode].isRunning && mode !== 'custom') {
            timerStates[mode].timeLeft = MODES[mode].time;
        }
    });
    updateDisplay();
    closeModals();
    showToast('Settings saved', 'success');
});

// ── Task Modal ───────────────────────────────────────────────────────────────

let currentEditTaskId = null;

function openTaskModal(id) {
    currentEditTaskId = id;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    document.getElementById('edit-task-name').value     = task.text;
    document.getElementById('edit-task-priority').value = task.priority || 'none';
    document.getElementById('edit-task-category').value = task.category || '';
    document.getElementById('edit-task-est').value      = task.estPomodoros || 1;
    document.getElementById('edit-task-recurring').value = task.recurring || 'none';
    document.getElementById('edit-task-notes').value    = task.notes || '';
    openModal('task-modal');
}

document.getElementById('save-task-btn').addEventListener('click', () => {
    if (!currentEditTaskId) return;
    const task = tasks.find(t => t.id === currentEditTaskId);
    if (!task) return;
    HistoryManager.pushState();
    task.text       = document.getElementById('edit-task-name').value.trim();
    task.priority   = document.getElementById('edit-task-priority').value;
    task.category   = document.getElementById('edit-task-category').value.trim();
    task.estPomodoros = parseInt(document.getElementById('edit-task-est').value) || 1;
    task.recurring  = document.getElementById('edit-task-recurring').value;
    task.notes      = document.getElementById('edit-task-notes').value.trim();
    saveTasks(); renderTasks(); renderCategoryFilter(); closeModals();
});

// ── Modals ───────────────────────────────────────────────────────────────────

const modalOverlay = document.getElementById('modal-overlay');
const MODAL_IDS = ['task-modal', 'analytics-modal', 'settings-modal', 'shortcuts-modal'];

function openModal(id) {
    MODAL_IDS.forEach(mid => document.getElementById(mid).classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    modalOverlay.classList.remove('hidden');
}

function closeModals() {
    modalOverlay.classList.add('hidden');
    MODAL_IDS.forEach(mid => document.getElementById(mid).classList.add('hidden'));
}

modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModals(); });
document.querySelectorAll('.close-modal-btn').forEach(btn => btn.addEventListener('click', closeModals));

document.getElementById('analytics-btn').addEventListener('click', () => {
    updateAnalyticsUI(); renderHistory();
    openModal('analytics-modal');
});

document.getElementById('settings-btn').addEventListener('click', openSettingsModal);

document.getElementById('shortcuts-btn').addEventListener('click', () => openModal('shortcuts-modal'));

// ── Theme Toggle ─────────────────────────────────────────────────────────────

const themeToggleBtn = document.getElementById('theme-toggle-btn');
themeToggleBtn.addEventListener('click', toggleTheme);

function toggleTheme() {
    document.body.classList.toggle('theme-light');
    const isLight = document.body.classList.contains('theme-light');
    try { localStorage.setItem('focusly-theme', isLight ? 'light' : 'dark'); } catch (e) {}
    themeToggleBtn.innerHTML = isLight ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

// ── Keyboard Shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
    const inInput = ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key === 'z') { e.preventDefault(); e.shiftKey ? HistoryManager.redo() : HistoryManager.undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); HistoryManager.redo(); return; }

    if (e.key === 'Escape') { closeModals(); return; }

    if (inInput) return;

    switch (e.key) {
        case ' ':  e.preventDefault(); timerStates[currentMode].isRunning ? pauseTimer(currentMode) : startTimer(currentMode); break;
        case 'r': case 'R': resetTimer(currentMode); break;
        case '1': switchMode('pomodoro');   break;
        case '2': switchMode('shortBreak'); break;
        case '3': switchMode('longBreak');  break;
        case '4': switchMode('custom');     break;
        case 'n': case 'N': e.preventDefault(); taskInput.focus(); break;
        case 'd': case 'D': toggleTheme(); break;
        case 'a': case 'A': updateAnalyticsUI(); renderHistory(); openModal('analytics-modal'); break;
        case 's': case 'S': openSettingsModal(); break;
        case '?': openModal('shortcuts-modal'); break;
    }
});

// ── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2600);
}

// ── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function id(s) { return document.getElementById(s); }

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadTasks();
    loadAnalytics();
    loadHistory();
    updateStreakBadge();
    renderPomoDots();

    // Theme
    try {
        if (localStorage.getItem('focusly-theme') === 'light') {
            document.body.classList.add('theme-light');
            themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }
    } catch (e) {}

    document.body.classList.add(MODES[currentMode].class);
    updateDisplay();
});
