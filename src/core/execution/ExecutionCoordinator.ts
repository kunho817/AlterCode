/**
 * Execution Coordinator
 *
 * Coordinates task execution across the agent hierarchy.
 */

import { EventEmitter } from 'events';
import {
  Mission,
  MissionStatus,
  Task,
  TaskStatus,
  TaskPriority,
  HierarchyLevel,
  AgentRole,
  AgentRequest,
  TaskOutput,
} from '../../types';
import { TaskManager } from '../task/TaskManager';
import { HierarchyManager } from '../hierarchy/HierarchyManager';
import { AgentPool } from '../../agents/AgentPool';
import { ApprovalManager } from '../approval/ApprovalManager';
import { QuotaTracker } from '../../quota/QuotaTracker';
import { TaskDecomposer } from '../decomposition/TaskDecomposer';
import { CodeChangeParser } from '../changes/CodeChangeParser';
import { FileChangeApplier } from '../changes/FileChangeApplier';
import { SemanticAnalyzer, VirtualBranchManager, MergeEngine } from '../../conflict';
import { Logger } from '../../utils/Logger';

/**
 * Concurrency configuration for different hierarchy levels.
 */
interface ConcurrencyConfig {
  maxConcurrentByLevel: Record<HierarchyLevel, number>;
  maxTotalConcurrent: number;
}

/**
 * Coordinates task execution.
 */
export class ExecutionCoordinator extends EventEmitter {
  private readonly taskManager: TaskManager;
  private readonly agentPool: AgentPool;
  private readonly hierarchyManager: HierarchyManager;
  private readonly approvalManager: ApprovalManager;
  private readonly quotaTracker: QuotaTracker;
  private readonly decomposer: TaskDecomposer;
  private readonly changeParser: CodeChangeParser;
  private readonly changeApplier: FileChangeApplier;
  private readonly semanticAnalyzer: SemanticAnalyzer;
  private readonly branchManager: VirtualBranchManager;
  private readonly mergeEngine: MergeEngine;
  private readonly logger: Logger;

  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private currentMission: Mission | null = null;
  private executionLoop: Promise<void> | null = null;

  // Concurrency tracking
  private readonly activeTasks: Map<string, Promise<void>> = new Map();
  private readonly activeByLevel: Map<HierarchyLevel, number> = new Map();
  private readonly concurrencyConfig: ConcurrencyConfig = {
    maxConcurrentByLevel: {
      [HierarchyLevel.SOVEREIGN]: 1,    // Only one sovereign
      [HierarchyLevel.ARCHITECT]: 2,    // Max 2 architects
      [HierarchyLevel.STRATEGIST]: 4,   // Max 4 strategists
      [HierarchyLevel.TEAM_LEAD]: 6,    // Max 6 team leads
      [HierarchyLevel.SPECIALIST]: 8,   // Max 8 specialists
      [HierarchyLevel.WORKER]: 10,      // Max 10 workers (configurable)
    },
    maxTotalConcurrent: 15,
  };

  constructor(
    taskManager: TaskManager,
    agentPool: AgentPool,
    hierarchyManager: HierarchyManager,
    approvalManager: ApprovalManager,
    quotaTracker: QuotaTracker,
    workspaceRoot: string,
    maxConcurrentWorkers: number = 10
  ) {
    super();
    this.taskManager = taskManager;
    this.agentPool = agentPool;
    this.hierarchyManager = hierarchyManager;
    this.approvalManager = approvalManager;
    this.quotaTracker = quotaTracker;
    this.decomposer = new TaskDecomposer(taskManager);
    this.changeParser = new CodeChangeParser();
    this.changeApplier = new FileChangeApplier(workspaceRoot);
    this.semanticAnalyzer = new SemanticAnalyzer();
    this.branchManager = new VirtualBranchManager(workspaceRoot);
    this.mergeEngine = new MergeEngine(this.semanticAnalyzer, this.branchManager);
    this.mergeEngine.setAgentPool(agentPool);
    this.logger = new Logger('ExecutionCoordinator');

    // Apply configured concurrency limit for workers
    this.concurrencyConfig.maxConcurrentByLevel[HierarchyLevel.WORKER] = maxConcurrentWorkers;
    this.concurrencyConfig.maxTotalConcurrent = maxConcurrentWorkers + 10; // Workers + management levels

    // Initialize level counters
    for (let level = 0; level <= 5; level++) {
      this.activeByLevel.set(level as HierarchyLevel, 0);
    }
  }

