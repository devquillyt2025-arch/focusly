import { memo } from 'react';
import AnalyticsDashboard from './AnalyticsDashboard';

// ─── Reports view ──────────────────────────────────────────────────
// Reports is a read-only, cross-tab analytics dashboard. It no longer surfaces
// or manages the nook-trackers system — everything here is synthesised from the
// real tabs: Habits (nook_habits), Tasks, Focus (pomodoro log) and Journal.
// (nook-trackers data is left untouched in localStorage; it simply has no UI
// on this screen anymore.)
export default memo(function ReportsView({ habits = [], tasks = [], pomodoroLog = [] }) {
  return (
    <div className="reports-view">
      <AnalyticsDashboard habits={habits} tasks={tasks} pomodoroLog={pomodoroLog} />
    </div>
  );
});
