# UI Improvements - Phase 1 Feedback

## Feedback Summary

### Issue 1: Settings QoL
**Problem**: Current implementation relies too heavily on VS Code extension settings panel. Users must navigate to a separate panel for configuration, which breaks workflow.

**Solution**:
- Make all settings configurable directly within the Mission Control UI
- Config section should have full control over all settings
- Changes made in UI should automatically sync to VS Code settings
- Remove dependency on external settings panel

**Settings to integrate into UI**:
- LLM Provider selection (claude/openai)
- API Key configuration
- Model selection
- Approval mode (full_automation/step_by_step/fully_manual)
- Quota warning thresholds
- Notification preferences (quota warnings, approval required)
- Activity max display entries
- Conflict auto-resolve setting
- Log level

### Issue 2: UI Design
**Problem**: Excessive use of emojis makes the UI flashy and reduces readability. Developers prefer clean, minimal interfaces.

**Solution**:
- Remove all emoji icons from navigation and UI elements
- Use simple text labels or minimal SVG icons
- Focus on readability and clean typography
- Use subtle visual hierarchy (borders, spacing, muted colors)
- Match VS Code's native design language

**Specific changes**:
- Replace emoji nav buttons with text labels
- Remove emoji icons from empty states
- Use simple status indicators (dots, borders) instead of emoji
- Cleaner section headers without decorative elements
- Consistent, muted color palette

---

## Implementation Tasks

### Task 1: Clean UI Design
- [x] Replace emoji navigation with text labels
- [x] Remove emoji from empty states
- [x] Simplify status indicators
- [x] Clean up section headers
- [x] Ensure consistent typography

### Task 2: Integrated Settings
- [x] Create full settings form in Config section
- [x] Add input fields for API keys
- [x] Add dropdowns for provider/model selection
- [x] Add toggles for boolean settings
- [x] Add number inputs for thresholds
- [x] Implement two-way sync with VS Code settings
- [x] Remove "Open VS Code Settings" button dependency

---

## Completed Implementation Summary

### Clean UI Changes (Phase 1)
- Navigation sidebar uses text labels (Chat, Missions, Activity, Hierarchy, Settings) with simple letter icons
- All emojis removed from empty states, status indicators, and headers
- Status indicators use colored dots instead of emoji symbols
- Section headers are clean with minimal styling
- Color palette uses VS Code native CSS variables for theme integration

### SVG Icons (Phase 2)
- Replaced letter icons with monochrome SVG icons matching VS Code style:
  - **Chat**: Speech bubble with message lines
  - **Missions**: Target/bullseye icon
  - **Activity**: Pulse/heartbeat graph icon
  - **Hierarchy**: Org chart/tree structure icon
  - **Settings**: Gear/cog icon

### Dual-Provider LLM Configuration (Phase 2)
The Config section now supports the dual-provider architecture:
- **Claude (Higher Tiers)**: API Key, Model (default: claude-opus-4-5-20251101)
  - Used for: Sovereign, Overlord, Lord agents
- **GLM (Worker Tier)**: API Key, Model (default: glm-4.7), Endpoint
  - Endpoint: https://api.z.ai/api/coding/paas/v4/chat/completions
  - Used for: Worker agents
- **Approval Mode**: Dropdown (Full Auto/Step by Step/Fully Manual)
- **Notifications**: Toggle switches for quota warnings, approval alerts, status bar quota
- **Advanced**: Max activity entries, auto-resolve conflicts toggle, log level

### Two-Way Sync (Fixed)
- `sendCurrentSettings()` method reads VS Code configuration on panel load
- `updateSetting` message handler writes changes to VS Code configuration
- UI automatically reflects current VS Code settings on initialization
- **Mode toggle sync fixed**: Header toggle and Settings dropdown stay in sync
  - `updateApprovalMode()` function syncs dropdown changes to header
  - `setMode()` function syncs header changes to dropdown

---

## Phase 3: Service-to-UI Integration

Systematic analysis of all backend services to ensure proper UI exposure.

### Feature 1: QuotaTrackerService
- **Enhanced quota widget** with expandable details (click to expand)
- Tokens sent/received display per provider
- Reset countdown timer (formatted as mm:ss)
- Level-by-level breakdown (Sovereign, Overlord, Lord, Worker usage)
- `toggleQuotaDetails()` and `formatTimeRemaining()` functions added

### Feature 2: PerformanceMonitorService
- **New Performance widget** added to status panel
- Shows total operation count and cumulative time
- Displays top 5 operations sorted by average duration
- Refresh button to request latest metrics
- `updatePerformanceUI()` and `refreshPerformance()` functions added

### Feature 3: AgentActivityService
- **Active count badge** in Activity section header (shows thinking count)
- **Error display** for failed activities (shows error message)
- Failed count added to stats summary
- Status dot indicators with animation for thinking state
- CSS classes: `.activity-badge`, `.activity-error`, `.activity-status-dot`

### Feature 4: MissionManager/TaskManager
- **Phase stepper visualization** - 5 phases with progress indication
  - Phases: planning → validation → execution → verification → completion
  - CSS classes: `.phase-stepper`, `.phase-step.completed`, `.phase-step.active`
- **Task counts** - "X / Y tasks" display
- **Mission controls** - Pause/Resume/Cancel buttons based on status
- **Mission stats summary** - Total, Active, Done, Failed counts
- **ETA display** - Estimated completion time when available
- **Task priority indicators** - critical (red), high (yellow), normal (hidden), low (muted)
- **Retry button** for failed tasks
- Functions: `pauseMission()`, `resumeMission()`, `cancelMission()`, `retryTask()`, `clearCompleted()`

### Feature 5: ApprovalService
- **Enhanced approval items** with detailed card layout
- Shows file count and first 2 file names (+ N more)
- Time since requested (formatTimeAgo: "5m ago", "2h ago")
- Three action buttons: View Diff / Approve / Reject
- "View All" link when more than 5 pending
- CSS classes: `.approval-item`, `.approval-header`, `.approval-actions`, `.approval-btn`

### Feature 6: VirtualBranchService/MergeEngineService
- **Enhanced conflict items** with detailed card layout
- Shows conflicting file name
- Shows which agents are conflicting (branch1 vs branch2)
- Shows conflicting region count
- Four resolution buttons: View / Auto / AI / Manual
- CSS classes: `.conflict-item`, `.conflict-actions`, `.conflict-btn.auto`, `.conflict-btn.ai`
- Functions: `viewConflictDiff()`, `resolveConflict(id, strategy)`

### Feature 7: RollbackService
- **Rollback button** in mission controls when rollback points exist
- Shows for active missions (alongside Pause/Cancel)
- Shows for paused missions (alongside Resume/Cancel)
- Shows for failed missions (standalone "Rollback Changes" button)
- Tooltip shows number of restore points available
- Function: `rollbackMission()`

### Feature 8: Infrastructure Services
- VerificationPipelineService - Internal, no direct UI needed
- ContextSelectorService - Internal, no direct UI needed
- KnowledgeStore - Database layer, no direct UI needed

---

## Design Principles (Updated)

1. **Minimal** - No decorative elements, only functional UI
2. **Readable** - High contrast text, proper spacing
3. **Self-contained** - All functionality within the panel
4. **Native feel** - Match VS Code design language
5. **Developer-friendly** - Clean, professional appearance
6. **Feature Complete** - All backend capabilities exposed in UI
7. **Progressive Disclosure** - Details expandable, not overwhelming
