/**
 * Intent Parser Service
 *
 * Parses user requests to extract structured intent:
 * - Action type identification (create, modify, delete, analyze)
 * - Target extraction (files, symbols, concepts)
 * - Constraint detection (scope limits, style requirements)
 * - Confidence scoring
 */

import {
  IIntentParserService,
  UserIntent,
  UserIntentType,
  UserIntentTarget,
  UserIntentConstraint,
  FilePath,
  SymbolKind,
  ILogger,
} from '../types';

/** Patterns for intent type detection */
const INTENT_PATTERNS: Record<UserIntentType, RegExp[]> = {
  create: [
    /\b(create|add|new|implement|build|make|generate|write)\b/i,
    /\b(introduce|setup|initialize)\b/i,
  ],
  modify: [
    /\b(modify|change|update|edit|fix|refactor|improve|enhance|adjust)\b/i,
    /\b(rename|move|replace|convert|transform)\b/i,
  ],
  delete: [
    /\b(delete|remove|drop|eliminate|clean\s*up)\b/i,
    /\b(get\s*rid\s*of|take\s*out)\b/i,
  ],
  analyze: [
    /\b(analyze|review|check|inspect|examine|audit|scan)\b/i,
    /\b(find|search|look\s*for|identify|list|show)\b/i,
    /\b(explain|describe|understand|what\s+is)\b/i,
  ],
  query: [
    /\b(how|what|where|when|why|which)\b/i,
    /\b(tell\s*me|show\s*me|can\s*you|does|is\s+there)\b/i,
  ],
};

