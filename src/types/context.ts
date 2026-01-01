/**
 * Context Layer Types
 *
 * Types for context optimization:
 * - Context Selection
 * - Token Budget
 * - Progressive Disclosure
 * - Conversation Compression
 */

import { AsyncResult, RelativePath, TokenCount } from './common';

// ============================================================================
// Token Budget Types
// ============================================================================

/** Token budget allocation */
export interface TokenBudget {
  readonly total: TokenCount;
  readonly system: TokenCount;
  readonly context: TokenCount;
  readonly history: TokenCount;
  readonly reserved: TokenCount;
}

/** Budget check result */
export interface BudgetCheck {
  readonly withinBudget: boolean;
  readonly used: TokenCount;
  readonly remaining: TokenCount;
  readonly overflow?: TokenCount;
}

/** Token usage */
export interface TokenUsage {
  readonly inputTokens: TokenCount;
  readonly outputTokens: TokenCount;
  readonly totalTokens: TokenCount;
}

// ============================================================================
// Context Selection Types
// ============================================================================

/** Task context for selection */
export interface TaskContextInfo {
  readonly intent: string;
  readonly targets: RelativePath[];
  readonly symbols: string[];
  readonly keywords: string[];
}

/** Expansion rules for context */
export interface ExpansionRules {
  readonly includeImports: boolean;
  readonly includeExports: boolean;
  readonly includeCallers: boolean;
  readonly includeCallees: boolean;
  readonly includeTests: boolean;
  readonly includeSiblings: boolean;
  readonly maxDepth: number;
}

/** Selection limits */
export interface SelectionLimits {
  readonly maxFiles: number;
  readonly maxSymbolsPerFile: number;
  readonly maxTotalSymbols: number;
  readonly maxTokens: TokenCount;
  readonly maxDepth?: number;
}

/** Selection priorities */
export interface SelectionPriorities {
  readonly directTargets: number;
  readonly imports: number;
  readonly tests: number;
  readonly recentlyModified: number;
  readonly frequentlyAccessed: number;
}

/** Selection strategy */
export interface SelectionStrategy {
  readonly startFrom: 'targets' | 'symbols' | 'keywords';
  readonly expand: ExpansionRules;
  readonly limits: SelectionLimits;
  readonly priorities: SelectionPriorities;
}

/** Context request */
export interface ContextRequest {
  readonly task: TaskContextInfo;
  readonly budget: TokenBudget;
  readonly strategy: SelectionStrategy;
}

/** Disclosure level */
export type DisclosureLevel = 'signature' | 'summary' | 'full';

/** Selected file */
export interface SelectedFile {
  readonly path: RelativePath;
  readonly content: string;
  readonly tokens: TokenCount;
  readonly relevance: number;
  readonly reason: string;
  readonly level: DisclosureLevel;
}

/** Selected symbol */
export interface SelectedSymbol {
  readonly name: string;
  readonly file: RelativePath;
  readonly content: string;
  readonly tokens: TokenCount;
  readonly relevance: number;
  readonly reason: string;
}

/** Selection statistics */
export interface SelectionStats {
  readonly filesConsidered: number;
  readonly filesSelected: number;
  readonly symbolsConsidered: number;
  readonly symbolsSelected: number;
  readonly tokensUsed: TokenCount;
  readonly tokensAvailable: TokenCount;
  readonly compressionRatio: number;
}

/** Context item for simple usage */
export interface ContextItem {
  readonly type: string;
  readonly path?: string;
  readonly content: string;
}

/** Context selection result */
export interface ContextSelection {
  readonly files: SelectedFile[];
  readonly symbols: SelectedSymbol[];
  readonly totalTokens: TokenCount;
  readonly selectionReasons: Map<string, string>;
  readonly stats: SelectionStats;
  /** Flattened items for simple usage */
  readonly items?: ContextItem[];
}

/** Selection explanation */
export interface SelectionExplanation {
  readonly summary: string;
  readonly perFile: Map<RelativePath, string>;
  readonly perSymbol: Map<string, string>;
}

// ============================================================================
// Progressive Disclosure Types
// ============================================================================

/** Disclosure level content */
export interface DisclosureLevelContent {
  readonly level: DisclosureLevel;
  readonly content: string;
  readonly tokens: TokenCount;
}

/** File disclosure */
export interface FileDisclosure {
  readonly path: RelativePath;
  readonly levels: {
    readonly signature: DisclosureLevelContent;
    readonly summary: DisclosureLevelContent;
    readonly full: DisclosureLevelContent;
  };
  readonly currentLevel: DisclosureLevel;
}

/** Symbol disclosure */
export interface SymbolDisclosure {
  readonly name: string;
  readonly file: RelativePath;
  readonly levels: {
    readonly signature: DisclosureLevelContent;
    readonly summary: DisclosureLevelContent;
    readonly full: DisclosureLevelContent;
  };
  readonly currentLevel: DisclosureLevel;
}

