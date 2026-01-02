# AlterCode v2 UI Migration Strategy

## Executive Summary

This document outlines the strategy for migrating AlterCode's UI from embedded HTML strings to a React-based architecture, implementing streaming responses, and adding Roo-style error handling.

**Goals:**
- Improve UI performance and responsiveness
- Enable real-time streaming for all operations
- Provide detailed, actionable error feedback
- Create a maintainable, extensible UI foundation

---

## 1. Current State Analysis

### 1.1 Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Extension Host (Node.js)                                    │
├─────────────────────────────────────────────────────────────┤
│ UI Components (5,450 lines total):                          │
│ ├── MissionControlPanel.ts (2,889 lines) - Main panel       │
│ ├── ConflictResolutionPanel.ts (911 lines) - Conflicts      │
│ ├── ChatProvider.ts (659 lines) - Chat interface            │
│ ├── ApprovalUI.ts (604 lines) - Approval dialogs            │
│ └── AlterCodeActionProvider.ts (359 lines) - Code actions   │
├─────────────────────────────────────────────────────────────┤
│ Problems:                                                   │
│ • HTML embedded as template strings in TypeScript           │
│ • CSS embedded inline, hard to maintain                     │
│ • No component reuse across panels                          │
│ • Blocking API calls (no streaming to UI)                   │
│ • Generic error messages                                    │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Current Message Flow (Blocking)

```
User Input → ChatProvider.handleUserMessage()
           → core.processMessage() [BLOCKING - waits for full response]
           → postMessage({ type: 'assistantMessage', ... })
           → UI displays complete message
```

### 1.3 Current Limitations

| Area | Current State | Impact |
|------|---------------|--------|
| **Streaming** | Adapter supports it, UI doesn't use it | Users wait without feedback |
| **Error Display** | `Error: ${message}` | No actionable guidance |
| **Performance** | Full HTML regeneration on updates | Laggy, unoptimized |
| **Maintainability** | 2,889-line monolithic file | Hard to modify |
| **State Management** | Scattered across components | Inconsistent UI state |

---

## 2. Target Architecture

### 2.1 New Project Structure

```
altercode-v2/
├── src/                          # Extension host (existing)
│   ├── core/
│   ├── llm/
│   ├── protocol/
│   └── webview/                  # NEW: Webview coordination
│       ├── WebviewProvider.ts    # Central orchestrator (like ClineProvider)
│       ├── messages/
│       │   ├── ExtensionMessage.ts  # Host → Webview messages
│       │   └── WebviewMessage.ts    # Webview → Host messages
│       └── handlers/
│           ├── ChatHandler.ts
│           ├── TaskHandler.ts
│           └── ErrorHandler.ts
│
├── webview-ui/                   # NEW: React application
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── ChatView.tsx
│   │   │   │   ├── ChatInput.tsx
│   │   │   │   ├── ChatMessage.tsx
│   │   │   │   └── StreamingText.tsx
│   │   │   ├── mission/
│   │   │   │   ├── MissionPanel.tsx
│   │   │   │   ├── TaskList.tsx
│   │   │   │   └── ActivityLog.tsx
│   │   │   ├── errors/
│   │   │   │   ├── ErrorBanner.tsx
│   │   │   │   ├── RetryButton.tsx
│   │   │   │   └── RateLimitCountdown.tsx
│   │   │   └── common/
│   │   │       ├── CodeBlock.tsx
│   │   │       ├── Markdown.tsx
│   │   │       └── LoadingIndicator.tsx
│   │   ├── context/
│   │   │   ├── ExtensionStateContext.tsx
│   │   │   └── StreamingContext.tsx
│   │   ├── hooks/
│   │   │   ├── useVSCodeAPI.ts
│   │   │   ├── useStreaming.ts
│   │   │   └── useErrorHandling.ts
│   │   └── types/
│   │       └── messages.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
└── package.json                  # Workspace root
```

### 2.2 Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ App.tsx                                                     │
│ └── ExtensionStateProvider                                  │
│     └── StreamingProvider                                   │
│         ├── ChatView (main chat interface)                  │
│         │   ├── MessageList                                 │
│         │   │   └── ChatMessage (per message)               │
│         │   │       ├── UserMessage                         │
│         │   │       ├── AssistantMessage                    │
│         │   │       │   └── StreamingText                   │
│         │   │       └── ToolExecutionMessage                │
│         │   ├── ChatInput                                   │
│         │   │   ├── TextArea                                │
│         │   │   ├── AttachmentButton                        │
│         │   │   └── SendButton                              │
│         │   └── ErrorBanner (when errors occur)             │
│         │       ├── ErrorMessage                            │
│         │       ├── RetryButton                             │
│         │       └── RateLimitCountdown                      │
│         │                                                   │
│         ├── MissionPanel (collapsible sidebar)              │
│         │   ├── MissionHeader                               │
│         │   ├── TaskList                                    │
│         │   └── QuotaWidget                                 │
│         │                                                   │
│         └── ActivityLog (bottom panel)                      │
│             └── ActivityEntry (per activity)                │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Message Protocol Design

