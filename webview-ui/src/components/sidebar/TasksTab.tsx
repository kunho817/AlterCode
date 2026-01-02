import { useExtensionState } from '../../context/ExtensionStateContext';
import { useVSCodeAPI } from '../../hooks/useVSCodeAPI';
import type { Task, PendingApproval } from '../../types/messages';
import './TasksTab.css';

export function TasksTab() {
  const { state } = useExtensionState();
  const { activeMission, tasks, pendingApprovals } = state;

  return (
    <div className="tasks-tab">
      {/* Mission header */}
      {activeMission ? (
        <div className="mission-header">
          <div className="mission-title">{activeMission.title}</div>
          <div className="mission-status">{formatStatus(activeMission.status)}</div>
        </div>
      ) : (
        <div className="no-mission">
          <p>No active mission</p>
          <button className="btn-secondary">Create Mission</button>
        </div>
      )}

      {/* Pending Approvals Section */}
      {pendingApprovals.length > 0 && (
        <div className="pending-approvals-section">
          <div className="section-header">
            <span className="section-title">Awaiting Approval</span>
            <span className="section-count">{pendingApprovals.length}</span>
          </div>
          {pendingApprovals.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} />
          ))}
        </div>
      )}

      {/* Tasks List */}
      {tasks.length > 0 && (
        <div className="tasks-section">
          <div className="section-header">
            <span className="section-title">Tasks</span>
          </div>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {tasks.length === 0 && pendingApprovals.length === 0 && !activeMission && (
        <div className="empty-state">
          <p>No tasks yet</p>
        </div>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const statusIcon = getTaskStatusIcon(task.status);
  const levelBadge = getLevelBadge(task.level);

  return (
    <div className={`task-card task-${task.status}`}>
      <div className="task-header">
        <span className="task-status-icon">{statusIcon}</span>
        <span className="task-title">{task.title}</span>
        <span className={`task-level ${task.level}`}>{levelBadge}</span>
      </div>
      {task.progress !== undefined && (
        <div className="task-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          {task.progressMessage && (
            <span className="progress-message">{task.progressMessage}</span>
          )}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ approval }: { approval: PendingApproval }) {
  const vscode = useVSCodeAPI();

  const handleApprove = () => {
    vscode.postMessage({
      type: 'approval:respond',
      approvalId: approval.id,
      action: 'approve',
    });
  };

  const handleReject = () => {
    vscode.postMessage({
      type: 'approval:respond',
      approvalId: approval.id,
      action: 'reject',
    });
  };

  const handleReview = () => {
    vscode.postMessage({
      type: 'approval:reviewHunks',
      approvalId: approval.id,
    });
  };

  return (
    <div className="approval-card">
      <div className="approval-header">
        <span className="approval-icon">⏳</span>
        <span className="approval-title">{approval.title}</span>
      </div>
      <div className="approval-description">{approval.description}</div>
      <div className="approval-changes">
        {approval.changes.length} file{approval.changes.length !== 1 ? 's' : ''} changed
      </div>
      <div className="approval-actions">
        <button className="btn-approve" onClick={handleApprove}>
          Approve
        </button>
        <button className="btn-reject" onClick={handleReject}>
          Reject
        </button>
        <button className="btn-review" onClick={handleReview}>
          Review
        </button>
      </div>
    </div>
  );
}

function getTaskStatusIcon(status: Task['status']): string {
  const icons: Record<Task['status'], string> = {
    pending: '⏳',
    in_progress: '🔄',
    completed: '✅',
    failed: '❌',
  };
  return icons[status];
}

function getLevelBadge(level: Task['level']): string {
  const badges: Record<Task['level'], string> = {
    worker: 'W',
    lord: 'L',
    overlord: 'O',
    sovereign: 'S',
  };
  return badges[level];
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
