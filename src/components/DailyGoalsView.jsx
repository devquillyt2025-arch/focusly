import { useState, useEffect } from 'react';
import DailyIntentions from './DailyIntentions';
import Select from './Select';
import {
  TRACKER_CATS, TRACKER_TYPES,
  isScheduledToday, isLoggedToday, getLogForDate,
  upsertLog, toggleMilestone, computeHabitStreaks, computeTargetStats, computeAverageStats,
  computeProjectStats, computeGlobalStats, todayStr,
} from '../trackers/trackerUtils';
import { getDailyInsight } from '../trackers/insightsEngine';
import {
  HABIT_CATS, isScheduledToday as isHabitScheduledToday,
  isCompletedToday as isHabitCompletedToday, calcStreak as habitStreak, fmtFrequency,
} from '../habitsStore';

// ─── Local Storage Helpers for Preview Cards ─────────────────────────
function loadRecentJournalEntries() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('focusly_journal_')) continue;
    try {
      const e = JSON.parse(localStorage.getItem(key));
      if (e?.date) out.push(e);
    } catch {}
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
}

function loadActiveGoals() {
  try {
    const list = JSON.parse(localStorage.getItem('focusly_goals') || '[]');
    return list.filter(g => !g.completed).slice(0, 3);
  } catch { return []; }
}

function calcGoalProgress(goal) {
  if (!goal.milestones?.length) return goal.manualProgress ?? 0;
  const done = goal.milestones.filter(m => m.done).length;
  return Math.round((done / goal.milestones.length) * 100);
}