### 3.1 ExtensionMessage (Host → Webview)

```typescript
// src/webview/messages/ExtensionMessage.ts

export type ExtensionMessage =
  // State synchronization
  | { type: 'state'; state: AppState }
  | { type: 'statePartial'; patch: Partial<AppState> }

  // Streaming
  | { type: 'streamStart'; messageId: string; model: string }
  | { type: 'streamChunk'; messageId: string; content: string; thinking?: boolean }
  | { type: 'streamToolCall'; messageId: string; tool: string; args: string }
  | { type: 'streamToolResult'; messageId: string; tool: string; result: string }
  | { type: 'streamEnd'; messageId: string; usage?: TokenUsage }
  | { type: 'streamError'; messageId: string; error: ErrorInfo }

  // Errors
  | { type: 'error'; error: ErrorInfo }
  | { type: 'errorClear' }
  | { type: 'rateLimitStart'; retryAfterMs: number; provider: string }
  | { type: 'rateLimitEnd' }

  // Tasks & Missions
  | { type: 'missionCreated'; mission: Mission }
  | { type: 'missionUpdated'; mission: Mission }
  | { type: 'taskUpdated'; task: Task }
  | { type: 'taskProgress'; taskId: string; progress: number; message: string }

  // Approvals
  | { type: 'approvalRequired'; approval: PendingApproval }
  | { type: 'approvalResolved'; approvalId: string }

  // Activity
  | { type: 'activityStarted'; activity: ActivityEntry }
  | { type: 'activityCompleted'; activityId: string; result: string }
  | { type: 'activityFailed'; activityId: string; error: string }

  // Quota
  | { type: 'quotaUpdated'; status: QuotaStatus };

export interface ErrorInfo {
  code: string;
  message: string;
  category: 'network' | 'rate_limit' | 'validation' | 'timeout' | 'provider' | 'unknown';
  retryable: boolean;
  retryAfterMs?: number;
  suggestion?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}
```

### 3.2 WebviewMessage (Webview → Host)

```typescript
// src/webview/messages/WebviewMessage.ts

export type WebviewMessage =
  // Chat
  | { type: 'chat:send'; content: string; attachments?: Attachment[] }
  | { type: 'chat:cancel' }
  | { type: 'chat:retry'; messageId: string }
  | { type: 'chat:clear' }
  | { type: 'chat:regenerate'; messageId: string }

  // Approvals
  | { type: 'approval:respond'; approvalId: string; action: 'approve' | 'reject' | 'modify' }
  | { type: 'approval:reviewHunks'; approvalId: string }

  // Tasks
  | { type: 'task:cancel'; taskId: string }
  | { type: 'task:retry'; taskId: string }

  // Settings
  | { type: 'settings:update'; settings: Partial<Settings> }
  | { type: 'settings:setApprovalMode'; mode: ApprovalMode }

  // Navigation
  | { type: 'nav:openFile'; path: string; line?: number }
  | { type: 'nav:showDiff'; original: string; modified: string }

  // System
  | { type: 'ready' }
  | { type: 'requestState' };

export interface Attachment {
  type: 'file' | 'selection' | 'image';
  content: string;
  name?: string;
  path?: string;
}
```

---

## 4. Streaming Architecture

### 4.1 Streaming Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User sends message                                          │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebviewMessage: chat:send
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ WebviewProvider.handleChatSend()                            │
│ 1. Generate messageId                                       │
│ 2. Post streamStart                                         │
│ 3. Call core.streamMessage()                                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ for await (const chunk of core.streamMessage())             │
│                                                             │
│   if (chunk.type === 'text')                                │
│     → Post streamChunk { content: chunk.text }              │
│                                                             │
│   if (chunk.type === 'thinking')                            │
│     → Post streamChunk { thinking: true, content: ... }     │
│                                                             │
│   if (chunk.type === 'tool_call')                           │
│     → Post streamToolCall { tool: chunk.name, args: ... }   │
│                                                             │
│   if (chunk.type === 'tool_result')                         │
│     → Post streamToolResult { tool: chunk.name, result: ... }│
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Post streamEnd { usage: tokenUsage }                        │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 React Streaming Components

