/**
 * Chat Section
 * Chat interface with agent roles, inline approvals, and typing indicator
 */

import React from 'react';
import { useChatMessages, useApp, useHierarchyStatus } from '../../context/AppContext';
import { actions } from '../../hooks/useVSCodeAPI';
import { ChatMessage, AgentLevel } from '../../types';

interface ChatSectionProps {
  active: boolean;
}

// Model names for display
const LEVEL_MODELS: Record<AgentLevel, string> = {
  sovereign: 'Claude Opus',
  overlord: 'Claude Opus',
  lord: 'Claude Opus',
  worker: 'GLM-4',
};

// Escape HTML
function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Format time
function formatTime(timestamp?: Date | string): string {
  if (!timestamp) return '';
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toLocaleTimeString();
}

// Typing indicator component
function TypingIndicator({ level, model }: { level: AgentLevel; model: string }) {
  const levelName = level.charAt(0).toUpperCase() + level.slice(1);
  return (
    <div className={'chat-typing ' + level}>
      <div className="typing-dots">
        <span className="typing-dot"></span>
        <span className="typing-dot"></span>
        <span className="typing-dot"></span>
      </div>
      <div className="typing-info">
        <span className="typing-agent">{levelName} is thinking...</span>
        <span className="typing-model">{model}</span>
      </div>
    </div>
  );
}

// Single chat message component
function ChatMessageItem({ msg }: { msg: ChatMessage }) {
  const time = formatTime(msg.timestamp);
  const hasApproval = msg.approval && msg.approval.status === 'pending';

  return (
    <div className={'chat-msg ' + msg.role}>
      <div className="chat-msg-header">
        <span className="chat-msg-role">{msg.role}</span>
        <span className="chat-msg-time">{time}</span>
      </div>
      <div className="chat-msg-text">{escapeHtml(msg.content)}</div>

      {hasApproval && (
        <div className="inline-approval">
          <div className="inline-approval-title">
            {msg.approval!.changes.length} file changes
          </div>
          <div className="inline-approval-files">
            {msg.approval!.changes.map((c, i) => (
              <div key={i} className="inline-approval-file">
                <span>{escapeHtml(c.file)}</span>
                <span>
                  <span className="text-success">+{c.additions}</span>{' '}
                  <span className="text-error">-{c.deletions}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="inline-approval-actions">
            <button
              className="action-btn"
              onClick={() => actions.viewDiff(msg.approval!.id)}
            >
              View
            </button>
            <button
              className="action-btn primary"
              onClick={() => actions.approveChange(msg.approval!.id)}
            >
              Approve
            </button>
            <button
              className="action-btn danger"
              onClick={() => actions.rejectChange(msg.approval!.id)}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatSection({ active }: ChatSectionProps) {
  const messages = useChatMessages();
  const { dispatch } = useApp();
  const hierarchyStatus = useHierarchyStatus();
  const messagesRef = React.useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages or when typing
  React.useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, hierarchyStatus.isExecuting]);

  const handleClear = () => {
    dispatch({ type: 'CLEAR_CHAT' });
  };

  const activeLevel = hierarchyStatus.activeLevel || 'sovereign';
  const activeModel = hierarchyStatus.activeModel || LEVEL_MODELS[activeLevel];

  return (
    <div className={'section ' + (active ? 'active' : '')}>
      <div className="section-header">
        <span className="section-title">Chat</span>
        <div className="section-actions">
          <button className="icon-btn" onClick={handleClear} title="Clear">
            x
          </button>
        </div>
      </div>
      <div className="section-body" ref={messagesRef}>
        {messages.length === 0 && !hierarchyStatus.isExecuting ? (
          <div className="empty-state">
            <div className="empty-state-title">No messages yet</div>
            <div className="empty-state-subtitle">
              Type a message or use /help for commands
            </div>
          </div>
        ) : (
          <div className="chat-messages">
            {messages.map((msg) => (
              <ChatMessageItem key={msg.id} msg={msg} />
            ))}
            {hierarchyStatus.isExecuting && (
              <TypingIndicator level={activeLevel} model={activeModel} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
