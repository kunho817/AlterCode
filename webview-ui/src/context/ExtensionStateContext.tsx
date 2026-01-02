import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type {
  AppState,
  ExtensionMessage,
  ChatMessage,
  Mission,
  Task,
  ActivityEntry,
  QuotaStatus,
  PendingApproval,
  ErrorInfo,
  RateLimitInfo,
  Settings,
} from '../types/messages';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';

// ============================================================================
// Initial State
// ============================================================================

const initialSettings: Settings = {
  approvalMode: 'step_by_step',
  showQuotaInStatusBar: true,
  notifyOnApprovalRequired: true,
  notifyOnQuotaWarning: true,
  maxDisplayEntries: 100,
  autoResolveSimpleConflicts: true,
};

const initialState: AppState = {
  messages: [],
  isStreaming: false,
  currentStreamingMessageId: null,
  activeMission: null,
  tasks: [],
  activities: [],
  quota: {
    providers: [],
    totalUsed: 0,
    totalLimit: 100,
  },
  pendingApprovals: [],
  sidebarTab: 'tasks',
  sidebarCollapsed: false,
  settings: initialSettings,
  currentError: null,
  rateLimitInfo: null,
};

// ============================================================================
// Actions
// ============================================================================

type StateAction =
  | { type: 'SET_STATE'; payload: AppState }
  | { type: 'PATCH_STATE'; payload: Partial<AppState> }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<ChatMessage> } }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_STREAMING'; payload: { isStreaming: boolean; messageId: string | null } }
  | { type: 'SET_MISSION'; payload: Mission | null }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'ADD_ACTIVITY'; payload: ActivityEntry }
  | { type: 'UPDATE_ACTIVITY'; payload: { id: string; updates: Partial<ActivityEntry> } }
  | { type: 'SET_QUOTA'; payload: QuotaStatus }
  | { type: 'ADD_APPROVAL'; payload: PendingApproval }
  | { type: 'REMOVE_APPROVAL'; payload: string }
  | { type: 'SET_ERROR'; payload: ErrorInfo | null }
  | { type: 'SET_RATE_LIMIT'; payload: RateLimitInfo | null }
  | { type: 'SET_SIDEBAR_TAB'; payload: 'tasks' | 'activity' | 'quota' }
  | { type: 'SET_SIDEBAR_COLLAPSED'; payload: boolean }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> };

// ============================================================================
// Reducer
// ============================================================================

function stateReducer(state: AppState, action: StateAction): AppState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload;

    case 'PATCH_STATE':
      return { ...state, ...action.payload };

    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };

    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.id ? { ...msg, ...action.payload.updates } : msg
        ),
      };

    case 'CLEAR_MESSAGES':
      return {
        ...state,
        messages: [],
      };

    case 'SET_STREAMING':
      return {
        ...state,
        isStreaming: action.payload.isStreaming,
        currentStreamingMessageId: action.payload.messageId,
      };

    case 'SET_MISSION':
      return {
        ...state,
        activeMission: action.payload,
      };

    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.some((t) => t.id === action.payload.id)
          ? state.tasks.map((t) => (t.id === action.payload.id ? action.payload : t))
          : [...state.tasks, action.payload],
      };

    case 'ADD_ACTIVITY':
      return {
        ...state,
        activities: [action.payload, ...state.activities].slice(0, state.settings.maxDisplayEntries),
      };

    case 'UPDATE_ACTIVITY':
      return {
        ...state,
        activities: state.activities.map((a) =>
          a.id === action.payload.id ? { ...a, ...action.payload.updates } : a
        ),
      };

    case 'SET_QUOTA':
      return {
        ...state,
        quota: action.payload,
      };

    case 'ADD_APPROVAL':
      return {
        ...state,
        pendingApprovals: [...state.pendingApprovals, action.payload],
      };

    case 'REMOVE_APPROVAL':
      return {
        ...state,
        pendingApprovals: state.pendingApprovals.filter((a) => a.id !== action.payload),
      };

    case 'SET_ERROR':
      return {
        ...state,
        currentError: action.payload,
      };

    case 'SET_RATE_LIMIT':
      return {
        ...state,
        rateLimitInfo: action.payload,
      };

    case 'SET_SIDEBAR_TAB':
      return {
        ...state,
        sidebarTab: action.payload,
      };

    case 'SET_SIDEBAR_COLLAPSED':
      return {
        ...state,
        sidebarCollapsed: action.payload,
      };

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };

    default:
      return state;
  }
}