function formatTimerDisplay(secs) {
  if (secs == null || isNaN(secs)) return '25:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Main View (3-Column Yartu Structural Pattern) ─────────────────
export default function DailyGoalsView({
  trackers, onUpdateTracker, onAddTracker,
  intentions, onIntentionUpdate, onIntentionToggle,
  pomodoroLog = [], tasks = [], onTriggerWeeklyReview,
  habits = [], onMarkHabitDone,
  activeTaskId, timerRunning, selectTask, toggleComplete, deleteTask, clearCompleted, setOpenModal, addTask, setEditingTask, updateTaskData, quickUpdateTask, syncStatus, syncTasks,
  startTimer, pauseTimer, resetTimer, timerState, timerSeconds, timerMode, setActiveTab
}) {
  const [mode, setMode] = useState('viewing'); // 'viewing' or 'editing'
  const [taskRange, setTaskRange] = useState('today'); // 'today' or 'week'

  const today = new Date();
  const todayDateStr = todayStr();
  
  // Calculations for Greeting Row Subtext
  const pendingTasksCount = tasks.filter(t => !t.completed).length;
  const dueHabitsCount = habits.filter(isHabitScheduledToday).filter(h => !isHabitCompletedToday(h)).length;
  const journalEntries = loadRecentJournalEntries();
  const journalPendingCount = journalEntries.some(e => e.date === todayDateStr && e.wins?.[0]?.trim()) ? 0 : 1;
  const eventsCount = intentions?.items?.filter(i => !i.done).length || trackers?.filter(t => isScheduledToday(t) && !isLoggedToday(t)).length || 0;

  // Load preview data
  const activeGoals = loadActiveGoals();

  // Recent Activity feed (mix of completed tasks & habits today)
  const recentActivity = [
    ...tasks.filter(t => t.completed).map(t => ({ id: t.id, title: t.name, type: 'Task', time: 'Completed recently', icon: '✓' })),
    ...habits.filter(isHabitCompletedToday).map(h => ({ id: h.id, title: h.name, type: 'Habit', time: 'Completed today', icon: '🔥' }))
  ].slice(0, 4);

  // Calendar strip (Mon - Sun of current week)
  const calDays = [];
  const currDay = today.getDay(); // 0 is Sun, 1 is Mon
  const dist = currDay === 0 ? -6 : 1 - currDay; // Get Monday
  const mon = new Date(today);
  mon.setDate(today.getDate() + dist);

  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const isCurr = dStr === todayDateStr;
    const hasDone = tasks.some(t => t.completed && t.completedAt?.startsWith(dStr)) || pomodoroLog.some(p => p.timestamp?.startsWith(dStr));
    calDays.push({
      lbl: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      num: d.getDate(),
      isCurr,
      hasDone
    });
  }

  // Progress stats
  const totalTasks = tasks.length || 1;
  const doneTasks = tasks.filter(t => t.completed).length;
  const taskPct = Math.round((doneTasks / totalTasks) * 100);

  const schedHabits = habits.filter(isHabitScheduledToday);
  const totalHabits = schedHabits.length || 1;
  const doneHabits = schedHabits.filter(isHabitCompletedToday).length;
  const habitPct = Math.round((doneHabits / totalHabits) * 100);

  // Time Breakdown calculations
  let totalMinutesToday = pomodoroLog.filter(p => p.timestamp?.startsWith(todayDateStr)).length * 25;
  if (timerState === 'running') totalMinutesToday += Math.floor((25 * 60 - timerSeconds) / 60);
  if (totalMinutesToday === 0) totalMinutesToday = tasks.reduce((acc, t) => acc + (t.timeEstimate || 25), 0); // fallback for gorgeous UI representation
  const hours = Math.floor(totalMinutesToday / 60);
  const mins = totalMinutesToday % 60;

  const catTime = {};
  for (const t of tasks) {
    const c = t.category || 'work';
    catTime[c] = (catTime[c] || 0) + (t.timeEstimate || 25);
  }
  const catEntries = Object.entries(catTime);

  // Filter tasks based on dropdown
  const displayedTasks = taskRange === 'today' ? tasks.filter(t => !t.completed) : tasks;

  return (
    <div className="today-3col-container">
      
      {/* ── GREETING ROW ── */}
      <div className="yartu-greeting-row">
        <div className="yartu-greeting-left">
          <h1 className="yartu-greeting-title">Welcome back, {localStorage.getItem('focusly-profile-name') || 'Friend'} 👋</h1>
          <div className="yartu-summary-strip">
            <span className="yartu-summary-prefix">Today you have:</span>
            <div className="yartu-summary-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span className="yartu-summary-num">{eventsCount}</span>
              <span className="yartu-summary-label">{eventsCount === 1 ? 'event to do' : 'events to do'}</span>
            </div>
            <span className="yartu-summary-divider">·</span>
            <div className="yartu-summary-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span className="yartu-summary-num">{pendingTasksCount}</span>
              <span className="yartu-summary-label">{pendingTasksCount === 1 ? 'task to complete' : 'tasks to complete'}</span>
            </div>
            <span className="yartu-summary-divider">·</span>
            <div className="yartu-summary-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
              <span className="yartu-summary-num">{dueHabitsCount}</span>
              <span className="yartu-summary-label">{dueHabitsCount === 1 ? 'habit due' : 'habits due'}</span>
            </div>
            <span className="yartu-summary-divider">·</span>
            <div className="yartu-summary-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              <span className="yartu-summary-num">{journalPendingCount}</span>
              <span className="yartu-summary-label">{journalPendingCount === 1 ? 'journal entry pending' : 'journal entries pending'}</span>
            </div>
          </div>
        </div>
        <div className="yartu-mode-toggle">
          <button className={`yartu-mode-btn${mode === 'viewing' ? ' active' : ''}`} onClick={() => setMode('viewing')}>Viewing</button>
          <button className={`yartu-mode-btn${mode === 'editing' ? ' active' : ''}`} onClick={() => setMode('editing')}>Editing</button>
        </div>
      </div>

      {/* ── 3-COLUMN MULTI-PANEL DASHBOARD ── */}
      <div className="today-3col-grid">
        
        {/* ── LEFT COLUMN: TODAY'S TASKS ── */}
        <div className="today-col col-left">
          
          {/* Card 1: TASKS */}
          <div className="yartu-card">
            <div className="yartu-card-hdr">
              <span className="yartu-card-title">Tasks</span>
              <Select 
                className="yartu-card-select" 
                value={taskRange} 
                onChange={e => setTaskRange(e.target.value)}
                options={[
                  { value: 'today', label: 'Today' },
                  { value: 'week', label: 'This Week' },
                ]}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  width: '100px'
                }}
              />
            </div>
            <div className="yartu-list">
              {displayedTasks.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>No pending tasks</div>
              ) : (
                displayedTasks.map(task => (
                  <div key={task.id} className="yartu-compact-row">
                    <div className="yartu-row-left">
                      <div className={`sunsama-checkbox${task.completed ? ' checked' : ''}`} onClick={() => toggleComplete?.(task.id)}>
                        {task.completed ? '✓' : ''}
                      </div>
                      <div className="yartu-row-title" style={{ textDecoration: task.completed ? 'line-through' : 'none', color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                        {task.name}
                      </div>
                      {task.timeEstimate > 0 && <span className="yartu-row-badge">{Math.round(task.timeEstimate / 25)} pomo</span>}
                    </div>
                    <div className="yartu-row-right">
                      {mode === 'editing' ? (
                        <button onClick={() => setEditingTask?.(task)} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Edit</button>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      )}
                    </div>
                  </div>
                ))
              )}
              {mode === 'editing' && (
                <button className="yartu-card-action" style={{ width: '100%', marginTop: 8 }} onClick={() => setOpenModal?.('add')}>＋ Add New Task</button>
              )}
            </div>
          </div>

          {/* Card 2: HABITS DUE */}
          <div className="yartu-card">
            <div className="yartu-card-hdr">
              <span className="yartu-card-title">Habits Due</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Today</span>
            </div>
            <div className="yartu-list">
              {schedHabits.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>No habits scheduled for today</div>
              ) : (
                schedHabits.map(h => {
                  const done = isHabitCompletedToday(h);
                  const streak = habitStreak(h);
                  return (
                    <div key={h.id} className={`yartu-compact-row${done ? ' item-completed' : ''}`}>
                      <div className="yartu-row-left">
                        <div className={`sunsama-checkbox${done ? ' checked' : ''}`} onClick={() => onMarkHabitDone?.(h.id)}>
                          {done ? '✓' : ''}
                        </div>
                        <div className="yartu-row-title" style={{ textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                          {h.name}
                        </div>
                        {streak > 0 && <span className="yartu-row-badge" style={{ background: '#f59e0b22', color: 'var(--color-amber)', borderColor: '#f59e0b44' }}>🔥 {streak}d streak</span>}
                      </div>
                      <div className="yartu-row-right">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Card 3: GOALS PROGRESS */}
          <div className="yartu-card">
            <div className="yartu-card-hdr">
              <span className="yartu-card-title">Goals Progress</span>
              <button className="yartu-card-action" onClick={() => setActiveTab?.('goals')}>View All</button>
            </div>
            <div className="yartu-list">
              {activeGoals.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>No active goals</div>
              ) : (
                activeGoals.map(g => {
                  const prog = calcGoalProgress(g);
                  return (
                    <div key={g.id} className="yartu-mini-bar-row" style={{ background: 'var(--bg-base)', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
                      <div className="yartu-mini-bar-hdr">
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{g.title}</span>
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{prog}%</span>
                      </div>
                      <div className="yartu-mini-bar-track">
                        <div className="yartu-mini-bar-fill" style={{ width: `${prog}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>


        {/* ── MIDDLE COLUMN: FOCUS & JOURNAL ── */}
        <div className="today-col col-mid">
          
          {/* Card 4: JOURNAL */}
          <div className="yartu-card">
            <div className="yartu-card-hdr">
              <span className="yartu-card-title">Journal</span>
              <button className="yartu-card-action" onClick={() => setActiveTab?.('journal')}>＋ New Entry</button>
            </div>
            <div className="yartu-list">
              {journalEntries.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>No recent journal entries</div>
              ) : (
                journalEntries.map((e, idx) => (
                  <div key={idx} className="yartu-compact-row" onClick={() => setActiveTab?.('journal')} style={{ cursor: 'pointer' }}>
                    <div className="yartu-row-left" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <div className="yartu-row-title" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{e.date === todayDateStr ? 'Today' : e.date}</div>
                      <div className="yartu-row-sub" style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>{e.wins?.[0] || e.tomorrowFocus || 'Focused entry'}</div>
                    </div>
                    <div className="yartu-row-right">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card 5: POMODORO */}
          <div className="yartu-card">
            <div className="yartu-card-hdr">
              <span className="yartu-card-title">Pomodoro Timer</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>{timerState === 'running' ? 'Running' : 'Paused'}</span>
            </div>
            <div className="yartu-pomo-box">
              <div className="yartu-mini-timer">{formatTimerDisplay(timerSeconds)}</div>
              <div className="yartu-timer-controls">
                <button className="yartu-timer-btn" onClick={startTimer} title="Start / Resume">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
                <button className="yartu-timer-btn" onClick={pauseTimer} title="Pause">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                </button>
                <button className="yartu-timer-btn" onClick={resetTimer} title="Reset">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Total focus today: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{hours}h {mins}m</span>
              </div>
            </div>
          </div>

          {/* Card 6: RECENT ACTIVITY */}
          <div className="yartu-card">
            <div className="yartu-card-hdr">
              <span className="yartu-card-title">Recent Activity</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Today</span>
            </div>
            <div className="yartu-list">
              {recentActivity.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>No activity recorded yet today</div>
              ) : (
                recentActivity.map((act, idx) => (
                  <div key={idx} className="yartu-compact-row">
                    <div className="yartu-row-left" style={{ gap: 14 }}>
                      <span style={{ fontSize: '1.2rem' }}>{act.icon}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div className="yartu-row-title">{act.title}</div>
                        <div className="yartu-row-sub">{act.type} · {act.time}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>


        {/* ── RIGHT COLUMN: STATS & OVERVIEW ── */}
        <div className="today-col col-right">
          
          {/* Card 7: THIS WEEK */}
          <div className="yartu-card">
            <div className="yartu-card-hdr stacked">
              <span className="yartu-card-title">This Week</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mon – Sun</span>
            </div>
            <div className="yartu-cal-strip">
              {calDays.map((cd, idx) => (
                <div key={idx} className={`yartu-cal-day${cd.isCurr ? ' active' : ''}`}>
                  <span className="yartu-cal-day-lbl">{cd.lbl}</span>
                  <span className="yartu-cal-day-num">{cd.num}</span>
                  <div className={`yartu-cal-dot${cd.hasDone ? ' done' : ''}`} />
                </div>
              ))}
            </div>
          </div>

          {/* Card 8: PROGRESS */}
          <div className="yartu-card">
            <div className="yartu-card-hdr stacked">
              <span className="yartu-card-title">Progress Overview</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>This Week</span>
            </div>
            <div className="yartu-rings-row">
              <div className="yartu-ring-card">
                <div className="yartu-ring-wrap">
                  <svg width="76" height="76" viewBox="0 0 76 76" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="38" cy="38" r="32" fill="none" stroke="var(--ring-track)" strokeWidth="6" />
                    <circle cx="38" cy="38" r="32" fill="none" stroke="var(--accent)" strokeWidth="6" strokeDasharray="201" strokeDashoffset={201 - (201 * taskPct) / 100} strokeLinecap="round" />
                  </svg>
                  <span className="yartu-ring-val">{taskPct}%</span>
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tasks Done</span>
              </div>

              <div className="yartu-ring-card">
                <div className="yartu-ring-wrap">
                  <svg width="76" height="76" viewBox="0 0 76 76" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="38" cy="38" r="32" fill="none" stroke="var(--ring-track)" strokeWidth="6" />
                    <circle cx="38" cy="38" r="32" fill="none" stroke="#34d399" strokeWidth="6" strokeDasharray="201" strokeDashoffset={201 - (201 * habitPct) / 100} strokeLinecap="round" />
                  </svg>
                  <span className="yartu-ring-val">{habitPct}%</span>
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Habit Consistency</span>
              </div>
            </div>
          </div>

          {/* Card 9: TIME BREAKDOWN */}
          <div className="yartu-card">
            <div className="yartu-card-hdr stacked">
              <span className="yartu-card-title">Time Breakdown</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Today</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>{hours}h {mins}m</span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>focused time</span>
              </div>
              <div className="yartu-list">
                {catEntries.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No time tracked by category</div>
                ) : (
                  catEntries.map(([cat, mins], idx) => {
                    const pct = Math.min(100, Math.round((mins / (totalMinutesToday || 1)) * 100));
                    const meta = TRACKER_CATS[cat] ?? { label: cat, color: 'var(--accent)' };
                    return (
                      <div key={idx} className="yartu-mini-bar-row">
                        <div className="yartu-mini-bar-hdr">
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600, textTransform: 'capitalize' }}>{meta.label || cat}</span>
                          <span style={{ color: meta.color, fontWeight: 600 }}>{mins}m ({pct}%)</span>
                        </div>
                        <div className="yartu-mini-bar-track">
                          <div className="yartu-mini-bar-fill" style={{ width: `${pct}%`, background: meta.color }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Card 10: STREAKS ROW */}
          <div className="yartu-card">
            <div className="yartu-card-hdr stacked">
              <span className="yartu-card-title">Active Streaks</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-amber)', fontWeight: 600 }}>🔥 Keep going!</span>
            </div>
            <div className="yartu-streak-list">
              {habits.filter(h => habitStreak(h) > 0).length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', width: '100%', padding: '8px 0' }}>No active streaks yet. Complete a habit today!</div>
              ) : (
                habits.filter(h => habitStreak(h) > 0).map(h => (
                  <div key={h.id} className="yartu-streak-avatar">
                    <span className="yartu-flame-icon">🔥</span>
                    <div className="yartu-streak-text">
                      <span className="yartu-streak-name">{h.name}</span>
                      <span className="yartu-streak-num">{habitStreak(h)} days</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
