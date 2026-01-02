/**
 * Activity Section
 * Activity log with filtering and export
 */

import { useActivities, useApp } from '../../context/AppContext';
import { actions } from '../../hooks/useVSCodeAPI';
import { Activity } from '../../types';

interface ActivitySectionProps {
  active: boolean;
}

// Escape HTML
function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Format number
function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// Activity item component
function ActivityItem({ activity }: { activity: Activity }) {
  const time = activity.timestamp ? new Date(activity.timestamp).toLocaleTimeString() : '';
  const level = activity.level || 'worker';
  const metrics = activity.metrics || {};
  const durationMs = metrics.durationMs || activity.durationMs;
  const tokensUsed =
    (metrics.tokensSent || 0) + (metrics.tokensReceived || 0) || activity.tokensUsed;

  return (
    <div className={`activity-item ${level}`}>
      <div className="activity-header">
        <span className="activity-agent">{escapeHtml(activity.agentId || 'Agent')}</span>
        <span className="activity-time">{time}</span>
      </div>
      <div className="activity-content">
        {escapeHtml(activity.prompt || activity.message || '')}
      </div>
      <div className="activity-metrics">
        <span className="activity-status">
          <span className={`activity-status-dot ${activity.status || 'unknown'}`}></span>
          {activity.status || 'unknown'}
        </span>
        {durationMs && <span>{(durationMs / 1000).toFixed(1)}s</span>}
        {tokensUsed && <span>{formatNumber(tokensUsed)} tok</span>}
      </div>
      {activity.status === 'failed' && activity.error && (
        <div className="activity-error">{escapeHtml(activity.error)}</div>
      )}
    </div>
  );
}

export function ActivitySection({ active }: ActivitySectionProps) {
  const filteredActivities = useActivities();
  const { state, activityFilter, setActivityFilter, activitySearch, setActivitySearch } = useApp();
  const allActivities = state.activities;

  // Count by status
  const thinking = allActivities.filter((a) => a.status === 'thinking');
  const completed = allActivities.filter((a) => a.status === 'completed');
  const failed = allActivities.filter((a) => a.status === 'failed');

  // Stats
  const avgDuration =
    completed.length > 0
      ? completed.reduce(
          (s, a) => s + ((a.metrics?.durationMs || a.durationMs) || 0),
          0
        ) /
        completed.length /
        1000
      : 0;

  const totalTokens = allActivities.reduce((s, a) => {
    const m = a.metrics || {};
    return s + ((m.tokensSent || 0) + (m.tokensReceived || 0) || a.tokensUsed || 0);
  }, 0);

  const successRate =
    allActivities.length > 0 ? (completed.length / allActivities.length) * 100 : 0;

  const handleExport = () => {
    actions.exportActivity(allActivities);
  };

  return (
    <div className={`section ${active ? 'active' : ''}`}>
      <div className="section-header">
        <span className="section-title">Activity Log</span>
        <div className="section-meta-group">
          <span
            className={`activity-badge thinking ${thinking.length === 0 ? 'hidden' : ''}`}
            title="Currently thinking"
          >
            {thinking.length}
          </span>
          <span className="section-meta">{filteredActivities.length} entries</span>
        </div>
      </div>
      <div className="section-body">
        {/* Controls */}
        <div className="controls-row">
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="thinking">Thinking</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <input
            type="text"
            placeholder="Search..."
            value={activitySearch}
            onChange={(e) => setActivitySearch(e.target.value)}
          />
          <button onClick={handleExport}>Export</button>
        </div>

        {/* Activity list */}
        {filteredActivities.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No activities</div>
          </div>
        ) : (
          <div className="activity-list">
            {filteredActivities.slice(0, 50).map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-value">{avgDuration.toFixed(1)}s</div>
            <div className="stat-label">Avg Duration</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{formatNumber(totalTokens)}</div>
            <div className="stat-label">Total Tokens</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{successRate.toFixed(0)}%</div>
            <div className="stat-label">Success Rate</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{failed.length}</div>
            <div className="stat-label">Failed</div>
          </div>
        </div>
      </div>
    </div>
  );
}
