/**
 * Error Memory Service
 *
 * Tracks and learns from errors encountered during development:
 * - Pattern recognition for common errors
 * - Prevention hints based on past errors
 * - Error resolution tracking
 */

import * as crypto from 'crypto';
import {
  IErrorMemoryService,
  ErrorPattern,
  ErrorOccurrence,
  ErrorContext,
  ErrorPatternCategory,
  ErrorStatistics,
  IKnowledgeStore,
  ILogger,
  TaskId,
  AgentId,
  AsyncResult,
  Ok,
  Err,
  AppError,
  toRelativePath,
} from '../types';

/** Maximum recent errors to keep in memory */
const MAX_RECENT_ERRORS = 100;

/** Error category detection patterns */
const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: ErrorPatternCategory }> = [
  { pattern: /SyntaxError|Unexpected token|Parse error/i, category: 'syntax' },
  { pattern: /TypeError|is not a function|cannot read property/i, category: 'type' },
  { pattern: /ReferenceError|is not defined|Cannot find name/i, category: 'reference' },
  { pattern: /Cannot find module|Module not found|import/i, category: 'import' },
  { pattern: /ENOENT|EACCES|EPERM/i, category: 'runtime' },
  { pattern: /does not exist|hallucinated|fabricated/i, category: 'hallucination' },
  { pattern: /scope violation|outside scope|forbidden/i, category: 'scope-violation' },
];

/**
 * Error Memory Service implementation
 */
export class ErrorMemoryService implements IErrorMemoryService {
  private readonly store: IKnowledgeStore;
  private readonly logger?: ILogger;
  private patterns: Map<string, ErrorPattern> = new Map();
  private recentErrors: ErrorOccurrence[] = [];

  constructor(store: IKnowledgeStore, logger?: ILogger) {
    this.store = store;
    this.logger = logger?.child('ErrorMemoryService');
  }

