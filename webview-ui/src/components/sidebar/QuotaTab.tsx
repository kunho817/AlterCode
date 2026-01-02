import { useExtensionState } from '../../context/ExtensionStateContext';
import type { ProviderQuota } from '../../types/messages';
import './QuotaTab.css';

export function QuotaTab() {
  const { state } = useExtensionState();
  const { quota } = state;

  const totalPercentage = quota.totalLimit > 0
    ? Math.round((quota.totalUsed / quota.totalLimit) * 100)
    : 0;

  return (
    <div className="quota-tab">
      {/* Overall Usage */}
      <div className="quota-overview">
        <div className="quota-header">
          <span className="quota-label">Total Usage</span>
          <span className="quota-value">{totalPercentage}%</span>
        </div>
        <div className="quota-bar">
          <div
            className={`quota-fill quota-${getLevel(totalPercentage)}`}
            style={{ width: `${Math.min(totalPercentage, 100)}%` }}
          />
        </div>
        <div className="quota-details">
          <span>{quota.totalUsed.toLocaleString()} / {quota.totalLimit.toLocaleString()} tokens</span>
        </div>
        {quota.resetTime && (
          <div className="quota-reset">
            Resets {formatResetTime(quota.resetTime)}
          </div>
        )}
      </div>

      {/* Per Provider */}
      {quota.providers.length > 0 && (
        <div className="providers-section">
          <div className="section-title">By Provider</div>
          {quota.providers.map((provider) => (
            <ProviderQuotaCard key={provider.provider} quota={provider} />
          ))}
        </div>
      )}

      {quota.providers.length === 0 && (
        <div className="empty-state">
          <p>No usage data available</p>
        </div>
      )}
    </div>
  );
}

function ProviderQuotaCard({ quota }: { quota: ProviderQuota }) {
  return (
    <div className="provider-card">
      <div className="provider-header">
        <span className="provider-name">{quota.provider}</span>
        <span className={`provider-percentage quota-${quota.level}`}>
          {quota.percentage}%
        </span>
      </div>
      <div className="quota-bar small">
        <div
          className={`quota-fill quota-${quota.level}`}
          style={{ width: `${Math.min(quota.percentage, 100)}%` }}
        />
      </div>
      <div className="provider-details">
        {quota.used.toLocaleString()} / {quota.limit.toLocaleString()}
      </div>
    </div>
  );
}

function getLevel(percentage: number): 'low' | 'medium' | 'high' {
  if (percentage >= 90) return 'high';
  if (percentage >= 70) return 'medium';
  return 'low';
}

function formatResetTime(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();

  if (diffMs <= 0) return 'now';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `in ${hours}h ${minutes}m`;
  }
  return `in ${minutes}m`;
}
