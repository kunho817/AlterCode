/**
 * Merge Engine
 *
 * Detects and resolves conflicts between virtual branches.
 * Uses AI-assisted resolution when automatic merge fails.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  VirtualBranch,
  FileChange,
  MergeConflict,
  MergeResolution,
  CodeRegion,
  HierarchyLevel,
  EventType,
} from '../types';
import { SemanticAnalyzer } from './SemanticAnalyzer';
import { VirtualBranchManager } from './VirtualBranchManager';
import { AgentPool } from '../agents/AgentPool';
import { Logger } from '../utils/Logger';

/**
 * Three-way merge input.
 */
interface MergeInput {
  base: string;
  ours: string;
  theirs: string;
}

/**
 * Merge result.
 */
interface MergeResult {
  success: boolean;
  content: string;
  conflicts: ConflictMarker[];
}

/**
 * A conflict marker in merged content.
 */
interface ConflictMarker {
  startLine: number;
  endLine: number;
  oursStart: number;
  oursEnd: number;
  theirsStart: number;
  theirsEnd: number;
}

/**
 * Orchestrates conflict detection and resolution.
 */
export class MergeEngine extends EventEmitter {
  private readonly logger: Logger;
  private readonly semanticAnalyzer: SemanticAnalyzer;
  private readonly branchManager: VirtualBranchManager;
  private agentPool: AgentPool | null = null;

  private activeConflicts: Map<string, MergeConflict> = new Map();

  constructor(
    semanticAnalyzer: SemanticAnalyzer,
    branchManager: VirtualBranchManager
  ) {
    super();
    this.logger = new Logger('MergeEngine');
    this.semanticAnalyzer = semanticAnalyzer;
    this.branchManager = branchManager;
  }

  /**
   * Set the agent pool for AI-assisted resolution.
   */
  setAgentPool(agentPool: AgentPool): void {
    this.agentPool = agentPool;
  }

  /**
   * Detect conflicts between active branches.
   */
  detectConflicts(): MergeConflict[] {
    const branches = this.branchManager.getActiveBranches();
    const conflicts: MergeConflict[] = [];

    // Check each pair of branches for conflicts
    for (let i = 0; i < branches.length; i++) {
      for (let j = i + 1; j < branches.length; j++) {
        const branch1 = branches[i];
        const branch2 = branches[j];

        const conflictingFiles = this.branchManager.getConflictingFiles(
          branch1.id,
          branch2.id
        );

        for (const filePath of conflictingFiles) {
          const conflict = this.createConflict(branch1, branch2, filePath);
          if (conflict) {
            conflicts.push(conflict);
            this.activeConflicts.set(conflict.id, conflict);
          }
        }
      }
    }

    if (conflicts.length > 0) {
      this.logger.info(`Detected ${conflicts.length} conflicts`);
      this.emit(EventType.CONFLICT_DETECTED, conflicts);
    }

    return conflicts;
  }

  /**
   * Create a conflict object for a file.
   */
  private createConflict(
    branch1: VirtualBranch,
    branch2: VirtualBranch,
    filePath: string
  ): MergeConflict | null {
    const change1 = branch1.changes.find(c => c.filePath === filePath);
    const change2 = branch2.changes.find(c => c.filePath === filePath);

    if (!change1 || !change2) return null;

    // Analyze conflicting regions
    const regions1 = change1.modifiedContent
      ? this.semanticAnalyzer.analyzeFile(filePath, change1.modifiedContent)
      : [];
    const regions2 = change2.modifiedContent
      ? this.semanticAnalyzer.analyzeFile(filePath, change2.modifiedContent)
      : [];

    // Find overlapping regions
    const conflictingRegions: CodeRegion[] = [];
    for (const r1 of regions1) {
      for (const r2 of regions2) {
        if (this.semanticAnalyzer.regionsOverlap(r1, r2)) {
          conflictingRegions.push(r1);
          break;
        }
      }
    }

    return {
      id: uuidv4(),
      filePath,
      baseContent: change1.originalContent || change2.originalContent || '',
      branch1,
      branch2,
      conflictingRegions,
    };
  }

