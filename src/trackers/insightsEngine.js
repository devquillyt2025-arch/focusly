import { computeHabitStreaks, computeTargetStats, isScheduledOn, todayStr, dateStrOf } from './trackerUtils';
import { calculateDailyScore } from './analyticsUtils';

export function generateInsights(trackers, tasks, pomodoroLog) {
  const insights = [];
  const today = new Date();
  
  // Need at least some data to make insights
  if (trackers.length === 0) return insights;

  // 1. Weekday vs Weekend Discrepancy
  trackers.filter(t => t.type === 'habit').forEach(tracker => {
    let weekdayScheduled = 0, weekdayDone = 0;
    let weekendScheduled = 0, weekendDone = 0;
    
    const logs = tracker.logs || [];
    const createdDate = new Date(tracker.createdAt);
    if (isNaN(createdDate)) {
      console.warn(`[Insights] "${tracker.name}" has an unparseable createdAt — skipping weekday/weekend insight for it.`);
    }

    for (let d = new Date(createdDate); d <= today; d.setDate(d.getDate() + 1)) {
      if (!isScheduledOn(tracker, d)) continue;
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const ds = dateStrOf(d);
      const val = logs.find(l => l.date === ds)?.value;
      
      if (isWeekend) {
        weekendScheduled++;
        if (val === true) weekendDone++;
      } else {
        weekdayScheduled++;
        if (val === true) weekdayDone++;
      }
    }
    
    if (weekdayScheduled >= 5 && weekendScheduled >= 2) {
      const wdRate = weekdayDone / weekdayScheduled;
      const weRate = weekendDone / weekendScheduled;
      if (wdRate > 0.8 && weRate < 0.5) {
        insights.push(`You complete ${tracker.name} ${Math.round(wdRate*100)}% of the time on weekdays but only ${Math.round(weRate*100)}% on weekends. Make a weekend plan!`);
      } else if (weRate > 0.8 && wdRate < 0.5) {
        insights.push(`You complete ${tracker.name} ${Math.round(weRate*100)}% of the time on weekends but only ${Math.round(wdRate*100)}% on weekdays.`);
      }
    }
  });

  // 2. Longest streak ever
  trackers.filter(t => t.type === 'habit').forEach(tracker => {
    const stats = computeHabitStreaks(tracker);
    if (stats.current >= 5 && stats.current === stats.longest) {
      insights.push(`Your streak of ${stats.current} days for "${tracker.name}" is your longest ever — keep going! 🔥`);
    }
  });

  // 3. Target behind pace
  trackers.filter(t => t.type === 'target').forEach(tracker => {
    const stats = computeTargetStats(tracker);
    if (stats.pace === 'behind' && stats.progress > 0 && stats.progress < 90) {
      insights.push(`You're falling behind pace on "${tracker.name}" — consider adjusting your daily target or taking action today.`);
    }
  });

  // 4. Productivity peak day
  if (tasks.length > 5 || pomodoroLog.length > 5) {
    const scoresByDow = [0,0,0,0,0,0,0];
    const countsByDow = [0,0,0,0,0,0,0];
    const daysNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    
    // Check last 30 days
    const start = new Date();
    start.setDate(start.getDate() - 30);
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const ds = dateStrOf(d);
      const score = calculateDailyScore(trackers, tasks, pomodoroLog, ds);
      const dow = d.getDay();
      scoresByDow[dow] += score;
      countsByDow[dow]++;
    }
    
    let bestAvg = 0;
    let bestDay = -1;
    for (let i = 0; i < 7; i++) {
      if (countsByDow[i] >= 2) {
        const avg = scoresByDow[i] / countsByDow[i];
        if (avg > bestAvg && avg > 40) {
          bestAvg = avg;
          bestDay = i;
        }
      }
    }
    
    if (bestDay !== -1) {
      insights.push(`Your productivity score peaks on ${daysNames[bestDay]} — your best focus day!`);
    }
  }

  // 5. Missed habits reminder
  trackers.filter(t => t.type === 'habit').forEach(tracker => {
    const stats = computeHabitStreaks(tracker);
    if (stats.current === 0 && tracker.logs?.length > 0) {
      const logs = [...tracker.logs].sort((a, b) => a.date.localeCompare(b.date));
      const last = logs[logs.length - 1];
      if (last && last.value === false) {
         // This is a skip, not a miss. But let's check consecutive days.
      }
      
      // Look back 3 days
      let missedDays = 0;
      for (let i = 1; i <= 3; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        if (isScheduledOn(tracker, d)) {
          const ds = dateStrOf(d);
          const val = logs.find(l => l.date === ds)?.value;
          if (val == null) missedDays++; // val===false is an explicit skip, not a miss
          else break;
        }
      }
      if (missedDays >= 3) {
        insights.push(`You've missed "${tracker.name}" 3 days in a row — don't break the chain, want to log it today?`);
      }
    }
  });

  return insights;
}

export function getDailyInsight(trackers, tasks, pomodoroLog) {
  const insights = generateInsights(trackers, tasks, pomodoroLog);
  if (insights.length === 0) return null;
  
  // Use today's date as a deterministic seed to pick one insight
  const today = todayStr();
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = ((hash << 5) - hash) + today.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % insights.length;
  return insights[index];
}
