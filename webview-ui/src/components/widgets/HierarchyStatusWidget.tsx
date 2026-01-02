/**
 * Hierarchy Status Widget
 * Shows current Hive Mind execution status with active agent level
 */

import { useHierarchyStatus } from '../../context/AppContext';
import { AgentLevel } from '../../types';

// Model names for each level
const LEVEL_MODELS: Record<AgentLevel, string> = {
  sovereign: 'Claude Opus',
  overlord: 'Claude Opus',
  lord: 'Claude Opus',
  worker: 'GLM-4',
};

// Level display names
const LEVEL_NAMES: Record<AgentLevel, string> = {
  sovereign: 'Sovereign',
  overlord: 'Overlord',
  lord: 'Lord',
  worker: 'Worker',
};

// Level descriptions
const LEVEL_DESC: Record<AgentLevel, string> = {
  sovereign: 'Strategic Planning',
  overlord: 'Task Decomposition',
  lord: 'Coordination',
  worker: 'Implementation',
};

function getLevelIndex(level: AgentLevel): number {
  const levels: AgentLevel[] = ['sovereign', 'overlord', 'lord', 'worker'];
  return levels.indexOf(level);
}

export function HierarchyStatusWidget() {
  const status = useHierarchyStatus();

  if (!status.isExecuting) {
    return (
      <div className="widget">
        <div className="widget-header">
          <span className="widget-title">Hive Mind</span>
          <span className="widget-badge">Idle</span>
        </div>
        <div className="hierarchy-idle">
          <div className="hierarchy-ready">Ready for commands</div>
          <div className="hierarchy-levels-preview">
            <span className="level-dot sovereign"></span>
            <span className="level-arrow">-</span>
            <span className="level-dot overlord"></span>
            <span className="level-arrow">-</span>
            <span className="level-dot lord"></span>
            <span className="level-arrow">-</span>
            <span className="level-dot worker"></span>
          </div>
        </div>
      </div>
    );
  }

  const activeLevel = status.activeLevel || 'sovereign';
  const activeModel = status.activeModel || LEVEL_MODELS[activeLevel];
  const levelName = LEVEL_NAMES[activeLevel];
  const levelDesc = LEVEL_DESC[activeLevel];
  const activeLevelIdx = getLevelIndex(activeLevel);

  return (
    <div className="widget hierarchy-active">
      <div className="widget-header">
        <span className="widget-title">Hive Mind</span>
        <span className="widget-badge warning">Active</span>
      </div>
      
      <div className="hierarchy-current">
        <div className="hierarchy-level-indicator">
          <span className={'level-dot ' + activeLevel + ' pulsing'}></span>
          <div className="level-info">
            <span className="level-name">{levelName}</span>
            <span className="level-desc">{levelDesc}</span>
          </div>
        </div>
        <div className="hierarchy-model">
          <span className="model-label">Model:</span>
          <span className="model-name">{activeModel}</span>
        </div>
      </div>

      {status.currentTask && (
        <div className="hierarchy-task">
          <span className="task-label">Task:</span>
          <span className="task-text">{status.currentTask}</span>
        </div>
      )}

      {status.phase && (
        <div className="hierarchy-phase">
          <span className="phase-label">Phase:</span>
          <span className="phase-name">{status.phase}</span>
        </div>
      )}

      <div className="hierarchy-flow">
        {(['sovereign', 'overlord', 'lord', 'worker'] as AgentLevel[]).map((level, i) => {
          const levelIdx = getLevelIndex(level);
          const isActive = level === activeLevel;
          const isCompleted = levelIdx < activeLevelIdx;
          let className = 'level-dot ' + level;
          if (isActive) className += ' active';
          if (isCompleted) className += ' completed';
          return (
            <span key={level}>
              <span className={className}></span>
              {i < 3 && <span className="level-arrow">-</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
