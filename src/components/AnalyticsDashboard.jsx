import React, { useRef } from 'react';
import { Doughnut, Line } from 'react-chartjs-2';
import { computeGlobalStats, TRACKER_CATS, isScheduledToday, isLoggedToday } from '../trackers/trackerUtils';
import { calculateDailyScore, getScoreHistory, getGlobalWeeklyHeatmap, getCategoryBreakdown } from '../trackers/analyticsUtils';

export default function AnalyticsDashboard({ trackers, tasks, pomodoroLog }) {
  const global = computeGlobalStats(trackers);
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  
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
  const yesterdayScore = scoreHistory.length > 1 ? scoreHistory[scoreHistory.length - 2].score : 0;
  const weekAvg = Math.round(scoreHistory.slice(-7).reduce((sum, h) => sum + h.score, 0) / Math.max(1, Math.min(scoreHistory.length, 7)));
  const bestScore = scoreHistory.length > 0 ? Math.max(...scoreHistory.map(h => h.score)) : 0;
  
  const scoreDoughnutData = {
    datasets: [{
      data: [currentScore, 100 - currentScore],
      backgroundColor: ['var(--accent)', 'rgba(255, 255, 255, 0.1)'],
      borderWidth: 0,
      cutout: '75%',
      circumference: 270,
      rotation: 225
    }]
  };

  // FIX 3: auto-scale Y from actual data range
  const scores = scoreHistory.map(h => h.score);
  const dataMin = scores.length ? Math.min(...scores) : 0;
  const dataMax = scores.length ? Math.max(...scores) : 100;
  const yMin    = Math.max(0, Math.floor(dataMin - 10));
  const yMax    = Math.ceil(dataMax + 10);
  const yRange  = yMax - yMin;
  const yStep   = yRange <= 20 ? 5 : yRange <= 50 ? 10 : 25;

  // FIX 4: pre-format X labels so Chart.js uses them directly (avoids val/index mismatch)
  const scoreLabels = scoreHistory.map(h => {
    const d = new Date(h.date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const scoreLineData = {
    labels: scoreLabels,
    datasets: [{
      label: 'Productivity Score',
      data: scoreHistory.map(h => h.score),
      borderColor: 'var(--color-green)',
      backgroundColor: 'var(--color-green-bg)',
      fill: true,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 5,
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: 'var(--bg-elevated)' }
    },
    scales: {
      x: {
        display: true,
        ticks: { color: 'var(--text-muted)', maxTicksLimit: 7, font: { size: 11 } },
        grid:   { color: 'var(--border)' },
        border: { color: 'var(--border)' }
      },
      y: {
        min: yMin,
        max: yMax,
        display: true,
        ticks: { color: 'var(--text-muted)', stepSize: yStep, font: { size: 11 } },
        grid:   { color: 'var(--border)' },
        border: { color: 'var(--border)' }
      }
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
    <div className="analytics-dashboard" id="export-dashboard-area" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
      
      <div className="analytics-section">
        <div className="analytics-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 className="analytics-section-title" style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', margin: 0 }}>Global Analytics</h2>
          <div className="header-actions no-print" style={{ display: 'flex', gap: 12 }}>
            <button onClick={printDashboard} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"/></svg>
              Export PDF
            </button>
            <button onClick={exportJSON} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
              Export JSON
            </button>
          </div>
        </div>

        {/* Overview Cards 2x2 Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--accent)', marginBottom: 12}}><path d="M3 12h4l3 -9l5 18l3 -9h6"/></svg>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>{global.activeTrackers}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Active Trackers</div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--color-green)', marginBottom: 12}}><path d="M5 12l5 5l10 -10"/></svg>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>{global.perfectDaysMonth}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Perfect Days (This Month)</div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--color-amber)', marginBottom: 12}}><path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z"/></svg>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>{global.bestStreak}d</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Best Streak</div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#8b5cf6', marginBottom: 12}}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>{successRate}%</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Overall Success Rate</div>
          </div>
        </div>
      </div>
      
      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* Productivity Score Engine */}
      <div className="analytics-section">
        <h2 className="analytics-section-title" style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 24 }}>Daily Productivity Score</h2>
        <div className="dashboard-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div className="dashboard-card score-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="score-gauge-container" style={{ position: 'relative', height: 200, width: '100%', display: 'flex', justifyContent: 'center' }}>
              <Doughnut data={scoreDoughnutData} options={{ maintainAspectRatio: false, plugins: { tooltip: { enabled: false } } }} />
              <div className="score-gauge-text" style={{ position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <span style={{ fontSize: '3rem', fontWeight: 700, color: '#f8fafc' }}>{currentScore}</span>
                <span style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Today's Score</span>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-around', width: '100%', marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#e2e8f0' }}>{yesterdayScore}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Yesterday</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#e2e8f0' }}>{weekAvg}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>7d Avg</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#e2e8f0' }}>{bestScore}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Best</div>
              </div>
            </div>
          </div>

          <div className="dashboard-card category-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
            <h3 style={{ fontSize: '14px', color: '#cbd5e1', marginBottom: 16, fontWeight: 600 }}>Category Breakdown (Completions)</h3>
            {catLabels.length > 0 ? (
              <div style={{ height: 240, position: 'relative' }}>
                <Doughnut data={catData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: 'var(--text-secondary)', font: { size: 13 } } } } }} />
              </div>
            ) : (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 20 }}>No completions this month yet.</p>
            )}
          </div>
        </div>
        
        <div style={{ height: 220, marginTop: 24, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 16px 8px 8px' }}>
          <Line data={scoreLineData} options={chartOptions} />
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* Global Weekly Heatmap */}
      <div className="analytics-section">
        <h2 className="analytics-section-title" style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 16 }}>Consistency Heatmap (Last 12 Weeks)</h2>
        <div className="dashboard-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 24 }}>
          {heatmapData.length > 0 ? (() => {
            const WEEK_COUNT = 12;
            const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const CELL_H = 16, GAP = 3;

            // Base dates from first tracker row (84 entries, Sun→Sat per week)
            const baseData = heatmapData[0].data;

            // FIX 1 aggregate: for each of 84 positions, compute completion rate
            const agg = baseData.map((cell, i) => {
              if (cell.isFuture) return { date: cell.date, isFuture: true, rate: null, scheduled: 0 };
              const scheduled = heatmapData.filter(row => row.data[i]?.status !== 'none' && !row.data[i]?.isFuture);
              const done      = heatmapData.filter(row => row.data[i]?.status === 'done');
              return { date: cell.date, isFuture: false, scheduled: scheduled.length, rate: scheduled.length > 0 ? done.length / scheduled.length : null };
            });

            // FIX 2: purple intensity scale
            const cellColor = (c) => {
              if (!c || c.isFuture || c.scheduled === 0) return '#1e1e2e';
              const r = c.rate ?? 0;
              if (r <= 0)    return '#1e1e2e';
              if (r <= 0.25) return '#4a1942';
              if (r <= 0.50) return '#7b2d8b';
              if (r <= 0.75) return '#a855f7';
              return 'var(--color-purple)';
            };

            const fmtWk = (ds) => {
              if (!ds) return '';
              const d = new Date(ds + 'T00:00:00');
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            };

            // FIX 1: use CSS grid so columns expand to fill full card width
            const gridCols = `repeat(${WEEK_COUNT}, 1fr)`;
            const DAY_LABEL_W = 32;

            return (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 0 }}>
                  {/* Day-of-week label column */}
                  <div style={{ width: DAY_LABEL_W, flexShrink: 0, paddingTop: 22, marginRight: 8 }}>
                    {DAY_LABELS.map(dl => (
                      <div key={dl} style={{ height: CELL_H, marginBottom: GAP, fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>{dl}</div>
                    ))}
                  </div>

                  {/* Grid area — takes all remaining width */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Week-date headers (every 2nd week, positioned via grid) */}
                    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: GAP, marginBottom: 4, height: 18 }}>
                      {Array.from({ length: WEEK_COUNT }, (_, w) => (
                        <div key={w} style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'visible' }}>
                          {w % 2 === 0 ? fmtWk(baseData[w * 7]?.date) : ''}
                        </div>
                      ))}
                    </div>

                    {/* 7 day rows × 12 week columns */}
                    {Array.from({ length: 7 }, (_, day) => (
                      <div key={day} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: GAP, marginBottom: GAP }}>
                        {Array.from({ length: WEEK_COUNT }, (_, week) => {
                          const idx = week * 7 + day;
                          const c   = agg[idx];
                          const pct = c?.scheduled > 0 ? Math.round((c.rate ?? 0) * 100) : null;
                          return (
                            <div key={week}
                              title={c ? `${c.date}${pct !== null ? ` — ${pct}%` : ''}` : ''}
                              style={{ height: CELL_H, borderRadius: 3, backgroundColor: cellColor(c) }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })() : (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No data to display.</p>
          )}
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* Journal Section */}
      <div className="analytics-section">
        <h2 className="analytics-section-title" style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 16 }}>Weekly Review Journal</h2>
        <div className="dashboard-card" style={{ background: 'transparent' }}>
          {reviews.length > 0 ? (
            <div className="journal-list" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {reviews.map(r => (
                <div key={r.date} className="journal-entry" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: 20, borderRadius: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <strong style={{ color: '#f8fafc', fontSize: '1rem' }}>{new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                    <span style={{ color: 'var(--color-amber)', fontSize: '1.1rem', letterSpacing: '0.1em' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                    <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-secondary)' }}>Went well:</strong> {r.wentWell}</p>
                    <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-secondary)' }}>Hard:</strong> {r.wasHard}</p>
                    <p><strong style={{ color: 'var(--text-secondary)' }}>Next Focus:</strong> {r.nextFocus}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No weekly reviews completed yet.</p>
          )}
        </div>
      </div>

    </div>
  );
}
