/**
 * Task Decomposer
 *
 * Handles decomposition of tasks into sub-tasks based on hierarchy level.
 * Each level breaks down work for the next level until reaching WORKER level.
 */

import {
  Task,
  TaskType,
  TaskPriority,
  HierarchyLevel,
  AgentResult,
} from '../../types';
import { TaskManager, TaskConfig } from '../task/TaskManager';
import { Logger } from '../../utils/Logger';

/**
 * Decomposed sub-task from AI response.
 */
export interface DecomposedTask {
  title: string;
  description: string;
  type: TaskType;
  priority?: TaskPriority;
  estimatedComplexity?: number;
  dependencies?: string[]; // References to other sub-task titles
}

/**
 * Decomposition result from parsing AI output.
 */
export interface DecompositionResult {
  subTasks: DecomposedTask[];
  summary: string;
  decisions: string[];
}

/**
 * Handles task decomposition across hierarchy levels.
 */
export class TaskDecomposer {
  private readonly taskManager: TaskManager;
  private readonly logger: Logger;

  constructor(taskManager: TaskManager) {
    this.taskManager = taskManager;
    this.logger = new Logger('TaskDecomposer');
  }

  /**
   * Check if a task at this level should be decomposed.
   * All levels except WORKER must decompose to maintain proper hierarchy.
   */
  shouldDecompose(level: HierarchyLevel): boolean {
    // Only WORKER level executes directly - all other levels MUST decompose
    // This ensures proper hierarchy: Sovereign -> Architect -> Strategist -> TeamLead -> Specialist -> Worker
    return level < HierarchyLevel.WORKER;
  }

  /**
   * Check if this level must delegate to the next level.
   * Specialist MUST always create Worker tasks, not implement directly.
   */
  mustDelegate(level: HierarchyLevel): boolean {
    // All levels except WORKER must delegate to the next level
    return level < HierarchyLevel.WORKER;
  }

  /**
   * Get the target level for sub-tasks.
   */
  getNextLevel(currentLevel: HierarchyLevel): HierarchyLevel {
    return Math.min(currentLevel + 1, HierarchyLevel.WORKER) as HierarchyLevel;
  }

  /**
   * Get the task type appropriate for the next level.
   */
  getTaskTypeForLevel(level: HierarchyLevel): TaskType {
    switch (level) {
      case HierarchyLevel.ARCHITECT:
        return TaskType.DOMAIN_DESIGN;
      case HierarchyLevel.STRATEGIST:
        return TaskType.FEATURE_DESIGN;
      case HierarchyLevel.TEAM_LEAD:
        return TaskType.TASK_COORDINATION;
      case HierarchyLevel.SPECIALIST:
        return TaskType.COMPLEX_IMPLEMENTATION;
      case HierarchyLevel.WORKER:
        return TaskType.SIMPLE_IMPLEMENTATION;
      default:
        return TaskType.SIMPLE_IMPLEMENTATION;
    }
  }

  /**
   * Parse AI response to extract sub-tasks.
   */
  parseDecompositionResponse(content: string, level: HierarchyLevel): DecompositionResult {
    this.logger.debug(`Parsing decomposition response for level ${HierarchyLevel[level]}`);

    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        content.match(/\{[\s\S]*"subTasks"[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        if (parsed.subTasks && Array.isArray(parsed.subTasks)) {
          return {
            subTasks: parsed.subTasks.map((t: Record<string, unknown>) => this.normalizeSubTask(t, level)),
            summary: String(parsed.summary || ''),
            decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
          };
        }
      }

      // Fallback: Try to extract tasks from structured text
      return this.parseStructuredText(content, level);
    } catch (error) {
      this.logger.warn('Failed to parse decomposition JSON, using fallback', error);
      return this.parseStructuredText(content, level);
    }
  }

  /**
   * Parse structured text to extract tasks (fallback method).
   */
  private parseStructuredText(content: string, level: HierarchyLevel): DecompositionResult {
    const subTasks: DecomposedTask[] = [];
    const nextLevel = this.getNextLevel(level);
    const taskType = this.getTaskTypeForLevel(nextLevel);

    // Look for numbered lists or bullet points
    const taskPatterns = [
      /^\d+\.\s*\*\*([^*]+)\*\*[:\s]*(.*)$/gm,  // 1. **Title**: Description
      /^\d+\.\s*([^:]+):\s*(.*)$/gm,            // 1. Title: Description
      /^[-*]\s*\*\*([^*]+)\*\*[:\s]*(.*)$/gm,   // - **Title**: Description
      /^[-*]\s*([^:]+):\s*(.*)$/gm,             // - Title: Description
    ];

    for (const pattern of taskPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const title = match[1].trim();
        const description = match[2]?.trim() || title;

        // Skip if title looks like a section header
        if (title.length > 100 || title.toLowerCase().includes('summary')) continue;

        subTasks.push({
          title,
          description,
          type: taskType,
          priority: TaskPriority.NORMAL,
        });
      }

      if (subTasks.length > 0) break;
    }

    // If no tasks found, create a single continuation task
    if (subTasks.length === 0) {
      this.logger.warn('No sub-tasks found in response, creating continuation task');
      subTasks.push({
        title: 'Continue implementation',
        description: content.substring(0, 500),
        type: taskType,
        priority: TaskPriority.NORMAL,
      });
    }

    return {
      subTasks,
      summary: content.substring(0, 200),
      decisions: [],
    };
  }

