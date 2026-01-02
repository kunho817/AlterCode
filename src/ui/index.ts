/**
 * UI Layer
 *
 * Re-exports all UI layer implementations:
 * - MissionControlPanel (WebView panel)
 * - ChatProvider (Chat interface)
 * - ConflictResolutionPanel (Conflict resolution webview)
 */

// Mission Control Panel
export { MissionControlPanel } from './MissionControlPanel';

// Chat Provider
export { ChatProvider } from './ChatProvider';

// Approval UI
export { ApprovalUI, createApprovalUI } from './ApprovalUI';

// Conflict Resolution Panel
export { ConflictResolutionPanel, createConflictResolutionPanel } from './ConflictResolutionPanel';
