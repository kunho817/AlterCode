# AlterCode v2 - System Architecture

## Document Information

| Item | Value |
|------|-------|
| Version | 2.0.0-alpha |
| Status | Design Phase |
| Last Updated | 2024-12-31 |

---

## 1. Vision & Principles

### 1.1 Vision Statement

AlterCode is a **reliability-first** AI coding assistant that produces high-quality code by:
- Verifying everything against reality before acting
- Enforcing structured development workflows
- Maximizing context efficiency
- Learning from mistakes to prevent repetition

### 1.2 Core Principles

| Principle | Description |
|-----------|-------------|
| **Reality Grounded** | Never operate on assumptions; verify against actual project state |
| **Intent Driven** | Every change requires explicit declaration of what and why |
| **Scope Bounded** | Changes are constrained to declared boundaries |
| **Fail Fast** | Detect problems before execution, not after |
| **Reversible** | Every action can be undone |
| **Transparent** | Show what's happening and why at every step |
| **Learnable** | Improve from corrections and feedback |

### 1.3 Design Philosophy

```
Traditional AI Assistant:
  User Request → LLM → Code Output → Hope it works

AlterCode v2:
  User Request → Intent Declaration → Scope Definition
       ↓
  Knowledge Sync → Verify Request is Valid
       ↓
  Context Optimization → Select Minimal Relevant Context
       ↓
  Agent Execution → Generate Code
       ↓
  Reality Verification → Verify Output Against Reality
       ↓
  Pre-flight Checks → Validate All Requirements
       ↓
  Impact Analysis → Show What Will Change
       ↓
  Apply with Rollback → Execute with Safety Net
```

---

## 2. System Architecture

### 2.1 Layer Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                      PRESENTATION LAYER                         │
│                                                                 │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────┐   │
│  │  Mission  │ │   Chat    │ │   Task    │ │ Verification  │   │
│  │  Control  │ │ Interface │ │   Tree    │ │  Dashboard    │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────────┘   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      PROTOCOL LAYER                             │
│                                                                 │
│  ┌───────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │    Intent     │ │   Scope     │ │      Pre-flight         │ │
│  │  Declaration  │ │   Guard     │ │      Checklist          │ │
│  └───────────────┘ └─────────────┘ └─────────────────────────┘ │
│  ┌───────────────┐ ┌─────────────┐                             │
│  │   Rollback    │ │   Impact    │                             │
│  │   Manager     │ │  Analyzer   │                             │
│  └───────────────┘ └─────────────┘                             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    VERIFICATION LAYER                           │
│                                                                 │
│  ┌───────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │     File      │ │   Symbol    │ │        API              │ │
│  │   Validator   │ │  Resolver   │ │      Checker            │ │
│  └───────────────┘ └─────────────┘ └─────────────────────────┘ │
│  ┌───────────────┐ ┌─────────────────────────────────────────┐ │
│  │  Dependency   │ │          Verification Pipeline          │ │
│  │   Verifier    │ │                                         │ │
│  └───────────────┘ └─────────────────────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      CONTEXT LAYER                              │
│                                                                 │
│  ┌───────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │    Smart      │ │    Token    │ │     Progressive         │ │
│  │   Selector    │ │   Budget    │ │     Disclosure          │ │
│  └───────────────┘ └─────────────┘ └─────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Conversation Compressor                      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     KNOWLEDGE LAYER                             │
│                                                                 │
│  ┌───────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │   Project     │ │  Semantic   │ │     Convention          │ │
│  │   Snapshot    │ │    Index    │ │     Extractor           │ │
│  └───────────────┘ └─────────────┘ └─────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   Error Memory                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      EXECUTION LAYER                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   Agent Hierarchy                         │ │
│  │        Sovereign → Lord → Overlord → Worker               │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │    Agent      │ │    Task     │ │      Execution          │ │
│  │    Pool       │ │   Manager   │ │     Coordinator         │ │
│  └───────────────┘ └─────────────┘ └─────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    INTEGRATION LAYER                            │
│                                                                 │
│  ┌───────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │    Claude     │ │    GLM      │ │       Future            │ │
│  │   Adapter     │ │   Adapter   │ │      Adapters           │ │
│  └───────────────┘ └─────────────┘ └─────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                   INFRASTRUCTURE LAYER                          │
│                                                                 │
│  ┌───────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │    SQLite     │ │   LevelDB   │ │     File System         │ │
│  │   Database    │ │    Cache    │ │      Watcher            │ │
│  └───────────────┘ └─────────────┘ └─────────────────────────┘ │
│  ┌───────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │    Logger     │ │   Config    │ │       Event             │ │
│  │               │ │   Manager   │ │        Bus              │ │
│  └───────────────┘ └─────────────┘ └─────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Layer Responsibilities

| Layer | Responsibility | Dependencies |
|-------|---------------|--------------|
| **Presentation** | User interaction, visualization | Protocol, Knowledge |
| **Protocol** | Workflow enforcement, safety | Verification, Context |
| **Verification** | Reality checking, validation | Knowledge |
| **Context** | Token optimization, relevance | Knowledge |
| **Knowledge** | Project understanding, indexing | Infrastructure |
| **Execution** | Agent coordination, task management | Integration, Knowledge |
| **Integration** | AI provider communication | Infrastructure |
| **Infrastructure** | Storage, events, configuration | None |

### 2.3 Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        USER REQUEST                              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  PROTOCOL: Intent Declaration                                    │
│  - Parse user request                                            │
│  - Define scope boundaries                                       │
│  - Establish success criteria                                    │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  VERIFICATION: Pre-Generation Check                              │
│  - Verify target files exist                                     │
│  - Validate referenced symbols                                   │
│  - Check scope is valid                                          │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  CONTEXT: Build Optimal Context                                  │
│  - Select relevant files                                         │
│  - Apply progressive disclosure                                  │
│  - Fit within token budget                                       │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  KNOWLEDGE: Inject Project Facts                                 │
│  - Add verified file structure                                   │
│  - Include convention hints                                      │
│  - Reference error patterns to avoid                             │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  EXECUTION: Agent Hierarchy                                      │
│  - Route to appropriate agent                                    │
│  - Execute with monitoring                                       │
│  - Collect response                                              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  VERIFICATION: Post-Generation Check                             │
│  - Validate generated code syntax                                │
│  - Verify referenced files/symbols exist                         │
│  - Check scope boundaries respected                              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  PROTOCOL: Pre-flight Checklist                                  │
│  - Run all validation checks                                     │
│  - Gate on required items                                        │
│  - Collect warnings                                              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  PROTOCOL: Impact Analysis                                       │
│  - Calculate affected files                                      │
│  - Identify dependent code                                       │
│  - Assess risk level                                             │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  PROTOCOL: Rollback Snapshot                                     │
│  - Save current state                                            │
│  - Create restore point                                          │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  APPLY CHANGES                                                   │
│  - Write to file system                                          │
│  - Update knowledge index                                        │
│  - Emit events                                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  KNOWLEDGE: Update State                                         │
│  - Record action in history                                      │
│  - Update semantic index                                         │
│  - Store any error patterns                                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Type Definitions

