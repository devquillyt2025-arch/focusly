const MODES = {
    pomodoro: { time: 25 * 60, id: 'btn-pomodoro', class: 'mode-pomodoro' },
    shortBreak: { time: 5 * 60, id: 'btn-short-break', class: 'mode-short-break' },
    longBreak: { time: 15 * 60, id: 'btn-long-break', class: 'mode-long-break' },
    custom: { time: 10 * 60, id: 'btn-custom', class: 'mode-custom' }
};

let currentMode = 'pomodoro';
const timerStates = {
    pomodoro: { timeLeft: MODES.pomodoro.time, isRunning: false, interval: null },
    shortBreak: { timeLeft: MODES.shortBreak.time, isRunning: false, interval: null },
    longBreak: { timeLeft: MODES.longBreak.time, isRunning: false, interval: null },
    custom: { timeLeft: MODES.custom.time, isRunning: false, interval: null }
};

// DOM Elements
const timeDisplay = document.getElementById('time-left');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const circle = document.querySelector('.progress-ring__circle');
const radius = parseFloat(circle.getAttribute('r')) || 110;
const circumference = radius * 2 * Math.PI;

circle.style.strokeDasharray = `${circumference} ${circumference}`;
circle.style.strokeDashoffset = 0;

// Initialize
document.body.classList.add(MODES[currentMode].class);
updateDisplay();
loadTasks();

// Event Listeners for Timer Modes
Object.keys(MODES).forEach(mode => {
    document.getElementById(MODES[mode].id).addEventListener('click', () => switchMode(mode));
});

startBtn.addEventListener('click', () => {
    if (timerStates[currentMode].isRunning) {
        pauseTimer(currentMode);
    } else {
        startTimer(currentMode);
    }
});

resetBtn.addEventListener('click', () => resetTimer(currentMode));

timeDisplay.addEventListener('blur', applyCustomTime);
timeDisplay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        timeDisplay.blur();
    }
});

function applyCustomTime() {
    if (currentMode !== 'custom') return;
    const text = timeDisplay.textContent.trim();
    const parts = text.split(':');
    let mins = 0;
    let secs = 0;
    
    if (parts.length >= 2) {
        mins = parseInt(parts[0]) || 0;
        secs = parseInt(parts[1]) || 0;
    } else if (parts.length === 1) {
        mins = parseInt(parts[0]) || 0;
    }
    
    if (mins > 999) mins = 999;
    if (secs > 59) secs = 59;
    
    let totalSeconds = mins * 60 + secs;
    if (totalSeconds < 1) totalSeconds = 1;

    MODES.custom.time = totalSeconds;
    timerStates.custom.timeLeft = totalSeconds;
    updateDisplay();
}

function switchMode(mode) {
    if (mode === currentMode) return;

    // Update UI active buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(MODES[mode].id).classList.add('active');

    // Update Body class for theme colors
    document.body.classList.remove('mode-pomodoro', 'mode-short-break', 'mode-long-break', 'mode-custom');
    document.body.classList.add(MODES[mode].class);

    currentMode = mode;
    updateDisplay();
    updateStartButton();
}

function updateStartButton() {
    const state = timerStates[currentMode];
    
    if (currentMode === 'custom' && !state.isRunning) {
        timeDisplay.setAttribute('contenteditable', 'true');
        timeDisplay.classList.add('editable');
        timeDisplay.title = "Click to edit time";
    } else {
        timeDisplay.setAttribute('contenteditable', 'false');
        timeDisplay.classList.remove('editable');
        timeDisplay.title = "";
    }
    
    if (state.isRunning) {
        startBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
        startBtn.classList.remove('primary-btn');
        startBtn.style.background = 'rgba(255,255,255,0.2)';
        startBtn.style.color = 'white';
    } else {
        startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
        startBtn.classList.add('primary-btn');
        startBtn.style.background = '';
        startBtn.style.color = '';
    }
}

function startTimer(mode) {
    const state = timerStates[mode];
    if (state.isRunning) return;
    
    state.isRunning = true;
    if (mode === currentMode) {
        updateStartButton();
    }

    state.interval = setInterval(() => {
        state.timeLeft--;
        
        if (mode === currentMode) {
            updateDisplay();
        }

        if (state.timeLeft <= 0) {
            clearInterval(state.interval);
            state.interval = null;
            state.isRunning = false;
            playAlarm(mode);
            resetTimer(mode);
        }
    }, 1000);
}

function pauseTimer(mode) {
    const state = timerStates[mode];
    state.isRunning = false;
    if (state.interval) {
        clearInterval(state.interval);
        state.interval = null;
    }
    
    if (mode === currentMode) {
        updateStartButton();
    }
}

function resetTimer(mode) {
    pauseTimer(mode);
    timerStates[mode].timeLeft = MODES[mode].time;
    if (mode === currentMode) {
        updateDisplay();
    }
}

function updateDisplay() {
    const state = timerStates[currentMode];
    const minutes = Math.floor(state.timeLeft / 60);
    const seconds = state.timeLeft % 60;
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    timeDisplay.textContent = timeString;
    document.title = `${timeString} - Focusly`;
    
    const progress = state.timeLeft / MODES[currentMode].time;
    setProgress(progress);
}

function setProgress(percent) {
    const offset = circumference - percent * circumference;
    circle.style.strokeDashoffset = offset;
}

function playAlarm(mode) {
    // Simple beep using Web Audio API
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    
    // Notification if permitted
    if (Notification.permission === 'granted') {
        let modeName = 'Focus';
        if (mode === 'shortBreak') modeName = 'Short Break';
        if (mode === 'longBreak') modeName = 'Long Break';
        if (mode === 'custom') modeName = 'Custom';
        new Notification('Focusly Timer', {
            body: `${modeName} session complete!`,
            icon: 'favicon.ico'
        });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// === TASK MANAGEMENT ===

const taskInput = document.getElementById('task-input');
const addTaskBtn = document.getElementById('add-task-btn');
const taskList = document.getElementById('task-list');

let tasks = [];

addTaskBtn.addEventListener('click', addTask);
taskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTask();
});

function loadTasks() {
    const savedTasks = localStorage.getItem('focusly-tasks');
    if (savedTasks) {
        tasks = JSON.parse(savedTasks);
        renderTasks();
    }
}

function saveTasks() {
    localStorage.setItem('focusly-tasks', JSON.stringify(tasks));
}

function addTask() {
    const text = taskInput.value.trim();
    if (!text) return;

    const newTask = {
        id: Date.now().toString(),
        text: text,
        completed: false
    };

    tasks.push(newTask);
    saveTasks();
    renderTasks();
    taskInput.value = '';
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveTasks();
        renderTasks();
    }
}

function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    renderTasks();
}

function renderTasks() {
    taskList.innerHTML = '';
    
    // Sort tasks: uncompleted first
    const sortedTasks = [...tasks].sort((a, b) => a.completed - b.completed);

    sortedTasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'completed' : ''}`;
        
        li.innerHTML = `
            <div class="task-content" onclick="toggleTask('${task.id}')">
                <div class="task-checkbox">
                    <i class="fa-solid fa-check"></i>
                </div>
                <span class="task-text">${escapeHtml(task.text)}</span>
            </div>
            <button class="delete-btn" onclick="deleteTask('${task.id}')">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        
        taskList.appendChild(li);
    });
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