```tsx
// webview-ui/src/components/chat/StreamingText.tsx

interface StreamingTextProps {
  messageId: string;
  initialContent?: string;
}

export function StreamingText({ messageId, initialContent = '' }: StreamingTextProps) {
  const [content, setContent] = useState(initialContent);
  const [isStreaming, setIsStreaming] = useState(true);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const msg = event.data;

      if (msg.type === 'streamChunk' && msg.messageId === messageId) {
        setContent(prev => prev + msg.content);
      }

      if (msg.type === 'streamEnd' && msg.messageId === messageId) {
        setIsStreaming(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [messageId]);

  return (
    <div className="streaming-text">
      <Markdown content={content} />
      {isStreaming && <BlinkingCursor />}
    </div>
  );
}
```

### 4.3 Extension-Side Streaming

```typescript
// src/webview/handlers/ChatHandler.ts

export class ChatHandler {
  async handleSend(content: string, attachments?: Attachment[]): Promise<void> {
    const messageId = generateId();

    // Notify UI that streaming is starting
    this.postMessage({ type: 'streamStart', messageId, model: this.getActiveModel() });

    try {
      // Stream from core
      for await (const chunk of this.core.streamMessage(content, { attachments })) {
        switch (chunk.type) {
          case 'text':
            this.postMessage({
              type: 'streamChunk',
              messageId,
              content: chunk.content
            });
            break;

          case 'thinking':
            this.postMessage({
              type: 'streamChunk',
              messageId,
              content: chunk.content,
              thinking: true
            });
            break;

          case 'tool_use':
            this.postMessage({
              type: 'streamToolCall',
              messageId,
              tool: chunk.name,
              args: JSON.stringify(chunk.input)
            });
            break;

          case 'tool_result':
            this.postMessage({
              type: 'streamToolResult',
              messageId,
              tool: chunk.name,
              result: chunk.result
            });
            break;
        }
      }

      this.postMessage({
        type: 'streamEnd',
        messageId,
        usage: this.getLastUsage()
      });

    } catch (error) {
      this.handleStreamError(messageId, error);
    }
  }
}
```

---

## 5. Error Handling (Roo-Style)

### 5.1 Error Categories & UI Treatment

| Category | Detection | UI Treatment | Recovery |
|----------|-----------|--------------|----------|
| **Rate Limit** | HTTP 429, retry-after header | Countdown timer, auto-retry | Wait then retry |
| **Network** | Connection failed, timeout | "Retry" button, offline indicator | Manual retry |
| **Provider** | API error, invalid key | Error message + settings link | Fix configuration |
| **Validation** | Invalid input, too long | Inline validation, character count | Edit input |
| **Context Overflow** | Token limit exceeded | Suggest clearing history | Clear or summarize |
| **Timeout** | Response too slow | "Retry with longer timeout" | Retry with options |

### 5.2 Error Banner Component

```tsx
// webview-ui/src/components/errors/ErrorBanner.tsx

interface ErrorBannerProps {
  error: ErrorInfo;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorBanner({ error, onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <div className={`error-banner error-${error.category}`}>
      <div className="error-icon">
        <ErrorIcon category={error.category} />
      </div>

      <div className="error-content">
        <div className="error-title">{getErrorTitle(error.category)}</div>
        <div className="error-message">{error.message}</div>
        {error.suggestion && (
          <div className="error-suggestion">{error.suggestion}</div>
        )}
      </div>

      <div className="error-actions">
        {error.category === 'rate_limit' && error.retryAfterMs && (
          <RateLimitCountdown
            retryAfterMs={error.retryAfterMs}
            onComplete={onRetry}
          />
        )}

        {error.retryable && error.category !== 'rate_limit' && (
          <RetryButton onClick={onRetry} />
        )}

        {onDismiss && (
          <button className="dismiss-btn" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
```

### 5.3 Rate Limit Countdown

```tsx
// webview-ui/src/components/errors/RateLimitCountdown.tsx

interface RateLimitCountdownProps {
  retryAfterMs: number;
  onComplete: () => void;
}

export function RateLimitCountdown({ retryAfterMs, onComplete }: RateLimitCountdownProps) {
  const [remaining, setRemaining] = useState(retryAfterMs);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1000) {
          clearInterval(interval);
          onComplete();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [retryAfterMs, onComplete]);

  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="rate-limit-countdown">
      <div className="countdown-circle">
        <svg viewBox="0 0 36 36">
          <path
            className="countdown-bg"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            className="countdown-progress"
            strokeDasharray={`${(remaining / retryAfterMs) * 100}, 100`}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <span className="countdown-number">{seconds}</span>
      </div>
      <span className="countdown-label">Retrying in {seconds}s</span>
    </div>
  );
}
```