### 3.1 Common Types

```typescript
// ============================================================================
// Identifiers
// ============================================================================

/** Branded type for type-safe IDs */
type Brand<T, B> = T & { __brand: B };

type MissionId = Brand<string, 'MissionId'>;
type TaskId = Brand<string, 'TaskId'>;
type AgentId = Brand<string, 'AgentId'>;
type SnapshotId = Brand<string, 'SnapshotId'>;
type IntentId = Brand<string, 'IntentId'>;

// ============================================================================
// Result Types
// ============================================================================

/** Result type for operations that can fail */
type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

/** Async result type */
type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// ============================================================================
// File System Types
// ============================================================================

/** Absolute file path */
type FilePath = Brand<string, 'FilePath'>;

/** Relative file path from project root */
type RelativePath = Brand<string, 'RelativePath'>;

/** Glob pattern for file matching */
type GlobPattern = Brand<string, 'GlobPattern'>;

/** Line number (1-indexed) */
type LineNumber = Brand<number, 'LineNumber'>;

/** Column number (1-indexed) */
type ColumnNumber = Brand<number, 'ColumnNumber'>;

/** Source location in a file */
interface SourceLocation {
  file: FilePath;
  line: LineNumber;
  column: ColumnNumber;
  endLine?: LineNumber;
  endColumn?: ColumnNumber;
}

// ============================================================================
// Token Types
// ============================================================================

/** Token count */
type TokenCount = Brand<number, 'TokenCount'>;

/** Token budget allocation */
interface TokenBudget {
  total: TokenCount;
  system: TokenCount;
  context: TokenCount;
  history: TokenCount;
  reserved: TokenCount;
}
```

### 3.2 Knowledge Layer Types

```typescript
// ============================================================================
// Project Snapshot
// ============================================================================

interface ProjectSnapshot {
  id: SnapshotId;
  timestamp: Date;
  projectRoot: FilePath;

  // File system state
  fileTree: FileTreeNode[];
  fileCount: number;
  totalLines: number;
  totalSize: number;

  // Dependencies
  packageManifest: PackageManifest | null;
  installedPackages: InstalledPackage[];
  lockfileHash: string | null;

  // Configuration
  configs: ProjectConfigs;

  // Git state
  git: GitState | null;
}

interface FileTreeNode {
  path: RelativePath;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: Date;
  children?: FileTreeNode[];
}

interface PackageManifest {
  name: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

interface InstalledPackage {
  name: string;
  version: string;
  resolved: string;
  integrity?: string;
}

interface ProjectConfigs {
  typescript: TypeScriptConfig | null;
  eslint: ESLintConfig | null;
  prettier: PrettierConfig | null;
  jest: JestConfig | null;
  custom: Record<string, unknown>;
}

interface GitState {
  initialized: boolean;
  branch: string;
  remote: string | null;
  uncommittedChanges: RelativePath[];
  recentCommits: CommitInfo[];
}

interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: Date;
}

// ============================================================================
// Semantic Index
// ============================================================================

interface SemanticIndex {
  version: number;
  lastUpdated: Date;

  // Symbol tables
  symbols: SymbolTable;

  // Relationship graphs
  imports: DependencyGraph;
  exports: DependencyGraph;
  calls: CallGraph;
  inheritance: InheritanceGraph;
}

interface SymbolTable {
  functions: Map<string, FunctionSymbol[]>;
  classes: Map<string, ClassSymbol[]>;
  interfaces: Map<string, InterfaceSymbol[]>;
  types: Map<string, TypeSymbol[]>;
  variables: Map<string, VariableSymbol[]>;
  enums: Map<string, EnumSymbol[]>;
}

interface BaseSymbol {
  name: string;
  location: SourceLocation;
  exported: boolean;
  documentation?: string;
}

interface FunctionSymbol extends BaseSymbol {
  kind: 'function';
  async: boolean;
  generator: boolean;
  parameters: ParameterInfo[];
  returnType: string;
  typeParameters?: string[];
}

interface ClassSymbol extends BaseSymbol {
  kind: 'class';
  abstract: boolean;
  extends?: string;
  implements: string[];
  members: ClassMember[];
  typeParameters?: string[];
}

interface InterfaceSymbol extends BaseSymbol {
  kind: 'interface';
  extends: string[];
  members: InterfaceMember[];
  typeParameters?: string[];
}

interface TypeSymbol extends BaseSymbol {
  kind: 'type';
  definition: string;
  typeParameters?: string[];
}

interface VariableSymbol extends BaseSymbol {
  kind: 'variable';
  const: boolean;
  type: string;
}

interface EnumSymbol extends BaseSymbol {
  kind: 'enum';
  members: EnumMember[];
}

interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

interface ClassMember {
  name: string;
  kind: 'property' | 'method' | 'getter' | 'setter' | 'constructor';
  visibility: 'public' | 'private' | 'protected';
  static: boolean;
  type?: string;
  parameters?: ParameterInfo[];
}

interface InterfaceMember {
  name: string;
  kind: 'property' | 'method' | 'index' | 'call';
  optional: boolean;
  type: string;
}

interface EnumMember {
  name: string;
  value: string | number;
}

type DependencyGraph = Map<RelativePath, RelativePath[]>;
type CallGraph = Map<string, string[]>;  // fully qualified name -> called names
type InheritanceGraph = Map<string, string[]>;  // class -> parent classes/interfaces

// ============================================================================
// Convention Extractor
// ============================================================================

interface ProjectConventions {
  // Detected with confidence scores
  detected: DetectedConventions;

  // Confidence in detection (0-1)
  confidence: ConventionConfidence;

  // Samples used for detection
  sampleSize: number;
  lastAnalyzed: Date;
}

interface DetectedConventions {
  // Naming conventions
  naming: NamingConventions;

  // Code style
  style: StyleConventions;

  // Structure
  structure: StructureConventions;

  // Patterns
  patterns: PatternConventions;
}

interface NamingConventions {
  files: NamingPattern;
  directories: NamingPattern;
  functions: NamingPattern;
  classes: NamingPattern;
  interfaces: NamingPattern;
  variables: NamingPattern;
  constants: NamingPattern;
  typeParameters: NamingPattern;
}

type NamingPattern =
  | 'camelCase'
  | 'PascalCase'
  | 'snake_case'
  | 'SCREAMING_SNAKE_CASE'
  | 'kebab-case'
  | 'unknown';

interface StyleConventions {
  indentation: 'tabs' | 'spaces';
  indentSize: number;
  quotes: 'single' | 'double';
  semicolons: boolean;
  trailingCommas: 'none' | 'es5' | 'all';
  lineWidth: number;
  endOfLine: 'lf' | 'crlf' | 'auto';
}

interface StructureConventions {
  sourceDir: RelativePath;
  testDir: RelativePath;
  testPattern: string;  // e.g., "*.test.ts"
  testLocation: 'colocated' | 'separate' | 'mixed';
  indexFiles: boolean;  // Uses index.ts for re-exports
  barrelExports: boolean;
}

interface PatternConventions {
  asyncStyle: 'async-await' | 'promises' | 'callbacks' | 'mixed';
  errorHandling: 'try-catch' | 'result-type' | 'callback' | 'mixed';
  importStyle: 'named' | 'default' | 'namespace' | 'mixed';
  exportStyle: 'named' | 'default' | 'mixed';
}

interface ConventionConfidence {
  naming: number;
  style: number;
  structure: number;
  patterns: number;
  overall: number;
}

// ============================================================================
// Error Memory
// ============================================================================

interface ErrorMemory {
  patterns: ErrorPattern[];
  recentErrors: ErrorOccurrence[];
  statistics: ErrorStatistics;
}

interface ErrorPattern {
  id: string;
  fingerprint: string;  // Hash for deduplication
  category: ErrorCategory;

  // Pattern matching
  messagePattern: string;  // Regex pattern
  codePattern?: string;    // Code that triggers this

  // Metadata
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;

  // Prevention
  prevention: string;
  autoFixable: boolean;
  autoFix?: string;
}

type ErrorCategory =
  | 'syntax'
  | 'type'
  | 'reference'
  | 'import'
  | 'runtime'
  | 'logic'
  | 'hallucination'
  | 'scope-violation'
  | 'other';

interface ErrorOccurrence {
  patternId: string;
  timestamp: Date;
  taskId: TaskId;
  agentId: AgentId;

  // Context
  file?: RelativePath;
  line?: LineNumber;
  code?: string;

  // Resolution
  resolved: boolean;
  resolution?: string;
  resolutionTime?: number;  // ms
}

interface ErrorStatistics {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsByAgent: Record<string, number>;
  averageResolutionTime: number;
  topPatterns: ErrorPattern[];
}
```

