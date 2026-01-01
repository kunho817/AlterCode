# AlterCode v2: Unified UI Architecture Plan

## Executive Summary

Transform the fragmented multi-window interface into a single, unified Mission Control panel that serves as the central hub for all user interactions with the AI-based automated Vibe Coding system.

---

## Current State Analysis

### Fragmentation Issues

| Component | Current Location | Problem |
|-----------|------------------|---------|
| Chat | Sidebar WebView | Separate from mission context |
| Mission Status | Mission Control Panel | Tab-based, not persistent |
| Activity Log | Mission Control Tab | Hidden behind tab navigation |
| Approvals | Quick Pick dialogs | Modal, interrupts workflow |
| Conflicts | Quick Pick dialogs | No visual context |
| Settings | VS Code Settings Panel | Disconnected from workflow |
| Quota/Status | Status Bar | Too minimal, requires hover |
| Agent Status | Not visualized | Critical for understanding system |

### User Experience Problems

1. **Context Switching**: User must navigate between 4+ different UI locations
2. **Lost Focus**: Modal dialogs (approvals, conflicts) break concentration
3. **Hidden State**: Agent activity is opaque; user doesn't see the "hive" working
4. **Scattered Configuration**: Settings spread across VS Code and commands

---

## Design Philosophy

### Core Principles

1. **Single Pane of Glass**: Everything accessible from one panel
2. **Always Visible State**: No hidden important information
3. **Inline Actions**: Handle approvals/conflicts without leaving context
4. **Hierarchical Clarity**: Visualize the Sovereign → Overlord → Lord → Worker structure
5. **Automation Transparency**: User should see agents thinking and working

### Metaphor: Mission Control Center

Like NASA's Mission Control, the user should be able to:
- See all active operations at a glance
- Monitor multiple agents simultaneously
- Intervene quickly when needed
- Have full situational awareness

---

## Proposed Architecture

### Layout Structure

```
┌──────────────────────────────────────────────────────────────────────────┐
│  HEADER: AlterCode Mission Control    [Status] [Mode: Auto] [Settings]  │
├────────────┬─────────────────────────────────────────┬───────────────────┤
│            │                                         │                   │
│  SIDEBAR   │           MAIN CONTENT AREA             │   STATUS PANEL    │
│  (Nav)     │                                         │                   │
│            │  ┌─────────────────────────────────┐    │  ┌─────────────┐  │
│  ┌──────┐  │  │                                 │    │  │ API QUOTA   │  │
│  │ Chat │  │  │   [Content varies by section]   │    │  │ Claude: 45% │  │
│  └──────┘  │  │                                 │    │  │ GLM: 12%    │  │
│  ┌──────┐  │  │   - Chat conversation           │    │  │ Reset: 2h   │  │
│  │Mission│  │  │   - Mission details            │    │  └─────────────┘  │
│  └──────┘  │  │   - Activity stream             │    │                   │
│  ┌──────┐  │  │   - Agent hierarchy             │    │  ┌─────────────┐  │
│  │Activity│ │  │                                 │    │  │ APPROVALS   │  │
│  └──────┘  │  └─────────────────────────────────┘    │  │ 3 pending   │  │
│  ┌──────┐  │                                         │  │ [Review]    │  │
│  │Agents│  │                                         │  └─────────────┘  │
│  └──────┘  │                                         │                   │
│            │                                         │  ┌─────────────┐  │
│  ┌──────┐  │                                         │  │ CONFLICTS   │  │
│  │Config│  │                                         │  │ 0 active    │  │
│  └──────┘  │                                         │  └─────────────┘  │
│            │                                         │                   │
│            │                                         │  ┌─────────────┐  │
│            │                                         │  │ AGENTS      │  │
│            │                                         │  │ 2 active    │  │
│            │                                         │  │ 1 thinking  │  │
│            │                                         │  └─────────────┘  │
├────────────┴─────────────────────────────────────────┴───────────────────┤
│  INPUT BAR: [Message input / Command] (/help for commands)    [Send]    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Header Bar
- **Logo/Title**: "AlterCode Mission Control"
- **Global Status**: Connection status, current operation
- **Mode Toggle**: Full Auto / Step-by-Step / Manual
- **Settings Gear**: Quick access to key settings

#### 2. Navigation Sidebar (Left)
- **Chat**: Primary interaction with AI
- **Mission**: Current mission overview, tasks, progress
- **Activity**: Real-time activity stream with filters
- **Agents**: Hierarchy visualization and agent status
- **Config**: Quick settings (not full VS Code settings)

#### 3. Main Content Area (Center)
Dynamic content based on sidebar selection:

**Chat View:**
- Conversation history with AI
- Code blocks with syntax highlighting
- File change previews inline
- Approval requests embedded in conversation

**Mission View:**
- Active mission details
- Task breakdown with status
- Progress visualization
- Dependencies graph

**Activity View:**
- Real-time activity stream
- Filter by agent level, status, time
- Search functionality
- Performance metrics

**Agents View:**
- Hierarchical tree: Sovereign → Overlord → Lord → Worker
- Agent status (idle, thinking, executing)
- Current task assignment
- Resource consumption per agent

**Config View:**
- Approval mode selection
- Quota thresholds
- Notification preferences
- AI provider settings

#### 4. Status Panel (Right)
Always-visible status widgets:

**API Quota Widget:**
- Visual progress bars for each provider
- Call count and token usage
- Time until reset
- Warning indicators

**Approvals Widget:**
- Pending count with badge
- Quick preview of first item
- "Review All" button
- Inline approve/reject for simple cases

**Conflicts Widget:**
- Active conflict count
- File names with conflicts
- Quick resolution buttons

**Active Agents Widget:**
- Count by level (Sovereign: 1, Lord: 2, Worker: 5)
- Activity indicator (thinking animation)
- Quick pause/resume controls

#### 5. Input Bar (Bottom)
- Unified input for chat and commands
- Command prefix: `/` for commands
- Auto-complete for commands
- Send button + keyboard shortcut (Enter)

---

## Detailed Section Designs

### Chat Section

```
┌─────────────────────────────────────────────────────────┐
│ CHAT                                        [Clear] [↓] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ USER                              10:23 AM      │   │
│  │ Add authentication to the login page            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ SOVEREIGN                         10:23 AM      │   │
│  │ I'll create a mission for this. Planning...     │   │
│  │                                                 │   │
│  │ Mission Created: AUTH-001                       │   │
│  │ ├─ Task 1: Analyze existing auth code           │   │
│  │ ├─ Task 2: Design auth flow                     │   │
│  │ └─ Task 3: Implement login authentication       │   │
│  │                                                 │   │
│  │ Delegating to Overlord...                       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ LORD (Task 3)                     10:24 AM      │   │
│  │ Implementing login authentication...            │   │
│  │                                                 │   │
│  │ ┌─ APPROVAL REQUIRED ─────────────────────────┐ │   │
│  │ │ 3 file changes ready for review             │ │   │
│  │ │                                             │ │   │
│  │ │ src/auth/login.ts (+45 lines)              │ │   │
│  │ │ src/routes/auth.ts (+12 lines)             │ │   │
│  │ │ src/middleware/auth.ts (new file)          │ │   │
│  │ │                                             │ │   │
│  │ │ [View Diff] [Approve] [Reject] [Modify]    │ │   │
│  │ └─────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Key features:
- Messages tagged with agent level (Sovereign, Overlord, Lord, Worker)
- Inline approval requests (no modal dialogs)
- Expandable code diffs
- Mission/task references as links

