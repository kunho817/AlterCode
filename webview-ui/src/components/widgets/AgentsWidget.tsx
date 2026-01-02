/**
 * Agents Widget
 * Summary of agent counts by level
 */

import { useAgents } from '../../context/AppContext';
import { AgentNode } from '../../types';

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

export function AgentsWidget() {
  const agents = useAgents();
  const counts = countAgents(agents);

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-title">Agents</span>
      </div>
      <div className="agent-grid">
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
    </div>
  );
}
