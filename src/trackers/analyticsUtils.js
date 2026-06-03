import { isScheduledOn, computeTargetStats, TRACKER_CATS } from './trackerUtils';

// ─── Helpers ───────────────────────────────────────────────────────────────

function getDaysSince(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function getPastDates(numDays, offset = 0) {
  const dates = [];
  const now = new Date();
  now.setDate(now.getDate() - offset);
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// ─── Productivity Score ────────────────────────────────────────────────────

export function calculateDailyScore(trackers, tasks, pomodoroLog, targetDateStr) {
  const targetDate = new Date(targetDateStr + 'T12:00:00');
  
  // 1. Habits (40 points)
  let habitPoints = 0;
  const scheduledHabits = trackers.filter(t => t.type === 'habit' && isScheduledOn(t, targetDate));
  if (scheduledHabits.length > 0) {
    const completedHabits = scheduledHabits.filter(t => 
      (t.logs || []).some(l => l.date === targetDateStr && l.value === true)
    );
    habitPoints = (completedHabits.length / scheduledHabits.length) * 40;
  } else {
    habitPoints = 40; // If no habits scheduled, give full points to not penalize
  }

  // 2. Targets (30 points)
  let targetPoints = 0;
  const targetTrackers = trackers.filter(t => t.type === 'target');
  if (targetTrackers.length > 0) {
    const onPaceTargets = targetTrackers.filter(t => {
      const stats = computeTargetStats(t);
      return stats.pace === 'on-track' || stats.pace === 'ahead';
    });
    targetPoints = (onPaceTargets.length / targetTrackers.length) * 30;
  } else {
    targetPoints = 30;
  }

  // 3. Tasks (20 points max, 5 pts per task)
  let taskPoints = 0;
  const tasksCompletedToday = tasks.filter(t => 
    t.completed && t.completedAt && t.completedAt.startsWith(targetDateStr)
  ).length;
  taskPoints = Math.min(20, tasksCompletedToday * 5);

  // 4. Pomodoros (10 points max, 2.5 pts per session)
  let pomoPoints = 0;
  const pomodorosToday = pomodoroLog.filter(logTime => logTime.startsWith(targetDateStr)).length;
  pomoPoints = Math.min(10, pomodorosToday * 2.5);

  return Math.round(habitPoints + targetPoints + taskPoints + pomoPoints);
}

export function getScoreHistory(trackers, tasks, pomodoroLog, numDays = 30) {
  const dates = getPastDates(numDays);
  return dates.map(dateStr => ({
    date: dateStr,
    score: calculateDailyScore(trackers, tasks, pomodoroLog, dateStr)
  }));
}

// ─── Weekly Heatmap (All Trackers) ──────────────────────────────────────────

export function getGlobalWeeklyHeatmap(trackers) {
  const weeks = 12;
  const daysPerWeek = 7;
  const today = new Date();
  
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (weeks * daysPerWeek - 1));
  startDate.setDate(startDate.getDate() - startDate.getDay()); // Snap to Sunday

  const trackerRows = trackers.map(tracker => {
    let d = new Date(startDate);
    const row = [];
    const todayStr = today.toISOString().split('T')[0];
    
    while (d <= today || row.length < weeks * daysPerWeek) {
      const ds = d.toISOString().split('T')[0];
      const isFuture = ds > todayStr;
      const isScheduled = !isFuture && isScheduledOn(tracker, d);
      
      let status = 'none'; // none, done, missed, skip
      if (isScheduled) {
        if (tracker.type === 'project') {
           // For projects, we might not have daily logs. Just consider if there's any activity or it's active.
           status = 'none';
        } else {
          const log = (tracker.logs || []).find(l => l.date === ds);
          if (log) {
            if (tracker.type === 'habit') status = log.value === true ? 'done' : (log.value === false ? 'skip' : 'missed');
            else status = 'done'; // target/average logged
          } else {
            status = 'missed';
          }
        }
      }
      
      row.push({ date: ds, status, isFuture });
      d.setDate(d.getDate() + 1);
    }
    
    return { id: tracker.id, name: tracker.name, category: tracker.category, data: row };
  });

  return trackerRows.filter(r => r.data.some(d => d.status !== 'none'));
}

// ─── Category Breakdown ────────────────────────────────────────────────────

export function getCategoryBreakdown(trackers) {
  const startOfMonthStr = getDaysSince(new Date().getDate() - 1);
  const breakdown = {};
  
  Object.keys(TRACKER_CATS).forEach(cat => breakdown[cat] = 0);

  trackers.forEach(t => {
    const logsThisMonth = (t.logs || []).filter(l => l.date >= startOfMonthStr && (l.value === true || typeof l.value === 'number'));
    const cat = t.category || 'work';
    if (breakdown[cat] !== undefined) {
      breakdown[cat] += logsThisMonth.length;
    }
  });

  return breakdown;
}

// ─── Trend Analysis ────────────────────────────────────────────────────────

export function calculateTrends(trackers) {
  const today = new Date();
  
  const getLogsCount = (tracker, startDaysAgo, endDaysAgo) => {
    const start = getDaysSince(startDaysAgo);
    const end = getDaysSince(endDaysAgo);
    return (tracker.logs || []).filter(l => l.date >= start && l.date <= end && (l.value === true || typeof l.value === 'number')).length;
  };

  return trackers.map(t => {
    const last14 = getLogsCount(t, 14, 0);
    const prev14 = getLogsCount(t, 28, 15);
    
    let trend = 'steady';
    if (last14 > prev14 + 1) trend = 'improving';
    else if (last14 < prev14 - 1) trend = 'declining';

    return { ...t, trend, _trendScore: trend === 'improving' ? 1 : trend === 'steady' ? 0 : -1 };
  });
}
