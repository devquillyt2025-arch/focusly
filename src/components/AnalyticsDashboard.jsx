import React, { useRef } from 'react';
import { Doughnut, Line } from 'react-chartjs-2';
import { computeGlobalStats, TRACKER_CATS, isScheduledToday, isLoggedToday } from '../trackers/trackerUtils';
import { calculateDailyScore, getScoreHistory, getGlobalWeeklyHeatmap, getCategoryBreakdown } from '../trackers/analyticsUtils';

export default function AnalyticsDashboard({ trackers, tasks, pomodoroLog }) {
  const global = computeGlobalStats(trackers);
  const todayStr = new Date().toISOString().split('T')[0];
  
  // Overall success rate this month
  const getSuccessRate = () => {
    let totalScheduled = 0;
    let totalLogged = 0;
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    
    for (let d = new Date(monthStart); d <= today; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      trackers.forEach(t => {
        if (t.type === 'project') return;
        const { schedule = 'daily' } = t.config || {};
        const dow = d.getDay();
        let sched = false;
        if (schedule === 'daily') sched = true;
        else if (schedule === 'weekdays') sched = dow >= 1 && dow <= 5;
        else if (schedule === 'weekends') sched = dow === 0 || dow === 6;
        else if (Array.isArray(schedule)) sched = schedule.includes(dow);
        else sched = true;

        if (sched) {
          totalScheduled++;
          if ((t.logs || []).some(l => l.date === ds && (l.value === true || typeof l.value === 'number'))) {
            totalLogged++;
          }
        }
      });
    }
    return totalScheduled > 0 ? Math.round((totalLogged / totalScheduled) * 100) : 0;
  };
  
  const successRate = getSuccessRate();

  // Productivity Score
  const currentScore = calculateDailyScore(trackers, tasks, pomodoroLog, todayStr);
  const scoreHistory = getScoreHistory(trackers, tasks, pomodoroLog, 30);
  
  const scoreDoughnutData = {
    datasets: [{
      data: [currentScore, 100 - currentScore],
      backgroundColor: ['#6366f1', 'rgba(255, 255, 255, 0.1)'],
      borderWidth: 0,
      cutout: '75%',
      circumference: 270,
      rotation: 225
    }]
  };

  const scoreLineData = {
    labels: scoreHistory.map(h => h.date),
    datasets: [{
      label: 'Productivity Score',
      data: scoreHistory.map(h => h.score),
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.2)',
      fill: true,
      tension: 0.3
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)' }
    },
    scales: {
      x: { display: false },
      y: { min: 0, max: 100, display: false }
    }
  };

  // Category Breakdown
  const catBreakdown = getCategoryBreakdown(trackers);
  const catLabels = Object.keys(catBreakdown).filter(k => catBreakdown[k] > 0);
  const catData = {
    labels: catLabels.map(k => TRACKER_CATS[k]?.label || k),
    datasets: [{
      data: catLabels.map(k => catBreakdown[k]),
      backgroundColor: catLabels.map(k => TRACKER_CATS[k]?.color || '#fff'),
      borderWidth: 0
    }]
  };

  // Weekly Heatmap
  const heatmapData = getGlobalWeeklyHeatmap(trackers);

  // Journal (Weekly Reviews) - from localStorage
  const getWeeklyReviews = () => {
    try {
      return JSON.parse(localStorage.getItem('focusly-weekly-reviews') || '[]');
    } catch {
      return [];
    }
  };
  const reviews = getWeeklyReviews().slice(0, 8);

  const printDashboard = () => {
    window.print();
  };

  const exportJSON = () => {
    const data = {
      trackers, tasks, pomodoroLog,
      reviews: getWeeklyReviews(),
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focusly-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="analytics-dashboard" id="export-dashboard-area">
      <div className="analytics-header">
        <h2 style={{ fontSize: '1.2rem', marginBottom: 16 }}>Global Analytics</h2>
        <div className="header-actions no-print" style={{ display: 'flex', gap: 8 }}>
          <button className="hdr-btn" onClick={printDashboard} title="Export PDF">🖨 PDF</button>
          <button className="hdr-btn" onClick={exportJSON} title="Export JSON">💾 JSON</button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="overview-cards">
        <div className="overview-card">
          <div className="oc-val">{global.activeTrackers}</div>
          <div className="oc-lbl">Active Trackers</div>
        </div>
        <div className="overview-card">
          <div className="oc-val">{global.perfectDaysMonth}</div>
          <div className="oc-lbl">Perfect Days (This Month)</div>
        </div>
        <div className="overview-card">
          <div className="oc-val">{global.bestStreak}d</div>
          <div className="oc-lbl">Best Streak</div>
        </div>
        <div className="overview-card">
          <div className="oc-val">{successRate}%</div>
          <div className="oc-lbl">Overall Success Rate</div>
        </div>
      </div>

      {/* Productivity Score Engine */}
      <div className="dashboard-row">
        <div className="dashboard-card score-card">
          <h3>Daily Productivity Score</h3>
          <div className="score-gauge-container" style={{ position: 'relative', height: 180, display: 'flex', justifyContent: 'center' }}>
            <Doughnut data={scoreDoughnutData} options={{ maintainAspectRatio: false, plugins: { tooltip: { enabled: false } } }} />
            <div className="score-gauge-text" style={{ position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem', fontWeight: 700, color: '#f8fafc' }}>{currentScore}</span>
              <span style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8' }}>/ 100</span>
            </div>
          </div>
          <div style={{ height: 100, marginTop: 10 }}>
            <Line data={scoreLineData} options={chartOptions} />
          </div>
        </div>

        <div className="dashboard-card category-card">
          <h3>Category Breakdown (Completions)</h3>
          {catLabels.length > 0 ? (
            <div style={{ height: 220, position: 'relative', marginTop: 20 }}>
              <Doughnut data={catData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } } }} />
            </div>
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: 20 }}>No completions this month yet.</p>
          )}
        </div>
      </div>

      {/* Global Weekly Heatmap */}
      <div className="dashboard-card">
        <h3>Consistency Heatmap (Last 12 Weeks)</h3>
        {heatmapData.length > 0 ? (
          <div className="global-heatmap" style={{ marginTop: 16, overflowX: 'auto' }}>
            {heatmapData.map(row => (
              <div key={row.id} className="gh-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ width: 100, fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: 8 }}>{row.name}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {row.data.map((d, i) => (
                    <div key={i} title={d.date} style={{
                      width: 12, height: 12, borderRadius: 2,
                      backgroundColor: d.isFuture ? 'rgba(255,255,255,0.05)' : 
                                       d.status === 'done' ? (TRACKER_CATS[row.category]?.color || '#10b981') :
                                       d.status === 'skip' ? '#64748b' :
                                       d.status === 'missed' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)'
                    }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: 20 }}>No data to display.</p>
        )}
      </div>

      {/* Journal Section */}
      <div className="dashboard-card">
        <h3>Weekly Review Journal</h3>
        {reviews.length > 0 ? (
          <div className="journal-list" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reviews.map(r => (
              <div key={r.date} className="journal-entry" style={{ background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>{new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                  <span style={{ color: '#f59e0b' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                  <p><strong>Went well:</strong> {r.wentWell}</p>
                  <p><strong>Hard:</strong> {r.wasHard}</p>
                  <p><strong>Next Focus:</strong> {r.nextFocus}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: 20 }}>No weekly reviews completed yet.</p>
        )}
      </div>

    </div>
  );
}