  /**
   * Execute a mission.
   */
  async execute(mission: Mission): Promise<void> {
    if (this.isRunning) {
      throw new Error('Execution already in progress');
    }

    this.currentMission = mission;
    this.isRunning = true;
    this.isPaused = false;

    this.logger.info(`Starting execution of mission: ${mission.id}`);

    try {
      this.executionLoop = this.runExecutionLoop();
      await this.executionLoop;

      // Check mission status
      const progress = this.taskManager.getMissionProgress(mission.id);
      if (progress.completed === progress.total) {
        mission.status = MissionStatus.COMPLETED;
        mission.completedAt = new Date();
      }

      this.logger.info(`Mission execution completed: ${mission.id}`);
    } catch (error) {
      this.logger.error(`Mission execution failed: ${mission.id}`, error);
      throw error;
    } finally {
      this.isRunning = false;
      this.currentMission = null;
      this.executionLoop = null;
    }
  }

  /**
   * Pause execution.
   */
  async pause(): Promise<void> {
    this.logger.info('Pausing execution...');
    this.isPaused = true;
  }

  /**
   * Resume execution.
   */
  async resume(): Promise<void> {
    this.logger.info('Resuming execution...');
    this.isPaused = false;
  }

  /**
   * Cancel execution.
   */
  async cancel(): Promise<void> {
    this.logger.info('Cancelling execution...');
    this.isRunning = false;
    this.isPaused = false;

    // Cancel all active agent requests
    const runningTasks = this.taskManager.getRunningTasks();
    for (const task of runningTasks) {
      this.agentPool.cancelRequest(task.id);
      await this.taskManager.cancelTask(task.id);
    }
  }

  /**
   * Dispose the coordinator.
   */
  async dispose(): Promise<void> {
    await this.cancel();
  }

  /**
   * Main execution loop.
   */
  private async runExecutionLoop(): Promise<void> {
    this.logger.info('=== Execution loop started ===');
    let loopCount = 0;

    while (this.isRunning) {
      loopCount++;
      this.logger.debug(`Loop iteration ${loopCount}`);

      // Check pause state
      if (this.isPaused) {
        await this.sleep(100);
        continue;
      }

      // Get all task states for debugging
      const pendingTasks = this.taskManager.getPendingTasks();
      const readyTasks = this.taskManager.getReadyTasks();
      const runningTasks = this.taskManager.getRunningTasks();
      const completedTasks = this.taskManager.getCompletedTasks();

      this.logger.info(
        `Task states - Pending: ${pendingTasks.length}, Ready: ${readyTasks.length}, Running: ${runningTasks.length}, Completed: ${completedTasks.length}`
      );

      if (readyTasks.length === 0) {
        if (runningTasks.length === 0) {
          this.logger.info('=== No ready or running tasks, exiting loop ===');
          if (pendingTasks.length > 0) {
            this.logger.warn(
              `WARNING: ${pendingTasks.length} pending tasks exist but none are ready. Checking dependencies...`
            );
            for (const task of pendingTasks) {
              const depsStatus = task.dependencies.map(
                (d) => `${d.taskId}(${d.type}:${d.status})`
              );
              this.logger.debug(
                `Task ${task.id.substring(0, 8)} deps: ${depsStatus.join(', ') || 'none'}`
              );
            }
          }
          break;
        }
        this.logger.debug('Waiting for running tasks to complete...');
        await this.sleep(100);
        continue;
      }

      // Select tasks respecting concurrency limits and priorities
      const tasksToExecute = this.selectTasksForExecution(readyTasks);

      if (tasksToExecute.length === 0) {
        // Can't execute any tasks due to concurrency limits, wait for active tasks
        this.logger.debug('Concurrency limits reached, waiting...');
        await this.sleep(100);
        continue;
      }

      this.logger.info(
        `Executing ${tasksToExecute.length} tasks (Active: ${this.activeTasks.size}): ${tasksToExecute.map((t) => `${HierarchyLevel[t.level]}:${t.title.substring(0, 20)}`).join(', ')}`
      );

      // Start tasks without waiting (fire and forget, tracked in activeTasks)
      for (const task of tasksToExecute) {
        const taskPromise = this.executeTaskWithTracking(task);
        this.activeTasks.set(task.id, taskPromise);
      }

      // Small delay to allow tasks to start
      await this.sleep(50);
    }

    // Wait for remaining active tasks to complete
    if (this.activeTasks.size > 0) {
      this.logger.info(`Waiting for ${this.activeTasks.size} active tasks to complete...`);
      await Promise.all(this.activeTasks.values());
    }

    this.logger.info(`=== Execution loop ended after ${loopCount} iterations ===`);
  }

