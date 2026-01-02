/**
 * Conflicts Widget
 * Displays merge conflicts with resolution options
 */

import { useConflicts } from '../../context/AppContext';
import { actions } from '../../hooks/useVSCodeAPI';
import { Conflict } from '../../types';

// Escape HTML
function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Single conflict item
function ConflictItem({ conflict }: { conflict: Conflict }) {
  const filePath = conflict.filePath || conflict.file || '';
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const branch1Agent = conflict.branch1?.agentId || 'Agent 1';
  const branch2Agent = conflict.branch2?.agentId || 'Agent 2';
  const regionCount = conflict.conflictingRegions?.length ?? 0;

  return (
    <div className="conflict-item">
      <div className="conflict-header">
        <span className="conflict-file">{escapeHtml(fileName)}</span>
      </div>
      <div className="conflict-branches">
        {escapeHtml(branch1Agent)} vs {escapeHtml(branch2Agent)}
      </div>
      <div className="conflict-regions">
        {regionCount} conflicting region{regionCount !== 1 ? 's' : ''}
      </div>
      <div className="conflict-actions">
        <button
          className="conflict-btn"
          onClick={() => actions.viewConflictDiff(conflict.id)}
        >
          View
        </button>
        <button
          className="conflict-btn auto"
          onClick={() => actions.resolveConflict(conflict.id, 'auto')}
        >
          Auto
        </button>
        <button
          className="conflict-btn ai"
          onClick={() => actions.resolveConflict(conflict.id, 'ai')}
        >
          AI
        </button>
        <button
          className="conflict-btn"
          onClick={() => actions.resolveConflict(conflict.id, 'manual')}
        >
          Manual
        </button>
      </div>
    </div>
  );
}

export function ConflictsWidget() {
  const conflicts = useConflicts();
  const count = conflicts.length;

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-title">Conflicts</span>
        <span className={`widget-badge ${count > 0 ? 'error' : ''}`}>{count}</span>
      </div>
      {count === 0 ? (
        <div className="text-muted" style={{ fontSize: 10 }}>
          No merge conflicts
        </div>
      ) : (
        <>
          {conflicts.slice(0, 5).map((conflict) => (
            <ConflictItem key={conflict.id} conflict={conflict} />
          ))}
          {count > 5 && (
            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <button className="conflict-btn" onClick={actions.showConflicts}>
                {count - 5} more...
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
