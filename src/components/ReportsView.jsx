import { memo, useState, useRef, useMemo, useCallback, useEffect, forwardRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence, useReducedMotion, useAnimationControls } from 'framer-motion';
import {
  TRACKER_CATS, TRACKER_TYPES,
  computeHabitStreaks, computeTargetStats, computeAverageStats, computeProjectStats,
  getLogForDate, todayStr, dateStrOf, isScheduledOn, isScheduledToday, isLoggedToday,
  computeGlobalStats, getSparklineData, upsertLog, toggleMilestone, getConfig,
  genId, defaultConfig,
} from '../trackers/trackerUtils';
const HabitStreakChart = lazy(() => import('./TrackerCharts').then(m => ({ default: m.HabitStreakChart })));
const HabitDayOfWeekChart = lazy(() => import('./TrackerCharts').then(m => ({ default: m.HabitDayOfWeekChart })));
const TargetProgressChart = lazy(() => import('./TrackerCharts').then(m => ({ default: m.TargetProgressChart })));
const TargetVelocityChart = lazy(() => import('./TrackerCharts').then(m => ({ default: m.TargetVelocityChart })));
const AverageRollingChart = lazy(() => import('./TrackerCharts').then(m => ({ default: m.AverageRollingChart })));
const ProjectBurndownChart = lazy(() => import('./TrackerCharts').then(m => ({ default: m.ProjectBurndownChart })));
import { calculateTrends } from '../trackers/analyticsUtils';
import AnalyticsDashboard from './AnalyticsDashboard';
import html2canvas from 'html2canvas';

