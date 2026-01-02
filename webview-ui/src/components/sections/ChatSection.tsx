/**
 * Chat Section
 * Chat interface with agent roles and inline approvals
 */

import React from 'react';
import { useChatMessages, useApp } from '../../context/AppContext';
import { actions } from '../../hooks/useVSCodeAPI';
import { ChatMessage } from '../../types';

interface ChatSectionProps {
  active: boolean;
}

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

// Single chat message component
function ChatMessageItem({ msg }: { msg: ChatMessage }) {
  const time = formatTime(msg.timestamp);
  const hasApproval = msg.approval && msg.approval.status === 'pending';

  return (
    <div className={`chat-msg ${msg.role}`}>
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
  const messagesRef = React.useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  React.useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const handleClear = () => {
    dispatch({ type: 'CLEAR_CHAT' });
  };

  return (
    <div className={`section ${active ? 'active' : ''}`}>
      <div className="section-header">
        <span className="section-title">Chat</span>
        <div className="section-actions">
          <button className="icon-btn" onClick={handleClear} title="Clear">
            ✕
          </button>
        </div>
      </div>
      <div className="section-body" ref={messagesRef}>
        {messages.length === 0 ? (
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
          </div>
        )}
      </div>
    </div>
  );
}
