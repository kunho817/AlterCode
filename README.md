# AlterCode

**AI-powered hierarchical task orchestration for software development**

AlterCode is a VS Code extension that implements a hive mind architecture for AI-assisted coding. It combines Claude Code (Opus model) for strategic planning and GLM-4.7 for task execution in a company-like hierarchical structure.

## Features

- **6-Level Hierarchy**: Sovereign → Architect → Strategist → Team Lead → Specialist → Worker
- **Dual AI Backend**: Claude Code for management, GLM-4.7 for execution
- **Dynamic Worker Pool**: Unlimited workers per supervisor, constrained by quota
- **Smart Conflict Resolution**: Semantic partitioning + AI-assisted merging
- **Quota Management**: 5-hour window tracking for both AI providers
- **Flexible Approval**: Full Auto / Step-by-Step / Fully Manual modes
- **Hybrid UI**: Status bar + Chat sidebar + Mission Control + Inline actions
- **CLI Auto-Detection**: Automatic Claude CLI validation with helpful setup prompts
- **Progress Indicators**: Real-time feedback during long operations

## Getting Started

### Prerequisites

- VS Code 1.85.0 or higher
- Node.js 18 or higher
- Claude Code CLI installed
- GLM API access (optional - for cost optimization)

### Install Claude Code CLI

```bash
# Install the CLI globally
npm install -g @anthropic-ai/claude-code

# Authenticate (opens browser for login)
claude
```

### Install AlterCode Extension

#### From VSIX
1. Download the `.vsix` file from releases
2. In VS Code: `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
3. Select the downloaded file

#### From Source (Development)
```bash
cd altercode
npm install
npm run build:dev
```

Then press `F5` in VS Code to launch the Extension Development Host.

### Verify Setup

1. Look for the **Claude** status indicator in the bottom-right status bar
2. Green check = Ready | Yellow warning = Needs auth | Red error = Not installed
3. Click the indicator to check status or run setup

## Quick Start

1. **Open the AlterCode sidebar** - Click the AlterCode icon in the Activity Bar
2. **Check CLI status** - Ensure the Claude indicator shows green
3. **Submit a plan** - `Ctrl+Shift+P` → "AlterCode: Submit Planning Document"
4. **Describe your task** - e.g., "Add user authentication with JWT tokens"
5. **Monitor progress** - Watch the Hierarchy and Tasks views update in real-time

### Development Mode

```bash
# Watch mode for development
npm run watch

# Run tests
npm test

# Run benchmarks
npm run benchmark

# Lint code
npm run lint
```

## Project Structure

```
altercode/
├── src/
│   ├── extension.ts           # Entry point
│   ├── types/                 # Type definitions
│   ├── core/                  # Core orchestration
│   │   ├── AlterCodeCore.ts   # Central coordinator
│   │   ├── hierarchy/         # Agent hierarchy
│   │   ├── task/              # Task management
│   │   ├── execution/         # Execution coordinator
│   │   ├── sovereign/         # Level 0 orchestrator
│   │   └── approval/          # Approval workflow
│   ├── agents/                # AI agent integrations
│   │   ├── AgentPool.ts       # Agent management
│   │   ├── claude/            # Claude Code CLI
│   │   └── glm/               # GLM-4.7 HTTP API
│   ├── storage/               # State persistence
│   ├── quota/                 # Usage tracking
│   ├── ui/                    # UI components
│   │   ├── StatusBarProvider.ts
│   │   ├── SidebarChatProvider.ts
│   │   ├── MissionControlPanel.ts
│   │   └── AlterCodeActionProvider.ts
│   └── utils/                 # Utilities
├── docs/
│   ├── TECHNICAL_SPECIFICATION.md
│   └── IMPLEMENTATION_ROADMAP.md
└── package.json
```

## Hierarchy System

```
Level 0: SOVEREIGN (Meta-Orchestrator)
   │     - Receives planning documents
   │     - Strategic decomposition
   │
