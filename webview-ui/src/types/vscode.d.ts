/**
 * VS Code Webview API type declarations
 */

interface VSCodeAPI {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

declare global {
  interface Window {
    acquireVsCodeApi?: () => VSCodeAPI;
  }
}

export { VSCodeAPI };