  /**
   * Resolve a conflict automatically if possible.
   */
  async resolveConflict(conflict: MergeConflict): Promise<MergeResolution> {
    this.logger.info(`Attempting to resolve conflict ${conflict.id.substring(0, 8)} for ${conflict.filePath}`);

    const change1 = conflict.branch1.changes.find(c => c.filePath === conflict.filePath);
    const change2 = conflict.branch2.changes.find(c => c.filePath === conflict.filePath);

    if (!change1 || !change2) {
      throw new Error('Missing changes for conflict resolution');
    }

    // Try automatic three-way merge first
    const mergeInput: MergeInput = {
      base: conflict.baseContent,
      ours: change1.modifiedContent,
      theirs: change2.modifiedContent,
    };

    const mergeResult = this.threeWayMerge(mergeInput);

    if (mergeResult.success) {
      this.logger.info(`Auto-merged ${conflict.filePath} successfully`);
      return this.createResolution(conflict.id, mergeResult.content, 'auto');
    }

    // Try AI-assisted resolution
    if (this.agentPool) {
      this.logger.info(`Attempting AI-assisted resolution for ${conflict.filePath}`);
      try {
        const aiResolution = await this.resolveWithAI(conflict, mergeInput);
        if (aiResolution) {
          return aiResolution;
        }
      } catch (error) {
        this.logger.error('AI resolution failed', error);
      }
    }

    // Return conflict markers for manual resolution
    return this.createResolution(
      conflict.id,
      this.generateConflictMarkedContent(mergeInput, mergeResult.conflicts),
      'manual'
    );
  }

  /**
   * Perform three-way merge.
   */
  private threeWayMerge(input: MergeInput): MergeResult {
    const baseLines = input.base.split('\n');
    const oursLines = input.ours.split('\n');
    const theirsLines = input.theirs.split('\n');

    const result: string[] = [];
    const conflicts: ConflictMarker[] = [];

    // Simple line-by-line merge
    const maxLen = Math.max(baseLines.length, oursLines.length, theirsLines.length);
    let conflictStartLine = -1;

    for (let i = 0; i < maxLen; i++) {
      const baseLine = baseLines[i] ?? '';
      const ourLine = oursLines[i] ?? '';
      const theirLine = theirsLines[i] ?? '';

      if (ourLine === theirLine) {
        // Both changes agree
        result.push(ourLine);
      } else if (ourLine === baseLine) {
        // Only theirs changed
        result.push(theirLine);
      } else if (theirLine === baseLine) {
        // Only ours changed
        result.push(ourLine);
      } else {
        // Real conflict
        if (conflictStartLine === -1) {
          conflictStartLine = result.length;
        }
        conflicts.push({
          startLine: result.length,
          endLine: result.length,
          oursStart: i,
          oursEnd: i,
          theirsStart: i,
          theirsEnd: i,
        });
        result.push(ourLine); // Temporarily use ours
      }
    }

    return {
      success: conflicts.length === 0,
      content: result.join('\n'),
      conflicts,
    };
  }

  /**
   * Resolve conflict using AI.
   */
  private async resolveWithAI(
    conflict: MergeConflict,
    mergeInput: MergeInput
  ): Promise<MergeResolution | null> {
    if (!this.agentPool) return null;

    const prompt = this.buildResolutionPrompt(conflict, mergeInput);

    const response = await this.agentPool.executeWithModel(
      {
        taskId: `conflict-${conflict.id}`,
        prompt,
        context: {
          workspaceRoot: '',
          relevantFiles: [{ path: conflict.filePath, relevance: 'primary' }],
          previousDecisions: [],
          constraints: [],
        },
        constraints: { maxTokens: 8192 },
      },
      this.agentPool.getModelForLevel(HierarchyLevel.SPECIALIST),
      HierarchyLevel.SPECIALIST
    );

    if (response.status !== 'success') {
      return null;
    }

    // Parse the AI response for merged content
    const mergedContent = this.parseAIResolution(response.result.content);
    if (!mergedContent) {
      return null;
    }

    return this.createResolution(conflict.id, mergedContent, 'ai_assisted');
  }

  /**
   * Build prompt for AI conflict resolution.
   */
  private buildResolutionPrompt(conflict: MergeConflict, mergeInput: MergeInput): string {
    return `You are resolving a merge conflict in ${conflict.filePath}.

CONFLICT CONTEXT:
- Two workers made different changes to the same file
- Branch 1 (Task: ${conflict.branch1.taskId.substring(0, 8)})
- Branch 2 (Task: ${conflict.branch2.taskId.substring(0, 8)})

CONFLICTING REGIONS:
${conflict.conflictingRegions.map(r => `- ${r.type}: ${r.name} (lines ${r.startLine}-${r.endLine})`).join('\n')}

BASE VERSION (original):
\`\`\`
${mergeInput.base}
\`\`\`

BRANCH 1 VERSION (ours):
\`\`\`
${mergeInput.ours}
\`\`\`

BRANCH 2 VERSION (theirs):
\`\`\`
${mergeInput.theirs}
\`\`\`

YOUR TASK:
Merge these changes intelligently. Consider:
1. Both sets of changes should be preserved if possible
2. If changes are complementary, combine them
3. If changes conflict, prefer the more comprehensive/correct approach
4. Maintain code consistency and style

Respond with ONLY the merged file content wrapped in a code block:
\`\`\`
[merged content here]
\`\`\``;
  }