### 3.3 Context Layer Types

```typescript
// ============================================================================
// Context Selection
// ============================================================================

interface ContextRequest {
  task: TaskContext;
  budget: TokenBudget;
  strategy: SelectionStrategy;
}

interface TaskContext {
  intent: string;
  targets: RelativePath[];
  symbols: string[];
  keywords: string[];
}

interface SelectionStrategy {
  // Starting points
  startFrom: 'targets' | 'symbols' | 'keywords';

  // Expansion rules
  expand: ExpansionRules;

  // Limits
  limits: SelectionLimits;

  // Priorities
  priorities: SelectionPriorities;
}

interface ExpansionRules {
  includeImports: boolean;
  includeExports: boolean;
  includeCallers: boolean;
  includeCallees: boolean;
  includeTests: boolean;
  includeSiblings: boolean;
  maxDepth: number;
}

interface SelectionLimits {
  maxFiles: number;
  maxSymbolsPerFile: number;
  maxTotalSymbols: number;
  maxTokens: TokenCount;
}

interface SelectionPriorities {
  directTargets: number;      // 1.0 = highest
  imports: number;            // Relative priority
  tests: number;
  recentlyModified: number;
  frequentlyAccessed: number;
}

interface ContextSelection {
  // Selected items
  files: SelectedFile[];
  symbols: SelectedSymbol[];

  // Metadata
  totalTokens: TokenCount;
  selectionReason: Map<string, string>;

  // Statistics
  stats: SelectionStats;
}

interface SelectedFile {
  path: RelativePath;
  content: string;
  tokens: TokenCount;
  relevance: number;
  reason: string;
  level: 'full' | 'summary' | 'signature';
}

interface SelectedSymbol {
  name: string;
  file: RelativePath;
  content: string;
  tokens: TokenCount;
  relevance: number;
  reason: string;
}

interface SelectionStats {
  filesConsidered: number;
  filesSelected: number;
  tokensUsed: TokenCount;
  tokensAvailable: TokenCount;
  compressionRatio: number;
}

// ============================================================================
// Progressive Disclosure
// ============================================================================

interface DisclosureLevel {
  level: 'signature' | 'summary' | 'full';
  content: string;
  tokens: TokenCount;
}

interface FileDisclosure {
  path: RelativePath;
  levels: {
    signature: DisclosureLevel;
    summary: DisclosureLevel;
    full: DisclosureLevel;
  };
  currentLevel: 'signature' | 'summary' | 'full';
}

// ============================================================================
// Conversation Compression
// ============================================================================

interface ConversationState {
  // Compressed summary
  summary: ConversationSummary;

  // Full history (reference)
  messages: Message[];

  // Compression info
  originalTokens: TokenCount;
  compressedTokens: TokenCount;
  compressionRatio: number;
}

interface ConversationSummary {
  // Key information
  decisions: Decision[];
  facts: EstablishedFact[];
  actions: CompletedAction[];
  pending: PendingItem[];

  // Context
  currentFocus: string;
  relevantHistory: string;
}

interface Decision {
  timestamp: Date;
  topic: string;
  decision: string;
  reasoning?: string;
}

interface EstablishedFact {
  fact: string;
  source: 'user' | 'verified' | 'inferred';
  confidence: number;
}

interface CompletedAction {
  action: string;
  result: 'success' | 'failure' | 'partial';
  summary: string;
}

interface PendingItem {
  item: string;
  priority: 'high' | 'medium' | 'low';
  blockedBy?: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens: TokenCount;
}
```

### 3.4 Verification Layer Types

