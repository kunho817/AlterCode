import type { ToolCall } from '../../types/messages';
import { ToolCallCard } from './ToolCallCard';
import { ThinkingIndicator } from '../common/LoadingIndicator';
import './StreamingMessage.css';

interface StreamingMessageProps {
  content: string;
  isThinking: boolean;
  toolCalls: ToolCall[];
}

export function StreamingMessage({ content, isThinking, toolCalls }: StreamingMessageProps) {
  return (
    <div className="streaming-message chat-message chat-message-assistant">
      <div className="message-avatar">
        <span className="avatar-icon">🤖</span>
      </div>

      <div className="message-content">
        <div className="message-header">
          <span className="message-role">AlterCode</span>
          <span className="streaming-badge">
            <span className="streaming-dot" />
            Streaming
          </span>
        </div>

        <div className="message-body">
          {isThinking && (
            <div className="thinking-section">
              <span className="thinking-label">Thinking</span>
              <ThinkingIndicator />
            </div>
          )}

          {content && (
            <div className="message-text">
              {content}
              <span className="blinking-cursor" />
            </div>
          )}

          {!content && !isThinking && (
            <div className="message-text">
              <span className="blinking-cursor" />
            </div>
          )}

          {/* Tool calls */}
          {toolCalls.length > 0 && (
            <div className="message-tool-calls">
              {toolCalls.map((toolCall) => (
                <ToolCallCard key={toolCall.id} toolCall={toolCall} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
