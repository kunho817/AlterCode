/**
 * Quota Widget
 * Displays quota usage with bars and history chart
 */

import { useState } from 'react';
import { useQuota, useApp } from '../../context/AppContext';
import { AgentLevel, LevelUsage } from '../../types';

// Format number
function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// Format time remaining
function formatTimeRemaining(ms: number | undefined): string {
  if (!ms || ms <= 0) return '0:00';
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Provider quota item
function QuotaItem({
  provider,
  label,
}: {
  provider: 'claude' | 'glm';
  label: string;
}) {
  const quota = useQuota();
  const [showDetails, setShowDetails] = useState(false);

  const q = quota?.[provider];
  if (!q) {
    return (
      <div className="quota-item">
        <div className="quota-row">
          <span>{label}</span>
          <span>--</span>
        </div>
        <div className="quota-bar">
          <div className="quota-fill ok" style={{ width: '0%' }}></div>
        </div>
      </div>
    );
  }

  const usage = q.currentWindow?.usage ?? {
    callCount: 0,
    tokensSent: 0,
    tokensReceived: 0,
    byLevel: {},
  };
  const percent = (q.usageRatio * 100).toFixed(0);
  const totalTokens = usage.tokensSent + usage.tokensReceived;

  const levels = ['sovereign', 'overlord', 'lord', 'worker'] as const;
  const levelColors: Record<string, string> = {
    sovereign: 'var(--sovereign)',
    overlord: 'var(--overlord)',
    lord: 'var(--lord)',
    worker: 'var(--worker)',
  };

  return (
    <div className="quota-item" onClick={() => setShowDetails(!showDetails)}>
      <div className="quota-row">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className="quota-bar">
        <div
          className={`quota-fill ${q.status || 'ok'}`}
          style={{ width: `${percent}%` }}
        ></div>
      </div>
      <div className="quota-meta">
        <span>{usage.callCount} calls</span>
        <span>{formatNumber(totalTokens)} tok</span>
      </div>

      {showDetails && (
        <div className="quota-details">
          <div className="quota-detail-row">
            <span>Sent:</span>
            <span>{formatNumber(usage.tokensSent)}</span>
          </div>
          <div className="quota-detail-row">
            <span>Received:</span>
            <span>{formatNumber(usage.tokensReceived)}</span>
          </div>
          <div className="quota-detail-row">
            <span>Reset in:</span>
            <span>{formatTimeRemaining(q.timeUntilResetMs)}</span>
          </div>
          <div className="quota-levels">
            {levels.map((level) => {
              const byLevel = (usage.byLevel || {}) as Partial<Record<AgentLevel, LevelUsage>>;
              const levelData = byLevel[level] ?? { callCount: 0 };
              return (
                <div key={level} className="quota-level-item">
                  <span
                    className="quota-level-dot"
                    style={{ background: levelColors[level] }}
                  ></span>
                  {level.charAt(0).toUpperCase()}: {levelData.callCount}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Usage history chart
function UsageHistoryChart() {
  const { state } = useApp();
  const history = state.usageHistory || { claude: [], glm: [] };

  const maxSlots = 12;
  const claudeHistory = history.claude || [];
  const glmHistory = history.glm || [];

  // If no history, show placeholder
  if (claudeHistory.length === 0 && glmHistory.length === 0) {
    return (
      <div className="quota-history">
        <div className="quota-history-header">
          <span>Usage History</span>
          <span className="text-muted" style={{ fontSize: 9 }}>
            Last hour
          </span>
        </div>
        <div className="chart-bars">
          {Array(maxSlots)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="chart-bar-group">
                <div className="chart-bar claude" style={{ height: 2 }}></div>
                <div className="chart-bar glm" style={{ height: 2 }}></div>
              </div>
            ))}
        </div>
        <div className="chart-labels">
          <span>-60m</span>
          <span>-30m</span>
          <span>Now</span>
        </div>
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-dot claude"></span>Claude
          </span>
          <span className="legend-item">
            <span className="legend-dot glm"></span>GLM
          </span>
        </div>
      </div>
    );
  }

  // Normalize and render bars
  const maxRatio = Math.max(
    ...claudeHistory.map((h) => h.usageRatio || 0),
    ...glmHistory.map((h) => h.usageRatio || 0),
    0.1
  );

  const bars = [];
  for (let i = 0; i < maxSlots; i++) {
    const claudeEntry = claudeHistory[i];
    const glmEntry = glmHistory[i];

    const claudeHeight = claudeEntry
      ? Math.max(2, (claudeEntry.usageRatio / maxRatio) * 100)
      : 2;
    const glmHeight = glmEntry ? Math.max(2, (glmEntry.usageRatio / maxRatio) * 100) : 2;

    bars.push(
      <div key={i} className="chart-bar-group">
        <div
          className="chart-bar claude"
          style={{ height: `${claudeHeight}%` }}
          title={`Claude: ${claudeEntry ? (claudeEntry.usageRatio * 100).toFixed(0) : 0}%`}
        ></div>
        <div
          className="chart-bar glm"
          style={{ height: `${glmHeight}%` }}
          title={`GLM: ${glmEntry ? (glmEntry.usageRatio * 100).toFixed(0) : 0}%`}
        ></div>
      </div>
    );
  }

  return (
    <div className="quota-history">
      <div className="quota-history-header">
        <span>Usage History</span>
        <span className="text-muted" style={{ fontSize: 9 }}>
          Last hour
        </span>
      </div>
      <div className="chart-bars">{bars}</div>
      <div className="chart-labels">
        <span>-60m</span>
        <span>-30m</span>
        <span>Now</span>
      </div>
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-dot claude"></span>Claude
        </span>
        <span className="legend-item">
          <span className="legend-dot glm"></span>GLM
        </span>
      </div>
    </div>
  );
}

export function QuotaWidget() {
  const quota = useQuota();

  // Find earliest reset time for header badge
  let earliestReset = Infinity;
  if (quota?.claude?.timeUntilResetMs) {
    earliestReset = Math.min(earliestReset, quota.claude.timeUntilResetMs);
  }
  if (quota?.glm?.timeUntilResetMs) {
    earliestReset = Math.min(earliestReset, quota.glm.timeUntilResetMs);
  }

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-title">Quota</span>
        <span className="widget-badge">
          {earliestReset < Infinity ? formatTimeRemaining(earliestReset) : '--:--'}
        </span>
      </div>
      <QuotaItem provider="claude" label="Claude" />
      <QuotaItem provider="glm" label="GLM" />
      <UsageHistoryChart />
    </div>
  );
}