```typescript
// ============================================================================
// Verification Pipeline
// ============================================================================

interface VerificationRequest {
  phase: VerificationPhase;
  content: VerificationContent;
  options: VerificationOptions;
}

type VerificationPhase =
  | 'pre-generation'   // Before LLM runs
  | 'post-generation'  // After LLM output
  | 'pre-apply';       // Before applying changes

type VerificationContent =
  | { type: 'intent'; intent: IntentDeclaration }
  | { type: 'code'; code: string; language: string }
  | { type: 'changes'; changes: FileChange[] };

interface VerificationOptions {
  strictness: 'strict' | 'standard' | 'lenient';
  skipChecks?: string[];
  additionalChecks?: string[];
}

interface VerificationResult {
  passed: boolean;
  phase: VerificationPhase;

  // Results
  checks: CheckResult[];
  errors: VerificationError[];
  warnings: VerificationWarning[];
  suggestions: VerificationSuggestion[];

  // Timing
  duration: number;
}

interface CheckResult {
  check: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

interface VerificationError {
  code: string;
  message: string;
  location?: SourceLocation;
  severity: 'error';
  suggestion?: string;
}

interface VerificationWarning {
  code: string;
  message: string;
  location?: SourceLocation;
  severity: 'warning';
  suggestion?: string;
}

interface VerificationSuggestion {
  code: string;
  message: string;
  location?: SourceLocation;
  severity: 'suggestion';
  autoFixable: boolean;
  fix?: string;
}

// ============================================================================
// File Validation
// ============================================================================

interface FileValidationRequest {
  paths: string[];
  checkContent?: boolean;
}

interface FileValidationResult {
  path: string;
  valid: boolean;

  // If valid
  exists?: boolean;
  isFile?: boolean;
  isDirectory?: boolean;
  size?: number;
  lastModified?: Date;

  // If invalid
  error?: string;
  suggestions?: FileSuggestion[];
}

interface FileSuggestion {
  path: string;
  similarity: number;
  reason: string;
}

// ============================================================================
// Symbol Resolution
// ============================================================================

interface SymbolResolutionRequest {
  symbols: SymbolReference[];
  context?: RelativePath;
}

interface SymbolReference {
  name: string;
  kind?: SymbolKind;
  module?: string;
}

type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'enum'
  | 'any';

interface SymbolResolutionResult {
  reference: SymbolReference;
  resolved: boolean;

  // If resolved
  symbol?: BaseSymbol;
  location?: SourceLocation;

  // If not resolved
  error?: string;
  suggestions?: SymbolSuggestion[];
}

interface SymbolSuggestion {
  name: string;
  kind: SymbolKind;
  location: SourceLocation;
  similarity: number;
  reason: string;
}

// ============================================================================
// API Validation
// ============================================================================

interface APIValidationRequest {
  calls: FunctionCall[];
}

interface FunctionCall {
  name: string;
  module?: string;
  arguments: CallArgument[];
  location: SourceLocation;
}

interface CallArgument {
  position: number;
  name?: string;
  value: string;
  inferredType: string;
}

interface APIValidationResult {
  call: FunctionCall;
  valid: boolean;

  // Validation details
  functionExists: boolean;
  signatureMatch: boolean;
  argumentErrors: ArgumentError[];

  // Expected signature
  expectedSignature?: string;
}

interface ArgumentError {
  position: number;
  name?: string;
  expected: string;
  actual: string;
  message: string;
}

// ============================================================================
// Dependency Validation
// ============================================================================

interface DependencyValidationRequest {
  imports: ImportStatement[];
}

interface ImportStatement {
  source: string;
  specifiers: ImportSpecifier[];
  location: SourceLocation;
}

interface ImportSpecifier {
  imported: string;
  local: string;
  isDefault: boolean;
  isNamespace: boolean;
}

interface DependencyValidationResult {
  import: ImportStatement;
  valid: boolean;

  // Validation details
  moduleExists: boolean;
  isInstalled: boolean;
  exportsExist: boolean;
  missingExports: string[];

  // Suggestions
  installCommand?: string;
  alternativeModule?: string;
}
```

### 3.5 Protocol Layer Types

```typescript
// ============================================================================
// Intent Declaration
// ============================================================================

interface IntentDeclaration {
  id: IntentId;
  timestamp: Date;
  userId: string;

  // What
  action: IntentAction;
  targets: IntentTarget[];
  description: string;

  // Why
  reason: string;
  issueReference?: string;

  // Scope
  scope: ScopeBoundary;

  // Verification
  successCriteria: string[];
  rollbackPlan?: string;

  // Status
  status: IntentStatus;
}

type IntentAction =
  | 'create'
  | 'modify'
  | 'delete'
  | 'refactor'
  | 'fix'
  | 'test'
  | 'document'
  | 'analyze';

interface IntentTarget {
  type: 'file' | 'symbol' | 'pattern';
  value: string;
  action: 'read' | 'write' | 'delete';
}

type IntentStatus =
  | 'pending'
  | 'validated'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ============================================================================
// Scope Boundary
// ============================================================================

interface ScopeBoundary {
  // File boundaries
  allowedFiles: GlobPattern[];
  forbiddenFiles: GlobPattern[];

  // Action boundaries
  allowedActions: FileAction[];

  // Size limits
  maxFilesChanged: number;
  maxLinesChanged: number;
  maxFilesCreated: number;

  // Symbol boundaries
  allowedSymbols?: string[];
  forbiddenSymbols?: string[];
}

type FileAction = 'read' | 'create' | 'modify' | 'delete';

interface ScopeViolation {
  type: ScopeViolationType;
  target: string;
  action: string;
  boundary: string;
  message: string;
}

type ScopeViolationType =
  | 'forbidden-file'
  | 'forbidden-action'
  | 'exceeded-limit'
  | 'outside-pattern'
  | 'forbidden-symbol';

// ============================================================================
// Pre-flight Checklist
// ============================================================================

interface PreflightChecklist {
  id: string;
  intentId: IntentId;

  // Items
  items: ChecklistItem[];

  // Status
  status: ChecklistStatus;
  startedAt?: Date;
  completedAt?: Date;

  // Results
  results: ChecklistItemResult[];
  summary: ChecklistSummary;
}

type ChecklistStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped';

interface ChecklistItem {
  id: string;
  name: string;
  description: string;
  category: ChecklistCategory;
  required: boolean;
  order: number;
}

type ChecklistCategory =
  | 'validation'
  | 'scope'
  | 'syntax'
  | 'dependencies'
  | 'tests'
  | 'documentation'
  | 'custom';

interface ChecklistItemResult {
  itemId: string;
  passed: boolean;
  message: string;
  duration: number;
  details?: unknown;
}

interface ChecklistSummary {
  totalItems: number;
  passedItems: number;
  failedItems: number;
  skippedItems: number;
  requiredFailed: number;
  canProceed: boolean;
}

// ============================================================================
// Rollback System
// ============================================================================

interface RollbackSnapshot {
  id: SnapshotId;
  timestamp: Date;
  intentId: IntentId;
  taskId?: TaskId;

  // What was saved
  files: SavedFile[];
  metadata: SnapshotMetadata;

  // Status
  status: SnapshotStatus;
}

interface SavedFile {
  path: RelativePath;
  content: string;
  hash: string;
  size: number;
  existed: boolean;
}

interface SnapshotMetadata {
  description: string;
  agentId?: AgentId;
  filesCount: number;
  totalSize: number;
}

type SnapshotStatus =
  | 'active'
  | 'restored'
  | 'expired'
  | 'deleted';

interface RollbackResult {
  snapshotId: SnapshotId;
  success: boolean;
  filesRestored: number;
  filesCreated: number;
  filesDeleted: number;
  errors: string[];
}

// ============================================================================
// Impact Analysis
// ============================================================================

interface ImpactAnalysis {
  intentId: IntentId;
  analyzedAt: Date;

  // Direct impacts
  direct: DirectImpact;

  // Indirect impacts
  indirect: IndirectImpact;

  // Risk assessment
  risk: RiskAssessment;

  // Recommendations
  recommendations: Recommendation[];
}

interface DirectImpact {
  filesCreated: RelativePath[];
  filesModified: RelativePath[];
  filesDeleted: RelativePath[];
  symbolsAdded: string[];
  symbolsModified: string[];
  symbolsRemoved: string[];
  linesAdded: number;
  linesRemoved: number;
}

interface IndirectImpact {
  dependentFiles: RelativePath[];
  affectedTests: RelativePath[];
  brokenImports: BrokenImport[];
  typeErrors: TypeImpact[];
}

interface BrokenImport {
  file: RelativePath;
  import: string;
  reason: string;
}

interface TypeImpact {
  file: RelativePath;
  location: SourceLocation;
  message: string;
}

interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number;  // 0-100
  factors: RiskFactor[];
}

interface RiskFactor {
  name: string;
  weight: number;
  score: number;
  description: string;
}

interface Recommendation {
  type: 'test' | 'review' | 'backup' | 'split' | 'documentation';
  priority: 'high' | 'medium' | 'low';
  message: string;
  action?: string;
}
```