// ============================================================================
// Context
// ============================================================================

interface ExtensionStateContextValue {
  state: AppState;
  dispatch: React.Dispatch<StateAction>;
  // Convenience actions
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearMessages: () => void;
  setSidebarTab: (tab: 'tasks' | 'activity' | 'quota') => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  clearError: () => void;
}

const ExtensionStateContext = createContext<ExtensionStateContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function ExtensionStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(stateReducer, initialState);
  const vscode = useVSCodeAPI();

  // Handle messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'state':
          dispatch({ type: 'SET_STATE', payload: message.state });
          break;

        case 'statePartial':
          dispatch({ type: 'PATCH_STATE', payload: message.patch });
          break;

        case 'streamStart':
          dispatch({
            type: 'SET_STREAMING',
            payload: { isStreaming: true, messageId: message.messageId },
          });
          break;

        case 'streamEnd':
          dispatch({
            type: 'SET_STREAMING',
            payload: { isStreaming: false, messageId: null },
          });
          break;

        case 'error':
          dispatch({ type: 'SET_ERROR', payload: message.error });
          break;

        case 'errorClear':
          dispatch({ type: 'SET_ERROR', payload: null });
          break;

        case 'rateLimitStart':
          dispatch({
            type: 'SET_RATE_LIMIT',
            payload: {
              retryAfterMs: message.retryAfterMs,
              provider: message.provider,
              startTime: Date.now(),
            },
          });
          break;

        case 'rateLimitEnd':
          dispatch({ type: 'SET_RATE_LIMIT', payload: null });
          break;

        case 'missionCreated':
        case 'missionUpdated':
          dispatch({ type: 'SET_MISSION', payload: message.mission });
          break;

        case 'taskUpdated':
          dispatch({ type: 'UPDATE_TASK', payload: message.task });
          break;

        case 'approvalRequired':
          dispatch({ type: 'ADD_APPROVAL', payload: message.approval });
          break;

        case 'approvalResolved':
          dispatch({ type: 'REMOVE_APPROVAL', payload: message.approvalId });
          break;

        case 'activityStarted':
          dispatch({ type: 'ADD_ACTIVITY', payload: message.activity });
          break;

        case 'activityCompleted':
          dispatch({
            type: 'UPDATE_ACTIVITY',
            payload: { id: message.activityId, updates: { status: 'completed' } },
          });
          break;

        case 'activityFailed':
          dispatch({
            type: 'UPDATE_ACTIVITY',
            payload: { id: message.activityId, updates: { status: 'failed' } },
          });
          break;

        case 'quotaUpdated':
          dispatch({ type: 'SET_QUOTA', payload: message.status });
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Persist state to VS Code
  useEffect(() => {
    vscode.setState(state);
  }, [state, vscode]);

  // Convenience actions
  const addMessage = useCallback((message: ChatMessage) => {
    dispatch({ type: 'ADD_MESSAGE', payload: message });
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { id, updates } });
  }, []);

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  const setSidebarTab = useCallback((tab: 'tasks' | 'activity' | 'quota') => {
    dispatch({ type: 'SET_SIDEBAR_TAB', payload: tab });
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    dispatch({ type: 'SET_SIDEBAR_COLLAPSED', payload: collapsed });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  const value: ExtensionStateContextValue = {
    state,
    dispatch,
    addMessage,
    updateMessage,
    clearMessages,
    setSidebarTab,
    setSidebarCollapsed,
    clearError,
  };

  return (
    <ExtensionStateContext.Provider value={value}>
      {children}
    </ExtensionStateContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useExtensionState(): ExtensionStateContextValue {
  const context = useContext(ExtensionStateContext);
  if (!context) {
    throw new Error('useExtensionState must be used within ExtensionStateProvider');
  }
  return context;
}