---

## 6. Migration Phases

### Phase 1: Foundation (Week 1)
**Goal:** Set up React project and basic communication

- [ ] Initialize webview-ui with Vite + React + TypeScript
- [ ] Create WebviewProvider (central orchestrator)
- [ ] Define message protocols (ExtensionMessage, WebviewMessage)
- [ ] Implement basic state synchronization
- [ ] Create App.tsx with ExtensionStateContext
- [ ] Test basic bidirectional communication

**Deliverables:**
- Working React webview that loads
- Basic message passing working
- State context established

### Phase 2: Chat Interface (Week 2)
**Goal:** Migrate chat functionality with streaming

- [ ] Create ChatView component
- [ ] Implement ChatInput with send functionality
- [ ] Create ChatMessage component (user/assistant)
- [ ] Implement StreamingText component
- [ ] Add streaming support to core.streamMessage()
- [ ] Wire streaming from handler to UI
- [ ] Add cancel functionality

**Deliverables:**
- Working chat with streaming responses
- Typing indicator during streaming
- Cancel button functionality

### Phase 3: Error Handling (Week 2-3)
**Goal:** Implement Roo-style error handling

- [ ] Create ErrorBanner component
- [ ] Implement RateLimitCountdown
- [ ] Create RetryButton component
- [ ] Add error categorization in handlers
- [ ] Implement retry logic with exponential backoff
- [ ] Add error suggestions based on category

**Deliverables:**
- Categorized error display
- Rate limit countdown with auto-retry
- Manual retry for network errors

### Phase 4: Mission & Activity (Week 3)
**Goal:** Migrate mission control features

- [ ] Create MissionPanel component
- [ ] Implement TaskList component
- [ ] Create ActivityLog component
- [ ] Add QuotaWidget component
- [ ] Wire mission/task events to UI
- [ ] Implement activity streaming

**Deliverables:**
- Mission panel with tasks
- Real-time activity log
- Quota visualization

### Phase 5: Approvals & Tools (Week 4)
**Goal:** Migrate approval workflow and tool execution display

- [ ] Create ApprovalBanner component
- [ ] Implement DiffViewer component
- [ ] Add per-hunk approval UI
- [ ] Create ToolExecutionCard component
- [ ] Show tool calls/results in chat
- [ ] Implement approval actions

**Deliverables:**
- Inline approval prompts
- Diff viewer with hunk selection
- Tool execution visualization

### Phase 6: Polish & Testing (Week 4-5)
**Goal:** Finalize and test

- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] Theme integration (VS Code colors)
- [ ] Keyboard shortcuts
- [ ] Comprehensive testing
- [ ] Remove old UI code

**Deliverables:**
- Polished, performant UI
- Full feature parity
- Old code removed

---

## 7. Technical Decisions

### 7.1 Build Tools

| Tool | Purpose | Reason |
|------|---------|--------|
| **Vite** | Webview bundling | Fast HMR, good React support |
| **esbuild** | Extension bundling | Already in use, fast |
| **pnpm** | Package management | Efficient, workspace support |
| **Turborepo** | Monorepo orchestration | Parallel builds, caching |

### 7.2 React Libraries

| Library | Purpose |
|---------|---------|
| **react-markdown** | Markdown rendering |
| **react-syntax-highlighter** | Code block highlighting |
| **@vscode/webview-ui-toolkit** | VS Code native components |
| **zustand** or **Context** | State management (Context preferred for simplicity) |

### 7.3 Styling Approach

- **CSS Modules** for component-scoped styles
- **VS Code CSS Variables** for theme integration
- **Utility classes** for common patterns

---

## 8. Success Criteria

| Metric | Target |
|--------|--------|
| **First contentful paint** | < 500ms |
| **Streaming latency** | < 100ms from API to UI |
| **Error recovery time** | < 2s for auto-retry |
| **Bundle size** | < 500KB gzipped |
| **Accessibility** | WCAG 2.1 AA compliant |
| **Test coverage** | > 80% for components |

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Build complexity | Delayed delivery | Use Turborepo for orchestration |
| State sync bugs | UI inconsistency | Comprehensive message type testing |
| Performance regression | Poor UX | Profile early, optimize critical paths |
| Breaking existing features | User disruption | Feature flags for gradual rollout |

