/**
 * VS Code API Hook
 * Provides access to the VS Code webview API
 */

import { VSCodeAPI } from '../types';

// Acquire VS Code API (only once)
declare function acquireVsCodeApi(): VSCodeAPI;

let vscodeApi: VSCodeAPI | null = null;

export function getVSCodeAPI(): VSCodeAPI {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

// Message sending helpers
export function postMessage(type: string, payload?: Record<string, unknown>): void {
  const api = getVSCodeAPI();
  api.postMessage({ type, ...(payload || {}) });
}

// Specific message actions matching MissionControlPanel
export const actions = {
  // Mission actions
  cancelMission: (missionId: string) => postMessage('cancelMission', { missionId }),
  pauseMission: (missionId: string) => postMessage('pauseMission', { missionId }),
  resumeMission: (missionId: string) => postMessage('resumeMission', { missionId }),
  rollbackMission: (missionId: string) => postMessage('rollbackMission', { missionId }),
  clearCompleted: () => postMessage('clearCompleted'),
  newMission: () => postMessage('sendCommand', { command: '/mission' }),

  // Task actions
  retryTask: (taskId: string) => postMessage('retryTask', { taskId }),
  viewDetails: (type: string, id: string) => postMessage('viewDetails', { detailType: type, id }),

  // Chat actions
  sendMessage: (content: string) => postMessage('sendMessage', { content }),
  sendCommand: (command: string) => postMessage('sendCommand', { command }),

  // Approval actions
  approveChange: (approvalId: string) => postMessage('approveChange', { approvalId }),
  rejectChange: (approvalId: string, reason?: string) => postMessage('rejectChange', { approvalId, reason }),
  viewDiff: (approvalId: string) => postMessage('viewDiff', { approvalId }),
  approveTask: () => postMessage('approveTask'),
  setApprovalMode: () => postMessage('setApprovalMode'),
  approveAll: () => postMessage('approveAll'),

  // Agent actions
  pauseAgent: (agentId: string) => postMessage('pauseAgent', { agentId }),
  resumeAgent: (agentId: string) => postMessage('resumeAgent', { agentId }),
  pauseAll: () => postMessage('pauseAll'),
  resumeAll: () => postMessage('resumeAll'),

  // Activity actions
  exportActivity: (activities: unknown[]) => postMessage('exportActivity', { activities }),

  // Conflict actions
  showConflicts: () => postMessage('showConflicts'),
  viewConflictDiff: (conflictId: string) => postMessage('viewConflictDiff', { conflictId }),
  resolveConflict: (conflictId: string, strategy: 'auto' | 'ai' | 'manual') =>
    postMessage('resolveConflict', { conflictId, strategy }),

  // Settings actions
  openSettings: () => postMessage('openSettings'),
  updateSetting: (key: string, value: unknown) => postMessage('updateSetting', { key, value }),
  getSettings: () => postMessage('getSettings'),
  getPerformance: () => postMessage('getPerformance'),

  // General
  refresh: () => postMessage('refresh'),
};
