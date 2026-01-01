/**
 * Token Budget Service
 *
 * Manages token allocation and counting for LLM requests:
 * - Budget allocation across system, context, history
 * - Token counting (approximation)
 * - Budget validation
 */

import {
  ITokenBudgetService,
  TokenBudget,
  BudgetCheck,
  ContextRequest,
  TokenCount,
  ILogger,
  toTokenCount,
} from '../types';

/** Default budget proportions */
const DEFAULT_PROPORTIONS = {
  system: 0.1,      // 10% for system prompt
  context: 0.5,     // 50% for context
  history: 0.3,     // 30% for conversation history
  reserved: 0.1,    // 10% reserved for output and safety
};

/** Token estimation constants */
const CHARS_PER_TOKEN = 4; // Average for English text
const TOKENS_PER_LINE = 10; // Average tokens per line of code

/**
 * Token Budget Service implementation
 */
export class TokenBudgetService implements ITokenBudgetService {
  private readonly logger?: ILogger;
  private readonly proportions: typeof DEFAULT_PROPORTIONS;

  constructor(logger?: ILogger, proportions?: Partial<typeof DEFAULT_PROPORTIONS>) {
    this.logger = logger?.child('TokenBudgetService');
    this.proportions = { ...DEFAULT_PROPORTIONS, ...proportions };
  }

  allocate(total: TokenCount): TokenBudget {
    const totalNum = total as number;

    const budget: TokenBudget = {
      total,
      system: toTokenCount(Math.floor(totalNum * this.proportions.system)),
      context: toTokenCount(Math.floor(totalNum * this.proportions.context)),
      history: toTokenCount(Math.floor(totalNum * this.proportions.history)),
      reserved: toTokenCount(Math.floor(totalNum * this.proportions.reserved)),
    };

    this.logger?.debug('Budget allocated', budget);
    return budget;
  }

  checkBudget(content: string, budget: TokenBudget): BudgetCheck {
    const used = this.countTokens(content);
    const available = (budget.context as number) + (budget.history as number);
    const remaining = toTokenCount(Math.max(0, available - (used as number)));
    const withinBudget = (used as number) <= available;
    const overflow = withinBudget
      ? undefined
      : toTokenCount((used as number) - available);

    const check: BudgetCheck = {
      withinBudget,
      used,
      remaining,
      overflow,
    };

    this.logger?.debug('Budget checked', check);
    return check;
  }

  countTokens(text: string): TokenCount {
    if (!text) return toTokenCount(0);

    // Use character-based estimation
    // This is an approximation; real token count depends on the tokenizer
    const charCount = text.length;
    const estimatedTokens = Math.ceil(charCount / CHARS_PER_TOKEN);

    return toTokenCount(estimatedTokens);
  }

  estimateTokens(request: ContextRequest): TokenCount {
    const { task, strategy } = request;
    const { limits } = strategy;

    // Estimate based on number of files and symbols
    const fileCount = task.targets.length;
    const symbolCount = task.symbols.length;

    // Assume average file has 200 lines, each symbol has 20 lines
    const estimatedLines =
      fileCount * 200 * this.getDisclosureMultiplier(strategy) +
      symbolCount * 20;

    const estimatedTokens = estimatedLines * TOKENS_PER_LINE;

    // Cap at the limit
    const capped = Math.min(estimatedTokens, limits.maxTokens as number);

    return toTokenCount(capped);
  }

  /**
   * Get multiplier based on disclosure level in strategy
   */
  private getDisclosureMultiplier(strategy: ContextRequest['strategy']): number {
    // Full files = 1.0, summary = 0.3, signature = 0.1
    // Without disclosure info in strategy, assume summary
    return 0.3;
  }

  /**
   * Create a custom budget allocation
   */
  createCustomBudget(
    total: TokenCount,
    allocations: {
      system?: number;
      context?: number;
      history?: number;
      reserved?: number;
    }
  ): TokenBudget {
    const totalNum = total as number;

    // Normalize proportions to sum to 1
    const sum =
      (allocations.system ?? this.proportions.system) +
      (allocations.context ?? this.proportions.context) +
      (allocations.history ?? this.proportions.history) +
      (allocations.reserved ?? this.proportions.reserved);

    const normalize = (val: number) => val / sum;

    return {
      total,
      system: toTokenCount(
        Math.floor(totalNum * normalize(allocations.system ?? this.proportions.system))
      ),
      context: toTokenCount(
        Math.floor(totalNum * normalize(allocations.context ?? this.proportions.context))
      ),
      history: toTokenCount(
        Math.floor(totalNum * normalize(allocations.history ?? this.proportions.history))
      ),
      reserved: toTokenCount(
        Math.floor(totalNum * normalize(allocations.reserved ?? this.proportions.reserved))
      ),
    };
  }

  /**
   * Estimate tokens for code content
   */
  estimateCodeTokens(code: string): TokenCount {
    if (!code) return toTokenCount(0);

    // Code typically has more tokens per character due to syntax
    const lines = code.split('\n').length;
    const estimatedTokens = lines * TOKENS_PER_LINE;

    return toTokenCount(estimatedTokens);
  }

  /**
   * Calculate remaining budget after usage
   */
  getRemainingBudget(budget: TokenBudget, used: TokenUsage): TokenBudget {
    const totalUsed = (used.inputTokens as number) + (used.outputTokens as number);

    return {
      total: budget.total,
      system: budget.system,
      context: toTokenCount(
        Math.max(0, (budget.context as number) - (used.inputTokens as number))
      ),
      history: toTokenCount(
        Math.max(0, (budget.history as number) - totalUsed)
      ),
      reserved: budget.reserved,
    };
  }
}

/** Token usage interface (for getRemainingBudget) */
interface TokenUsage {
  inputTokens: TokenCount;
  outputTokens: TokenCount;
}

/**
 * Create a token budget service
 */
export function createTokenBudgetService(
  logger?: ILogger,
  proportions?: Partial<typeof DEFAULT_PROPORTIONS>
): ITokenBudgetService {
  return new TokenBudgetService(logger, proportions);
}