---

## 10. Final Architectural Decisions

### 10.1 State Persistence: File-Based (Kilo-Style)

**Decision**: Full file-based persistence at `~/.altercode/`

```
~/.altercode/
├── tasks/
│   ├── {task-id}.json        # Individual task state
│   └── history/              # Archived tasks
├── sessions/
│   └── {session-id}.json     # Chat history per session
├── settings.json             # User preferences
└── cache/
    └── responses/            # Cached LLM responses (optional)
```

**Benefits**:
- Tasks survive VS Code restarts
- Portable across workspaces
- Easy backup/restore
- Can be version controlled if desired

### 10.2 Layout: Hybrid Main Chat + Collapsible Sidebar

**Decision**: Main chat as primary interface with collapsible sidebar containing tabs

```
┌─────────────────────────────────────────────────────────────┐
│ [≡] AlterCode                              [Settings] [?]   │
├─────────────────────────────────────────────────────────────┤
│                                                    │ [<]    │
│  ┌─────────────────────────────────┐              │ Tasks  │
│  │ Chat Messages                   │              │ Activity│
│  │ (streaming, tool calls, etc.)   │              │ Quota  │
│  │                                 │              │        │
│  │                                 │              │ ────── │
│  │                                 │              │ Task 1 │
│  │                                 │              │ Task 2 │
│  │                                 │              │ Task 3 │
│  └─────────────────────────────────┘              │        │
│  ┌─────────────────────────────────┐              │        │
│  │ [📎] Type message... [Send]     │              │        │
│  └─────────────────────────────────┘              │        │
└─────────────────────────────────────────────────────────────┘
```

**Sidebar Tabs**:
- **Tasks**: Current mission tasks with status
- **Activity**: Real-time activity log
- **Quota**: Provider usage and limits

**Behavior**:
- Sidebar collapsible via `[<]` button
- Remembers collapsed state
- Auto-expands on new approval/conflict

### 10.3 Theming: Custom System with VS Code Fallback

**Decision**: Custom AlterCode theme system with VS Code CSS variables as fallback

```typescript
// Theme tokens
const theme = {
  // Core colors (custom)
  primary: 'var(--altercode-primary, var(--vscode-button-background))',
  secondary: 'var(--altercode-secondary, var(--vscode-button-secondaryBackground))',

  // Status colors (custom)
  success: 'var(--altercode-success, #4caf50)',
  warning: 'var(--altercode-warning, #ff9800)',
  error: 'var(--altercode-error, #f44336)',

  // Backgrounds (VS Code fallback)
  background: 'var(--vscode-editor-background)',
  sidebarBg: 'var(--vscode-sideBar-background)',

  // Text (VS Code fallback)
  text: 'var(--vscode-editor-foreground)',
  textMuted: 'var(--vscode-descriptionForeground)',
};
```

**Custom Theme Presets**:
- Default (inherits VS Code)
- High Contrast
- Warm Dark
- Cool Light

### 10.4 Migration Strategy: Big Bang

**Decision**: Build complete new UI, switch over at once

**Approach**:
1. Build new React UI in `webview-ui/` alongside existing code
2. Keep old UI functional during development
3. Feature flag to toggle between old/new
4. Single cutover when new UI reaches feature parity
5. Remove old UI code after validation

**Timeline**: All phases run as continuous development

### 10.5 Build Tools: Vite + pnpm Workspaces

**Decision**: Vite for webview, pnpm workspaces for monorepo

```json
// package.json (root)
{
  "name": "altercode-v2",
  "private": true,
  "workspaces": [
    ".",
    "webview-ui"
  ],
  "scripts": {
    "dev": "concurrently \"pnpm run dev:extension\" \"pnpm run dev:webview\"",
    "build": "pnpm run build:webview && pnpm run build:extension",
    "build:extension": "esbuild ...",
    "build:webview": "pnpm --filter webview-ui build"
  }
}
```

```typescript
// webview-ui/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../out/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
});
```

---

## Appendix: File Migration Map

| Old File | New Location | Notes |
|----------|--------------|-------|
| ChatProvider.ts | webview-ui/src/components/chat/* | Split into components |
| MissionControlPanel.ts | webview-ui/src/components/mission/* | Major refactor |
| ApprovalUI.ts | webview-ui/src/components/approval/* | Keep quick-pick for simple cases |
| ConflictResolutionPanel.ts | webview-ui/src/components/conflicts/* | Integrate into main view |
| AlterCodeActionProvider.ts | src/providers/ActionProvider.ts | Keep in extension (not UI) |