### 3.6 Execution Layer Types

```typescript
// ============================================================================
// Agent Hierarchy
// ============================================================================

type HierarchyLevel =
  | 'sovereign'
  | 'lord'
  | 'overlord'
  | 'worker';

interface AgentDefinition {
  id: AgentId;
  level: HierarchyLevel;
  role: AgentRole;
  model: AIModel;
  status: AgentStatus;

  // Configuration
  config: AgentConfig;

  // Metrics
  metrics: AgentMetrics;
}

type AgentRole =
  | 'architect'      // High-level design decisions
  | 'planner'        // Task breakdown and planning
  | 'implementer'    // Code implementation
  | 'reviewer'       // Code review
  | 'tester'         // Test creation
  | 'fixer';         // Bug fixing

type AIModel =
  | 'claude-opus'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'glm-4';

type AgentStatus =
  | 'idle'
  | 'busy'
  | 'waiting'
  | 'error'
  | 'terminated';

interface AgentConfig {
  maxConcurrentTasks: number;
  timeoutMs: number;
  retryConfig: RetryConfig;
  constraints: AgentConstraints;
}

interface AgentConstraints {
  maxTokensPerRequest: TokenCount;
  maxOutputTokens: TokenCount;
  allowedActions: string[];
  forbiddenPatterns: string[];
}

interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  totalTokensUsed: TokenCount;
  averageResponseTime: number;
  successRate: number;
}

// ============================================================================
// Task Management
// ============================================================================

interface Task {
  id: TaskId;
  missionId: MissionId;
  parentTaskId: TaskId | null;
  childTaskIds: TaskId[];

  // Assignment
  level: HierarchyLevel;
  assignedAgentId: AgentId | null;

  // Definition
  type: TaskType;
  title: string;
  description: string;
  context: TaskContext;
  input: TaskInput;

  // Status
  status: TaskStatus;
  priority: TaskPriority;

  // Dependencies
  dependencies: TaskDependency[];

  // Output
  output: TaskOutput | null;

  // Timing
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;

  // Metrics
  metrics: TaskMetrics;
}

type TaskType =
  | 'analyze'
  | 'plan'
  | 'implement'
  | 'review'
  | 'test'
  | 'fix'
  | 'document'
  | 'refactor';

type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

type TaskPriority = 0 | 1 | 2 | 3 | 4;  // 0 = lowest, 4 = critical

interface TaskInput {
  prompt: string;
  context: ContextSelection;
  constraints?: string[];
  examples?: string[];
}

interface TaskOutput {
  response: string;
  artifacts: Artifact[];
  metrics: OutputMetrics;
}

interface Artifact {
  type: 'code' | 'document' | 'analysis' | 'plan';
  path?: RelativePath;
  content: string;
  language?: string;
}

interface TaskDependency {
  taskId: TaskId;
  type: 'blocks' | 'informs';
  status: 'pending' | 'satisfied';
}

interface TaskMetrics {
  tokensIn: TokenCount;
  tokensOut: TokenCount;
  duration: number;
  retries: number;
}

interface OutputMetrics {
  tokensUsed: TokenCount;
  processingTime: number;
}

// ============================================================================
// Mission
// ============================================================================

interface Mission {
  id: MissionId;
  intentId: IntentId;

  // Definition
  title: string;
  description: string;
  mode: MissionMode;

  // Status
  status: MissionStatus;
  progress: MissionProgress;

  // Tasks
  rootTaskId: TaskId;
  taskCount: number;

  // Timing
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;

  // Results
  result?: MissionResult;
}

type MissionMode =
  | 'planning'
  | 'execution'
  | 'analysis';

type MissionStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface MissionProgress {
  tasksTotal: number;
  tasksCompleted: number;
  tasksFailed: number;
  percentage: number;
  currentPhase: string;
}

interface MissionResult {
  success: boolean;
  summary: string;
  artifacts: Artifact[];
  metrics: MissionMetrics;
  errors?: string[];
}

interface MissionMetrics {
  totalDuration: number;
  totalTokens: TokenCount;
  agentsUsed: number;
  tasksExecuted: number;
}

// ============================================================================
// Retry Configuration
// ============================================================================

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors: string[];
  nonRetryableErrors: string[];
}
```

### 3.7 Integration Layer Types

```typescript
// ============================================================================
// AI Provider Interface
// ============================================================================

interface AIProvider {
  name: string;
  models: AIModel[];

  // Capabilities
  capabilities: ProviderCapabilities;

  // Methods
  complete(request: CompletionRequest): AsyncResult<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  countTokens(text: string): TokenCount;
}

interface ProviderCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  maxContextWindow: TokenCount;
  maxOutputTokens: TokenCount;
}

interface CompletionRequest {
  model: AIModel;
  messages: ProviderMessage[];
  maxTokens?: TokenCount;
  temperature?: number;
  stopSequences?: string[];
  systemPrompt?: string;
}

interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; content: string };

interface CompletionResponse {
  content: string;
  finishReason: 'stop' | 'max_tokens' | 'error';
  usage: TokenUsage;
}

interface TokenUsage {
  inputTokens: TokenCount;
  outputTokens: TokenCount;
  totalTokens: TokenCount;
}

interface StreamChunk {
  type: 'text' | 'done' | 'error';
  content?: string;
  error?: string;
}

// ============================================================================
// Claude Adapter
// ============================================================================

interface ClaudeConfig {
  cliPath: string;
  model: 'opus' | 'sonnet' | 'haiku';
  maxOutputTokens: TokenCount;
  timeout: number;
}

// ============================================================================
// GLM Adapter
// ============================================================================

interface GLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens: TokenCount;
  temperature: number;
}
```

### 3.8 Infrastructure Layer Types

