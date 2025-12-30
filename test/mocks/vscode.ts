/**
 * VS Code API Mocks
 *
 * Mocks for VS Code APIs used in tests.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const Uri = {
  file: (path: string) => ({
    fsPath: path,
    path,
    scheme: 'file',
    toString: () => `file://${path}`,
  }),
  parse: (uri: string) => ({
    fsPath: uri.replace('file://', ''),
    path: uri.replace('file://', ''),
    scheme: 'file',
    toString: () => uri,
  }),
};

export const workspace = {
  fs: {
    readFile: jest.fn().mockResolvedValue(Buffer.from('')),
    writeFile: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    createDirectory: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ type: 1 }),
  },
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn().mockImplementation((key: string, defaultValue: any) => defaultValue),
    update: jest.fn().mockResolvedValue(undefined),
  }),
  onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  workspaceFolders: [{ uri: Uri.file('/workspace'), name: 'workspace', index: 0 }],
  registerTextDocumentContentProvider: jest.fn().mockReturnValue({ dispose: jest.fn() }),
};

export const window = {
  showInformationMessage: jest.fn().mockResolvedValue(undefined),
  showWarningMessage: jest.fn().mockResolvedValue(undefined),
  showErrorMessage: jest.fn().mockResolvedValue(undefined),
  showQuickPick: jest.fn().mockResolvedValue(undefined),
  showInputBox: jest.fn().mockResolvedValue(undefined),
  createStatusBarItem: jest.fn().mockReturnValue({
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
    text: '',
    tooltip: '',
    command: '',
  }),
  createOutputChannel: jest.fn().mockReturnValue({
    appendLine: jest.fn(),
    append: jest.fn(),
    clear: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  }),
  createWebviewPanel: jest.fn().mockReturnValue({
    webview: {
      html: '',
      postMessage: jest.fn().mockResolvedValue(true),
      onDidReceiveMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    },
    reveal: jest.fn(),
    dispose: jest.fn(),
    onDidDispose: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  }),
  registerWebviewViewProvider: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  activeTextEditor: undefined,
};

export const commands = {
  registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  executeCommand: jest.fn().mockResolvedValue(undefined),
};

export const EventEmitter = class {
  private listeners: Map<string, Function[]> = new Map();

  fire(data: any): void {
    const listeners = this.listeners.get('event') || [];
    listeners.forEach((l) => l(data));
  }

  event = (listener: Function) => {
    const listeners = this.listeners.get('event') || [];
    listeners.push(listener);
    this.listeners.set('event', listeners);
    return { dispose: () => {} };
  };

  dispose(): void {
    this.listeners.clear();
  }
};

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
}

export const languages = {
  registerCodeActionsProvider: jest.fn().mockReturnValue({ dispose: jest.fn() }),
};

export const ExtensionContext = {
  subscriptions: [],
  extensionPath: '/extension',
  extensionUri: Uri.file('/extension'),
  globalState: {
    get: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  },
  workspaceState: {
    get: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  },
  secrets: {
    get: jest.fn().mockResolvedValue(undefined),
    store: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  },
};
