/**
 * Conversation Compressor Service
 *
 * Compresses conversation history to fit token budgets while
 * preserving important information:
 * - Key decisions
 * - Established facts
 * - Completed actions
 * - Pending items
 */

import * as crypto from 'crypto';
import {
  IConversationCompressorService,
  ITokenBudgetService,
  Message,
  ConversationSummary,
  ConversationState,
  Decision,
  EstablishedFact,
  CompletedAction,
  PendingItem,
  TokenCount,
  AsyncResult,
  Ok,
  ILogger,
  toTokenCount,
} from '../types';

/** Patterns for extracting structured information */
const DECISION_PATTERNS = [
  /(?:we|i)\s+(?:decided|agreed|chose|will)\s+(?:to\s+)?(.+)/i,
  /(?:the|our)\s+(?:decision|choice|plan)\s+(?:is|was)\s+(?:to\s+)?(.+)/i,
  /(?:let's|lets)\s+(.+)/i,
];

const FACT_PATTERNS = [
  /(?:the\s+)?(\w+)\s+(?:is|are|was|were)\s+(.+)/i,
  /(?:we|i)\s+(?:found|discovered|noticed)\s+(?:that\s+)?(.+)/i,
  /(?:it\s+(?:is|was)|that's)\s+(?:because|due\s+to)\s+(.+)/i,
];

const ACTION_PATTERNS = [
  /(?:i|we)\s+(?:created|added|modified|deleted|updated|fixed|implemented)\s+(.+)/i,
  /(?:the|a)\s+(?:file|function|class|component)\s+(?:was|has\s+been)\s+(.+)/i,
  /(?:completed|finished|done)\s+(?:with\s+)?(.+)/i,
];

const PENDING_PATTERNS = [
  /(?:still|yet)\s+(?:need|needs)\s+(?:to\s+)?(.+)/i,
  /(?:todo|TODO|to-do):\s*(.+)/i,
  /(?:next|remaining)(?:\s+step)?:\s*(.+)/i,
];

/**
 * Conversation Compressor Service implementation
 */
export class ConversationCompressorService implements IConversationCompressorService {
  private readonly tokenBudget: ITokenBudgetService;
  private readonly logger?: ILogger;

  private messages: Message[] = [];
  private summary: ConversationSummary = {
    decisions: [],
    facts: [],
    actions: [],
    pending: [],
    currentFocus: '',
    relevantHistory: '',
  };

  constructor(tokenBudget: ITokenBudgetService, logger?: ILogger) {
    this.tokenBudget = tokenBudget;
    this.logger = logger?.child('ConversationCompressorService');
  }

  async compress(messages: Message[]): AsyncResult<ConversationSummary> {
    this.logger?.info('Compressing conversation', { messageCount: messages.length });

    // Extract structured information
    const decisions = this.extractDecisions(messages);
    const facts = this.extractFacts(messages);
    const actions = this.extractCompletedActions(messages);
    const pending = this.extractPendingItems(messages);

    // Determine current focus from recent messages
    const currentFocus = this.extractCurrentFocus(messages);

    // Generate relevant history summary
    const relevantHistory = this.generateHistorySummary(messages, {
      decisions,
      facts,
      actions,
      pending,
    });

    this.summary = {
      decisions,
      facts,
      actions,
      pending,
      currentFocus,
      relevantHistory,
    };

    this.logger?.debug('Compression complete', {
      decisions: decisions.length,
      facts: facts.length,
      actions: actions.length,
      pending: pending.length,
    });

    return Ok(this.summary);
  }

  addMessage(message: Message): void {
    this.messages.push(message);

    // Incrementally extract information
    const newDecisions = this.extractDecisions([message]);
    const newFacts = this.extractFacts([message]);
    const newActions = this.extractCompletedActions([message]);
    const newPending = this.extractPendingItems([message]);

    // Merge with existing summary
    this.summary = {
      ...this.summary,
      decisions: [...this.summary.decisions, ...newDecisions],
      facts: [...this.summary.facts, ...newFacts],
      actions: [...this.summary.actions, ...newActions],
      pending: this.mergePending(this.summary.pending, newPending, newActions),
      currentFocus: this.extractCurrentFocus([message]) || this.summary.currentFocus,
    };
  }

  getState(): ConversationState {
    const originalTokens = this.messages.reduce(
      (sum, m) => toTokenCount((sum as number) + (m.tokens as number)),
      toTokenCount(0)
    );

    const summaryText = this.serializeSummary(this.summary);
    const compressedTokens = this.tokenBudget.countTokens(summaryText);

    const compressionRatio =
      (originalTokens as number) > 0
        ? (compressedTokens as number) / (originalTokens as number)
        : 1;

    return {
      summary: this.summary,
      messages: this.messages,
      originalTokens,
      compressedTokens,
      compressionRatio,
    };
  }

  reset(): void {
    this.messages = [];
    this.summary = {
      decisions: [],
      facts: [],
      actions: [],
      pending: [],
      currentFocus: '',
      relevantHistory: '',
    };
  }

  extractDecisions(messages: Message[]): Decision[] {
    const decisions: Decision[] = [];

    for (const message of messages) {
      const content = message.content;

      for (const pattern of DECISION_PATTERNS) {
        const matches = content.matchAll(new RegExp(pattern, 'gi'));
        for (const match of matches) {
          if (match[1] && match[1].length > 10) {
            decisions.push({
              id: crypto.randomUUID(),
              timestamp: message.timestamp,
              topic: this.extractTopic(match[1]),
              decision: match[1].trim(),
              participants: [message.role],
            });
          }
        }
      }
    }

    // Deduplicate by content similarity
    return this.deduplicateDecisions(decisions);
  }

  extractFacts(messages: Message[]): EstablishedFact[] {
    const facts: EstablishedFact[] = [];

    for (const message of messages) {
      const content = message.content;

      for (const pattern of FACT_PATTERNS) {
        const matches = content.matchAll(new RegExp(pattern, 'gi'));
        for (const match of matches) {
          const fullMatch = match[0];
          if (fullMatch && fullMatch.length > 15 && fullMatch.length < 200) {
            facts.push({
              id: crypto.randomUUID(),
              fact: fullMatch.trim(),
              source: message.role === 'user' ? 'user' : 'inferred',
              confidence: 0.7,
              establishedAt: message.timestamp,
              relatedMessages: [message.id],
            });
          }
        }
      }
    }

    // Deduplicate by content similarity
    return this.deduplicateFacts(facts);
  }

  /**
   * Extract completed actions from messages
   */
  private extractCompletedActions(messages: Message[]): CompletedAction[] {
    const actions: CompletedAction[] = [];

    for (const message of messages) {
      if (message.role !== 'assistant') continue;

      const content = message.content;

      for (const pattern of ACTION_PATTERNS) {
        const matches = content.matchAll(new RegExp(pattern, 'gi'));
        for (const match of matches) {
          if (match[1] && match[1].length > 5) {
            actions.push({
              id: crypto.randomUUID(),
              action: match[1].trim(),
              result: 'success',
              summary: match[0].trim(),
              timestamp: message.timestamp,
            });
          }
        }
      }
    }

    return this.deduplicateActions(actions);
  }

  /**
   * Extract pending items from messages
   */
  private extractPendingItems(messages: Message[]): PendingItem[] {
    const pending: PendingItem[] = [];

    for (const message of messages) {
      const content = message.content;

      for (const pattern of PENDING_PATTERNS) {
        const matches = content.matchAll(new RegExp(pattern, 'gi'));
        for (const match of matches) {
          if (match[1] && match[1].length > 5) {
            pending.push({
              id: crypto.randomUUID(),
              item: match[1].trim(),
              priority: 'medium',
              addedAt: message.timestamp,
            });
          }
        }
      }
    }

    return pending;
  }

  /**
   * Extract current focus from recent messages
   */
  private extractCurrentFocus(messages: Message[]): string {
    // Look at the last few messages
    const recentMessages = messages.slice(-3);
    const keywords: Map<string, number> = new Map();

    for (const message of recentMessages) {
      // Extract nouns and verbs (simplified)
      const words = message.content.split(/\s+/);
      for (const word of words) {
        const clean = word.toLowerCase().replace(/[^a-z]/g, '');
        if (clean.length > 4) {
          keywords.set(clean, (keywords.get(clean) ?? 0) + 1);
        }
      }
    }

    // Find most common keywords
    const sorted = Array.from(keywords.entries()).sort((a, b) => b[1] - a[1]);
    const topKeywords = sorted.slice(0, 3).map(([word]) => word);

    return topKeywords.join(', ');
  }

  /**
   * Generate relevant history summary
   */
  private generateHistorySummary(
    messages: Message[],
    structured: {
      decisions: Decision[];
      facts: EstablishedFact[];
      actions: CompletedAction[];
      pending: PendingItem[];
    }
  ): string {
    const lines: string[] = [];

    if (structured.decisions.length > 0) {
      lines.push('Key Decisions:');
      for (const d of structured.decisions.slice(-5)) {
        lines.push(`- ${d.decision}`);
      }
    }

    if (structured.actions.length > 0) {
      lines.push('\nCompleted Actions:');
      for (const a of structured.actions.slice(-5)) {
        lines.push(`- ${a.action}`);
      }
    }

    if (structured.pending.length > 0) {
      lines.push('\nPending:');
      for (const p of structured.pending.slice(-3)) {
        lines.push(`- ${p.item}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Merge pending items, removing completed ones
   */
  private mergePending(
    existing: PendingItem[],
    newItems: PendingItem[],
    completedActions: CompletedAction[]
  ): PendingItem[] {
    const completedTexts = completedActions.map((a) => a.action.toLowerCase());

    // Filter out items that seem completed
    const filtered = existing.filter((item) => {
      const itemText = item.item.toLowerCase();
      return !completedTexts.some(
        (completed) =>
          this.calculateSimilarity(itemText, completed) > 0.5
      );
    });

    return [...filtered, ...newItems];
  }

  /**
   * Extract topic from decision text
   */
  private extractTopic(text: string): string {
    // Take first few words as topic
    const words = text.split(/\s+/).slice(0, 3);
    return words.join(' ');
  }

  /**
   * Deduplicate decisions by similarity
   */
  private deduplicateDecisions(decisions: Decision[]): Decision[] {
    const unique: Decision[] = [];

    for (const decision of decisions) {
      const isDuplicate = unique.some(
        (existing) =>
          this.calculateSimilarity(existing.decision, decision.decision) > 0.7
      );
      if (!isDuplicate) {
        unique.push(decision);
      }
    }

    return unique;
  }

  /**
   * Deduplicate facts by similarity
   */
  private deduplicateFacts(facts: EstablishedFact[]): EstablishedFact[] {
    const unique: EstablishedFact[] = [];

    for (const fact of facts) {
      const isDuplicate = unique.some(
        (existing) =>
          this.calculateSimilarity(existing.fact, fact.fact) > 0.7
      );
      if (!isDuplicate) {
        unique.push(fact);
      }
    }

    return unique;
  }

  /**
   * Deduplicate actions by similarity
   */
  private deduplicateActions(actions: CompletedAction[]): CompletedAction[] {
    const unique: CompletedAction[] = [];

    for (const action of actions) {
      const isDuplicate = unique.some(
        (existing) =>
          this.calculateSimilarity(existing.action, action.action) > 0.7
      );
      if (!isDuplicate) {
        unique.push(action);
      }
    }

    return unique;
  }

  /**
   * Calculate string similarity (Jaccard index)
   */
  private calculateSimilarity(a: string, b: string): number {
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  /**
   * Serialize summary to string
   */
  private serializeSummary(summary: ConversationSummary): string {
    const lines: string[] = [];

    if (summary.currentFocus) {
      lines.push(`Current Focus: ${summary.currentFocus}`);
    }

    if (summary.decisions.length > 0) {
      lines.push('\n## Decisions');
      for (const d of summary.decisions) {
        lines.push(`- [${d.topic}] ${d.decision}`);
      }
    }

    if (summary.facts.length > 0) {
      lines.push('\n## Established Facts');
      for (const f of summary.facts) {
        lines.push(`- ${f.fact}`);
      }
    }

    if (summary.actions.length > 0) {
      lines.push('\n## Completed Actions');
      for (const a of summary.actions) {
        lines.push(`- ${a.action} (${a.result})`);
      }
    }

    if (summary.pending.length > 0) {
      lines.push('\n## Pending Items');
      for (const p of summary.pending) {
        lines.push(`- [${p.priority}] ${p.item}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Create a conversation compressor service
 */
export function createConversationCompressorService(
  tokenBudget: ITokenBudgetService,
  logger?: ILogger
): IConversationCompressorService {
  return new ConversationCompressorService(tokenBudget, logger);
}
