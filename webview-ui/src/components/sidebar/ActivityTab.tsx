import { useExtensionState } from '../../context/ExtensionStateContext';
import type { ActivityEntry } from '../../types/messages';
import './ActivityTab.css';

export function ActivityTab() {
  const { state } = useExtensionState();
  const { activities } = state;

  if (activities.length === 0) {
    return (
      <div className="activity-tab">
        <div className="empty-state">
          <p>No activity yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="activity-tab">
      {activities.map((activity) => (
        <ActivityCard key={activity.id} activity={activity} />
      ))}
    </div>
  );
}

function ActivityCard({ activity }: { activity: ActivityEntry }) {
  const icon = getActivityIcon(activity.type);
  const statusClass = `activity-${activity.status}`;

  return (
    <div className={`activity-card ${statusClass}`}>
      <div className="activity-header">
        <span className="activity-icon">{icon}</span>
        <span className="activity-title">{activity.title}</span>
        <span className="activity-time">{formatTime(activity.timestamp)}</span>
      </div>
      {activity.description && (
        <div className="activity-description">{activity.description}</div>
      )}
      {activity.duration !== undefined && activity.status === 'completed' && (
        <div className="activity-duration">{formatDuration(activity.duration)}</div>
      )}
    </div>
  );
}

function getActivityIcon(type: ActivityEntry['type']): string {
  const icons: Record<ActivityEntry['type'], string> = {
    thinking: '🤔',
    tool_call: '🔧',
    message: '💬',
    approval: '✋',
    error: '❌',
  };
  return icons[type];
}

function formatTime(date: Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
