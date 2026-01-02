/**
 * Mission Section
 * Mission cards with progress bars, phase steppers, task lists
 */

import { useMissions } from '../../context/AppContext';
import { actions } from '../../hooks/useVSCodeAPI';
import { Mission, Task, PHASES } from '../../types';

interface MissionSectionProps {
  active: boolean;
}

// Escape HTML
function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Task item component
function TaskItem({ task }: { task: Task }) {
  const showRetry = task.status === 'failed';

  return (
    <div className="task-item">
      <span className={`task-dot ${task.status}`}></span>
      <span>{escapeHtml(task.description || task.title || task.id)}</span>
      {task.priority && task.priority !== 'normal' && (
        <span className={`task-priority ${task.priority}`}>{task.priority}</span>
      )}
      {showRetry && (
        <button className="task-retry" onClick={() => actions.retryTask(task.id)}>
          Retry
        </button>
      )}
    </div>
  );
}

// Mission card component
function MissionCard({ mission }: { mission: Mission }) {
  const progress = mission.progress;
  const overallProgress = progress?.overallProgress ?? 0;
  const tasksTotal = progress?.tasksTotal ?? 0;
  const tasksCompleted = progress?.tasksCompleted ?? 0;
  const currentPhase = mission.phase || 'planning';
  const phaseIndex = PHASES.indexOf(currentPhase);
  const tasks = mission.tasks || [];
  const isPaused = mission.status === 'paused';
  const isActive = mission.status === 'active' || mission.status === 'running';
  const isFailed = mission.status === 'failed';
  const rollbackCount = mission.rollbackPoints ?? 0;
  const hasRollback = rollbackCount > 0;

  // Format ETA
  let etaText = '';
  if (progress?.estimatedCompletion) {
    const eta = new Date(progress.estimatedCompletion);
    const now = new Date();
    const diffMs = eta.getTime() - now.getTime();
    if (diffMs > 0) {
      const mins = Math.round(diffMs / 60000);
      etaText = `ETA: ${mins}m`;
    }
  }

  return (
    <div className={`mission-card ${mission.status}`}>
      <div className="mission-header">
        <span className="mission-title">{escapeHtml(mission.title)}</span>
        <span className={`mission-status ${mission.status}`}>{mission.status}</span>
      </div>

      {/* Phase stepper */}
      <div className="phase-stepper">
        {PHASES.map((phase, i) => {
          let cls = '';
          if (i < phaseIndex) cls = 'completed';
          else if (i === phaseIndex && isActive) cls = 'active';
          return <div key={phase} className={`phase-step ${cls}`} data-phase={phase}></div>;
        })}
      </div>

      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${overallProgress}%` }}></div>
      </div>

      <div className="mission-progress-info">
        <span>
          {tasksCompleted} / {tasksTotal} tasks
        </span>
        <span>{Math.round(overallProgress)}%</span>
        {etaText && <span className="mission-eta">{etaText}</span>}
      </div>

      {/* Task list */}
      {tasks.length > 0 && (
        <div className="task-list">
          {tasks.slice(0, 5).map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Controls */}
      {isActive && (
        <div className="mission-controls">
          <button className="mission-btn" onClick={() => actions.pauseMission(mission.id)}>
            Pause
          </button>
          {hasRollback && (
            <button
              className="mission-btn"
              onClick={() => actions.rollbackMission(mission.id)}
              title={`${rollbackCount} restore points`}
            >
              Rollback
            </button>
          )}
          <button
            className="mission-btn danger"
            onClick={() => actions.cancelMission(mission.id)}
          >
            Cancel
          </button>
        </div>
      )}

      {isPaused && (
        <div className="mission-controls">
          <button className="mission-btn" onClick={() => actions.resumeMission(mission.id)}>
            Resume
          </button>
          {hasRollback && (
            <button
              className="mission-btn"
              onClick={() => actions.rollbackMission(mission.id)}
              title={`${rollbackCount} restore points`}
            >
              Rollback
            </button>
          )}
          <button
            className="mission-btn danger"
            onClick={() => actions.cancelMission(mission.id)}
          >
            Cancel
          </button>
        </div>
      )}

      {isFailed && hasRollback && (
        <div className="mission-controls">
          <button
            className="mission-btn"
            onClick={() => actions.rollbackMission(mission.id)}
            title={`${rollbackCount} restore points`}
          >
            Rollback Changes
          </button>
        </div>
      )}
    </div>
  );
}

export function MissionSection({ active }: MissionSectionProps) {
  const missions = useMissions();

  // Stats
  const stats = {
    total: missions.length,
    active: missions.filter((m) => m.status === 'active' || m.status === 'running').length,
    completed: missions.filter((m) => m.status === 'completed').length,
    failed: missions.filter((m) => m.status === 'failed').length,
  };

  return (
    <div className={`section ${active ? 'active' : ''}`}>
      <div className="section-header">
        <span className="section-title">Missions</span>
        <div className="section-actions">
          <button className="icon-btn" onClick={actions.clearCompleted} title="Clear completed">
            ✕
          </button>
          <button className="icon-btn" onClick={actions.newMission} title="New">
            +
          </button>
        </div>
      </div>
      <div className="section-body">
        {/* Stats */}
        <div className="mission-stats">
          <div className="mission-stat">
            <span className="mission-stat-value">{stats.total}</span>
            <span className="mission-stat-label">Total</span>
          </div>
          <div className="mission-stat">
            <span className="mission-stat-value">{stats.active}</span>
            <span className="mission-stat-label">Active</span>
          </div>
          <div className="mission-stat">
            <span className="mission-stat-value">{stats.completed}</span>
            <span className="mission-stat-label">Done</span>
          </div>
          <div className="mission-stat">
            <span className="mission-stat-value">{stats.failed}</span>
            <span className="mission-stat-label">Failed</span>
          </div>
        </div>

        {/* Mission list */}
        {missions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No active missions</div>
            <div className="empty-state-subtitle">Start a new mission to begin</div>
          </div>
        ) : (
          <div className="mission-list">
            {missions.map((mission) => (
              <MissionCard key={mission.id} mission={mission} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