  async recordError(error: Error, context: ErrorContext): AsyncResult<void> {
    try {
      this.logger?.debug('Recording error', {
        message: error.message,
        taskId: context.taskId,
      });

      // Generate fingerprint for the error
      const fingerprint = this.generateFingerprint(error, context);

      // Find or create pattern
      let pattern = this.patterns.get(fingerprint);

      if (!pattern) {
        pattern = this.createPattern(error, context, fingerprint);
        this.patterns.set(fingerprint, pattern);

        // Save new pattern
        await this.store.saveErrorPattern(pattern);
      } else {
        // Update existing pattern
        pattern = {
          ...pattern,
          occurrences: pattern.occurrences + 1,
          lastSeen: new Date(),
        };
        this.patterns.set(fingerprint, pattern);
        await this.store.saveErrorPattern(pattern);
      }

      // Record occurrence
      const occurrence: ErrorOccurrence = {
        id: crypto.randomUUID(),
        patternId: pattern.id,
        timestamp: new Date(),
        taskId: context.taskId,
        agentId: context.agentId,
        file: context.file,
        code: context.code,
        errorMessage: error.message,
        resolved: false,
      };

      this.recentErrors.unshift(occurrence);

      // Trim recent errors
      if (this.recentErrors.length > MAX_RECENT_ERRORS) {
        this.recentErrors = this.recentErrors.slice(0, MAX_RECENT_ERRORS);
      }

      await this.store.recordErrorOccurrence(occurrence);

      this.logger?.info('Error recorded', {
        patternId: pattern.id,
        category: pattern.category,
        occurrences: pattern.occurrences,
      });

      return Ok(undefined);
    } catch (err) {
      this.logger?.error('Failed to record error', err as Error);
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to record error: ${(err as Error).message}`)
      );
    }
  }

  async recordResolution(patternId: string, resolution: string): AsyncResult<void> {
    try {
      const pattern = this.patterns.get(patternId);
      if (!pattern) {
        return Err(new AppError('NOT_FOUND', `Pattern not found: ${patternId}`));
      }

      // Update pattern with resolution
      const updatedPattern: ErrorPattern = {
        ...pattern,
        prevention: resolution,
      };

      this.patterns.set(patternId, updatedPattern);
      await this.store.saveErrorPattern(updatedPattern);

      // Mark recent occurrences as resolved
      for (const occurrence of this.recentErrors) {
        if (occurrence.patternId === patternId && !occurrence.resolved) {
          const idx = this.recentErrors.indexOf(occurrence);
          this.recentErrors[idx] = {
            ...occurrence,
            resolved: true,
            resolution,
            resolutionTime: Date.now() - occurrence.timestamp.getTime(),
          };
        }
      }

      this.logger?.info('Resolution recorded', { patternId, resolution });
      return Ok(undefined);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to record resolution: ${(error as Error).message}`)
      );
    }
  }

  getPatterns(): ErrorPattern[] {
    return Array.from(this.patterns.values());
  }

  getPattern(id: string): ErrorPattern | null {
    for (const pattern of this.patterns.values()) {
      if (pattern.id === id) {
        return pattern;
      }
    }
    return null;
  }

  findSimilar(error: Error): ErrorPattern[] {
    const results: ErrorPattern[] = [];
    const errorMessage = error.message.toLowerCase();

    for (const pattern of this.patterns.values()) {
      // Check message similarity
      const patternMessage = pattern.messagePattern.toLowerCase();
      if (this.calculateSimilarity(errorMessage, patternMessage) > 0.6) {
        results.push(pattern);
      }
    }

    // Sort by occurrences (most common first)
    results.sort((a, b) => b.occurrences - a.occurrences);

    return results.slice(0, 5);
  }

  getPreventionHints(context: { intent: string; targets: string[] }): string[] {
    const hints: string[] = [];
    const intentLower = context.intent.toLowerCase();
    const targetPatterns = context.targets.map((t) => t.toLowerCase());

    for (const pattern of this.patterns.values()) {
      // Check if pattern is relevant to the intent
      const messagePatternLower = pattern.messagePattern.toLowerCase();
      const preventionLower = pattern.prevention.toLowerCase();

      // Check for keyword matches
      const intentKeywords = intentLower.split(/\s+/);
      const relevanceScore = intentKeywords.filter(
        (kw) =>
          messagePatternLower.includes(kw) ||
          preventionLower.includes(kw) ||
          targetPatterns.some((t) => pattern.codePattern?.toLowerCase().includes(t))
      ).length;

      if (relevanceScore > 0 && pattern.prevention) {
        hints.push(pattern.prevention);
      }
    }

    // Deduplicate and limit
    return [...new Set(hints)].slice(0, 5);
  }

  /**
   * Load patterns from store
   */
  async loadPatterns(): AsyncResult<void> {
    try {
      const result = await this.store.listErrorPatterns();
      if (!result.ok) {
        return result;
      }

      this.patterns.clear();
      for (const pattern of result.value) {
        this.patterns.set(pattern.fingerprint, pattern);
      }

      this.logger?.info('Loaded error patterns', { count: this.patterns.size });
      return Ok(undefined);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to load patterns: ${(error as Error).message}`)
      );
    }
  }

  /**
   * Get error statistics
   */
  async getStatistics(): AsyncResult<ErrorStatistics> {
    const patterns = Array.from(this.patterns.values());
    const errorsByCategory: Record<ErrorPatternCategory, number> = {
      syntax: 0,
      type: 0,
      reference: 0,
      import: 0,
      runtime: 0,
      logic: 0,
      hallucination: 0,
      'scope-violation': 0,
      other: 0,
    };

    const errorsByAgent: Record<string, number> = {};
    let totalErrors = 0;
    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const pattern of patterns) {
      totalErrors += pattern.occurrences;
      errorsByCategory[pattern.category] += pattern.occurrences;
    }

    for (const occurrence of this.recentErrors) {
      const agentId = occurrence.agentId as string;
      errorsByAgent[agentId] = (errorsByAgent[agentId] ?? 0) + 1;

      if (occurrence.resolved && occurrence.resolutionTime) {
        totalResolutionTime += occurrence.resolutionTime;
        resolvedCount++;
      }
    }

    // Get top patterns
    const topPatterns = patterns
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10);

    return Ok({
      totalErrors,
      errorsByCategory,
      errorsByAgent,
      averageResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
      topPatterns,
    });
  }

  /**
   * Generate fingerprint for an error
   */
  private generateFingerprint(error: Error, context: ErrorContext): string {
    // Normalize error message by removing file-specific parts
    const normalizedMessage = error.message
      .replace(/at\s+.+:\d+:\d+/g, '') // Remove stack trace locations
      .replace(/['"`].+['"`]/g, '<str>') // Replace string literals
      .replace(/\d+/g, '<num>') // Replace numbers
      .trim();

    const data = [
      normalizedMessage,
      error.name,
      context.file ?? '',
    ].join('|');

    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Create a new error pattern
   */
  private createPattern(
    error: Error,
    context: ErrorContext,
    fingerprint: string
  ): ErrorPattern {
    const category = this.detectCategory(error.message);

    // Generate a message pattern (regex-like)
    const messagePattern = error.message
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars
      .replace(/\d+/g, '\\d+') // Replace numbers with digit pattern
      .replace(/['"][^'"]+['"]/g, '[\'"][^\'"]+[\'"]'); // Replace strings

    return {
      id: crypto.randomUUID(),
      fingerprint,
      category,
      messagePattern,
      codePattern: context.code,
      occurrences: 1,
      firstSeen: new Date(),
      lastSeen: new Date(),
      prevention: this.generateDefaultPrevention(category, error.message),
      autoFixable: this.isAutoFixable(category),
    };
  }

  /**
   * Detect error category
   */
  private detectCategory(message: string): ErrorPatternCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
      if (pattern.test(message)) {
        return category;
      }
    }
    return 'other';
  }

  /**
   * Generate default prevention hint
   */
  private generateDefaultPrevention(category: ErrorPatternCategory, message: string): string {
    switch (category) {
      case 'syntax':
        return 'Verify syntax before generating code. Check for balanced brackets and proper statement termination.';
      case 'type':
        return 'Use the semantic index to verify types. Check function signatures before calling.';
      case 'reference':
        return 'Verify symbol existence using findSymbol before referencing. Check imports.';
      case 'import':
        return 'Verify module paths exist. Check package.json for dependencies.';
      case 'hallucination':
        return 'Always verify against project snapshot. Do not assume file or symbol existence.';
      case 'scope-violation':
        return 'Check scope boundaries before modifying files. Verify intent allows the action.';
      default:
        return 'Verify assumptions against project state before proceeding.';
    }
  }

  /**
   * Check if error is auto-fixable
   */
  private isAutoFixable(category: ErrorPatternCategory): boolean {
    return ['syntax', 'import'].includes(category);
  }

  /**
   * Calculate string similarity (Jaccard index)
   */
  private calculateSimilarity(a: string, b: string): number {
    const setA = new Set(a.split(/\s+/));
    const setB = new Set(b.split(/\s+/));

    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }
}

/**
 * Create an error memory service
 */
export function createErrorMemoryService(
  store: IKnowledgeStore,
  logger?: ILogger
): IErrorMemoryService {
  return new ErrorMemoryService(store, logger);
}
