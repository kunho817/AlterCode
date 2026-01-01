/**
 * Merge Engine Service
 *
 * Handles conflict detection and resolution across virtual branches:
 * - Detects conflicts between active branches
 * - Three-way merge for automatic resolution
 * - AI-assisted resolution using Lord level (Opus)
 * - Manual fallback with conflict markers
 */

import {
  IMergeEngineService,
  IVirtualBranchService,
  ISemanticAnalyzerService,
  ILLMAdapter,
  MergeConflict,
  MergeResolution,
  MergeResult,
  MergeInput,
  VirtualBranch,
  CodeRegion,
  ConflictMarker,
  ConflictId,
  FilePath,
  LineNumber,
  createConflictId,
  AsyncResult,
  Ok,
  Err,
  AppError,
  IEventBus,
  ILogger,
} from '../types';

// Import FileChange from conflict module directly
import { FileChange } from '../types/conflict';

/** Default config for merge engine */
export interface MergeEngineConfig {
  /** Whether to enable AI-assisted merging */
  readonly enableAIMerge: boolean;
  /** Max tokens for AI merge request */
  readonly aiMergeMaxTokens: number;
  /** Temperature for AI merge */
  readonly aiMergeTemperature: number;
}

/** Default configuration */
export const DEFAULT_MERGE_ENGINE_CONFIG: MergeEngineConfig = {
  enableAIMerge: true,
  aiMergeMaxTokens: 4096,
  aiMergeTemperature: 0.1,
};

/**
 * Merge Engine Service Implementation
 */
export class MergeEngineService implements IMergeEngineService {
  private readonly branchService: IVirtualBranchService;
  private readonly semanticAnalyzer: ISemanticAnalyzerService;
  private readonly llmAdapter: ILLMAdapter | null;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;
  private readonly config: MergeEngineConfig;

  /** Active conflicts */
  private readonly conflicts: Map<ConflictId, MergeConflict> = new Map();

  /** Resolutions for conflicts */
  private readonly resolutions: Map<ConflictId, MergeResolution> = new Map();

