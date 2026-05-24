const MODES = {
    pomodoro: { time: 25 * 60, id: 'btn-pomodoro', class: 'mode-pomodoro' },
    shortBreak: { time: 5 * 60, id: 'btn-short-break', class: 'mode-short-break' },
    longBreak: { time: 15 * 60, id: 'btn-long-break', class: 'mode-long-break' }
};

let currentMode = 'pomodoro';
let timerInterval = null;
let timeLeft = MODES[currentMode].time;
let isRunning = false;

// DOM Elements
const timeDisplay = document.getElementById('time-left');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const circle = document.querySelector('.progress-ring__circle');
const radius = circle.r.baseVal.value;
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
    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
});

resetBtn.addEventListener('click', resetTimer);

function switchMode(mode) {
    if (isRunning) {
        const confirmSwitch = confirm('Timer is running. Are you sure you want to switch modes?');
        if (!confirmSwitch) return;
        pauseTimer();
    }

    // Update UI active buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(MODES[mode].id).classList.add('active');

    // Update Body class for theme colors
    document.body.classList.remove('mode-pomodoro', 'mode-short-break', 'mode-long-break');
    document.body.classList.add(MODES[mode].class);

    currentMode = mode;
    timeLeft = MODES[mode].time;
    updateDisplay();
    setProgress(1); // Full circle
}

function startTimer() {
    isRunning = true;
    startBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
    startBtn.classList.remove('primary-btn');
    startBtn.style.background = 'rgba(255,255,255,0.2)';
    startBtn.style.color = 'white';

    timerInterval = setInterval(() => {
        timeLeft--;
        updateDisplay();
        
        const progress = timeLeft / MODES[currentMode].time;
        setProgress(progress);

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            isRunning = false;
            playAlarm();
            resetTimer();
        }
    }, 1000);
}

function pauseTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
    startBtn.style.background = 'white';
    startBtn.style.color = 'var(--bg-gradient-start)';
}

function resetTimer() {
    pauseTimer();
    timeLeft = MODES[currentMode].time;
    updateDisplay();
    setProgress(1);
}

function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    timeDisplay.textContent = timeString;
    document.title = `${timeString} - Focusly`;
}

function setProgress(percent) {
    const offset = circumference - percent * circumference;
    circle.style.strokeDashoffset = offset;
}

function playAlarm() {
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
        new Notification('Focusly Timer', {
            body: `${currentMode === 'pomodoro' ? 'Focus' : 'Break'} session complete!`,
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
