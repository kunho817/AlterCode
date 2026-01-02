import { useState } from 'react';
import type { ToolCall } from '../../types/messages';
import './ToolCallCard.css';

interface ToolCallCardProps {
  toolCall: ToolCall;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = getStatusIcon(toolCall.status);
  const statusClass = `tool-call-${toolCall.status}`;

  return (
    <div className={`tool-call-card ${statusClass}`}>
      <div
        className="tool-call-header"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
      >
        <span className="tool-call-icon">{statusIcon}</span>
        <span className="tool-call-name">{toolCall.name}</span>
        <span className="tool-call-status">{formatStatus(toolCall.status)}</span>
        <span className={`expand-icon ${expanded ? 'expanded' : ''}`}>
          ▶
        </span>
      </div>

      {expanded && (
        <div className="tool-call-details">
          <div className="tool-call-section">
            <span className="section-label">Arguments</span>
            <pre className="section-content">{formatJson(toolCall.args)}</pre>
          </div>

          {toolCall.result && (
            <div className="tool-call-section">
              <span className="section-label">Result</span>
              <pre className="section-content">{formatJson(toolCall.result)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getStatusIcon(status: ToolCall['status']): string {
  switch (status) {
    case 'pending':
      return '⏳';
    case 'running':
      return '🔄';
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    default:
      return '❓';
  }
}

function formatStatus(status: ToolCall['status']): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'running':
      return 'Running...';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}
