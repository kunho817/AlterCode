import { useState, useEffect, useCallback, useRef } from 'react';
import type { ExtensionMessage, ChatMessage, ToolCall } from '../types/messages';

interface StreamingState {
  isStreaming: boolean;
  currentMessageId: string | null;
  currentContent: string;
  isThinking: boolean;
  toolCalls: ToolCall[];
}

interface UseStreamingReturn extends StreamingState {
  reset: () => void;
}

/**
 * Hook to manage streaming message state
 *
 * Handles streamStart, streamChunk, streamToolCall, streamToolResult, and streamEnd
 * messages from the extension host.
 */
export function useStreaming(): UseStreamingReturn {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    currentMessageId: null,
    currentContent: '',
    isThinking: false,
    toolCalls: [],
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const reset = useCallback(() => {
    setState({
      isStreaming: false,
      currentMessageId: null,
      currentContent: '',
      isThinking: false,
      toolCalls: [],
    });
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'streamStart':
          setState({
            isStreaming: true,
            currentMessageId: message.messageId,
            currentContent: '',
            isThinking: false,
            toolCalls: [],
          });
          break;

        case 'streamChunk':
          if (message.messageId === stateRef.current.currentMessageId) {
            setState((prev) => ({
              ...prev,
              currentContent: prev.currentContent + message.content,
              isThinking: message.thinking ?? false,
            }));
          }
          break;

        case 'streamToolCall':
          if (message.messageId === stateRef.current.currentMessageId) {
            const newToolCall: ToolCall = {
              id: message.toolCallId,
              name: message.tool,
              args: message.args,
              status: 'running',
            };
            setState((prev) => ({
              ...prev,
              toolCalls: [...prev.toolCalls, newToolCall],
            }));
          }
          break;

        case 'streamToolResult':
          if (message.messageId === stateRef.current.currentMessageId) {
            setState((prev) => ({
              ...prev,
              toolCalls: prev.toolCalls.map((tc) =>
                tc.id === message.toolCallId
                  ? { ...tc, result: message.result, status: 'completed' }
                  : tc
              ),
            }));
          }
          break;

        case 'streamEnd':
          if (message.messageId === stateRef.current.currentMessageId) {
            setState((prev) => ({
              ...prev,
              isStreaming: false,
            }));
          }
          break;

        case 'streamError':
          if (message.messageId === stateRef.current.currentMessageId) {
            setState((prev) => ({
              ...prev,
              isStreaming: false,
            }));
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return {
    ...state,
    reset,
  };
}

/**
 * Build a ChatMessage from streaming state
 */
export function buildStreamingMessage(
  streaming: StreamingState,
  _model?: string
): ChatMessage | null {
  if (!streaming.currentMessageId) {
    return null;
  }

  return {
    id: streaming.currentMessageId,
    role: 'assistant',
    content: streaming.currentContent,
    timestamp: new Date(),
    isStreaming: streaming.isStreaming,
    isThinking: streaming.isThinking,
    toolCalls: streaming.toolCalls.length > 0 ? streaming.toolCalls : undefined,
  };
}