```typescript
// ============================================================================
// Database
// ============================================================================

interface Database {
  // Missions
  createMission(mission: Mission): AsyncResult<void>;
  getMission(id: MissionId): AsyncResult<Mission | null>;
  updateMission(mission: Mission): AsyncResult<void>;
  listMissions(filter?: MissionFilter): AsyncResult<Mission[]>;

  // Tasks
  createTask(task: Task): AsyncResult<void>;
  getTask(id: TaskId): AsyncResult<Task | null>;
  updateTask(task: Task): AsyncResult<void>;
  getTasksByMission(missionId: MissionId): AsyncResult<Task[]>;

  // Agents
  createAgent(agent: AgentDefinition): AsyncResult<void>;
  getAgent(id: AgentId): AsyncResult<AgentDefinition | null>;
  updateAgent(agent: AgentDefinition): AsyncResult<void>;

  // Snapshots
  createSnapshot(snapshot: RollbackSnapshot): AsyncResult<void>;
  getSnapshot(id: SnapshotId): AsyncResult<RollbackSnapshot | null>;
  listSnapshots(intentId: IntentId): AsyncResult<RollbackSnapshot[]>;
}

interface MissionFilter {
  status?: MissionStatus[];
  mode?: MissionMode[];
  since?: Date;
  limit?: number;
}

// ============================================================================
// Cache
// ============================================================================

interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}

// ============================================================================
// Event Bus
// ============================================================================

interface EventBus {
  emit<T extends Event>(event: T): void;
  on<T extends Event>(type: T['type'], handler: EventHandler<T>): Disposable;
  off<T extends Event>(type: T['type'], handler: EventHandler<T>): void;
}

type EventHandler<T> = (event: T) => void;

interface Disposable {
  dispose(): void;
}

interface Event {
  type: string;
  timestamp: Date;
}

// Specific events
interface MissionEvent extends Event {
  type: 'mission:created' | 'mission:started' | 'mission:completed' | 'mission:failed';
  missionId: MissionId;
}

interface TaskEvent extends Event {
  type: 'task:created' | 'task:started' | 'task:completed' | 'task:failed';
  taskId: TaskId;
  missionId: MissionId;
}

interface VerificationEvent extends Event {
  type: 'verification:started' | 'verification:passed' | 'verification:failed';
  phase: VerificationPhase;
  result?: VerificationResult;
}

interface FileEvent extends Event {
  type: 'file:created' | 'file:modified' | 'file:deleted';
  path: RelativePath;
}

// ============================================================================
// Configuration
// ============================================================================

interface AlterCodeConfig {
  // General
  projectRoot: FilePath;
  enabled: boolean;

  // AI Providers
  claude: ClaudeConfig;
  glm: GLMConfig;

  // Verification
  verification: VerificationConfig;

  // Protocol
  protocol: ProtocolConfig;

  // Storage
  storage: StorageConfig;

  // UI
  ui: UIConfig;
}

interface VerificationConfig {
  enabled: boolean;
  strictness: 'strict' | 'standard' | 'lenient';
  preGeneration: boolean;
  postGeneration: boolean;
  preApply: boolean;
}

interface ProtocolConfig {
  requireIntent: boolean;
  enforceScope: boolean;
  preflightChecks: boolean;
  autoSnapshot: boolean;
  impactAnalysis: boolean;
}

interface StorageConfig {
  databasePath: FilePath;
  cachePath: FilePath;
  snapshotPath: FilePath;
  maxSnapshots: number;
  cacheMaxSize: number;
}

interface UIConfig {
  theme: 'auto' | 'light' | 'dark';
  showVerification: boolean;
  showImpactAnalysis: boolean;
  confirmBeforeApply: boolean;
}

// ============================================================================
// Logger
// ============================================================================

interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, error?: Error, ...args: unknown[]): void;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  timestamp: Date;
  component: string;
  message: string;
  data?: unknown;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
```

---

## 4. Component Interfaces

### 4.1 Knowledge Layer Interfaces

```typescript
// ============================================================================
// Project Snapshot Service
// ============================================================================

interface IProjectSnapshotService {
  // Capture current state
  capture(): AsyncResult<ProjectSnapshot>;

  // Get latest snapshot
  getLatest(): ProjectSnapshot | null;

  // Compare snapshots
  diff(from: SnapshotId, to: SnapshotId): AsyncResult<SnapshotDiff>;

  // Watch for changes
  watch(): Disposable;
}

interface SnapshotDiff {
  filesAdded: RelativePath[];
  filesModified: RelativePath[];
  filesDeleted: RelativePath[];
  dependenciesChanged: boolean;
  configsChanged: string[];
}

// ============================================================================
// Semantic Index Service
// ============================================================================

interface ISemanticIndexService {
  // Build full index
  buildIndex(): AsyncResult<SemanticIndex>;

  // Update incrementally
  updateFile(path: RelativePath): AsyncResult<void>;
  removeFile(path: RelativePath): AsyncResult<void>;

  // Query
  findSymbol(name: string, kind?: SymbolKind): BaseSymbol[];
  findSymbolsInFile(path: RelativePath): BaseSymbol[];
  getImports(path: RelativePath): RelativePath[];
  getExports(path: RelativePath): BaseSymbol[];
  getCallers(symbol: string): SourceLocation[];
  getCallees(symbol: string): string[];

  // Search
  search(query: string, options?: SearchOptions): SearchResult[];
}

interface SearchOptions {
  kinds?: SymbolKind[];
  files?: GlobPattern;
  limit?: number;
}

interface SearchResult {
  symbol: BaseSymbol;
  score: number;
  matches: TextMatch[];
}

interface TextMatch {
  text: string;
  start: number;
  end: number;
}

// ============================================================================
// Convention Extractor Service
// ============================================================================

interface IConventionExtractorService {
  // Analyze project
  analyze(): AsyncResult<ProjectConventions>;

  // Get current conventions
  getConventions(): ProjectConventions | null;

  // Check compliance
  checkCompliance(code: string, file: RelativePath): ComplianceResult;
}

interface ComplianceResult {
  compliant: boolean;
  violations: ConventionViolation[];
}

interface ConventionViolation {
  convention: string;
  expected: string;
  actual: string;
  location?: SourceLocation;
  autoFixable: boolean;
}

// ============================================================================
// Error Memory Service
// ============================================================================

interface IErrorMemoryService {
  // Record errors
  recordError(error: Error, context: ErrorContext): AsyncResult<void>;
  recordResolution(patternId: string, resolution: string): AsyncResult<void>;

  // Query
  getPatterns(): ErrorPattern[];
  getPattern(id: string): ErrorPattern | null;
  findSimilar(error: Error): ErrorPattern[];

  // Prevention
  getPreventionHints(context: TaskContext): string[];
}

interface ErrorContext {
  taskId: TaskId;
  agentId: AgentId;
  file?: RelativePath;
  code?: string;
}
```

### 4.2 Context Layer Interfaces

```typescript
// ============================================================================
// Context Selector Service
// ============================================================================

interface IContextSelectorService {
  // Select context
  select(request: ContextRequest): AsyncResult<ContextSelection>;

  // Explain selection
  explainSelection(selection: ContextSelection): SelectionExplanation;
}

interface SelectionExplanation {
  summary: string;
  perFile: Map<RelativePath, string>;
  perSymbol: Map<string, string>;
}

// ============================================================================
// Token Budget Service
// ============================================================================

interface ITokenBudgetService {
  // Budget management
  allocate(total: TokenCount): TokenBudget;
  checkBudget(content: string, budget: TokenBudget): BudgetCheck;

  // Counting
  countTokens(text: string): TokenCount;
  estimateTokens(request: ContextRequest): TokenCount;
}

interface BudgetCheck {
  withinBudget: boolean;
  used: TokenCount;
  remaining: TokenCount;
  overflow?: TokenCount;
}

// ============================================================================
// Progressive Disclosure Service
// ============================================================================

interface IProgressiveDisclosureService {
  // Generate levels
  generateLevels(file: RelativePath): AsyncResult<FileDisclosure>;

  // Get at level
  getAtLevel(file: RelativePath, level: 'signature' | 'summary' | 'full'): string;
}

// ============================================================================
// Conversation Compressor Service
// ============================================================================

interface IConversationCompressorService {
  // Compress
  compress(messages: Message[]): AsyncResult<ConversationSummary>;

  // Manage state
  addMessage(message: Message): void;
  getState(): ConversationState;
  reset(): void;
}
```