  constructor(
    branchService: IVirtualBranchService,
    semanticAnalyzer: ISemanticAnalyzerService,
    llmAdapter: ILLMAdapter | null,
    eventBus: IEventBus,
    config?: Partial<MergeEngineConfig>,
    logger?: ILogger
  ) {
    this.branchService = branchService;
    this.semanticAnalyzer = semanticAnalyzer;
    this.llmAdapter = llmAdapter;
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_MERGE_ENGINE_CONFIG, ...config };
    this.logger = logger?.child('MergeEngineService');
  }

  /**
   * Detect conflicts across all active branches
   */
  detectConflicts(): MergeConflict[] {
    const activeBranches = this.branchService.getActiveBranches();
    const detectedConflicts: MergeConflict[] = [];

    this.logger?.debug('Detecting conflicts', { branchCount: activeBranches.length });

    // Compare each pair of branches
    for (let i = 0; i < activeBranches.length; i++) {
      for (let j = i + 1; j < activeBranches.length; j++) {
        const branch1 = activeBranches[i];
        const branch2 = activeBranches[j];

        // Skip if either branch is undefined (shouldn't happen but TypeScript requires check)
        if (!branch1 || !branch2) continue;

        // Get conflicting files
        const conflictingFiles = this.branchService.getConflictingFiles(
          branch1.id,
          branch2.id
        );

        // Create conflict for each file
        for (const filePath of conflictingFiles) {
          const conflict = this.createConflict(branch1, branch2, filePath);
          if (conflict) {
            detectedConflicts.push(conflict);
            this.conflicts.set(conflict.id, conflict);
          }
        }
      }
    }

    // Emit event if conflicts found
    if (detectedConflicts.length > 0) {
      this.eventBus.emit('conflict:detected', {
        type: 'conflict:detected',
        conflicts: detectedConflicts,
        timestamp: new Date(),
      });

      this.logger?.warn('Conflicts detected', {
        conflictCount: detectedConflicts.length,
      });
    }

    return detectedConflicts;
  }

  /**
   * Create a conflict between two branches for a file
   */
  createConflict(
    branch1: VirtualBranch,
    branch2: VirtualBranch,
    filePath: FilePath
  ): MergeConflict | null {
    // Find the changes for this file in each branch
    const change1 = branch1.changes.find((c) => c.filePath === filePath);
    const change2 = branch2.changes.find((c) => c.filePath === filePath);

    if (!change1 || !change2) {
      return null;
    }

    // Get base content (from original content or empty)
    const baseContent = change1.originalContent ?? change2.originalContent ?? '';

    // Analyze conflicting regions
    const regions1 = this.semanticAnalyzer.analyzeFile(filePath, change1.modifiedContent);
    const regions2 = this.semanticAnalyzer.analyzeFile(filePath, change2.modifiedContent);

    // Find overlapping regions
    const conflictingRegions = this.findOverlappingRegions(regions1, regions2);

    const conflict: MergeConflict = {
      id: createConflictId(),
      filePath,
      baseContent,
      branch1,
      branch2,
      conflictingRegions,
    };

    this.logger?.debug('Conflict created', {
      conflictId: conflict.id,
      filePath,
      branch1Id: branch1.id,
      branch2Id: branch2.id,
      regionCount: conflictingRegions.length,
    });

    return conflict;
  }

  /**
   * Resolve a conflict using cascade: auto → AI → manual
   */
  async resolveConflict(conflict: MergeConflict): AsyncResult<MergeResolution> {
    this.logger?.info('Resolving conflict', { conflictId: conflict.id, filePath: conflict.filePath });

    // Get the modified content from each branch
    const change1 = conflict.branch1.changes.find((c) => c.filePath === conflict.filePath);
    const change2 = conflict.branch2.changes.find((c) => c.filePath === conflict.filePath);

    if (!change1 || !change2) {
      return Err(new AppError('INVALID_CONFLICT', 'Could not find changes for conflict'));
    }

    const mergeInput: MergeInput = {
      base: conflict.baseContent,
      ours: change1.modifiedContent,
      theirs: change2.modifiedContent,
    };

    // Step 1: Try automatic three-way merge
    const autoResult = this.threeWayMerge(mergeInput);
    if (autoResult.success) {
      const resolution: MergeResolution = {
        conflictId: conflict.id,
        resolvedContent: autoResult.content,
        resolvedBy: 'auto',
        strategy: 'auto',
      };

      this.resolutions.set(conflict.id, resolution);
      this.emitResolved(resolution);

      this.logger?.info('Conflict resolved automatically', { conflictId: conflict.id });
      return Ok(resolution);
    }

    // Step 2: Try AI-assisted resolution
    if (this.config.enableAIMerge && this.llmAdapter) {
      const aiResult = await this.aiAssistedMerge(conflict, mergeInput, autoResult);
      if (aiResult.ok) {
        const resolution = aiResult.value;
        this.resolutions.set(conflict.id, resolution);
        this.emitResolved(resolution);

        this.logger?.info('Conflict resolved with AI assistance', { conflictId: conflict.id });
        return Ok(resolution);
      }

      this.logger?.warn('AI-assisted merge failed', { conflictId: conflict.id, error: aiResult.error.message });
    }

    // Step 3: Fall back to manual (conflict markers)
    const manualResolution: MergeResolution = {
      conflictId: conflict.id,
      resolvedContent: autoResult.content, // Contains conflict markers
      resolvedBy: 'manual',
      strategy: 'manual',
    };

    this.resolutions.set(conflict.id, manualResolution);

    this.logger?.info('Conflict requires manual resolution', { conflictId: conflict.id });
    return Ok(manualResolution);
  }

  /**
   * Apply a resolution
   */
  async applyResolution(resolution: MergeResolution): AsyncResult<void> {
    const conflict = this.conflicts.get(resolution.conflictId);
    if (!conflict) {
      return Err(new AppError('CONFLICT_NOT_FOUND', `Conflict ${resolution.conflictId} not found`));
    }

    this.logger?.info('Applying resolution', {
      conflictId: resolution.conflictId,
      filePath: conflict.filePath,
      strategy: resolution.strategy,
    });

    // Create a file change with the resolved content
    const resolvedChange: FileChange = {
      filePath: conflict.filePath,
      originalContent: conflict.baseContent,
      modifiedContent: resolution.resolvedContent,
      diff: this.createUnifiedDiff(conflict.baseContent, resolution.resolvedContent),
      changeType: 'modify',
    };

    // Update the first branch with the resolved change
    this.branchService.recordChange(conflict.branch1.id, resolvedChange);

    // Remove the change from the second branch (it's been merged)
    const branch2ChangeIndex = conflict.branch2.changes.findIndex(
      (c) => c.filePath === conflict.filePath
    );
    if (branch2ChangeIndex >= 0) {
      conflict.branch2.changes.splice(branch2ChangeIndex, 1);
    }

    // Remove the conflict
    this.conflicts.delete(resolution.conflictId);

    this.logger?.info('Resolution applied', { conflictId: resolution.conflictId });

    return Ok(undefined);
  }

  /**
   * Check if there are any active conflicts
   */
  hasConflicts(): boolean {
    return this.conflicts.size > 0;
  }

  /**
   * Get all active conflicts
   */
  getActiveConflicts(): MergeConflict[] {
    return Array.from(this.conflicts.values());
  }

  /**
   * Get a specific conflict
   */
  getConflict(conflictId: ConflictId): MergeConflict | null {
    return this.conflicts.get(conflictId) ?? null;
  }

  /**
   * Clear all active conflicts
   */
  clearConflicts(): void {
    this.conflicts.clear();
    this.resolutions.clear();
    this.logger?.debug('Cleared all conflicts');
  }

  /**
   * Three-way merge implementation
   */
  private threeWayMerge(input: MergeInput): MergeResult {
    const baseLines = input.base.split('\n');
    const oursLines = input.ours.split('\n');
    const theirsLines = input.theirs.split('\n');

    const result: string[] = [];
    const conflicts: ConflictMarker[] = [];

    // Simple LCS-based merge
    let baseIdx = 0;
    let oursIdx = 0;
    let theirsIdx = 0;

    while (baseIdx < baseLines.length || oursIdx < oursLines.length || theirsIdx < theirsLines.length) {
      const baseLine = baseLines[baseIdx];
      const oursLine = oursLines[oursIdx];
      const theirsLine = theirsLines[theirsIdx];

      // All same - advance all
      if (baseLine === oursLine && baseLine === theirsLine) {
        if (baseLine !== undefined) {
          result.push(baseLine);
        }
        baseIdx++;
        oursIdx++;
        theirsIdx++;
        continue;
      }

      // Only ours changed
      if (baseLine === theirsLine && baseLine !== oursLine) {
        if (oursLine !== undefined) {
          result.push(oursLine);
        }
        if (baseLine !== undefined) baseIdx++;
        oursIdx++;
        if (theirsLine !== undefined) theirsIdx++;
        continue;
      }

      // Only theirs changed
      if (baseLine === oursLine && baseLine !== theirsLine) {
        if (theirsLine !== undefined) {
          result.push(theirsLine);
        }
        if (baseLine !== undefined) baseIdx++;
        if (oursLine !== undefined) oursIdx++;
        theirsIdx++;
        continue;
      }

      // Both changed - conflict
      const conflictStart = result.length + 1;
      const oursStart = conflictStart + 1;

      result.push('<<<<<<< ours');
      const oursConflictStart = result.length + 1;

      // Add ours lines until we find a matching line
      while (oursIdx < oursLines.length && oursLines[oursIdx] !== baseLine) {
        const line = oursLines[oursIdx];
        if (line !== undefined) {
          result.push(line);
        }
        oursIdx++;
      }

      const oursEnd = result.length;
      result.push('=======');
      const theirsStart = result.length + 1;

      // Add theirs lines until we find a matching line
      while (theirsIdx < theirsLines.length && theirsLines[theirsIdx] !== baseLine) {
        const line = theirsLines[theirsIdx];
        if (line !== undefined) {
          result.push(line);
        }
        theirsIdx++;
      }

      const theirsEnd = result.length;
      result.push('>>>>>>> theirs');
      const conflictEnd = result.length;

      conflicts.push({
        startLine: conflictStart as LineNumber,
        endLine: conflictEnd as LineNumber,
        oursStart: oursConflictStart as LineNumber,
        oursEnd: oursEnd as LineNumber,
        theirsStart: theirsStart as LineNumber,
        theirsEnd: theirsEnd as LineNumber,
      });

      // Skip base line if we have one
      if (baseLine !== undefined) baseIdx++;
    }

    return {
      success: conflicts.length === 0,
      content: result.join('\n'),
      conflicts,
    };
  }

  /**
   * AI-assisted merge using Lord level (Opus)
   */
  private async aiAssistedMerge(
    conflict: MergeConflict,
    input: MergeInput,
    autoResult: MergeResult
  ): AsyncResult<MergeResolution> {
    if (!this.llmAdapter) {
      return Err(new AppError('NO_LLM', 'LLM adapter not available'));
    }

    const prompt = this.buildMergePrompt(conflict, input, autoResult);

    try {
      const response = await this.llmAdapter.complete({
        prompt,
        systemPrompt: this.buildMergeSystemPrompt(),
        maxTokens: this.config.aiMergeMaxTokens,
        temperature: this.config.aiMergeTemperature,
      });

      if (!response.ok) {
        return Err(response.error);
      }

      // Extract merged code from response
      const mergedContent = this.extractMergedCode(response.value.content);
      if (!mergedContent) {
        return Err(new AppError('PARSE_ERROR', 'Could not extract merged code from AI response'));
      }

      return Ok({
        conflictId: conflict.id,
        resolvedContent: mergedContent,
        resolvedBy: 'ai:claude-opus',
        strategy: 'ai_assisted',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(new AppError('AI_MERGE_FAILED', message));
    }
  }

  /**
   * Build prompt for AI merge
   */
  private buildMergePrompt(
    conflict: MergeConflict,
    input: MergeInput,
    autoResult: MergeResult
  ): string {
    return `You are merging code changes from two developers working on the same file.

FILE: ${conflict.filePath}

ORIGINAL (BASE) CODE:
\`\`\`
${input.base}
\`\`\`

CHANGES FROM DEVELOPER 1 (Agent ${conflict.branch1.agentId}):
\`\`\`
${input.ours}
\`\`\`

CHANGES FROM DEVELOPER 2 (Agent ${conflict.branch2.agentId}):
\`\`\`
${input.theirs}
\`\`\`

AUTOMATIC MERGE RESULT (WITH CONFLICTS):
\`\`\`
${autoResult.content}
\`\`\`

The automatic merge found ${autoResult.conflicts.length} conflict(s).

Please analyze both sets of changes and produce a properly merged version that:
1. Preserves the intent of both developers' changes
2. Resolves any conflicts intelligently
3. Maintains code correctness and consistency
4. Does not lose any functionality from either side

Output ONLY the merged code wrapped in triple backticks (\`\`\`).`;
  }

  /**
   * Build system prompt for merge AI
   */
  private buildMergeSystemPrompt(): string {
    return `You are an expert code merge assistant. Your task is to intelligently merge code changes from multiple developers.

Guidelines:
- Understand the semantic intent of each change
- Preserve functionality from both sides
- Resolve conflicts by combining or choosing the better implementation
- Maintain code style consistency
- Ensure the merged code is syntactically correct
- Do not add comments about the merge process in the output

Output format: Return ONLY the merged code wrapped in \`\`\` code blocks.`;
  }

  /**
   * Extract merged code from AI response
   */
  private extractMergedCode(response: string): string | null {
    // Try to extract code from markdown code blocks
    const codeBlockMatch = response.match(/```[\w]*\n([\s\S]*?)\n```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1];
    }

    // Try to find code between first and last ``` markers
    const parts = response.split('```');
    if (parts.length >= 3 && parts[1]) {
      // Get the content after the first ``` (which may have a language specifier)
      let code = parts[1];
      // Remove language specifier if present
      const firstNewline = code.indexOf('\n');
      if (firstNewline > 0 && firstNewline < 20) {
        code = code.substring(firstNewline + 1);
      }
      return code.trim();
    }

    // If no code blocks, return the whole response (trimmed)
    return response.trim() || null;
  }

  /**
   * Find overlapping regions between two sets of regions
   */
  private findOverlappingRegions(regions1: CodeRegion[], regions2: CodeRegion[]): CodeRegion[] {
    const overlapping: CodeRegion[] = [];

    for (const r1 of regions1) {
      for (const r2 of regions2) {
        if (this.semanticAnalyzer.regionsOverlap(r1, r2)) {
          // Add both regions (they're in conflict)
          if (!overlapping.some((r) => r.id === r1.id)) {
            overlapping.push(r1);
          }
          if (!overlapping.some((r) => r.id === r2.id)) {
            overlapping.push(r2);
          }
        }
      }
    }

    return overlapping;
  }

  /**
   * Create a simple unified diff
   */
  private createUnifiedDiff(original: string, modified: string): string {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');

    const diff: string[] = [
      '--- original',
      '+++ modified',
    ];

    // Simple line-by-line diff
    const maxLen = Math.max(originalLines.length, modifiedLines.length);
    for (let i = 0; i < maxLen; i++) {
      const origLine = originalLines[i];
      const modLine = modifiedLines[i];

      if (origLine === modLine) {
        diff.push(` ${origLine ?? ''}`);
      } else {
        if (origLine !== undefined) {
          diff.push(`-${origLine}`);
        }
        if (modLine !== undefined) {
          diff.push(`+${modLine}`);
        }
      }
    }

    return diff.join('\n');
  }

  /**
   * Emit conflict resolved event
   */
  private emitResolved(resolution: MergeResolution): void {
    this.eventBus.emit('conflict:resolved', {
      type: 'conflict:resolved',
      resolution,
      timestamp: new Date(),
    });
  }
}

/**
 * Create a new merge engine service
 */
export function createMergeEngineService(
  branchService: IVirtualBranchService,
  semanticAnalyzer: ISemanticAnalyzerService,
  llmAdapter: ILLMAdapter | null,
  eventBus: IEventBus,
  config?: Partial<MergeEngineConfig>,
  logger?: ILogger
): IMergeEngineService {
  return new MergeEngineService(
    branchService,
    semanticAnalyzer,
    llmAdapter,
    eventBus,
    config,
    logger
  );
}