// ─── Reports view ──────────────────────────────────────────────────
export default memo(function ReportsView({ trackers, tasks, pomodoroLog, onUpdateTracker, onDeleteTracker, onEditTracker, onAddTracker, onQuickAdd }) {
  const [catFilter,  setCatFilter]  = useState('all');
  const [viewMode,   setViewMode]   = useState('trackers'); // 'trackers' | 'analytics'
  const [detail,     setDetail]     = useState(null); // tracker shown in detail
  const [highlightId, setHighlightId] = useState(null); // card pulsed after a stat-card jump
  const [heatRange,  setHeatRange]  = useState('30'); // '30' (pattern) | '7' (this week)
  const reduceMotion = useReducedMotion();

  // Refs to each rendered card + the Today's Focus strip, so the Best Streak /
  // Perfect Days stat cards can scroll to the responsible habit and flash it.
  const cardRefs  = useRef({});
  const focusRef  = useRef(null);

  const jumpToCard = useCallback((id) => {
    const el = cardRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(id);
    // Clear so the same card can be re-flashed on a later click.
    setTimeout(() => setHighlightId(cur => (cur === id ? null : cur)), 1600);
  }, []);

  const jumpToFocus = useCallback(() => {
    focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const global = computeGlobalStats(trackers);
  const daysInMonthSoFar = new Date().getDate();

  // Overall success rate: logged / scheduled across all days this month
  const successRate = (() => {
    let sched = 0, logged = 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let d = new Date(monthStart); d <= now; d.setDate(d.getDate() + 1)) {
      const ds = dateStrOf(d);
      trackers.forEach(t => {
        if (t.type === 'project') return;
        if (isScheduledOn(t, d)) {
          sched++;
          if ((t.logs || []).some(l => l.date === ds && (l.value === true || typeof l.value === 'number'))) logged++;
        }
      });
    }
    return sched > 0 ? Math.round((logged / sched) * 100) : 0;
  })();

  const trackersWithTrends = useMemo(() => calculateTrends(trackers), [trackers]);

  // Habit that owns the longest streak — target of the Best Streak stat card.
  const bestStreakOwnerId = useMemo(() => {
    let bestId = null, best = 0;
    for (const t of trackers) {
      if (t.type !== 'habit') continue;
      const { longest } = computeHabitStreaks(t);
      if (longest > best) { best = longest; bestId = t.id; }
    }
    return bestId;
  }, [trackers]);

  // Today's Focus: everything scheduled today that isn't logged yet, ordered by
  // "streak at risk" — the pending habit with the biggest current streak is the
  // most urgent, since that's what tonight's miss would break. Projects are
  // excluded (they have no daily log). timeTag is a soft secondary sort.
  const TIME_ORDER = { morning: 0, afternoon: 1, evening: 2, night: 3 };
  const todaysFocus = useMemo(() => {
    return trackers
      // Only daily-cadence types belong here — targets/projects are long-horizon.
      .filter(t => (t.type === 'habit' || t.type === 'average') && isScheduledToday(t) && !isLoggedToday(t))
      .map(t => {
        const streak = t.type === 'habit' ? computeHabitStreaks(t).current : 0;
        const tag = getConfig(t).timeTag;
        return { tracker: t, streak, tagOrder: TIME_ORDER[tag] ?? 99 };
      })
      .sort((a, b) => a.tagOrder - b.tagOrder || b.streak - a.streak);
  }, [trackers]);

  let filtered = catFilter === 'all'
    ? trackersWithTrends
    : trackersWithTrends.filter(t => t.category === catFilter);

  // Sort by trend (improving first)
  filtered = [...filtered].sort((a, b) => (b._trendScore || 0) - (a._trendScore || 0));

  // The heatmap range toggle only affects habit cards — hide it if none exist.
  const hasHabits = trackers.some(t => t.type === 'habit');

  // Quick-start seeds for the first-run empty state — pre-filled so a new user
  // isn't staring at a blank input. Each becomes a real habit-type tracker.
  const QUICK_STARTS = [
    { name: 'Drink Water',           category: 'health',   icon: '💧' },
    { name: 'Read 10 mins',          category: 'personal', icon: '📖' },
    { name: 'No Screens After 10pm', category: 'health',   icon: '🌙' },
  ];
  const handleQuickStart = (seed) => {
    if (!onQuickAdd) { onAddTracker?.(); return; }
    const exists = trackers.some(t => t.name.trim().toLowerCase() === seed.name.toLowerCase());
    if (exists) return;
    onQuickAdd({
      id: genId(), type: 'habit', logs: [], createdAt: new Date().toISOString(),
      name: seed.name, category: seed.category, description: '',
      config: defaultConfig('habit'),
    });
  };

  const openDetail = (tracker) => setDetail(tracker);
  const closeDetail = () => setDetail(null);

  const handleDelete = (id) => {
    onDeleteTracker(id);
    closeDetail();
  };

  // Sync detail tracker when parent state updates
  const liveDetail = detail ? (trackers.find(t => t.id === detail.id) ?? null) : null;

  return (
    <div className="reports-view">
      {/* Minimal action row — replaces the removed page header; keeps the success-rate stat and Add Tracker action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {global.activeTrackers} tracker{global.activeTrackers === 1 ? '' : 's'} · {successRate}% success rate
        </span>
        {onAddTracker && (
          <button className="add-task-btn" onClick={onAddTracker}>＋ Add Tracker</button>
        )}
      </div>

      <div className="view-mode-tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg-card)', padding: 6, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', width: 'max-content', margin: '0 auto 24px' }}>
        <button style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: viewMode === 'trackers' ? 'var(--accent)' : 'transparent', color: viewMode === 'trackers' ? '#fff' : 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setViewMode('trackers')}>Trackers</button>
        <button style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: viewMode === 'analytics' ? 'var(--accent)' : 'transparent', color: viewMode === 'analytics' ? '#fff' : 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setViewMode('analytics')}>Analytics</button>
      </div>

      {viewMode === 'analytics' ? (
        <AnalyticsDashboard trackers={trackers} tasks={tasks} pomodoroLog={pomodoroLog} />
      ) : (
        <>
          {/* Today's Focus — what's still pending today, most urgent first */}
          {todaysFocus.length > 0 && (
            <TodaysFocusStrip
              ref={focusRef}
              items={todaysFocus}
              onLog={(t, v) => onUpdateTracker(upsertLog(t, v))}
              onOpen={openDetail}
            />
          )}

          {/* Global stats — Best Streak & Perfect Days jump to the habit responsible */}
          <div className="reports-global-stats">
            <div className="rgs-card">
              <div className="rgs-val">{global.activeTrackers}</div>
              <div className="rgs-lbl">Trackers</div>
            </div>
            <button
              className={`rgs-card${todaysFocus.length ? ' rgs-card-link' : ''}`}
              onClick={todaysFocus.length ? jumpToFocus : undefined}
              disabled={!todaysFocus.length}
              title={todaysFocus.length ? 'Jump to what’s left today' : undefined}
            >
              <div className="rgs-val">{global.perfectDaysMonth}</div>
              <div className="rgs-lbl">Perfect Days</div>
              <div className="rgs-sub">{global.perfectDaysMonth} of {daysInMonthSoFar} days</div>
            </button>
            <button
              className={`rgs-card${bestStreakOwnerId ? ' rgs-card-link' : ''}`}
              onClick={bestStreakOwnerId ? () => jumpToCard(bestStreakOwnerId) : undefined}
              disabled={!bestStreakOwnerId}
              title={bestStreakOwnerId ? 'Jump to this habit' : undefined}
            >
              <div className="rgs-val">{global.longestStreak > 0 ? `${global.longestStreak}d` : '—'}</div>
              <div className="rgs-lbl">Best Streak</div>
              {global.longestStreak !== global.bestStreak && (
                <div className="rgs-sub">current: {global.bestStreak}d</div>
              )}
            </button>
            <div className="rgs-card">
              <div className="rgs-val">{successRate}%</div>
              <div className="rgs-lbl">Success Rate</div>
              <div className="rgs-progress-bar">
                <div className="rgs-progress-fill" style={{ width: `${successRate}%` }} />
              </div>
            </div>
          </div>

          {/* Category filter + heatmap range toggle */}
          <div className="cat-filter-bar">
            <div className="cat-filter-row" style={{ padding: '0 0 4px' }}>
              {['all', ...Object.keys(TRACKER_CATS)].map(key => {
                const m = TRACKER_CATS[key];
                const active = catFilter === key;
                return (
                  <button key={key}
                    className={`cat-chip${active ? ' cat-chip-active' : ''}`}
                    style={active && m ? { background: m.color, borderColor: m.color, color: '#fff' } : {}}
                    onClick={() => setCatFilter(key)}
                  >
                    {m?.label ?? 'All'}
                  </button>
                );
              })}
            </div>
            {hasHabits && (
              <div className="heat-range-toggle" role="group" aria-label="Heatmap range">
                <button className={heatRange === '30' ? 'hr-active' : ''} onClick={() => setHeatRange('30')} aria-pressed={heatRange === '30'}>30d</button>
                <button className={heatRange === '7'  ? 'hr-active' : ''} onClick={() => setHeatRange('7')}  aria-pressed={heatRange === '7'}>7d</button>
              </div>
            )}
          </div>

          {/* Tracker grid */}
          {filtered.length === 0 ? (
            trackers.length === 0 ? (
              <QuickStartEmpty seeds={QUICK_STARTS} onPick={handleQuickStart} onAddTracker={onAddTracker} />
            ) : (
              <div className="empty-state">
                <span>📊</span>
                <p>No trackers in this category.</p>
              </div>
            )
          ) : (
            <motion.div className="tracker-grid" layout={!reduceMotion}>
              <AnimatePresence mode="popLayout" initial={false}>
                {filtered.map(t => (
                  <TrackerCard
                    key={t.id}
                    tracker={t}
                    heatRange={heatRange}
                    reduceMotion={reduceMotion}
                    cardRef={el => { if (el) cardRefs.current[t.id] = el; else delete cardRefs.current[t.id]; }}
                    highlighted={highlightId === t.id}
                    onOpen={() => openDetail(t)}
                    onUpdate={onUpdateTracker}
                  />
                ))}
              </AnimatePresence>
              {trackers.length < 3 && onAddTracker && (
                <button className="tracker-add-cta tracker-add-cta-grid" onClick={onAddTracker}>
                  <IconPlusCircle />
                  <span>Track a new habit</span>
                </button>
              )}
            </motion.div>
          )}
        </>
      )}

      {/* Detail modal */}
      {liveDetail && (
        <TrackerDetail
          tracker={liveDetail}
          onClose={closeDetail}
          onDelete={() => handleDelete(liveDetail.id)}
          onEdit={() => { closeDetail(); onEditTracker(liveDetail); }}
          onUpdateTracker={onUpdateTracker}
        />
      )}
    </div>
  );
});

