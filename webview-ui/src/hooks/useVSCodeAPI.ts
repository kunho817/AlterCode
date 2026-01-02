import { useMemo } from 'react';
import type { WebviewMessage } from '../types/messages';

interface VSCodeAPI {
  postMessage(message: WebviewMessage): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

/**
 * Hook to access the VS Code webview API
 *
 * Provides a type-safe wrapper around the VS Code API with
 * proper handling for development mode (outside VS Code).
 */
export function useVSCodeAPI(): VSCodeAPI {
  const vscode = useMemo(() => {
    // Check if running inside VS Code webview
    if (typeof window !== 'undefined' && window.acquireVsCodeApi) {
      try {
        return window.acquireVsCodeApi();
      } catch {
        // API already acquired, use cached version
        console.warn('VS Code API already acquired');
      }
    }

    // Development mode mock
    console.log('[Dev Mode] VS Code API not available, using mock');

    return {
      postMessage: (message: WebviewMessage) => {
        console.log('[Dev Mode] postMessage:', message);
        // In dev mode, simulate some responses for testing
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'mock:received', original: message },
          })
        );
      },
      getState: <T>(): T | undefined => {
        const stored = localStorage.getItem('vscode-state');
        return stored ? JSON.parse(stored) : undefined;
      },
      setState: <T>(state: T) => {
        localStorage.setItem('vscode-state', JSON.stringify(state));
      },
    };
  }, []);

  return vscode as VSCodeAPI;
}
