/**
 * Performance Widget
 * Displays performance stats and top operations
 */

import { usePerformance } from '../../context/AppContext';
import { actions } from '../../hooks/useVSCodeAPI';

// Escape HTML
function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function PerformanceWidget() {
  const performance = usePerformance();

  const stats = performance?.stats || [];
  const totalOps = stats.reduce((sum, s) => sum + s.count, 0);
  const totalTime = stats.reduce((sum, s) => sum + s.totalMs, 0);

  // Format total time
  const totalTimeStr =
    totalTime > 1000 ? (totalTime / 1000).toFixed(1) + 's' : totalTime.toFixed(0) + 'ms';

  // Top 5 slowest operations
  const topOps = stats.slice(0, 5);

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-title">Performance</span>
        <button
          className="widget-btn"
          onClick={actions.getPerformance}
          title="Refresh"
        >
          ↻
        </button>
      </div>
      <div className="perf-summary">
        <div className="perf-stat">
          <span className="perf-value">{totalOps}</span>
          <span className="perf-label">Operations</span>
        </div>
        <div className="perf-stat">
          <span className="perf-value">{totalTimeStr}</span>
          <span className="perf-label">Total Time</span>
        </div>
      </div>
      <div className="perf-top-ops">
        {topOps.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 10 }}>
            No data yet
          </div>
        ) : (
          topOps.map((op, i) => {
            const isSlow = op.avgMs > 1000;
            return (
              <div key={i} className="perf-op">
                <span className="perf-op-name" title={op.name}>
                  {escapeHtml(op.name)}
                </span>
                <span className={`perf-op-time ${isSlow ? 'perf-op-slow' : ''}`}>
                  {op.avgMs.toFixed(0)}ms x{op.count}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