// ─── Today's Focus strip ───────────────────────────────────────────
const TodaysFocusStrip = forwardRef(function TodaysFocusStrip({ items, onLog, onOpen }, ref) {
  return (
    <div className="focus-strip" ref={ref}>
      <div className="focus-strip-hdr">
        <span className="focus-strip-title">Today’s Focus</span>
        <span className="focus-strip-count">{items.length} left</span>
      </div>
      <div className="focus-strip-scroll">
        {items.map(({ tracker, streak }) => {
          const cat = TRACKER_CATS[tracker.category] ?? TRACKER_CATS.health;
          const isHabit = tracker.type === 'habit';
          return (
            <div key={tracker.id} className="focus-pill" style={{ borderColor: cat.color + '55' }}>
              <button className="focus-pill-main" onClick={() => onOpen(tracker)}>
                <span className="focus-pill-dot" style={{ background: cat.color }} />
                <span className="focus-pill-name">{tracker.name}</span>
                {isHabit && streak > 0 && <span className="focus-pill-streak">🔥{streak}</span>}
              </button>
              <button
                className="focus-pill-check"
                style={{ '--pill-accent': cat.color }}
                onClick={() => (isHabit ? onLog(tracker, true) : onOpen(tracker))}
                aria-label={isHabit ? `Mark ${tracker.name} done` : `Log ${tracker.name}`}
              >
                {isHabit ? <CheckIcon /> : <PlusIcon />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─── Tracker card (unified chassis, 3 hero variants) ───────────────
// forwardRef so AnimatePresence (popLayout) can attach its measurement ref;
// merged with cardRef, our own scroll-to-card handle for the stat-card jumps.
const TrackerCard = memo(forwardRef(function TrackerCard({ tracker, cardRef, highlighted, heatRange, reduceMotion, onOpen, onUpdate }, ref) {
  const cat      = TRACKER_CATS[tracker.category] ?? TRACKER_CATS.health;
  const typeMeta = TRACKER_TYPES[tracker.type] ?? TRACKER_TYPES.habit;

  const setRefs = (node) => {
    cardRef(node);
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  const openKey = (e) => {
    // Only the card chassis handles Enter/Space; inner controls stopPropagation.
    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
      e.preventDefault();
      onOpen();
    }
  };

  // Enter/exit + reposition are transform/opacity only (no layout reflow); the
  // reduced-motion path drops straight to the final frame with no `layout`.
  const anim = reduceMotion ? {} : {
    layout: true,
    initial: { opacity: 0, scale: 0.94 },
    animate: { opacity: 1, scale: 1 },
    exit:    { opacity: 0, scale: 0.94 },
    transition: { duration: 0.22, ease: 'easeOut' },
  };

  return (
    <motion.div
      ref={setRefs}
      className={`tracker-card${highlighted ? ' tracker-card-flash' : ''}`}
      style={{ '--card-cat': cat.color }}
      onClick={onOpen}
      onKeyDown={openKey}
      role="button"
      tabIndex={0}
      aria-label={`${tracker.name} — open details`}
      {...anim}
    >
      <div className="tc-topbar" style={{ background: cat.color }} />
      <div className="tc-head">
        <span className="tc-name">{tracker.name}</span>
        <span className="tc-sub">
          <span className="mini-cat-badge"
            style={{ background: cat.color + '22', color: cat.color, border: `1px solid ${cat.color}44` }}>
            {cat.label}
          </span>
          <span className="tc-type">{typeMeta.label}</span>
          {tracker.trend === 'improving' && <span className="tc-trend up" title="Improving">↑</span>}
          {tracker.trend === 'declining' && <span className="tc-trend down" title="Declining">↓</span>}
        </span>
      </div>

      {tracker.type === 'habit'   && <HabitCardBody   tracker={tracker} color={cat.color} heatRange={heatRange} reduceMotion={reduceMotion} onUpdate={onUpdate} />}
      {tracker.type === 'target'  && <TargetCardBody  tracker={tracker} color={cat.color} onUpdate={onUpdate} />}
      {tracker.type === 'project' && <ProjectCardBody tracker={tracker} color={cat.color} />}
      {tracker.type === 'average' && <AverageCardBody tracker={tracker} color={cat.color} onUpdate={onUpdate} />}
    </motion.div>
  );
}));

function HabitCardBody({ tracker, color, heatRange, reduceMotion, onUpdate }) {
  const { current, longest, successRate } = computeHabitStreaks(tracker);
  const today    = todayStr();
  const todayLog = getLogForDate(tracker, today);
  const stop  = e => e.stopPropagation();
  const log   = (v) => onUpdate(upsertLog(tracker, v));
  const unlog = () => onUpdate({ ...tracker, logs: (tracker.logs || []).filter(l => l.date !== today) });

  return (
    <>
      <div className="tc-habit-hero">
        <StreakFlame streak={current} reduceMotion={reduceMotion} />
        <div className="tc-habit-stats">
          <div className="tc-stat"><span className="tc-stat-v">{longest}d</span><span className="tc-stat-l">Best</span></div>
          <div className="tc-stat"><span className="tc-stat-v">{successRate}%</span><span className="tc-stat-l">Success</span></div>
        </div>
      </div>
      <CardHeatmap tracker={tracker} range={heatRange} reduceMotion={reduceMotion} />
      <div className="tc-actions" onClick={stop}>
        {todayLog?.value === true ? (
          <button className="tc-btn tc-btn-done tc-btn-active" style={{ '--card-cat': color }} onClick={unlog}>
            <CheckIcon /> Done today
          </button>
        ) : todayLog?.value === false ? (
          <button className="tc-btn tc-btn-skip tc-btn-active" onClick={unlog}>→ Skipped</button>
        ) : (
          <>
            <button className="tc-btn tc-btn-done" style={{ '--card-cat': color }} onClick={() => log(true)}>
              <CheckIcon /> Done
            </button>
            <button className="tc-btn tc-btn-skip" onClick={() => log(false)}>Skip</button>
          </>
        )}
      </div>
    </>
  );
}

function TargetCardBody({ tracker, color, onUpdate }) {
  const { currentValue, targetValue, unit, progress, pace } = computeTargetStats(tracker);
  const [val, setVal] = useState('');
  const stop = e => e.stopPropagation();
  const submit = () => {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    onUpdate(upsertLog(tracker, currentValue + n));
    setVal('');
  };
  const PACE = { behind: 'var(--color-red)', 'on-track': 'var(--color-green)', ahead: 'var(--color-blue)' };
  return (
    <>
      <div className="tc-ring-hero">
        <ProgressRing pct={progress} color={color} />
        <div className="tc-ring-meta">
          <div className="tc-ring-nums">{currentValue}<span className="tc-ring-unit">/{targetValue}{unit}</span></div>
          <span className="tc-pace" style={{ color: PACE[pace] }}>{pace}</span>
        </div>
      </div>
      <div className="tc-inline" onClick={stop}>
        <input className="tc-inline-input" type="number" value={val} step="any" min="0"
          onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder={`+${unit || 'amount'}`} />
        <button className="tc-inline-btn" style={{ '--card-cat': color }} onClick={submit} disabled={!val}>Add</button>
      </div>
    </>
  );
}

function ProjectCardBody({ tracker, color }) {
  const { done, total, progress, pace } = computeProjectStats(tracker);
  const PACE = { behind: 'var(--color-red)', 'on-track': 'var(--color-green)', complete: 'var(--accent)' };
  return (
    <div className="tc-ring-hero tc-ring-hero-project">
      <ProgressRing pct={progress} color={color} />
      <div className="tc-ring-meta">
        <div className="tc-ring-nums">{done}<span className="tc-ring-unit">/{total} done</span></div>
        <span className="tc-pace" style={{ color: PACE[pace] }}>{pace}</span>
        <span className="tc-open-hint">Open to update →</span>
      </div>
    </div>
  );
}

function AverageCardBody({ tracker, color, onUpdate }) {
  const { todayValue, avg7, targetAverage, unit } = computeAverageStats(tracker);
  const [val, setVal] = useState('');
  const stop = e => e.stopPropagation();
  const submit = () => {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    onUpdate(upsertLog(tracker, n));
    setVal('');
  };
  const spark = getSparklineData(tracker);
  const pct = avg7 != null && targetAverage > 0 ? Math.min(100, Math.round((avg7 / targetAverage) * 100)) : null;
  return (
    <>
      <div className="tc-avg-hero">
        <div className="tc-avg-nums">
          <span className="tc-avg-v" style={{ color }}>{avg7 != null ? `${avg7}${unit}` : '—'}</span>
          <span className="tc-avg-l">7-day avg{targetAverage > 0 ? ` · target ${targetAverage}${unit}` : ''}</span>
        </div>
        <div className="tc-avg-spark"><Sparkline data={spark} color={color} type="average" /></div>
      </div>
      {targetAverage > 0 && (
        <div className="tc-avg-gauge"><div className="tc-avg-gauge-fill" style={{ width: `${pct}%`, background: color }} /></div>
      )}
      <div className="tc-inline" onClick={stop}>
        <input className="tc-inline-input" type="number" value={val} step="any" min="0"
          onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder={todayValue != null ? `today: ${todayValue}${unit}` : (unit || 'value')} />
        <button className="tc-inline-btn" style={{ '--card-cat': color }} onClick={submit} disabled={!val}>Log</button>
      </div>
    </>
  );
}

// ─── Streak flame — scales + intensifies with streak length ────────
function StreakFlame({ streak, reduceMotion }) {
  const tier   = streak >= 30 ? 4 : streak >= 14 ? 3 : streak >= 7 ? 2 : streak >= 1 ? 1 : 0;
  const COLORS = ['#6b7280', '#fbbf24', '#fb923c', '#f97316', '#ef4444'];
  const color  = COLORS[tier];
  const size   = 30 + tier * 6; // 30 → 54px

  // Pop the flame the moment a streak ticks up — but never on first mount
  // (prevInit guards against animating on tab-open) or under reduced motion.
  const controls = useAnimationControls();
  const prev = useRef(streak);
  useEffect(() => {
    const rose = streak > prev.current;
    prev.current = streak;
    if (rose && !reduceMotion) {
      controls.start({ scale: [1, 1.45, 1], transition: { duration: 0.45, ease: 'easeOut' } });
    }
  }, [streak, reduceMotion, controls]);

  return (
    <div className={`streak-flame streak-flame-t${tier}`} style={{ '--flame': color }}>
      <motion.svg animate={controls} style={{ originX: 0.5, originY: 1 }}
        width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
        <path d="M12 2c1 3-1 4.5-2.5 6C8 9.5 7 11 7 13a5 5 0 0 0 10 0c0-1.5-1-3.9-2-5-1.2 2-2.2 2-3 1 1.4-2.5 1-5.5 0-8z" />
      </motion.svg>
      <div className="streak-flame-num">
        <span className="streak-flame-v" style={{ color: tier ? color : 'var(--text-muted)' }}>{streak}</span>
        <span className="streak-flame-d">day{streak === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

// ─── Progress ring (target / project hero) ─────────────────────────
function ProgressRing({ pct, color, size = 62 }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const off = c - (clamped / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="tc-ring" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} className="tc-ring-arc" />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" className="tc-ring-pct" fill="var(--text-primary)">{pct}%</text>
    </svg>
  );
}

// ─── Compact card heatmap (habit variant) ──────────────────────────
// range '30' → 5 weeks as columns × 7 day-of-week rows, so weekday patterns
//   (e.g. weekday-consistent / weekend-drop) are legible at a glance.
// range '7'  → just the trailing week as one labelled row (the zoomed-in view).
// Cells are capped squares (not width-filling) so the grid stays a compact,
// pattern-legible widget at every breakpoint incl. the 390px single column.
function CardHeatmap({ tracker, range, reduceMotion }) {
  const today  = new Date();
  const todayS = dateStrOf(today);
  const logMap = {};
  for (const l of tracker.logs || []) logMap[l.date] = l.value;

  const cellClass = (ds, d) => {
    const isFuture = ds > todayS;
    const val = logMap[ds];
    const scheduled = !isFuture && isScheduledOn(tracker, d);
    return isFuture ? 'chm-future'
      : scheduled && val === true  ? 'chm-done'
      : scheduled && val === false ? 'chm-skip'
      : scheduled ? 'chm-missed' : 'chm-idle';
  };

  const buildGrid = () => {
    const weeks = 5;
    const start = new Date(today);
    start.setDate(start.getDate() - (weeks * 7 - 1));
    start.setDate(start.getDate() - start.getDay()); // snap to Sunday
    const cols = [];
    let d = new Date(start);
    for (let w = 0; w < weeks; w++) {
      const col = [];
      for (let dow = 0; dow < 7; dow++) {
        const ds = dateStrOf(d);
        col.push({ ds, cls: cellClass(ds, d) });
        d.setDate(d.getDate() + 1);
      }
      cols.push(col);
    }
    return cols;
  };

  const buildWeek = () => {
    const L = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const days = [];
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    for (let i = 0; i < 7; i++) {
      const ds = dateStrOf(d);
      days.push({ ds, label: L[d.getDay()], cls: cellClass(ds, d) });
      d.setDate(d.getDate() + 1);
    }
    return days;
  };

  const inner = range === '7' ? (
    <div className="card-hm-week">
      {buildWeek().map((c, i) => (
        <div key={i} className="card-hm-daycol">
          <div className={`card-hm-cell card-hm-cell-lg ${c.cls}`} title={c.ds} />
          <span className="card-hm-daylabel">{c.label}</span>
        </div>
      ))}
    </div>
  ) : (
    <div className="card-hm-grid">
      {buildGrid().map((col, wi) => (
        <div key={wi} className="card-hm-col">
          {col.map((cell, di) => <div key={di} className={`card-hm-cell ${cell.cls}`} title={cell.ds} />)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="card-heatmap" aria-hidden="true">
      {reduceMotion ? inner : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={range} className="card-hm-fade"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}>
            {inner}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

// ─── First-run quick-start ─────────────────────────────────────────
function QuickStartEmpty({ seeds, onPick, onAddTracker }) {
  return (
    <div className="quickstart">
      <div className="quickstart-icon">📈</div>
      <h3 className="quickstart-title">Start your first habit</h3>
      <p className="quickstart-sub">Pick one to begin — rename or fine-tune it any time.</p>
      <div className="quickstart-chips">
        {seeds.map(s => (
          <button key={s.name} className="quickstart-chip" onClick={() => onPick(s)}>
            <span className="quickstart-chip-ico">{s.icon}</span>
            <span>{s.name}</span>
          </button>
        ))}
      </div>
      {onAddTracker && (
        <button className="quickstart-custom" onClick={onAddTracker}>or create a custom tracker →</button>
      )}
    </div>
  );
}

// ─── Small inline icons ────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
  );
}
function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
  );
}

// ─── Sparkline SVG ─────────────────────────────────────────────────
function Sparkline({ data, color, type }) {
  if (!data.length) return <div style={{ width: 56 }} />;

  if (type === 'habit') {
    return (
      <div className="spark-dots">
        {data.slice(-7).map((v, i) => (
          <div key={i} className="spark-dot" style={{ background: v ? color : 'var(--border)' }} />
        ))}
      </div>
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data.filter(v => v > 0), 0);
  const range = max - min || 1;
  const W = 56, H = 24;

  if (data.length < 2) return <div style={{ width: W }} />;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto', display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

// ─── Tracker Detail modal ──────────────────────────────────────────
function TrackerDetail({ tracker, onClose, onDelete, onEdit, onUpdateTracker }) {
  const catMeta  = TRACKER_CATS[tracker.category] ?? TRACKER_CATS.health;
  const typeMeta = TRACKER_TYPES[tracker.type] ?? TRACKER_TYPES.habit;
  
  const detailRef = useRef(null);

  const log = (value) => onUpdateTracker(upsertLog(tracker, value));
  const toggleMs = (id) => onUpdateTracker(toggleMilestone(tracker, id));

  const handleShare = async () => {
    if (!detailRef.current) return;
    try {
      const canvas = await html2canvas(detailRef.current, { backgroundColor: '#0f172a' });
      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          alert('Image copied to clipboard!');
        } catch (e) {
          alert('Failed to copy image. Your browser might not support this feature.');
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-wide detail-modal" onClick={e => e.stopPropagation()} role="dialog" ref={detailRef}>
        <div className="modal-hdr">
          <div className="detail-hdr-left">
            <span className="detail-type-icon">{typeMeta.icon}</span>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{tracker.name}</h3>
              <span className="mini-cat-badge"
                style={{ background: catMeta.color + '22', color: catMeta.color, border: `1px solid ${catMeta.color}44` }}>
                {catMeta.label}
              </span>
            </div>
          </div>
          <div className="detail-hdr-actions no-print">
            <button className="hdr-btn" onClick={handleShare} title="Share Image" style={{ width: 'auto', padding: '0 12px', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Share
            </button>
            <button className="hdr-btn" onClick={onEdit} title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button className="hdr-btn" onClick={() => { if (confirm(`Delete "${tracker.name}"?`)) onDelete(); }} title="Delete" style={{ color: 'var(--color-red)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="detail-body">
          {tracker.description && (
            <p className="detail-description">{tracker.description}</p>
          )}

          {tracker.type === 'habit'   && <HabitDetail   tracker={tracker} onLog={log} />}
          {tracker.type === 'target'  && <TargetDetail  tracker={tracker} onLog={log} />}
          {tracker.type === 'average' && <AverageDetail tracker={tracker} onLog={log} />}
          {tracker.type === 'project' && <ProjectDetail tracker={tracker} onToggle={toggleMs} />}
        </div>
      </div>
    </div>
  );
}

// ─── Habit detail ──────────────────────────────────────────────────
function HabitDetail({ tracker, onLog }) {
  const color = TRACKER_CATS[tracker.category]?.color ?? 'var(--accent)';
  const { current, longest, successRate, doneCount, logged } = computeHabitStreaks(tracker);
  const today = todayStr();
  const todayLog = getLogForDate(tracker, today);

  return (
    <>
      <div className="detail-stats-grid">
        <StatCard val={`${current}d`} lbl="Current Streak" />
        <StatCard val={`${longest}d`} lbl="Longest Streak" />
        <StatCard val={`${successRate}%`} lbl="Success Rate" />
        <StatCard val={doneCount} lbl="Total Done" />
      </div>

      {/* Today log */}
      <div className="detail-today-row">
        <span className="detail-section-lbl">Today</span>
        {todayLog?.value === true  && <span className="habit-logged-badge">✓ Done</span>}
        {todayLog?.value === false && <span className="habit-logged-badge skipped">→ Skipped</span>}
        {todayLog == null && (
          <div className="habit-action-row">
            <button className="habit-done-btn" onClick={() => onLog(true)}>✓ Done</button>
            <button className="habit-skip-btn" onClick={() => onLog(false)}>→ Skip</button>
          </div>
        )}
      </div>

      {/* Heatmap */}
      <div className="detail-section-lbl" style={{ marginBottom: 8 }}>Activity (last 13 weeks)</div>
      <HabitHeatmap tracker={tracker} />

      <Suspense fallback={
        <>
          <ChartSkeleton height={200} />
          <ChartSkeleton height={200} />
        </>
      }>
        <HabitStreakChart tracker={tracker} color={color} />
        <HabitDayOfWeekChart tracker={tracker} color={color} />
      </Suspense>
    </>
  );
}

// ─── Habit heatmap ─────────────────────────────────────────────────
function HabitHeatmap({ tracker }) {
  const today = new Date();
  const logMap = {};
  for (const l of tracker.logs || []) logMap[l.date] = l.value;

  // Build 13 weeks × 7 days (91 days), starting from a Sunday 91 days ago
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 91);
  // Snap to previous Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const weeks = [];
  let d = new Date(startDate);
  const todayStr_ = dateStrOf(today);

  while (d <= today || weeks.length < 13) {
    const week = [];
    for (let dow = 0; dow < 7; dow++) {
      const ds = dateStrOf(d);
      const isFuture = ds > todayStr_;
      const val = logMap[ds];
      week.push({ date: ds, value: val, isFuture, isScheduled: !isFuture && isScheduledOn(tracker, d) });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
    if (weeks.length >= 13) break;
  }

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-days-col">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <span key={i} className="heatmap-day-label">{i % 2 === 1 ? d : ''}</span>
        ))}
      </div>
      <div className="heatmap-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap-week">
            {week.map((cell, di) => (
              <div key={di}
                className={[
                  'heatmap-cell',
                  cell.isFuture   ? 'hm-future'  : '',
                  !cell.isFuture && cell.isScheduled && cell.value === true  ? 'hm-done'   : '',
                  !cell.isFuture && cell.isScheduled && cell.value === false ? 'hm-skip'   : '',
                  !cell.isFuture && cell.isScheduled && cell.value == null   ? 'hm-missed' : '',
                ].filter(Boolean).join(' ')}
                title={cell.date}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Target detail ─────────────────────────────────────────────────
function TargetDetail({ tracker, onLog }) {
  const stats = computeTargetStats(tracker);
  const { currentValue, targetValue, unit, progress, pace } = stats;
  const [val, setVal] = useState('');
  const today = todayStr();
  const todayLog = getLogForDate(tracker, today);

  const submit = () => {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    // Log cumulative progress
    onLog(currentValue + n);
    setVal('');
  };

  const PACE_COLOR = { behind: 'var(--color-red)', 'on-track': 'var(--color-green)', ahead: 'var(--color-blue)' };

  return (
    <>
      <div className="detail-stats-grid">
        <StatCard val={`${currentValue}${unit}`} lbl="Current" />
        <StatCard val={`${targetValue}${unit}`} lbl="Target" />
        <StatCard val={`${progress}%`} lbl="Complete" />
        <StatCard val={pace} lbl="Pace" color={PACE_COLOR[pace]} />
      </div>

      {/* Progress bar */}
      <div className="detail-progress-bar-wrap">
        <div className="detail-progress-bar" style={{ width: `${progress}%`, background: TRACKER_CATS[tracker.category]?.color ?? 'var(--accent)' }} />
      </div>

      {/* Log today */}
      <div className="detail-today-row">
        <span className="detail-section-lbl">Log Progress</span>
        <div className="inline-log-row">
          <input type="number" className="inline-log-input" value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={`+${unit || 'amount'}`} step="any" min="0" />
          <button className="inline-log-btn" onClick={submit} disabled={!val}>Add</button>
        </div>
      </div>

      {/* Line chart */}
      {tracker.logs.length > 0 && (
        <>
          <div className="detail-section-lbl" style={{ marginBottom: 8, marginTop: 16 }}>Progress vs Pace</div>
          <Suspense fallback={
            <>
              <ChartSkeleton height={240} />
              <ChartSkeleton height={200} />
            </>
          }>
            <TargetProgressChart tracker={tracker} stats={stats} />
            <TargetVelocityChart tracker={tracker} />
          </Suspense>
        </>
      )}
    </>
  );
}

// ─── Average detail ────────────────────────────────────────────────
function AverageDetail({ tracker, onLog }) {
  const { todayValue, avg7, avg30, targetAverage, unit } = computeAverageStats(tracker);
  const [val, setVal] = useState(todayValue != null ? String(todayValue) : '');

  const submit = () => {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    onLog(n);
  };

  return (
    <>
      <div className="detail-stats-grid">
        <StatCard val={todayValue != null ? `${todayValue}${unit}` : '—'} lbl="Today" />
        <StatCard val={avg7 != null ? `${avg7}${unit}` : '—'} lbl="7-Day Avg" />
        <StatCard val={avg30 != null ? `${avg30}${unit}` : '—'} lbl="30-Day Avg" />
        <StatCard val={`${targetAverage}${unit}`} lbl="Target" />
      </div>

      <div className="detail-today-row">
        <span className="detail-section-lbl">Log Today</span>
        <div className="inline-log-row">
          <input type="number" className="inline-log-input" value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={unit || 'value'} step="any" min="0" />
          <button className="inline-log-btn" onClick={submit} disabled={!val}>Log</button>
        </div>
      </div>

      {tracker.logs.length > 0 && (
        <>
          <div className="detail-section-lbl" style={{ marginBottom: 8, marginTop: 16 }}>Last 30 Days</div>
          <Suspense fallback={
            <>
              <ChartSkeleton height={240} />
              <ChartSkeleton height={240} />
            </>
          }>
            <AverageBarChart tracker={tracker} />
            <AverageRollingChart tracker={tracker} color={TRACKER_CATS[tracker.category]?.color || 'var(--accent)'} />
          </Suspense>
        </>
      )}
    </>
  );
}

// ─── Project detail ────────────────────────────────────────────────
function ProjectDetail({ tracker, onToggle }) {
  const { done, total, progress, pace } = computeProjectStats(tracker);
  const { milestones = [], targetDate = '' } = getConfig(tracker);
  const catColor = TRACKER_CATS[tracker.category]?.color ?? 'var(--accent)';
  const PACE_COLOR = { behind: 'var(--color-red)', 'on-track': 'var(--color-green)', complete: 'var(--accent)' };

  return (
    <>
      <div className="detail-stats-grid">
        <StatCard val={`${done}/${total}`} lbl="Milestones" />
        <StatCard val={`${progress}%`} lbl="Complete" />
        <StatCard val={pace} lbl="Pace" color={PACE_COLOR[pace]} />
        {targetDate && <StatCard val={targetDate} lbl="Target Date" />}
      </div>

      <div className="detail-progress-bar-wrap">
        <div className="detail-progress-bar" style={{ width: `${progress}%`, background: catColor }} />
      </div>

      <div className="detail-section-lbl" style={{ marginTop: 16, marginBottom: 8 }}>Milestones</div>
      <div className="project-milestone-list" style={{ gap: 6 }}>
        {milestones.map(m => (
          <button key={m.id} className={`milestone-check-row${m.done ? ' ms-done' : ''}`}
            onClick={() => onToggle(m.id)}>
            <span className={`ms-checkbox${m.done ? ' ms-checked' : ''}`}>{m.done ? '✓' : ''}</span>
            <span className="ms-text">{m.text}</span>
            {m.done && m.doneAt && (
              <span className="ms-done-date">{m.doneAt.split('T')[0]}</span>
            )}
          </button>
        ))}
      </div>

      <Suspense fallback={<ChartSkeleton height={240} />}>
        <ProjectBurndownChart tracker={tracker} color={catColor} />
      </Suspense>
    </>
  );
}

// ─── SVG Charts ───────────────────────────────────────────────────

function AverageBarChart({ tracker }) {
  const today = new Date();
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29);
  const logs = [...(tracker.logs || [])]
    .filter(l => l.date >= dateStrOf(cutoff))
    .sort((a, b) => a.date.localeCompare(b.date));

  const { targetAverage = 0, unit = '' } = getConfig(tracker);
  const color = TRACKER_CATS[tracker.category]?.color ?? 'var(--accent)';
  if (!logs.length) return null;

  const W = 100, H = 80;
  const vals = logs.map(l => l.value);
  const max = Math.max(...vals, targetAverage) * 1.1 || 1;
  const barW = W / logs.length;
  const avgY = H - 4 - (targetAverage / max) * (H - 8);

  return (
    <div className="detail-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 120 }}>
        {logs.map((l, i) => {
          const bh = (l.value / max) * (H - 8);
          return <rect key={i} x={i * barW + 0.5} y={H - 4 - bh} width={barW - 1} height={bh}
            fill={color} opacity="0.7" rx="1" />;
        })}
        {targetAverage > 0 && (
          <line x1="0" y1={avgY} x2={W} y2={avgY} stroke={color} strokeWidth="1.2" strokeDasharray="3,2" />
        )}
      </svg>
      <div className="chart-axis-row">
        <span>{logs[0]?.date ?? ''}</span>
        {targetAverage > 0 && <span style={{ color, fontWeight: 700 }}>Target: {targetAverage}{unit}</span>}
        <span>{logs[logs.length - 1]?.date ?? ''}</span>
      </div>
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────
function StatCard({ val, lbl, color }) {
  return (
    <div className="stat-card">
      <div className="stat-val" style={color ? { color } : {}}>{val}</div>
      <div className="stat-lbl">{lbl}</div>
    </div>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────

function IconPlusCircle() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  );
}

// ─── Chart Skeleton ────────────────────────────────────────────────
const ChartSkeleton = memo(function ChartSkeleton({ height = 240, title = '' }) {
  return (
    <div className="chart-container" style={{ height, marginTop: 16 }}>
      {title && (
        <div className="detail-section-lbl" style={{ marginBottom: 8 }}>
          {title}
        </div>
      )}
      <div 
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 8,
          background: 'var(--bg-hover)',
          animation: 'skeletonPulse 1.5s ease-in-out infinite',
          opacity: 0.4
        }} 
      />
    </div>
  );
});