  /**
   * Parse AI response for merged content.
   */
  private parseAIResolution(response: string): string | null {
    const match = response.match(/```(?:\w*\n)?([\s\S]*?)```/);
    return match ? match[1].trim() : null;
  }

  /**
   * Generate content with conflict markers for manual resolution.
   */
  private generateConflictMarkedContent(
    input: MergeInput,
    conflicts: ConflictMarker[]
  ): string {
    if (conflicts.length === 0) {
      return input.ours;
    }

    const oursLines = input.ours.split('\n');
    const theirsLines = input.theirs.split('\n');
    const result: string[] = [];

    let lastEnd = 0;

    for (const conflict of conflicts) {
      // Add non-conflicting lines before this conflict
      for (let i = lastEnd; i < conflict.oursStart; i++) {
        result.push(oursLines[i] || '');
      }

      // Add conflict markers
      result.push('<<<<<<< BRANCH1 (ours)');
      for (let i = conflict.oursStart; i <= conflict.oursEnd; i++) {
        result.push(oursLines[i] || '');
      }
      result.push('=======');
      for (let i = conflict.theirsStart; i <= conflict.theirsEnd; i++) {
        result.push(theirsLines[i] || '');
      }
      result.push('>>>>>>> BRANCH2 (theirs)');

      lastEnd = conflict.oursEnd + 1;
    }

    // Add remaining lines
    for (let i = lastEnd; i < oursLines.length; i++) {
      result.push(oursLines[i]);
    }

    return result.join('\n');
  }

  /**
   * Create a merge resolution object.
   */
  private createResolution(
    conflictId: string,
    content: string,
    strategy: 'auto' | 'manual' | 'ai_assisted'
  ): MergeResolution {
    return {
      conflictId,
      resolvedContent: content,
      resolvedBy: strategy === 'manual' ? 'user' : 'system',
      strategy,
    };
  }

  /**
   * Apply a resolution to the workspace.
   */
  async applyResolution(resolution: MergeResolution): Promise<void> {
    const conflict = this.activeConflicts.get(resolution.conflictId);
    if (!conflict) {
      throw new Error(`Conflict not found: ${resolution.conflictId}`);
    }

    // Create a file change for the resolved content
    const change: FileChange = {
      filePath: conflict.filePath,
      originalContent: conflict.baseContent,
      modifiedContent: resolution.resolvedContent,
      diff: '',
      changeType: 'modify',
    };

    // Apply to branch1 (we'll merge branch2 into branch1's version)
    this.branchManager.recordChange(conflict.branch1.id, change);

    // Mark branch2's change as superseded
    conflict.branch2.status = 'merged';

    // Remove from active conflicts
    this.activeConflicts.delete(resolution.conflictId);

    this.logger.info(`Applied resolution for ${conflict.filePath}`);
    this.emit(EventType.CONFLICT_RESOLVED, resolution);
  }

  /**
   * Escalate a conflict to a higher hierarchy level.
   */
  escalateConflict(conflict: MergeConflict, level: HierarchyLevel): void {
    this.logger.info(
      `Escalating conflict ${conflict.id.substring(0, 8)} to level ${HierarchyLevel[level]}`
    );

    // Emit event for higher-level handling
    this.emit('conflictEscalated', {
      conflict,
      level,
      reason: 'Automatic and AI resolution failed',
    });
  }

  /**
   * Get active conflicts.
   */
  getActiveConflicts(): MergeConflict[] {
    return Array.from(this.activeConflicts.values());
  }

  /**
   * Get conflict by ID.
   */
  getConflict(conflictId: string): MergeConflict | null {
    return this.activeConflicts.get(conflictId) || null;
  }

  /**
   * Check if there are any active conflicts.
   */
  hasConflicts(): boolean {
    return this.activeConflicts.size > 0;
  }

  /**
   * Clear all active conflicts.
   */
  clearConflicts(): void {
    this.activeConflicts.clear();
  }

  /**
   * Dispose and clean up.
   */
  dispose(): void {
    this.activeConflicts.clear();
    this.removeAllListeners();
  }
}
