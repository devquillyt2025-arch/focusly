import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { isScheduledOn, dateStrOf, getConfig } from '../trackers/trackerUtils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: 'var(--text-secondary)', font: { family: 'Outfit' } }
    },
    tooltip: {
      backgroundColor: 'var(--bg-elevated)',
      titleFont: { family: 'Outfit' },
      bodyFont: { family: 'Outfit' },
      padding: 10,
      cornerRadius: 8,
      displayColors: true
    }
  },
  scales: {
    x: {
      ticks: { color: 'var(--text-muted)', font: { family: 'Outfit' } },
      grid: { color: 'var(--border)' }
    },
    y: {
      ticks: { color: 'var(--text-muted)', font: { family: 'Outfit' } },
      grid: { color: 'var(--border)' }
    }
  }
};

// ─── Habit Charts ──────────────────────────────────────────────────────────

export function HabitStreakChart({ tracker, color }) {
  // Calculate streaks history
  const logs = [...(tracker.logs || [])].sort((a, b) => a.date.localeCompare(b.date));
  const streaks = [];
  let currentStreak = 0;
  let streakEnd = '';
  
  for (const log of logs) {
    if (log.value === true) {
      currentStreak++;
      streakEnd = log.date;
    } else if (log.value === false) {
      // skip, neutral
    } else {
      if (currentStreak > 0) {
        streaks.push({ length: currentStreak, end: streakEnd });
        currentStreak = 0;
      }
    }
  }
  if (currentStreak > 0) streaks.push({ length: currentStreak, end: streakEnd });
  
  // Take last 10 streaks
  const recentStreaks = streaks.slice(-10);

  const data = {
    labels: recentStreaks.map(s => s.end),
    datasets: [{
      label: 'Streak Length (days)',
      data: recentStreaks.map(s => s.length),
      backgroundColor: color,
      borderRadius: 4
    }]
  };

  if (!recentStreaks.length) return null;

  return (
    <div className="chart-container" style={{ height: 200, marginTop: 16 }}>
      <div className="detail-section-lbl" style={{ marginBottom: 8 }}>Streak History</div>
      <Bar data={data} options={chartOptions} />
    </div>
  );
}

export function HabitDayOfWeekChart({ tracker, color }) {
  const logs = tracker.logs || [];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const successCount = [0,0,0,0,0,0,0];
  const scheduledCount = [0,0,0,0,0,0,0];

  // Only consider days since creation up to today
  const createdDate = new Date(tracker.createdAt);
  const today = new Date();
  if (isNaN(createdDate)) {
    console.warn(`[Trackers] "${tracker.name}" has an unparseable createdAt — day-of-week chart will be empty.`);
  }

  for (let d = new Date(createdDate); d <= today; d.setDate(d.getDate() + 1)) {
    if (isScheduledOn(tracker, d)) {
      const dow = d.getDay();
      scheduledCount[dow]++;
      const ds = dateStrOf(d);
      const log = logs.find(l => l.date === ds);
      if (log?.value === true) {
        successCount[dow]++;
      }
    }
  }

  const successRates = days.map((_, i) => scheduledCount[i] > 0 ? (successCount[i] / scheduledCount[i]) * 100 : 0);

  const data = {
    labels: days,
    datasets: [{
      label: 'Success Rate %',
      data: successRates,
      backgroundColor: color,
      borderRadius: 4
    }]
  };

  return (
    <div className="chart-container" style={{ height: 200, marginTop: 16 }}>
      <div className="detail-section-lbl" style={{ marginBottom: 8 }}>Success by Day</div>
      <Bar data={data} options={{ ...chartOptions, scales: { y: { min: 0, max: 100, ...chartOptions.scales.y } } }} />
    </div>
  );
}

// ─── Target Charts ─────────────────────────────────────────────────────────

export function TargetProgressChart({ tracker, color }) {
  const { startValue = 0, targetValue = 100, targetDate = '' } = getConfig(tracker);
  const logs = [...(tracker.logs || [])].sort((a, b) => a.date.localeCompare(b.date));
  
  if (!logs.length) return null;
  
  const labels = [dateStrOf(new Date(tracker.createdAt)), ...logs.map(l => l.date)];
  const actualData = [startValue, ...logs.map(l => l.value)];
  
  // Pace line
  let paceData = [];
  if (targetDate) {
    const s = new Date(tracker.createdAt).getTime();
    const e = new Date(targetDate).getTime();
    const range = e - s;
    if (range > 0) {
      paceData = labels.map(dateStr => {
        const d = new Date(dateStr).getTime();
        const expectedPct = Math.min(1, Math.max(0, (d - s) / range));
        return startValue + (targetValue - startValue) * expectedPct;
      });
    }
  }

  const data = {
    labels,
    datasets: [
      {
        label: 'Actual Progress',
        data: actualData,
        borderColor: color,
        backgroundColor: color + '44',
        fill: true,
        tension: 0.3
      },
      ...(targetDate ? [{
        label: 'Target Pace',
        data: paceData,
        borderColor: 'var(--text-secondary)',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0
      }] : [])
    ]
  };

  return (
    <div className="chart-container" style={{ height: 240, marginTop: 16 }}>
      <Line data={data} options={chartOptions} />
    </div>
  );
}