/** Patterns for target extraction */
const TARGET_PATTERNS = {
  file: [
    /(?:file|module)\s+[`"']?([^`"'\s]+\.\w+)[`"']?/i,
    /[`"']([^`"'\s]+\.\w{2,4})[`"']/,
    /in\s+([^`"'\s]+\.\w+)/i,
  ],
  function: [
    /(?:function|method)\s+[`"']?(\w+)[`"']?/i,
    /[`"'](\w+)\([^)]*\)[`"']/,
    /(\w+)\s*\(\)/,
  ],
  class: [
    /(?:class|type|interface)\s+[`"']?([A-Z]\w+)[`"']?/i,
    /[`"']([A-Z]\w+)[`"']/,
  ],
  variable: [
    /(?:variable|constant|property)\s+[`"']?(\w+)[`"']?/i,
  ],
  concept: [
    /(?:the|a|an)\s+(\w+(?:\s+\w+){0,3})\s+(?:feature|functionality|system|module|component)/i,
  ],
};

/** Patterns for constraint extraction */
const CONSTRAINT_PATTERNS = {
  scope: [
    /only\s+(?:in|within)\s+([^,.]+)/i,
    /(?:limited|restrict(?:ed)?)\s+to\s+([^,.]+)/i,
    /don'?t\s+(?:touch|modify|change)\s+([^,.]+)/i,
  ],
  style: [
    /(?:follow(?:ing)?|use|using|with)\s+(\w+)\s+(?:style|convention|pattern)/i,
    /(?:like|similar\s+to)\s+([^,.]+)/i,
  ],
  dependency: [
    /(?:without|don'?t\s+use|avoid)\s+([^,.]+)/i,
    /(?:use|using|with)\s+([^,.]+)\s+(?:library|package|module)/i,
  ],
};

/**
 * Intent Parser Service implementation
 */
export class IntentParserService implements IIntentParserService {
  private readonly logger?: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger?.child('IntentParserService');
  }

  parse(userMessage: string, context?: { currentFile?: FilePath }): UserIntent {
    this.logger?.debug('Parsing intent', { messageLength: userMessage.length });

    const intentType = this.detectIntentType(userMessage);
    const targets = this.extractTargets(userMessage, context);
    const constraints = this.extractConstraints(userMessage);
    const confidence = this.calculateConfidence(userMessage, intentType, targets);

    const intent: UserIntent = {
      type: intentType,
      targets,
      constraints,
      confidence,
      rawMessage: userMessage,
      keywords: this.extractKeywords(userMessage),
    };

    this.logger?.info('Intent parsed', {
      type: intentType,
      targetCount: targets.length,
      constraintCount: constraints.length,
      confidence,
    });

    return intent;
  }

  extractTargets(message: string, context?: { currentFile?: FilePath }): UserIntentTarget[] {
    const targets: UserIntentTarget[] = [];
    const seen = new Set<string>();

    // Extract file targets
    for (const pattern of TARGET_PATTERNS.file) {
      const matches = message.matchAll(new RegExp(pattern, 'gi'));
      for (const match of matches) {
        const name = match[1];
        if (name && !seen.has(`file:${name}`)) {
          seen.add(`file:${name}`);
          targets.push({
            type: 'file',
            name,
            confidence: this.getPatternConfidence(pattern, match),
          });
        }
      }
    }

    // Extract function targets
    for (const pattern of TARGET_PATTERNS.function) {
      const matches = message.matchAll(new RegExp(pattern, 'gi'));
      for (const match of matches) {
        const name = match[1];
        if (name && !seen.has(`function:${name}`) && !this.isCommonWord(name)) {
          seen.add(`function:${name}`);
          targets.push({
            type: 'symbol',
            name,
            symbolKind: 'function' as SymbolKind,
            confidence: this.getPatternConfidence(pattern, match),
          });
        }
      }
    }

    // Extract class targets
    for (const pattern of TARGET_PATTERNS.class) {
      const matches = message.matchAll(new RegExp(pattern, 'gi'));
      for (const match of matches) {
        const name = match[1];
        if (name && !seen.has(`class:${name}`) && this.isPascalCase(name)) {
          seen.add(`class:${name}`);
          targets.push({
            type: 'symbol',
            name,
            symbolKind: 'class' as SymbolKind,
            confidence: this.getPatternConfidence(pattern, match),
          });
        }
      }
    }

    // Extract concept targets
    for (const pattern of TARGET_PATTERNS.concept) {
      const matches = message.matchAll(new RegExp(pattern, 'gi'));
      for (const match of matches) {
        const name = match[1]?.trim();
        if (name && !seen.has(`concept:${name}`)) {
          seen.add(`concept:${name}`);
          targets.push({
            type: 'concept',
            name,
            confidence: 0.5, // Concepts are lower confidence
          });
        }
      }
    }

    // Add context file if referenced
    if (context?.currentFile && this.referencesCurrentFile(message)) {
      const fileName = this.getFileName(context.currentFile);
      if (!seen.has(`file:${fileName}`)) {
        targets.push({
          type: 'file',
          name: context.currentFile as string,
          confidence: 0.8,
        });
      }
    }

    // Sort by confidence
    targets.sort((a, b) => b.confidence - a.confidence);

    return targets;
  }

  extractConstraints(message: string): UserIntentConstraint[] {
    const constraints: UserIntentConstraint[] = [];

    // Extract scope constraints
    for (const pattern of CONSTRAINT_PATTERNS.scope) {
      const match = message.match(pattern);
      if (match?.[1]) {
        constraints.push({
          type: 'scope',
          value: match[1].trim(),
          isNegative: /don'?t|without|except/i.test(match[0]),
        });
      }
    }

    // Extract style constraints
    for (const pattern of CONSTRAINT_PATTERNS.style) {
      const match = message.match(pattern);
      if (match?.[1]) {
        constraints.push({
          type: 'style',
          value: match[1].trim(),
          isNegative: false,
        });
      }
    }

    // Extract dependency constraints
    for (const pattern of CONSTRAINT_PATTERNS.dependency) {
      const match = message.match(pattern);
      if (match?.[1]) {
        constraints.push({
          type: 'dependency',
          value: match[1].trim(),
          isNegative: /without|don'?t|avoid/i.test(match[0]),
        });
      }
    }

    return constraints;
  }

  getConfidence(intent: UserIntent): number {
    return intent.confidence;
  }

  /**
   * Detect the primary intent type
   */
  private detectIntentType(message: string): UserIntentType {
    const scores: Record<UserIntentType, number> = {
      create: 0,
      modify: 0,
      delete: 0,
      analyze: 0,
      query: 0,
    };

    for (const [type, patterns] of Object.entries(INTENT_PATTERNS)) {
      for (const pattern of patterns) {
        const matches = message.match(pattern);
        if (matches) {
          // Weight by position - earlier matches are more important
          const position = message.search(pattern);
          const positionWeight = 1 - (position / message.length) * 0.3;
          scores[type as UserIntentType] += positionWeight;
        }
      }
    }

    // Find the highest scoring type
    let maxType: UserIntentType = 'query';
    let maxScore = 0;

    for (const [type, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxType = type as UserIntentType;
      }
    }

    return maxType;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(
    message: string,
    intentType: UserIntentType,
    targets: UserIntentTarget[]
  ): number {
    let confidence = 0.5; // Base confidence

    // Intent type clarity
    const patterns = INTENT_PATTERNS[intentType];
    let intentMatches = 0;
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        intentMatches++;
      }
    }
    confidence += Math.min(intentMatches * 0.1, 0.2);

    // Target specificity
    if (targets.length > 0) {
      const avgTargetConfidence = targets.reduce((sum, t) => sum + t.confidence, 0) / targets.length;
      confidence += avgTargetConfidence * 0.2;
    }

    // Message clarity (length, punctuation)
    if (message.length > 20 && message.length < 500) {
      confidence += 0.1;
    }

    // Cap at 1.0
    return Math.min(confidence, 1.0);
  }

  /**
   * Extract keywords from message
   */
  private extractKeywords(message: string): string[] {
    // Remove common words and extract significant terms
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'this', 'that', 'these', 'those', 'i', 'you', 'we', 'they', 'it',
      'my', 'your', 'our', 'their', 'its', 'me', 'him', 'her', 'us', 'them',
      'please', 'want', 'like', 'just', 'also', 'very', 'too', 'so',
    ]);

    const words = message
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    // Deduplicate and return
    return [...new Set(words)];
  }

  /**
   * Get confidence for a pattern match
   */
  private getPatternConfidence(pattern: RegExp, match: RegExpMatchArray): number {
    // Explicit patterns (with keywords) get higher confidence
    if (pattern.source.includes('function|method') || pattern.source.includes('class|type')) {
      return 0.9;
    }
    // Code-style patterns (backticks) get medium-high confidence
    if (pattern.source.includes('[`"\'')) {
      return 0.8;
    }
    // Generic patterns get medium confidence
    return 0.6;
  }

  /**
   * Check if a word is a common programming word (not a symbol name)
   */
  private isCommonWord(word: string): boolean {
    const common = new Set([
      'function', 'method', 'class', 'type', 'interface', 'const', 'let', 'var',
      'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
      'continue', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super',
      'import', 'export', 'from', 'default', 'async', 'await', 'yield',
      'true', 'false', 'null', 'undefined', 'void', 'typeof', 'instanceof',
    ]);
    return common.has(word.toLowerCase());
  }

  /**
   * Check if string is PascalCase
   */
  private isPascalCase(str: string): boolean {
    return /^[A-Z][a-zA-Z0-9]*$/.test(str);
  }

  /**
   * Check if message references "this file" or "current file"
   */
  private referencesCurrentFile(message: string): boolean {
    return /\b(this|current|open|active)\s+(file|module)\b/i.test(message);
  }

  /**
   * Extract file name from path
   */
  private getFileName(filePath: FilePath): string {
    const path = filePath as string;
    return path.split(/[/\\]/).pop() ?? path;
  }
}

/**
 * Create an intent parser service
 */
export function createIntentParserService(logger?: ILogger): IIntentParserService {
  return new IntentParserService(logger);
}