### Agents Section (Hierarchy View)

```
┌─────────────────────────────────────────────────────────┐
│ AGENT HIERARCHY                      [Pause All] [▶]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SOVEREIGN (Claude Opus)                    ● Active    │
│  └─ Planning mission AUTH-001                          │
│     │                                                   │
│     ├─ OVERLORD-1 (Claude Opus)             ● Active    │
│     │  └─ Coordinating auth implementation             │
│     │     │                                             │
│     │     ├─ LORD-1 (Claude Opus)           ◐ Thinking  │
│     │     │  └─ Designing auth flow                    │
│     │     │     │                                       │
│     │     │     ├─ WORKER-1 (GLM)           ○ Idle     │
│     │     │     └─ WORKER-2 (GLM)           ● Executing │
│     │     │        └─ Writing login.ts                 │
│     │     │                                             │
│     │     └─ LORD-2 (Claude Opus)           ○ Waiting   │
│     │        └─ Pending: Task 2 dependencies           │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  Legend: ● Active  ◐ Thinking  ○ Idle  ⏸ Paused        │
│                                                         │
│  Stats:                                                 │
│  ├─ Active Agents: 4                                   │
│  ├─ Completed Tasks: 12                                │
│  └─ Avg Response Time: 2.3s                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Key features:
- Tree visualization of agent hierarchy
- Real-time status indicators
- Current task display
- Pause/resume controls per agent
- Aggregate statistics

### Activity Section

```
┌─────────────────────────────────────────────────────────┐
│ ACTIVITY                    [Filter ▼] [Search] [Export]│
├─────────────────────────────────────────────────────────┤
│ Filter: [All ▼] [Today ▼]                  Found: 47    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  10:24:32  WORKER-2    Completed   login.ts written     │
│            └─ Duration: 1.2s | Tokens: 1,432            │
│                                                         │
│  10:24:30  LORD-1      Thinking    Analyzing auth...    │
│            └─ Duration: ongoing | Tokens: 856           │
│                                                         │
│  10:24:15  OVERLORD-1  Delegated   Task 3 → LORD-1      │
│            └─ Duration: 0.3s                            │
│                                                         │
│  10:23:45  SOVEREIGN   Planning    Created mission      │
│            └─ Duration: 2.1s | Tokens: 2,104            │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  Performance Summary                                    │
│  ├─ Avg Duration: 1.8s                                 │
│  ├─ Total Tokens: 15,432                               │
│  ├─ Success Rate: 94%                                  │
│  └─ Active Time: 12m 34s                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Layout Foundation (Priority: High)
**Goal**: Establish the new unified layout structure