  /**
   * Select tasks for execution based on concurrency limits and priorities.
   */
  private selectTasksForExecution(readyTasks: Task[]): Task[] {
    const selected: Task[] = [];

    // Sort by priority (highest first) and then by level (lower levels first)
    const sortedTasks = [...readyTasks].sort((a, b) => {
      // Higher priority first
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Lower level first (strategic decisions before worker tasks)
      return a.level - b.level;
    });

    for (const task of sortedTasks) {
      // Check total concurrency limit
      if (this.activeTasks.size + selected.length >= this.concurrencyConfig.maxTotalConcurrent) {
        this.logger.debug(`Total concurrency limit reached (${this.concurrencyConfig.maxTotalConcurrent})`);
        break;
      }

      // Check level-specific concurrency limit
      const currentAtLevel = this.activeByLevel.get(task.level) || 0;
      const maxAtLevel = this.concurrencyConfig.maxConcurrentByLevel[task.level] || 5;

      // Count already selected tasks at this level
      const selectedAtLevel = selected.filter((t) => t.level === task.level).length;

      if (currentAtLevel + selectedAtLevel >= maxAtLevel) {
        this.logger.debug(
          `Level ${HierarchyLevel[task.level]} concurrency limit reached (${currentAtLevel}/${maxAtLevel})`
        );
        continue; // Skip this task, try next
      }

      selected.push(task);
    }

    return selected;
  }

  /**
   * Execute a task with concurrency tracking.
   */
  private async executeTaskWithTracking(task: Task): Promise<void> {
    // Increment level counter
    const currentCount = this.activeByLevel.get(task.level) || 0;
    this.activeByLevel.set(task.level, currentCount + 1);

    try {
      await this.executeTask(task);
    } finally {
      // Decrement level counter
      const count = this.activeByLevel.get(task.level) || 1;
      this.activeByLevel.set(task.level, Math.max(0, count - 1));

      // Remove from active tasks
      this.activeTasks.delete(task.id);
    }
  }

