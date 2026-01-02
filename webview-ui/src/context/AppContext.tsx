/**
 * App Context
 * Global state management for Mission Control
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import {
  AppState,
  ChatMessage,
  Mission,
  Activity,
  AgentNode,
  QuotaState,
  UsageHistory,
  PendingApproval,
  Conflict,
  PerformanceState,
  Settings,
  MissionProgress,
  ExtensionMessage,
  Section,
  ApprovalMode,
} from '../types';
import { actions } from '../hooks/useVSCodeAPI';

// Initial state
const initialState: AppState = {
  activeMissions: [],
  chatMessages: [],
  activities: [],
  agents: null,
  quota: null,
  usageHistory: { claude: [], glm: [] },
  pendingApprovals: [],
  conflicts: [],
  performance: null,
  settings: {},
  approvalMode: 'step_by_step',
};

// Action types
type Action =
  | { type: 'STATE_UPDATE'; payload: Partial<AppState> }
  | { type: 'SETTINGS_UPDATE'; payload: Settings }
  | { type: 'CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'MISSION_CREATED'; payload: Mission }
  | { type: 'PROGRESS_UPDATE'; payload: { missionId: string; progress: MissionProgress } }
  | { type: 'AGENT_UPDATE'; payload: AgentNode }
  | { type: 'ACTIVITY_UPDATE'; payload: Activity[] }
  | { type: 'QUOTA_UPDATE'; payload: QuotaState }
  | { type: 'USAGE_HISTORY_UPDATE'; payload: UsageHistory }
  | { type: 'APPROVALS_UPDATE'; payload: PendingApproval[] }
  | { type: 'CONFLICTS_UPDATE'; payload: Conflict[] }
  | { type: 'PERFORMANCE_UPDATE'; payload: PerformanceState }
  | { type: 'CLEAR_CHAT' }
  | { type: 'SET_APPROVAL_MODE'; payload: ApprovalMode };

// Reducer
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'STATE_UPDATE':
      return { ...state, ...action.payload };

    case 'SETTINGS_UPDATE':
      return { ...state, settings: action.payload };

    case 'CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };

    case 'MISSION_CREATED':
      return { ...state, activeMissions: [...state.activeMissions, action.payload] };

    case 'PROGRESS_UPDATE': {
      const { missionId, progress } = action.payload;
      return {
        ...state,
        activeMissions: state.activeMissions.map((m) =>
          m.id === missionId ? { ...m, progress } : m
        ),
      };
    }

    case 'AGENT_UPDATE':
      return { ...state, agents: action.payload };

    case 'ACTIVITY_UPDATE':
      return { ...state, activities: action.payload };

    case 'QUOTA_UPDATE':
      return { ...state, quota: action.payload };

    case 'USAGE_HISTORY_UPDATE':
      return { ...state, usageHistory: action.payload };

    case 'APPROVALS_UPDATE':
      return { ...state, pendingApprovals: action.payload };

    case 'CONFLICTS_UPDATE':
      return { ...state, conflicts: action.payload };

    case 'PERFORMANCE_UPDATE':
      return { ...state, performance: action.payload };

    case 'CLEAR_CHAT':
      return { ...state, chatMessages: [] };

    case 'SET_APPROVAL_MODE':
      return { ...state, approvalMode: action.payload };

    default:
      return state;
  }
}

// Context types
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  currentSection: Section;
  setCurrentSection: (section: Section) => void;
  activityFilter: string;
  setActivityFilter: (filter: string) => void;
  activitySearch: string;
  setActivitySearch: (search: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

// Provider
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [currentSection, setCurrentSection] = React.useState<Section>('chat');
  const [activityFilter, setActivityFilter] = React.useState('all');
  const [activitySearch, setActivitySearch] = React.useState('');

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'stateUpdate':
          dispatch({ type: 'STATE_UPDATE', payload: message.payload as Partial<AppState> });
          break;

        case 'settingsUpdate':
          dispatch({ type: 'SETTINGS_UPDATE', payload: message.payload as Settings });
          break;

        case 'chatMessage':
          dispatch({ type: 'CHAT_MESSAGE', payload: message.payload as ChatMessage });
          break;

        case 'missionCreated':
          dispatch({ type: 'MISSION_CREATED', payload: message.payload as Mission });
          break;

        case 'progressUpdate': {
          const { missionId, progress } = message.payload as {
            missionId: string;
            progress: MissionProgress;
          };
          dispatch({ type: 'PROGRESS_UPDATE', payload: { missionId, progress } });
          break;
        }

        case 'agentUpdate':
          dispatch({ type: 'AGENT_UPDATE', payload: message.payload as AgentNode });
          break;

        case 'activityUpdate':
          dispatch({ type: 'ACTIVITY_UPDATE', payload: message.payload as Activity[] });
          break;

        case 'quotaUpdate':
          dispatch({ type: 'QUOTA_UPDATE', payload: message.payload as QuotaState });
          break;

        case 'usageHistoryUpdate':
          dispatch({ type: 'USAGE_HISTORY_UPDATE', payload: message.payload as UsageHistory });
          break;

        case 'approvalsUpdate':
          dispatch({ type: 'APPROVALS_UPDATE', payload: message.payload as PendingApproval[] });
          break;

        case 'conflictsUpdate':
          dispatch({ type: 'CONFLICTS_UPDATE', payload: message.payload as Conflict[] });
          break;

        case 'performanceUpdate':
          dispatch({ type: 'PERFORMANCE_UPDATE', payload: message.payload as PerformanceState });
          break;

        case 'taskStarted':
        case 'taskCompleted':
        case 'warnings':
          // Refresh state
          actions.refresh();
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Request initial settings
    actions.getSettings();

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        currentSection,
        setCurrentSection,
        activityFilter,
        setActivityFilter,
        activitySearch,
        setActivitySearch,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// Hook
export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

// Selector hooks
export function useChatMessages() {
  const { state } = useApp();
  return state.chatMessages;
}

export function useMissions() {
  const { state } = useApp();
  return state.activeMissions;
}

export function useActivities() {
  const { state, activityFilter, activitySearch } = useApp();
  return state.activities.filter((a) => {
    if (activityFilter !== 'all' && a.status !== activityFilter) return false;
    if (activitySearch && !JSON.stringify(a).toLowerCase().includes(activitySearch.toLowerCase())) {
      return false;
    }
    return true;
  });
}

export function useAgents() {
  const { state } = useApp();
  return state.agents;
}

export function useQuota() {
  const { state } = useApp();
  return state.quota;
}

export function useApprovals() {
  const { state } = useApp();
  return state.pendingApprovals;
}

export function useConflicts() {
  const { state } = useApp();
  return state.conflicts;
}

export function usePerformance() {
  const { state } = useApp();
  return state.performance;
}

export function useSettings() {
  const { state } = useApp();
  return state.settings;
}
