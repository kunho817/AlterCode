import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ExtensionMessage, ToolCall } from '../types/messages';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';

// ============================================================================
// Types
// ============================================================================

interface StreamingMessage {
  id: string;
  content: string;
  isThinking: boolean;
  toolCalls: ToolCall[];
  model?: string;
}

interface StreamingContextValue {
  // State
  isStreaming: boolean;
  currentMessage: StreamingMessage | null;

  // Actions
  cancelStream: () => void;
}

// ============================================================================
// Context
// ============================================================================

const StreamingContext = createContext<StreamingContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function StreamingProvider({ children }: { children: React.ReactNode }) {
  const vscode = useVSCodeAPI();
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<StreamingMessage | null>(null);

  // Use ref to avoid stale closure issues
  const currentMessageRef = useRef<StreamingMessage | null>(null);
  currentMessageRef.current = currentMessage;

  // Handle streaming messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'streamStart':
          setIsStreaming(true);
          setCurrentMessage({
            id: message.messageId,
            content: '',
            isThinking: false,
            toolCalls: [],
            model: message.model,
          });
          break;

        case 'streamChunk':
          if (currentMessageRef.current?.id === message.messageId) {
            setCurrentMessage((prev) =>
              prev
                ? {
                    ...prev,
                    content: prev.content + message.content,
                    isThinking: message.thinking ?? false,
                  }
                : null
            );
          }
          break;

        case 'streamToolCall':
          if (currentMessageRef.current?.id === message.messageId) {
            const newToolCall: ToolCall = {
              id: message.toolCallId,
              name: message.tool,
              args: message.args,
              status: 'running',
            };
            setCurrentMessage((prev) =>
              prev
                ? {
                    ...prev,
                    toolCalls: [...prev.toolCalls, newToolCall],
                  }
                : null
            );
          }
          break;

        case 'streamToolResult':
          if (currentMessageRef.current?.id === message.messageId) {
            setCurrentMessage((prev) =>
              prev
                ? {
                    ...prev,
                    toolCalls: prev.toolCalls.map((tc) =>
                      tc.id === message.toolCallId
                        ? { ...tc, result: message.result, status: 'completed' as const }
                        : tc
                    ),
                  }
                : null
            );
          }
          break;

        case 'streamEnd':
          if (currentMessageRef.current?.id === message.messageId) {
            setIsStreaming(false);
            // Keep the message around briefly for final render
            setTimeout(() => {
              if (currentMessageRef.current?.id === message.messageId) {
                setCurrentMessage(null);
              }
            }, 100);
          }
          break;

        case 'streamError':
          if (currentMessageRef.current?.id === message.messageId) {
            setIsStreaming(false);
            setCurrentMessage(null);
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const cancelStream = useCallback(() => {
    vscode.postMessage({ type: 'chat:cancel' });
    setIsStreaming(false);
    setCurrentMessage(null);
  }, [vscode]);

  const value: StreamingContextValue = {
    isStreaming,
    currentMessage,
    cancelStream,
  };

  return <StreamingContext.Provider value={value}>{children}</StreamingContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useStreaming(): StreamingContextValue {
  const context = useContext(StreamingContext);
  if (!context) {
    throw new Error('useStreaming must be used within StreamingProvider');
  }
  return context;
}
