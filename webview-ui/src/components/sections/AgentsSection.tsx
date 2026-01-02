/**
 * Agents Section
 * Agent hierarchy tree view
 */

import { useAgents } from '../../context/AppContext';
import { actions } from '../../hooks/useVSCodeAPI';
import { AgentNode } from '../../types';

interface AgentsSectionProps {
  active: boolean;
}

// Escape HTML
function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Agent node component
function AgentNodeComponent({ node, depth = 0 }: { node: AgentNode; depth?: number }) {
  return (
    <div className="agent-node" style={{ marginLeft: depth * 16 }}>
      <div className={`agent-row ${node.level}`}>
        <span className={`status-indicator ${node.status}`}></span>
        <div className="agent-info">
          <div className="agent-name">{node.level.toUpperCase()}</div>
          <div className="agent-task">{escapeHtml(node.currentTask || 'Idle')}</div>
        </div>
      </div>
      {node.children &&
        node.children.map((child, i) => (
          <AgentNodeComponent key={child.id || i} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

// Count agents by level
function countAgents(
  node: AgentNode | null,
  counts: Record<string, number> = { sovereign: 0, overlord: 0, lord: 0, worker: 0 }
): Record<string, number> {
  if (!node) return counts;
  counts[node.level]++;
  if (node.children) {
    node.children.forEach((child) => countAgents(child, counts));
  }
  return counts;
}

export function AgentsSection({ active }: AgentsSectionProps) {
  const agents = useAgents();
  const counts = countAgents(agents);

  return (
    <div className={`section ${active ? 'active' : ''}`}>
      <div className="section-header">
        <span className="section-title">Agent Hierarchy</span>
        <div className="section-actions">
          <button className="icon-btn" onClick={actions.pauseAll} title="Pause All">
            ⏸
          </button>
          <button className="icon-btn" onClick={actions.resumeAll} title="Resume All">
            ▶
          </button>
        </div>
      </div>
      <div className="section-body">
        {/* Agent tree */}
        {!agents ? (
          <div className="empty-state">
            <div className="empty-state-title">No active agents</div>
            <div className="empty-state-subtitle">Agents appear when a mission starts</div>
          </div>
        ) : (
          <div className="agent-tree">
            <AgentNodeComponent node={agents} />
          </div>
        )}

        {/* Legend */}
        <div className="legend-row">
          <div className="legend-item">
            <span className="status-indicator active"></span> Active
          </div>
          <div className="legend-item">
            <span className="status-indicator thinking"></span> Thinking
          </div>
          <div className="legend-item">
            <span className="status-indicator idle"></span> Idle
          </div>
          <div className="legend-item">
            <span className="status-indicator paused"></span> Paused
          </div>
        </div>

        {/* Agent summary */}
        {agents && (
          <div className="agent-grid" style={{ marginTop: 12 }}>
            <div className="agent-item">
              <span className="agent-dot sovereign"></span>Sov: {counts.sovereign}
            </div>
            <div className="agent-item">
              <span className="agent-dot overlord"></span>Ovr: {counts.overlord}
            </div>
            <div className="agent-item">
              <span className="agent-dot lord"></span>Lord: {counts.lord}
            </div>
            <div className="agent-item">
              <span className="agent-dot worker"></span>Wrk: {counts.worker}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
