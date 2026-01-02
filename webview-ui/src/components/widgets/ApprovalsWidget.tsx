/**
 * Approvals Widget
 * Displays pending approvals with approve/reject actions
 */

import { useApprovals } from '../../context/AppContext';
import { actions } from '../../hooks/useVSCodeAPI';
import { PendingApproval } from '../../types';

// Escape HTML
function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Format time ago
function formatTimeAgo(date: Date | string | undefined): string {
  if (!date) return '';
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  return `${diffHours}h ago`;
}

// Single approval item
function ApprovalItem({ approval }: { approval: PendingApproval }) {
  const changes = approval.changes || [];
  const fileCount = changes.length;
  const fileNames = changes
    .slice(0, 2)
    .map((c) => {
      const path = c.filePath || c.file || '';
      return path.split(/[/\\]/).pop() || path;
    })
    .join(', ');
  const moreFiles = fileCount > 2 ? ` +${fileCount - 2} more` : '';
  const timeAgo = formatTimeAgo(approval.requestedAt);

  return (
    <div className="approval-item">
      <div className="approval-header">
        <span className="approval-task">{escapeHtml(approval.taskId || 'Task')}</span>
        <span className="approval-time">{timeAgo}</span>
      </div>
      <div className="approval-meta">
        {fileCount} file{fileCount !== 1 ? 's' : ''} to change
      </div>
      {fileNames && (
        <div className="approval-files">
          {escapeHtml(fileNames)}
          {moreFiles}
        </div>
      )}
      <div className="approval-actions">
        <button className="approval-btn" onClick={() => actions.viewDiff(approval.id)}>
          Diff
        </button>
        <button
          className="approval-btn approve"
          onClick={() => actions.approveChange(approval.id)}
        >
          Approve
        </button>
        <button
          className="approval-btn reject"
          onClick={() => actions.rejectChange(approval.id)}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export function ApprovalsWidget() {
  const approvals = useApprovals();
  const count = approvals.length;

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-title">Approvals</span>
        <span className={`widget-badge ${count > 0 ? 'warning' : ''}`}>{count}</span>
      </div>
      {count === 0 ? (
        <div className="text-muted" style={{ fontSize: 10 }}>
          No pending approvals
        </div>
      ) : (
        <>
          {approvals.slice(0, 5).map((approval) => (
            <ApprovalItem key={approval.id} approval={approval} />
          ))}
          {count > 5 && (
            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <button className="approval-btn" onClick={actions.approveTask}>
                {count - 5} more...
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
