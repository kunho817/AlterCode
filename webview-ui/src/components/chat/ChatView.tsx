import { useRef, useEffect } from 'react';
import { useExtensionState } from '../../context/ExtensionStateContext';
import { useStreaming } from '../../context/StreamingContext';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { StreamingMessage } from './StreamingMessage';
import { ErrorBanner } from '../errors/ErrorBanner';
import './ChatView.css';

export function ChatView() {
  const { state, clearError } = useExtensionState();
  const { isStreaming, currentMessage, cancelStream } = useStreaming();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.messages, currentMessage?.content]);

  return (
    <div className="chat-view">
      {/* Error Banner */}
      {state.currentError && (
        <ErrorBanner
          error={state.currentError}
          onDismiss={clearError}
        />
      )}

      {/* Rate Limit Banner */}
      {state.rateLimitInfo && (
        <div className="rate-limit-banner">
          <span className="rate-limit-icon">⏳</span>
          <span>Rate limited by {state.rateLimitInfo.provider}. Retrying...</span>
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {state.messages.length === 0 && !isStreaming ? (
          <div className="chat-empty">
            <div className="chat-empty-content">
              <h2>Welcome to AlterCode</h2>
              <p>Start a conversation or create a new mission to get started.</p>
            </div>
          </div>
        ) : (
          <>
            {state.messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {/* Streaming message */}
            {isStreaming && currentMessage && (
              <StreamingMessage
                content={currentMessage.content}
                isThinking={currentMessage.isThinking}
                toolCalls={currentMessage.toolCalls}
              />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        disabled={isStreaming}
        onCancel={isStreaming ? cancelStream : undefined}
      />
    </div>
  );
}