### 4.3 Verification Layer Interfaces

```typescript
// ============================================================================
// Verification Pipeline Service
// ============================================================================

interface IVerificationPipelineService {
  // Run verification
  verify(request: VerificationRequest): AsyncResult<VerificationResult>;

  // Individual checks
  verifyFiles(paths: string[]): AsyncResult<FileValidationResult[]>;
  verifySymbols(symbols: SymbolReference[]): AsyncResult<SymbolResolutionResult[]>;
  verifyAPIs(calls: FunctionCall[]): AsyncResult<APIValidationResult[]>;
  verifyDependencies(imports: ImportStatement[]): AsyncResult<DependencyValidationResult[]>;
}

// ============================================================================
// File Validator Service
// ============================================================================

interface IFileValidatorService {
  // Validate
  validate(paths: string[]): AsyncResult<FileValidationResult[]>;

  // Suggest corrections
  suggestCorrection(invalidPath: string): FileSuggestion[];

  // Check existence
  exists(path: string): boolean;
  isFile(path: string): boolean;
  isDirectory(path: string): boolean;
}

// ============================================================================
// Symbol Resolver Service
// ============================================================================

interface ISymbolResolverService {
  // Resolve
  resolve(references: SymbolReference[]): AsyncResult<SymbolResolutionResult[]>;

  // Quick check
  exists(name: string, kind?: SymbolKind): boolean;

  // Suggestions
  suggest(name: string): SymbolSuggestion[];
}

// ============================================================================
// API Checker Service
// ============================================================================

interface IAPICheckerService {
  // Validate
  validate(calls: FunctionCall[]): AsyncResult<APIValidationResult[]>;

  // Get signature
  getSignature(name: string, module?: string): string | null;
}

// ============================================================================
// Dependency Verifier Service
// ============================================================================

interface IDependencyVerifierService {
  // Validate
  validate(imports: ImportStatement[]): AsyncResult<DependencyValidationResult[]>;

  // Check package
  isInstalled(packageName: string): boolean;
  getVersion(packageName: string): string | null;
}
```

### 4.4 Protocol Layer Interfaces

```typescript
// ============================================================================
// Intent Service
// ============================================================================

interface IIntentService {
  // Create
  declare(input: IntentInput): AsyncResult<IntentDeclaration>;

  // Validate
  validate(intent: IntentDeclaration): AsyncResult<IntentValidation>;

  // Manage
  getIntent(id: IntentId): IntentDeclaration | null;
  updateStatus(id: IntentId, status: IntentStatus): AsyncResult<void>;
  cancel(id: IntentId): AsyncResult<void>;
}

interface IntentInput {
  action: IntentAction;
  targets: string[];
  description: string;
  reason: string;
  scope?: Partial<ScopeBoundary>;
}

interface IntentValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestedScope?: ScopeBoundary;
}

// ============================================================================
// Scope Guard Service
// ============================================================================

interface IScopeGuardService {
  // Set scope
  setScope(scope: ScopeBoundary): void;

  // Check access
  checkFileAccess(file: RelativePath, action: FileAction): ScopeCheck;
  checkSymbolAccess(symbol: string, action: FileAction): ScopeCheck;

  // Enforce on changes
  enforceScope(changes: FileChange[]): ScopeEnforcement;
}

interface ScopeCheck {
  allowed: boolean;
  reason?: string;
  violation?: ScopeViolation;
}

interface ScopeEnforcement {
  approved: FileChange[];
  rejected: FileChange[];
  violations: ScopeViolation[];
}

interface FileChange {
  path: RelativePath;
  action: FileAction;
  content?: string;
  diff?: string;
}

// ============================================================================
// Preflight Service
// ============================================================================

interface IPreflightService {
  // Create checklist
  createChecklist(intent: IntentDeclaration): PreflightChecklist;

  // Run checklist
  run(checklist: PreflightChecklist): AsyncResult<PreflightChecklist>;

  // Custom checks
  addCustomCheck(check: ChecklistItem): void;
  removeCustomCheck(id: string): void;
}

// ============================================================================
// Rollback Service
// ============================================================================

interface IRollbackService {
  // Create snapshot
  createSnapshot(intent: IntentDeclaration, files: RelativePath[]): AsyncResult<RollbackSnapshot>;

  // Restore
  rollback(snapshotId: SnapshotId): AsyncResult<RollbackResult>;

  // Query
  getSnapshot(id: SnapshotId): RollbackSnapshot | null;
  listSnapshots(intentId?: IntentId): RollbackSnapshot[];

  // Cleanup
  pruneOldSnapshots(maxAge: number): AsyncResult<number>;
}

// ============================================================================
// Impact Analyzer Service
// ============================================================================

interface IImpactAnalyzerService {
  // Analyze
  analyze(intent: IntentDeclaration, changes: FileChange[]): AsyncResult<ImpactAnalysis>;

  // Quick checks
  getAffectedTests(files: RelativePath[]): RelativePath[];
  getDependents(file: RelativePath): RelativePath[];
}
```

### 4.5 Execution Layer Interfaces

```typescript
// ============================================================================
// Agent Pool Service
// ============================================================================

interface IAgentPoolService {
  // Get agents
  getAgent(level: HierarchyLevel): AsyncResult<AgentDefinition>;
  getAgentById(id: AgentId): AgentDefinition | null;

  // Execute
  execute(request: AgentRequest): AsyncResult<AgentResponse>;

  // Manage
  spawn(level: HierarchyLevel, role: AgentRole): AsyncResult<AgentDefinition>;
  terminate(agentId: AgentId): AsyncResult<void>;
}

interface AgentRequest {
  agentId: AgentId;
  task: Task;
  context: ContextSelection;
  prompt: string;
}

interface AgentResponse {
  agentId: AgentId;
  taskId: TaskId;
  content: string;
  artifacts: Artifact[];
  usage: TokenUsage;
  duration: number;
}

// ============================================================================
// Task Manager Service
// ============================================================================

interface ITaskManagerService {
  // Create
  createTask(config: TaskConfig): AsyncResult<Task>;

  // Query
  getTask(id: TaskId): Task | null;
  getTasksByMission(missionId: MissionId): Task[];
  getTasksByStatus(status: TaskStatus): Task[];
  getChildTasks(taskId: TaskId): Task[];

  // Update
  updateStatus(taskId: TaskId, status: TaskStatus): AsyncResult<void>;
  assignAgent(taskId: TaskId, agentId: AgentId): AsyncResult<void>;
  setOutput(taskId: TaskId, output: TaskOutput): AsyncResult<void>;

  // Dependencies
  areDependenciesSatisfied(taskId: TaskId): boolean;
  getNextReadyTask(level?: HierarchyLevel): Task | null;
}

interface TaskConfig {
  missionId: MissionId;
  parentTaskId?: TaskId;
  level: HierarchyLevel;
  type: TaskType;
  title: string;
  description: string;
  priority?: TaskPriority;
  dependencies?: TaskId[];
}

// ============================================================================
// Mission Manager Service
// ============================================================================

interface IMissionManagerService {
  // Create
  createMission(intent: IntentDeclaration): AsyncResult<Mission>;

  // Query
  getMission(id: MissionId): Mission | null;
  getActiveMissions(): Mission[];
  getMissionsByStatus(status: MissionStatus): Mission[];

  // Control
  start(missionId: MissionId): AsyncResult<void>;
  pause(missionId: MissionId): AsyncResult<void>;
  resume(missionId: MissionId): AsyncResult<void>;
  cancel(missionId: MissionId): AsyncResult<void>;

  // Progress
  getProgress(missionId: MissionId): MissionProgress;
}

// ============================================================================
// Execution Coordinator Service
// ============================================================================

interface IExecutionCoordinatorService {
  // Execute
  execute(mission: Mission): AsyncResult<MissionResult>;

  // Task execution
  executeTask(task: Task): AsyncResult<TaskOutput>;

  // Monitoring
  onProgress(handler: (progress: ExecutionProgress) => void): Disposable;
}

interface ExecutionProgress {
  missionId: MissionId;
  phase: string;
  currentTask?: TaskId;
  tasksCompleted: number;
  tasksTotal: number;
  message: string;
}
```