Level 1: ARCHITECTS (Domain Directors)
   │     - Frontend/Backend domains
   │     - High-level architecture
   │
Level 2: STRATEGISTS (Feature Leads)
   │     - Feature-level planning
   │     - Component breakdown
   │
Level 3: TEAM LEADS (Task Coordinators)
   │     - Task assignment
   │     - Worker management
   │
Level 4: SPECIALISTS (Senior Workers)
   │     - Complex atomic tasks
   │     - Claude OR GLM (auto-selected)
   │
Level 5: WORKERS (Executors)
         - Simple atomic tasks
         - GLM-4.7 only
         - Unlimited per supervisor
```

## Configuration

Key settings in VS Code:

| Setting | Default | Description |
|---------|---------|-------------|
| `altercode.approvalMode` | `fully_manual` | Approval mode for changes |
| `altercode.glm.endpoint` | `https://api.z.ai/...` | GLM API endpoint |
| `altercode.hierarchy.maxConcurrentWorkers` | `10` | Max concurrent workers |
| `altercode.quota.warningThreshold` | `0.8` | Quota warning at 80% |

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `AlterCode: Submit Planning Document` | - | Start a new mission from a description |
| `AlterCode: Open Mission Control` | - | Open the Mission Control panel |
| `AlterCode: Open Chat` | - | Open the chat interface |
| `AlterCode: Pause Current Mission` | - | Pause the active mission |
| `AlterCode: Resume Mission` | - | Resume a paused mission |
| `AlterCode: Cancel Mission` | - | Cancel the active mission |
| `AlterCode: Review Selected Code` | - | Review selected code with AI |
| `AlterCode: Refactor Selected Code` | - | Refactor selected code with AI |
| `AlterCode: Explain Selected Code` | - | Get an explanation of selected code |
| `AlterCode: Check Claude CLI Status` | - | Verify Claude CLI installation |
| `AlterCode: Show Quota Status` | - | View API usage quotas |
| `AlterCode: Show Output` | - | Show the AlterCode output channel |
| `AlterCode: Configure` | - | Open extension settings |

## Usage

### Submit a Planning Document

1. Run `Ctrl+Shift+P` → "AlterCode: Submit Planning Document"
2. Type or paste your planning document describing what you want to accomplish
3. AlterCode will analyze the plan and create a mission with tasks

### Quick Actions

- Select code in the editor
- Right-click → Choose from:
  - **AlterCode: Review Selected Code** - Get an AI code review
  - **AlterCode: Refactor Selected Code** - Suggest improvements
  - **AlterCode: Explain Selected Code** - Get detailed explanation

### Mission Control

- Click the status bar item or run `AlterCode: Open Mission Control`
- View hierarchy, task queue, and quota status
- Pause, resume, or cancel missions

## Troubleshooting

### Claude CLI not found

1. Ensure Node.js 18+ is installed: `node --version`
2. Install the CLI: `npm install -g @anthropic-ai/claude-code`
3. Authenticate: `claude`
4. Restart VS Code
5. Click the Claude status indicator to verify

### Status bar shows error/warning

- **Red error**: Claude CLI not installed - click to open setup
- **Yellow warning**: CLI installed but needs authentication - run `claude` in terminal
- Click the indicator for guided setup

### Mission not progressing

1. Run `AlterCode: Show Output` to view logs
2. Check `AlterCode: Show Quota Status` for rate limits
3. Verify Claude CLI works: `claude --version`

### First-time setup

On first run, AlterCode will:
1. Check for Claude CLI installation
2. Validate authentication status
3. Prompt to configure if needed

## Documentation

- [Technical Specification](docs/TECHNICAL_SPECIFICATION.md) - Complete system architecture
- [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md) - Development phases and milestones

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

[MIT License](LICENSE)

---

Built with ❤️ by the AlterCode Team
