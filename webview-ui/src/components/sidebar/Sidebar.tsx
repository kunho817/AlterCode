import { useExtensionState } from '../../context/ExtensionStateContext';
import { TasksTab } from './TasksTab';
import { ActivityTab } from './ActivityTab';
import { QuotaTab } from './QuotaTab';
import './Sidebar.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { state, setSidebarTab } = useExtensionState();
  const { sidebarTab, pendingApprovals } = state;

  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <button className="sidebar-toggle" onClick={onToggle} title="Expand sidebar">
          <span className="codicon codicon-chevron-left" />
        </button>

        {/* Show badges when collapsed */}
        {pendingApprovals.length > 0 && (
          <div className="collapsed-badge" title={`${pendingApprovals.length} pending approvals`}>
            {pendingApprovals.length}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${sidebarTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setSidebarTab('tasks')}
          >
            Tasks
            {pendingApprovals.length > 0 && (
              <span className="tab-badge">{pendingApprovals.length}</span>
            )}
          </button>
          <button
            className={`sidebar-tab ${sidebarTab === 'activity' ? 'active' : ''}`}
            onClick={() => setSidebarTab('activity')}
          >
            Activity
          </button>
          <button
            className={`sidebar-tab ${sidebarTab === 'quota' ? 'active' : ''}`}
            onClick={() => setSidebarTab('quota')}
          >
            Quota
          </button>
        </div>

        <button className="sidebar-toggle" onClick={onToggle} title="Collapse sidebar">
          <span className="codicon codicon-chevron-right" />
        </button>
      </div>

      <div className="sidebar-content">
        {sidebarTab === 'tasks' && <TasksTab />}
        {sidebarTab === 'activity' && <ActivityTab />}
        {sidebarTab === 'quota' && <QuotaTab />}
      </div>
    </div>
  );
}
