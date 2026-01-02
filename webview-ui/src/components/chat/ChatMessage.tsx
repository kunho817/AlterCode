import type { ChatMessage as ChatMessageType } from '../../types/messages';
import { ToolCallCard } from './ToolCallCard';
import './ChatMessage.css';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`chat-message chat-message-${message.role}`}>
      <div className="message-avatar">
        {isUser ? (
          <span className="avatar-icon">👤</span>
        ) : (
          <span className="avatar-icon">🤖</span>
        )}
      </div>

      <div className="message-content">
        <div className="message-header">
          <span className="message-role">{isUser ? 'You' : 'AlterCode'}</span>
          <span className="message-time">
            {formatTime(message.timestamp)}
          </span>
        </div>

        <div className="message-body">
          {message.content ? (
            <div className="message-text">{message.content}</div>
          ) : message.isStreaming ? (
            <div className="message-streaming">
              <span className="blinking-cursor" />
            </div>
          ) : null}

          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="message-tool-calls">
              {message.toolCalls.map((toolCall) => (
                <ToolCallCard key={toolCall.id} toolCall={toolCall} />
              ))}
            </div>
          )}

          {/* Error */}
          {message.error && (
            <div className="message-error">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{message.error.message}</span>
            </div>
          )}
        </div>

        {/* Usage stats */}
        {message.usage && (
          <div className="message-usage">
            <span className="usage-item">
              Tokens: {message.usage.totalTokens.toLocaleString()}
            </span>
            {message.usage.cost !== undefined && (
              <span className="usage-item">
                Cost: ${message.usage.cost.toFixed(4)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(date: Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}