  /**
   * Normalize a sub-task object from parsed JSON.
   */
  private normalizeSubTask(task: Record<string, unknown>, parentLevel: HierarchyLevel): DecomposedTask {
    const nextLevel = this.getNextLevel(parentLevel);

    return {
      title: String(task.title || task.name || 'Untitled task'),
      description: String(task.description || task.details || ''),
      type: this.parseTaskType(task.type as string) || this.getTaskTypeForLevel(nextLevel),
      priority: this.parsePriority(task.priority as string | number),
      estimatedComplexity: typeof task.complexity === 'number' ? task.complexity :
                          typeof task.estimatedComplexity === 'number' ? task.estimatedComplexity : 5,
      dependencies: Array.isArray(task.dependencies) ? task.dependencies.map(String) : [],
    };
  }

  /**
   * Parse task type from string.
   */
  private parseTaskType(typeStr: string | undefined): TaskType | null {
    if (!typeStr) return null;
    const normalized = typeStr.toLowerCase().replace(/[^a-z_]/g, '_');
    return (TaskType as Record<string, string>)[normalized.toUpperCase()] as TaskType || null;
  }

  /**
   * Parse priority from string or number.
   */
  private parsePriority(priority: string | number | undefined): TaskPriority {
    if (typeof priority === 'number') {
      if (priority >= 4) return TaskPriority.CRITICAL;
      if (priority >= 3) return TaskPriority.HIGH;
      if (priority >= 2) return TaskPriority.NORMAL;
      return TaskPriority.LOW;
    }

    if (typeof priority === 'string') {
      const lower = priority.toLowerCase();
      if (lower.includes('critical')) return TaskPriority.CRITICAL;
      if (lower.includes('high')) return TaskPriority.HIGH;
      if (lower.includes('low')) return TaskPriority.LOW;
    }

    return TaskPriority.NORMAL;
  }

  /**
   * Create sub-tasks from decomposition result.
   */
  async createSubTasks(
    parentTask: Task,
    decomposition: DecompositionResult
  ): Promise<Task[]> {
    const nextLevel = this.getNextLevel(parentTask.level);
    const createdTasks: Task[] = [];
    const titleToId: Map<string, string> = new Map();

    this.logger.info(
      `Creating ${decomposition.subTasks.length} sub-tasks at level ${HierarchyLevel[nextLevel]} for parent ${parentTask.id.substring(0, 8)}`
    );

    for (const subTask of decomposition.subTasks) {
      const config: TaskConfig = {
        missionId: parentTask.missionId,
        parentTaskId: parentTask.id,
        level: nextLevel,
        type: subTask.type,
        priority: subTask.priority || TaskPriority.NORMAL,
        title: subTask.title,
        description: subTask.description,
        context: {
          ...parentTask.context,
          previousDecisions: [
            ...parentTask.context.previousDecisions,
            ...decomposition.decisions,
          ],
        },
        input: {
          prompt: this.buildSubTaskPrompt(subTask, nextLevel, parentTask),
          context: parentTask.context,
          constraints: parentTask.input.constraints,
        },
        dependencies: [], // Will be updated after all tasks created
      };

      const task = await this.taskManager.createTask(config);
      createdTasks.push(task);
      titleToId.set(subTask.title, task.id);
    }

    // Update dependencies based on title references
    for (let i = 0; i < decomposition.subTasks.length; i++) {
      const subTask = decomposition.subTasks[i];
      const task = createdTasks[i];

      if (subTask.dependencies && subTask.dependencies.length > 0) {
        for (const depTitle of subTask.dependencies) {
          const depId = titleToId.get(depTitle);
          if (depId) {
            task.dependencies.push({
              taskId: depId,
              type: 'blocking',
              status: 'pending',
            });
          }
        }
      }
    }

    return createdTasks;
  }

  /**
   * Build prompt for a sub-task based on its level.
   */
  private buildSubTaskPrompt(
    subTask: DecomposedTask,
    level: HierarchyLevel,
    parentTask: Task
  ): string {
    const levelInstructions = this.getLevelInstructions(level);

    return `
# Task: ${subTask.title}

## Context
Parent task: ${parentTask.title}
${subTask.description}

## Your Role
${levelInstructions}

## Requirements
${subTask.description}

## Output Format
${this.getOutputFormat(level)}
`.trim();
  }

  /**
   * Get level-specific instructions.
   */
  private getLevelInstructions(level: HierarchyLevel): string {
    switch (level) {
      case HierarchyLevel.STRATEGIST:
        return `You are a Feature Strategist. Break down this domain design into specific features.
For each feature, define clear acceptance criteria and technical requirements.`;

      case HierarchyLevel.TEAM_LEAD:
        return `You are a Team Lead. Break down this feature into implementable tasks.
Consider dependencies between tasks and optimal execution order.`;

      case HierarchyLevel.SPECIALIST:
        return `You are a Specialist. Break down this implementation task into atomic Worker tasks.
Each Worker task should be a single, focused unit of work (one file change, one function, etc.).
You MUST create Worker tasks - do not implement directly.`;

      case HierarchyLevel.WORKER:
        return `You are a Worker. Execute this task by providing the actual code implementation.
Focus on clean, working code that meets the requirements.`;

      default:
        return 'Analyze and break down this task appropriately.';
    }
  }

  /**
   * Get expected output format for a level.
   */
  private getOutputFormat(level: HierarchyLevel): string {
    if (level === HierarchyLevel.WORKER) {
      return `Provide your implementation as:
1. File path and changes needed
2. The actual code to write or modify
3. Any tests or documentation updates`;
    }

    return `Respond with JSON:
\`\`\`json
{
  "summary": "Brief summary of your analysis",
  "decisions": ["Key decision 1", "Key decision 2"],
  "subTasks": [
    {
      "title": "Task title",
      "description": "Detailed description",
      "type": "task_type",
      "priority": "normal|high|critical",
      "estimatedComplexity": 1-10,
      "dependencies": ["Other task title if dependent"]
    }
  ]
}
\`\`\``;
  }
}