Tasks:
1. Redesign MissionControlPanel.ts with new layout
2. Implement sidebar navigation component
3. Implement right status panel structure
4. Add bottom input bar
5. Create responsive layout CSS

Deliverables:
- New panel layout with all sections
- Working navigation between sections
- Placeholder content in each section

### Phase 2: Chat Integration (Priority: High)
**Goal**: Move chat functionality into Mission Control

Tasks:
1. Extract chat logic from ChatProvider
2. Integrate into Mission Control panel
3. Implement message rendering with agent tags
4. Add inline approval UI in chat messages
5. Implement input bar with command support

Deliverables:
- Fully functional chat within Mission Control
- Inline approval handling
- Command support (/help, /status, etc.)

### Phase 3: Agent Visualization (Priority: High)
**Goal**: Visualize the hive hierarchy

Tasks:
1. Design agent tree component
2. Implement real-time status updates
3. Add pause/resume controls
4. Show current task per agent
5. Display agent statistics

Deliverables:
- Interactive agent hierarchy tree
- Real-time status updates
- Agent control capabilities

### Phase 4: Status Panel Widgets (Priority: Medium)
**Goal**: Always-visible status information

Tasks:
1. Enhance quota widget with details
2. Create approvals widget with inline actions
3. Create conflicts widget with quick resolve
4. Create agents summary widget
5. Add real-time updates to all widgets

Deliverables:
- All status widgets functioning
- Real-time data updates
- Inline action capabilities

### Phase 5: Activity Enhancement (Priority: Medium)
**Goal**: Rich activity monitoring

Tasks:
1. Enhance activity stream with agent levels
2. Add advanced filtering (by agent, status, time)
3. Implement search functionality
4. Add expandable details
5. Implement export functionality

Deliverables:
- Enhanced activity view
- Powerful filtering and search
- Export capability

### Phase 6: Config Section (Priority: Low)
**Goal**: Quick settings access

Tasks:
1. Design config section layout
2. Implement approval mode toggle
3. Add quota threshold settings
4. Add notification preferences
5. Sync with VS Code settings

Deliverables:
- In-panel configuration
- Sync with extension settings

### Phase 7: Polish & UX (Priority: Low)
**Goal**: Professional finish

Tasks:
1. Add animations and transitions
2. Implement keyboard shortcuts
3. Add tooltips and help text
4. Ensure accessibility (ARIA)
5. Performance optimization

Deliverables:
- Smooth animations
- Full keyboard navigation
- Accessible interface

---

## Technical Considerations

### State Management
- Centralized state object in webview
- Message passing for updates from extension
- Optimistic UI updates where safe

### Event Flow
```
Extension (TypeScript)
    ↓ postMessage
WebView (JavaScript)
    ↓ state update
UI Components
    ↓ user action
postMessage back to Extension
```

### Performance
- Virtual scrolling for long lists
- Debounced search/filter
- Lazy loading for historical data
- Efficient DOM updates

### Styling
- CSS custom properties for theming
- VS Code theme integration
- Responsive design for panel resizing

---

## Migration Strategy

### Deprecation Plan
1. Phase 2 completion: Mark sidebar chat as "legacy"
2. Phase 4 completion: Hide sidebar chat by default
3. Phase 7 completion: Remove sidebar chat code

### Backwards Compatibility
- Keep existing commands functional
- Status bar remains as quick glance
- Output channel for debugging

---

## Success Metrics

1. **Single Panel Usage**: 90%+ of interactions within Mission Control
2. **Reduced Context Switches**: < 2 panel switches per task
3. **Approval Response Time**: < 3 seconds (inline vs modal)
4. **User Satisfaction**: Clear understanding of agent activity

---

## File Changes Summary

### New Files
- `src/ui/unified/UnifiedMissionControl.ts` - Main panel controller
- `src/ui/unified/components/` - Reusable UI components
- `src/ui/unified/sections/` - Section implementations
- `src/ui/unified/webview/unified.html` - HTML template
- `src/ui/unified/webview/unified.css` - Styles
- `src/ui/unified/webview/unified.js` - Client-side logic

### Modified Files
- `src/extension.ts` - Register new panel, update activation
- `package.json` - Update commands, views configuration
- `src/ui/index.ts` - Export new components

### Deprecated Files (Phase 7)
- `src/ui/ChatProvider.ts` - Replaced by unified chat
- `src/ui/MissionControlPanel.ts` - Replaced by unified panel

---

## Next Steps

1. **Review and approve this plan**
2. **Phase 1 implementation** - Layout foundation
3. **Iterative testing** after each phase
4. **User feedback integration**

---

*This plan establishes the foundation for a unified, professional UI that matches the sophistication of the underlying AI-based automated Vibe Coding system.*