  /**
   * Execute a single task.
   */
  private async executeTask(task: Task): Promise<void> {
    this.logger.info(`>>> Starting task execution: ${task.title.substring(0, 50)} (${task.id.substring(0, 8)})`);

    try {
      // Find or spawn an agent
      this.logger.debug(`Finding/spawning agent for level ${task.level}, role ${this.getRoleForTask(task)}`);
      const agent = await this.hierarchyManager.findOrSpawnAgent(
        task.level,
        this.getRoleForTask(task),
        task.parentTaskId
      );
      this.logger.debug(`Agent found: ${agent.id.substring(0, 8)}`);

      // Assign task to agent
      await this.taskManager.assignTask(task.id, agent.id);
      await this.hierarchyManager.assignTask(agent.id, task.id);
      await this.taskManager.startTask(task.id);

      this.logger.info(`Task ${task.id.substring(0, 8)} assigned to agent ${agent.id.substring(0, 8)}, now running`);

      // Build agent request
      const request: AgentRequest = {
        taskId: task.id,
        prompt: task.input.prompt,
        systemPrompt: this.getSystemPromptForLevel(task.level),
        context: task.context,
        constraints: task.input.constraints || {},
      };

      // Execute with agent pool
      this.logger.info(`Calling agentPool.execute for task ${task.id.substring(0, 8)}...`);
      const response = await this.agentPool.execute(request, task.level, agent.id);
      this.logger.info(`agentPool.execute returned with status: ${response.status}`);

      // Handle response
      if (response.status === 'success') {
        this.logger.info(`Task ${task.id.substring(0, 8)} succeeded, response length: ${response.result.content.length}`);

        // Check if this task should be decomposed into sub-tasks
        if (this.decomposer.shouldDecompose(task.level)) {
          this.logger.info(`Decomposing task at level ${HierarchyLevel[task.level]}...`);

          // Parse response for sub-tasks
          const decomposition = this.decomposer.parseDecompositionResponse(
            response.result.content,
            task.level
          );

          this.logger.info(`Found ${decomposition.subTasks.length} sub-tasks`);

          // Create sub-tasks
          const subTasks = await this.decomposer.createSubTasks(task, decomposition);

          this.logger.info(
            `Created ${subTasks.length} sub-tasks: ${subTasks.map((t) => t.title.substring(0, 30)).join(', ')}`
          );

          // Complete parent task (it has done its job of decomposing)
          const output: TaskOutput = {
            result: response.result.content,
            fileChanges: [],
            decisions: decomposition.decisions,
            metrics: response.metrics,
          };

          await this.taskManager.completeTask(task.id, output);
          await this.hierarchyManager.completeTask(agent.id, true);

          this.emit('taskDecomposed', task, subTasks);
          this.emit('taskCompleted', task);
        } else {
          // WORKER level - this is actual implementation
          this.logger.info(`Task at WORKER level - handling implementation output`);

          // Create virtual branch for this worker
          const branch = await this.branchManager.createBranch(agent.id, task.id);
          this.logger.debug(`Created virtual branch ${branch.id.substring(0, 8)} for task`);

          // Parse file changes from AI response
          let fileChanges = response.result.fileChanges || [];

          // If no explicit fileChanges, try to parse from content
          if (fileChanges.length === 0) {
            fileChanges = this.changeParser.parseOutput(response.result.content);
            this.logger.info(`Parsed ${fileChanges.length} file changes from response`);
          }

          // Prepare changes (read original content, generate diffs)
          if (fileChanges.length > 0) {
            fileChanges = await this.changeApplier.prepareChanges(fileChanges);
            this.logger.info(`Prepared ${fileChanges.length} file changes with diffs`);

            // Record changes in virtual branch
            this.branchManager.recordChanges(branch.id, fileChanges);

            // Check for conflicts with other active branches
            const conflicts = this.mergeEngine.detectConflicts();
            if (conflicts.length > 0) {
              this.logger.warn(`Detected ${conflicts.length} conflicts for task ${task.id.substring(0, 8)}`);

              // Attempt to resolve conflicts
              for (const conflict of conflicts) {
                const resolution = await this.mergeEngine.resolveConflict(conflict);
                if (resolution.strategy === 'manual') {
                  this.logger.warn(`Conflict in ${conflict.filePath} requires manual resolution`);
                  // For now, continue with ours version
                } else {
                  await this.mergeEngine.applyResolution(resolution);
                  this.logger.info(`Resolved conflict in ${conflict.filePath} using ${resolution.strategy}`);
                }
              }
            }

            // Request approval
            const approvalResult = await this.approvalManager.requestApproval(
              task,
              fileChanges
            );

            if (!approvalResult.approved) {
              this.logger.info(`Changes rejected for task ${task.id.substring(0, 8)}`);
              this.branchManager.abandonBranch(branch.id);
              await this.taskManager.updateTaskStatus(task.id, TaskStatus.REJECTED);
              await this.hierarchyManager.completeTask(agent.id, false);
              this.emit('taskRejected', task);
              return;
            }

            // Merge branch and apply approved changes
            this.logger.info(`Merging branch and applying ${fileChanges.length} approved changes...`);
            const mergeResult = await this.branchManager.mergeBranch(branch.id);

            if (!mergeResult.success) {
              this.logger.error(`Failed to merge branch: ${mergeResult.errors.join('; ')}`);
              for (const error of mergeResult.errors) {
                this.logger.error(`  - ${error}`);
              }
            } else {
              this.logger.info(`Successfully merged branch and applied all changes`);
            }
          } else {
            // No changes, just clean up the branch
            this.branchManager.deleteBranch(branch.id);
          }

          // Complete task
          const output: TaskOutput = {
            result: response.result.content,
            fileChanges,
            decisions: [],
            metrics: response.metrics,
          };

          await this.taskManager.completeTask(task.id, output);
          await this.hierarchyManager.completeTask(agent.id, true);

          this.emit('taskCompleted', task);
        }
      } else {
        // Handle failure
        this.logger.error(`Task ${task.id.substring(0, 8)} failed: ${response.error?.message || 'Unknown error'}`);
        await this.taskManager.failTask(task.id, new Error(response.error?.message || 'Unknown error'));
        await this.hierarchyManager.completeTask(agent.id, false);

        this.emit('taskFailed', task, response.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Task ${task.id.substring(0, 8)} execution exception: ${errorMessage}`);
      await this.taskManager.failTask(task.id, error as Error);
      this.emit('taskFailed', task, error);
    }

    this.logger.info(`<<< Task execution finished: ${task.id.substring(0, 8)}`);
  }

  /**
   * Get role for task based on its level and type.
   */
  private getRoleForTask(task: Task): AgentRole {
    // Simplified role mapping
    switch (task.level) {
      case HierarchyLevel.ARCHITECT:
        return task.title.toLowerCase().includes('frontend')
          ? AgentRole.FRONTEND_ARCHITECT
          : AgentRole.BACKEND_ARCHITECT;
      case HierarchyLevel.STRATEGIST:
        return AgentRole.FEATURE_STRATEGIST;
      case HierarchyLevel.TEAM_LEAD:
        return AgentRole.TEAM_LEAD;
      case HierarchyLevel.SPECIALIST:
        return AgentRole.SPECIALIST;
      case HierarchyLevel.WORKER:
        return AgentRole.WORKER;
      default:
        return AgentRole.WORKER;
    }
  }

  /**
   * Get system prompt for hierarchy level.
   */
  private getSystemPromptForLevel(level: HierarchyLevel): string {
    const decompositionFormat = `
IMPORTANT: You must respond with valid JSON in this exact format:
\`\`\`json
{
  "summary": "Brief summary of your analysis and approach",
  "decisions": ["Key technical decision 1", "Key technical decision 2"],
  "subTasks": [
    {
      "title": "Clear, actionable task title",
      "description": "Detailed description of what needs to be done",
      "type": "feature_design|task_coordination|complex_implementation|simple_implementation",
      "priority": "low|normal|high|critical",
      "estimatedComplexity": 5,
      "dependencies": ["Title of another task if this depends on it"]
    }
  ]
}
\`\`\``;

    const prompts: Record<HierarchyLevel, string> = {
      [HierarchyLevel.SOVEREIGN]: `You are the SOVEREIGN - the meta-orchestrator of the AlterCode system.
Your role is to analyze planning documents and decompose them into domain-level tasks.

${decompositionFormat}

Focus on identifying:
- Which domains are involved (frontend, backend, database, infrastructure)
- High-level objectives for each domain
- Dependencies between domains`,

      [HierarchyLevel.ARCHITECT]: `You are a DOMAIN ARCHITECT in the AlterCode hierarchy.
Your role is to take domain-level objectives and break them into feature-level designs.

${decompositionFormat}

Focus on:
- Architectural patterns to use
- Component/module breakdown
- API contracts and data flow
- Technical constraints and decisions`,

      [HierarchyLevel.STRATEGIST]: `You are a FEATURE STRATEGIST in the AlterCode hierarchy.
Your role is to take feature designs and break them into coordinated implementation tasks.

${decompositionFormat}

Focus on:
- Breaking features into implementable units
- Defining clear interfaces between components
- Identifying shared utilities or dependencies
- Ordering tasks for efficient parallel execution`,

      [HierarchyLevel.TEAM_LEAD]: `You are a TEAM LEAD in the AlterCode hierarchy.
Your role is to take implementation tasks and break them into specific coding assignments.

${decompositionFormat}

Focus on:
- File-level changes needed
- Function/method signatures
- Test requirements
- Edge cases and error handling`,

      [HierarchyLevel.SPECIALIST]: `You are a SPECIALIST in the AlterCode hierarchy.
Your role is to break down complex implementation tasks into atomic WORKER tasks.

IMPORTANT: You MUST ALWAYS decompose your task into Worker tasks. You cannot implement directly.
Each Worker task should be a single, focused unit of work (one file, one function, one test, etc.)

${decompositionFormat}

Guidelines:
- Break complex tasks into 2-5 Worker tasks
- Each Worker task should take 5-15 minutes of work
- Ensure each task has clear input and expected output
- Consider error handling, testing, and documentation as separate tasks if needed`,

      [HierarchyLevel.WORKER]: `You are a WORKER in the AlterCode hierarchy.
Your role is to execute atomic implementation tasks.

IMPORTANT: Provide your implementation in one of these formats:

FORMAT 1 - JSON (preferred):
\`\`\`json
{
  "files": [
    {
      "filePath": "src/path/to/file.ts",
      "changeType": "modify",
      "content": "// Complete file content here"
    }
  ]
}
\`\`\`

FORMAT 2 - Markdown code blocks with file paths:
\`\`\`typescript:src/path/to/file.ts
// Complete file content here
\`\`\`

FORMAT 3 - File headers before code blocks:
### File: src/path/to/file.ts
\`\`\`typescript
// Complete file content here
\`\`\`

Guidelines:
- Always provide COMPLETE file content, not just snippets
- Use relative paths from the workspace root
- For new files, use changeType: "create"
- Focus on clean, working code that fulfills the task requirements`,
    };
    return prompts[level];
  }

  /**
   * Sleep for a specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