---

## 5. Directory Structure

```
altercode-v2/
├── docs/
│   ├── ARCHITECTURE.md          # This document
│   ├── API.md                   # API reference
│   └── DEVELOPMENT.md           # Development guide
│
├── src/
│   ├── types/
│   │   ├── common.ts            # Common types (Result, Brand, etc.)
│   │   ├── knowledge.ts         # Knowledge layer types
│   │   ├── context.ts           # Context layer types
│   │   ├── verification.ts      # Verification layer types
│   │   ├── protocol.ts          # Protocol layer types
│   │   ├── execution.ts         # Execution layer types
│   │   ├── integration.ts       # Integration layer types
│   │   ├── infrastructure.ts    # Infrastructure layer types
│   │   └── index.ts             # Re-exports all types
│   │
│   ├── knowledge/
│   │   ├── ProjectSnapshotService.ts
│   │   ├── SemanticIndexService.ts
│   │   ├── ConventionExtractorService.ts
│   │   ├── ErrorMemoryService.ts
│   │   └── index.ts
│   │
│   ├── context/
│   │   ├── ContextSelectorService.ts
│   │   ├── TokenBudgetService.ts
│   │   ├── ProgressiveDisclosureService.ts
│   │   ├── ConversationCompressorService.ts
│   │   └── index.ts
│   │
│   ├── verification/
│   │   ├── VerificationPipelineService.ts
│   │   ├── FileValidatorService.ts
│   │   ├── SymbolResolverService.ts
│   │   ├── APICheckerService.ts
│   │   ├── DependencyVerifierService.ts
│   │   └── index.ts
│   │
│   ├── protocol/
│   │   ├── IntentService.ts
│   │   ├── ScopeGuardService.ts
│   │   ├── PreflightService.ts
│   │   ├── RollbackService.ts
│   │   ├── ImpactAnalyzerService.ts
│   │   └── index.ts
│   │
│   ├── execution/
│   │   ├── AgentPoolService.ts
│   │   ├── TaskManagerService.ts
│   │   ├── MissionManagerService.ts
│   │   ├── ExecutionCoordinatorService.ts
│   │   └── index.ts
│   │
│   ├── integration/
│   │   ├── AIProvider.ts
│   │   ├── ClaudeAdapter.ts
│   │   ├── GLMAdapter.ts
│   │   └── index.ts
│   │
│   ├── infrastructure/
│   │   ├── Database.ts
│   │   ├── Cache.ts
│   │   ├── EventBus.ts
│   │   ├── ConfigManager.ts
│   │   ├── Logger.ts
│   │   ├── FileSystemWatcher.ts
│   │   └── index.ts
│   │
│   ├── ui/
│   │   ├── MissionControlPanel.ts
│   │   ├── ChatProvider.ts
│   │   ├── TaskTreeProvider.ts
│   │   ├── VerificationDashboard.ts
│   │   └── index.ts
│   │
│   ├── core/
│   │   ├── AlterCodeCore.ts     # Main orchestrator
│   │   ├── ServiceContainer.ts  # Dependency injection
│   │   └── index.ts
│   │
│   └── extension.ts             # VS Code entry point
│
├── test/
│   ├── unit/
│   │   ├── knowledge/
│   │   ├── context/
│   │   ├── verification/
│   │   ├── protocol/
│   │   ├── execution/
│   │   └── infrastructure/
│   │
│   ├── integration/
│   │   └── ...
│   │
│   └── e2e/
│       └── ...
│
├── package.json
├── tsconfig.json
├── .eslintrc.js
└── .prettierrc
```

---

## 6. Implementation Order

### Phase 1: Foundation
1. Types system (all type definitions)
2. Infrastructure layer (Database, Cache, EventBus, Logger)
3. Configuration management

### Phase 2: Knowledge Layer
1. ProjectSnapshotService
2. SemanticIndexService (basic)
3. FileTreeScanner
4. ASTParser

### Phase 3: Context Layer
1. TokenBudgetService
2. ContextSelectorService (basic)
3. Integration with Knowledge layer

### Phase 4: Verification Layer
1. FileValidatorService
2. SymbolResolverService
3. VerificationPipelineService

### Phase 5: Protocol Layer
1. IntentService
2. ScopeGuardService
3. PreflightService
4. RollbackService

### Phase 6: Execution Layer
1. TaskManagerService
2. AgentPoolService
3. ExecutionCoordinatorService
4. MissionManagerService

### Phase 7: Integration
1. ClaudeAdapter
2. GLMAdapter

### Phase 8: UI Layer
1. MissionControlPanel
2. ChatProvider
3. VerificationDashboard

### Phase 9: Advanced Features
1. ConventionExtractorService
2. ErrorMemoryService
3. ImpactAnalyzerService
4. Progressive Disclosure
5. Conversation Compression

---

## 7. Open Design Questions

1. **Dependency Injection Strategy**
   - Constructor injection vs service locator?
   - Interface-based or concrete classes?

2. **Error Handling Strategy**
   - Result types everywhere or try/catch?
   - How to propagate errors across layers?

3. **Async Patterns**
   - Pure async/await or observable streams?
   - How to handle cancellation?

4. **Storage Strategy**
   - One database or separate per layer?
   - In-memory caching strategy?

5. **Event Architecture**
   - Synchronous or asynchronous events?
   - Event sourcing for audit trail?

---

## 8. Appendix

### 8.1 Glossary

| Term | Definition |
|------|------------|
| **Intent** | Explicit declaration of what action will be taken and why |
| **Scope** | Boundaries defining what can and cannot be changed |
| **Verification** | Process of confirming information against reality |
| **Hallucination** | LLM-generated content that doesn't match reality |
| **Progressive Disclosure** | Loading information incrementally by detail level |
| **Rollback** | Reverting to a previous known-good state |

### 8.2 References

- TypeScript Compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- VS Code Extension API: https://code.visualstudio.com/api
- tiktoken: https://github.com/openai/tiktoken
- sql.js: https://github.com/sql-js/sql.js
- LevelDB: https://github.com/Level/level
