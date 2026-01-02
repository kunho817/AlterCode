import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { useVSCodeAPI } from '../../hooks/useVSCodeAPI';
import './ChatInput.css';

interface ChatInputProps {
  disabled?: boolean;
  onCancel?: () => void;
}

export function ChatInput({ disabled, onCancel }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const vscode = useVSCodeAPI();

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    vscode.postMessage({
      type: 'chat:send',
      content: trimmed,
    });

    setValue('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, vscode]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Send on Enter (without Shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    // Auto-resize textarea
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, []);

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <button className="attach-button" title="Attach file">
          <span className="codicon codicon-attach" />
        </button>

        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder="Type a message..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          rows={1}
        />

        {disabled && onCancel ? (
          <button className="cancel-button" onClick={onCancel} title="Cancel">
            <span className="codicon codicon-close" />
          </button>
        ) : (
          <button
            className="send-button"
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            title="Send message"
          >
            <span className="codicon codicon-send" />
          </button>
        )}
      </div>

      <div className="chat-input-hint">
        Press <kbd>Enter</kbd> to send, <kbd>Shift+Enter</kbd> for new line
      </div>
    </div>
  );
}