export function TargetVelocityChart({ tracker, color }) {
  const logs = [...(tracker.logs || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (logs.length < 2) return null;

  const velocityData = [];
  const labels = [];
  
  for (let i = 1; i < logs.length; i++) {
    const prev = logs[i-1];
    const curr = logs[i];
    const daysDiff = (new Date(curr.date) - new Date(prev.date)) / (1000 * 60 * 60 * 24);
    if (daysDiff > 0) {
      const vel = (curr.value - prev.value) / daysDiff;
      velocityData.push(vel);
      labels.push(curr.date);
    }
  }

  const data = {
    labels,
    datasets: [{
      label: 'Velocity (progress per day)',
      data: velocityData,
      backgroundColor: color,
      borderRadius: 4
    }]
  };

  return (
    <div className="chart-container" style={{ height: 200, marginTop: 16 }}>
      <div className="detail-section-lbl" style={{ marginBottom: 8 }}>Velocity</div>
      <Bar data={data} options={chartOptions} />
    </div>
  );
}

// ─── Average Charts ────────────────────────────────────────────────────────

export function AverageRollingChart({ tracker, color }) {
  const logs = [...(tracker.logs || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (logs.length < 2) return null;

  const calculateRolling = (days) => {
    return logs.map((log, index) => {
      const windowLogs = logs.slice(Math.max(0, index - days + 1), index + 1);
      const sum = windowLogs.reduce((acc, l) => acc + l.value, 0);
      return sum / windowLogs.length;
    });
  };

  const rolling7 = calculateRolling(7);
  const rolling30 = calculateRolling(30);

  const data = {
    labels: logs.map(l => l.date),
    datasets: [
      {
        label: '7-Day Rolling Avg',
        data: rolling7,
        borderColor: color,
        tension: 0.4
      },
      {
        label: '30-Day Rolling Avg',
        data: rolling30,
        borderColor: 'var(--color-amber)',
        borderDash: [3, 3],
        tension: 0.4
      }
    ]
  };

  return (
    <div className="chart-container" style={{ height: 240, marginTop: 16 }}>
      <div className="detail-section-lbl" style={{ marginBottom: 8 }}>Rolling Averages</div>
      <Line data={data} options={chartOptions} />
    </div>
  );
}

// ─── Project Charts ────────────────────────────────────────────────────────

export function ProjectBurndownChart({ tracker, color }) {
  const { milestones = [], targetDate = '' } = getConfig(tracker);
  if (!milestones.length || !targetDate) return null;

  const s = new Date(tracker.createdAt).getTime();
  const e = new Date(targetDate).getTime();
  const range = e - s;
  
  if (range <= 0) return null;

  // Group milestones by doneAt date
  const completedByDate = {};
  milestones.filter(m => m.done && m.doneAt).forEach(m => {
    const d = m.doneAt.split('T')[0];
    completedByDate[d] = (completedByDate[d] || 0) + 1;
  });

  const dates = [dateStrOf(new Date(s))].concat(Object.keys(completedByDate).sort());
  const actualData = [];
  let remaining = milestones.length;
  
  dates.forEach(d => {
    if (completedByDate[d]) {
      remaining -= completedByDate[d];
    }
    actualData.push(remaining);
  });

  // Target pace line
  const paceData = dates.map(dateStr => {
    const d = new Date(dateStr).getTime();
    const expectedPct = Math.min(1, Math.max(0, (d - s) / range));
    return milestones.length - (milestones.length * expectedPct);
  });

  const data = {
    labels: dates,
    datasets: [
      {
        label: 'Remaining Milestones',
        data: actualData,
        borderColor: color,
        backgroundColor: color + '44',
        fill: true,
        stepped: true
      },
      {
        label: 'Ideal Burndown',
        data: paceData,
        borderColor: 'var(--color-red)',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0
      }
    ]
  };

  return (
    <div className="chart-container" style={{ height: 240, marginTop: 16 }}>
      <div className="detail-section-lbl" style={{ marginBottom: 8 }}>Burndown</div>
      <Line data={data} options={chartOptions} />
    </div>
  );
}