// ============================================================================
// Conversation Compression Types
// ============================================================================

/** Message role */
export type MessageRole = 'user' | 'assistant' | 'system';

/** Conversation message */
export interface Message {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: Date;
  readonly tokens: TokenCount;
  readonly metadata?: Record<string, unknown>;
}

/** Decision record */
export interface Decision {
  readonly id: string;
  readonly timestamp: Date;
  readonly topic: string;
  readonly decision: string;
  readonly reasoning?: string;
  readonly participants: MessageRole[];
}

/** Established fact */
export interface EstablishedFact {
  readonly id: string;
  readonly fact: string;
  readonly source: 'user' | 'verified' | 'inferred';
  readonly confidence: number;
  readonly establishedAt: Date;
  readonly relatedMessages: string[];
}

/** Completed action */
export interface CompletedAction {
  readonly id: string;
  readonly action: string;
  readonly result: 'success' | 'failure' | 'partial';
  readonly summary: string;
  readonly timestamp: Date;
  readonly artifacts?: string[];
}

/** Pending item */
export interface PendingItem {
  readonly id: string;
  readonly item: string;
  readonly priority: 'high' | 'medium' | 'low';
  readonly addedAt: Date;
  readonly blockedBy?: string;
}

/** Conversation summary */
export interface ConversationSummary {
  readonly decisions: Decision[];
  readonly facts: EstablishedFact[];
  readonly actions: CompletedAction[];
  readonly pending: PendingItem[];
  readonly currentFocus: string;
  readonly relevantHistory: string;
}

/** Conversation state */
export interface ConversationState {
  readonly summary: ConversationSummary;
  readonly messages: Message[];
  readonly originalTokens: TokenCount;
  readonly compressedTokens: TokenCount;
  readonly compressionRatio: number;
}

// ============================================================================
// Default Values
// ============================================================================

import { toTokenCount } from './common';

/** Default expansion rules */
export const DEFAULT_EXPANSION_RULES: ExpansionRules = {
  includeImports: true,
  includeExports: true,
  includeCallers: false,
  includeCallees: true,
  includeTests: true,
  includeSiblings: false,
  maxDepth: 2,
};

/** Default selection limits */
export const DEFAULT_SELECTION_LIMITS: SelectionLimits = {
  maxFiles: 20,
  maxSymbolsPerFile: 50,
  maxTotalSymbols: 200,
  maxTokens: toTokenCount(8000),
};

/** Default selection priorities */
export const DEFAULT_SELECTION_PRIORITIES: SelectionPriorities = {
  directTargets: 1.0,
  imports: 0.8,
  tests: 0.6,
  recentlyModified: 0.4,
  frequentlyAccessed: 0.3,
};

/** Default selection strategy */
export const DEFAULT_SELECTION_STRATEGY: SelectionStrategy = {
  startFrom: 'targets',
  expand: DEFAULT_EXPANSION_RULES,
  limits: DEFAULT_SELECTION_LIMITS,
  priorities: DEFAULT_SELECTION_PRIORITIES,
};

// ============================================================================
// Context Service Interfaces
// ============================================================================

/** Simple context request */
export interface SimpleContextRequest {
  query: string;
  budget: number;
  priorityFiles?: string[];
}

/** Context selector service */
export interface IContextSelectorService {
  select(request: ContextRequest | SimpleContextRequest): AsyncResult<ContextSelection>;
  explainSelection(selection: ContextSelection): SelectionExplanation;
}

/** Budget category for allocation */
export type BudgetCategory = 'system' | 'context' | 'history' | 'agent' | 'reserved';

/** Token budget service */
export interface ITokenBudgetService {
  // Basic allocation
  allocate(total: TokenCount): TokenBudget;

  // Budget checking
  checkBudget(content: string, budget: TokenBudget): BudgetCheck;
  canAllocate?(category: BudgetCategory, tokens: number): boolean;

  // Token counting
  countTokens(text: string): TokenCount;
  estimateTokens(request: ContextRequest): TokenCount;

  // Release tokens back
  release?(category: BudgetCategory, tokens: number): void;

  // Get current usage
  getUsage?(): Record<BudgetCategory, number>;
}

/** Progressive disclosure service */
export interface IProgressiveDisclosureService {
  generateLevels(file: RelativePath): AsyncResult<FileDisclosure>;
  getAtLevel(file: RelativePath, level: DisclosureLevel): AsyncResult<string>;
  generateSymbolLevels(name: string, file: RelativePath): AsyncResult<SymbolDisclosure>;
}

/** Conversation compressor service */
export interface IConversationCompressorService {
  compress(messages: Message[]): AsyncResult<ConversationSummary>;
  addMessage(message: Message): void;
  getState(): ConversationState;
  reset(): void;
  extractDecisions(messages: Message[]): Decision[];
  extractFacts(messages: Message[]): EstablishedFact[];
}
