/**
 * Sovereign
 *
 * Level 0 meta-orchestrator that receives planning documents and decomposes them.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Mission,
  MissionStatus,
  Task,
  TaskType,
  TaskStatus,
  TaskPriority,
  HierarchyLevel,
  AgentRole,
  AgentRequest,
  Domain,
  ApprovalMode,
} from '../../types';
import { AgentPool } from '../../agents/AgentPool';
import { TaskManager, TaskConfig } from '../task/TaskManager';
import { HierarchyManager } from '../hierarchy/HierarchyManager';
import { Logger } from '../../utils/Logger';

/**
 * Domain allocation from planning document analysis.
 */
interface DomainAllocation {
  domains: DomainTask[];
  resourceAllocation: Record<Domain, number>;
  priorities: string[];
}

/**
 * Domain-level task.
 */
interface DomainTask {
  domain: Domain;
  objective: string;
  successCriteria: string[];
  estimatedComplexity: number;
  dependencies: Domain[];
}

/**
 * The Sovereign - Level 0 Meta-Orchestrator.
 */
export class Sovereign {
  private readonly agentPool: AgentPool;
  private readonly taskManager: TaskManager;
  private readonly hierarchyManager: HierarchyManager;
  private readonly logger: Logger;

  constructor(
    agentPool: AgentPool,
    taskManager: TaskManager,
    hierarchyManager: HierarchyManager
  ) {
    this.agentPool = agentPool;
    this.taskManager = taskManager;
    this.hierarchyManager = hierarchyManager;
    this.logger = new Logger('Sovereign');
  }

  /**
   * Create a mission from a planning document.
   */
  async createMission(planningDocument: string): Promise<Mission> {
    console.log('[Sovereign] createMission called');
    this.logger.info('Creating mission from planning document...');

    // Create mission record - use provided config or defaults
    const mission: Mission = {
      id: uuidv4(),
      title: this.extractTitle(planningDocument),
      description: this.extractDescription(planningDocument),
      planningDocument,
      status: MissionStatus.PLANNING,
      rootTaskIds: [],
      config: {
        approvalMode: ApprovalMode.FULL_AUTOMATION, // Default to full auto, can be overridden
        maxConcurrentWorkers: 10,
      },
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };

    // Analyze and decompose the planning document
    const allocation = await this.analyzePlanningDocument(planningDocument);

    // Create domain-level tasks
    const domainTasks = await this.createDomainTasks(mission.id, allocation);

    mission.rootTaskIds = domainTasks.map((t) => t.id);

    this.logger.info(`Mission created: ${mission.id} with ${domainTasks.length} domain tasks`);

    return mission;
  }

  /**
   * Analyze planning document to extract domain allocations.
   */
  private async analyzePlanningDocument(document: string): Promise<DomainAllocation> {
    console.log('[Sovereign] analyzePlanningDocument called');
    this.logger.debug('Analyzing planning document...');

    // Spawn sovereign agent if needed
    let sovereign = this.hierarchyManager.getSovereign();
    if (!sovereign) {
      sovereign = await this.hierarchyManager.spawnAgent({
        level: HierarchyLevel.SOVEREIGN,
        parentId: null,
        role: AgentRole.SOVEREIGN,
      });
    }

    // Build analysis request
    const request: AgentRequest = {
      taskId: 'sovereign-analysis',
      prompt: this.buildAnalysisPrompt(document),
      systemPrompt: this.getSovereignSystemPrompt(),
      context: {
        workspaceRoot: '',
        relevantFiles: [],
        previousDecisions: [],
        constraints: [],
      },
      constraints: {},
    };

    // Execute analysis
    console.log('[Sovereign] Calling agentPool.execute...');
    const response = await this.agentPool.execute(
      request,
      HierarchyLevel.SOVEREIGN,
      sovereign.id
    );

    // Parse response
    try {
      const allocation = this.parseAllocationResponse(response.result.content);
      return allocation;
    } catch (error) {
      this.logger.warn('Failed to parse AI response, using default allocation');
      return this.createDefaultAllocation(document);
    }
  }

  /**
   * Create domain-level tasks from allocation.
   */
  private async createDomainTasks(
    missionId: string,
    allocation: DomainAllocation
  ): Promise<Task[]> {
    const tasks: Task[] = [];

    for (const domainTask of allocation.domains) {
      const taskConfig: TaskConfig = {
        missionId,
        level: HierarchyLevel.ARCHITECT,
        type: TaskType.DOMAIN_DESIGN,
        priority: this.getPriorityFromComplexity(domainTask.estimatedComplexity),
        title: `${domainTask.domain.charAt(0).toUpperCase() + domainTask.domain.slice(1)} Domain: ${domainTask.objective}`,
        description: domainTask.objective,
        context: {
          workspaceRoot: '',
          relevantFiles: [],
          previousDecisions: [],
          constraints: domainTask.successCriteria,
        },
        input: {
          prompt: this.buildDomainPrompt(domainTask),
          context: {
            workspaceRoot: '',
            relevantFiles: [],
            previousDecisions: [],
            constraints: domainTask.successCriteria,
          },
        },
        dependencies: domainTask.dependencies.map((dep) => ({
          taskId: `${dep}-placeholder`,
          type: 'informational' as const,
          status: 'pending' as const,
        })),
      };

      const task = await this.taskManager.createTask(taskConfig);
      tasks.push(task);
    }

    return tasks;
  }

  /**
   * Build analysis prompt for planning document.
   */
  private buildAnalysisPrompt(document: string): string {
    return `
Analyze the following planning document and decompose it into domain-level tasks.

PLANNING DOCUMENT:
${document}

AVAILABLE DOMAINS:
- frontend: UI components, styling, client-side logic, user interactions
- backend: APIs, services, business logic, data processing, integrations

For each domain task, provide the high-level objective, success criteria, and complexity estimate.

IMPORTANT: Respond with valid JSON in this exact format:
\`\`\`json
{
  "summary": "Brief summary of the overall plan",
  "decisions": ["Key architectural decision 1", "Key decision 2"],
  "subTasks": [
    {
      "title": "Domain: High-level objective",
      "description": "Detailed description of what this domain needs to accomplish",
      "type": "domain_design",
      "priority": "normal|high|critical",
      "estimatedComplexity": 5,
      "dependencies": []
    }
  ]
}
\`\`\`

Guidelines:
- Create 1-3 domain-level tasks depending on the scope
- Each task should be assignable to a domain architect
- Consider if frontend, backend, or both are needed
- Small tasks might only need one domain
`.trim();
  }

  /**
   * Get sovereign system prompt.
   */
  private getSovereignSystemPrompt(): string {
    return `You are the SOVEREIGN of the AlterCode system - the meta-orchestrator at Level 0.

Your role is to:
1. Analyze planning documents and extract actionable requirements
2. Decompose requirements into domain-level tasks for Domain Architects
3. Identify priorities and dependencies between domains

Guidelines:
- For simple tasks, create just 1-2 focused domain tasks
- For complex features, break into frontend/backend domains as needed
- Each domain task will be further decomposed by architects
- Focus on the high-level structure, not implementation details

Always respond with valid JSON containing the subTasks array.`;
  }

  /**
   * Build prompt for domain task.
   */
  private buildDomainPrompt(domainTask: DomainTask): string {
    return `
As the ${domainTask.domain} architect, design the implementation for:

OBJECTIVE: ${domainTask.objective}

SUCCESS CRITERIA:
${domainTask.successCriteria.map((c) => `- ${c}`).join('\n')}

DEPENDENCIES: ${domainTask.dependencies.length > 0 ? domainTask.dependencies.join(', ') : 'None'}

Provide:
1. High-level architecture design
2. Feature breakdown (decompose into specific features)
3. Technical decisions and rationale
4. Interface contracts (if backend, define API; if frontend, define component interfaces)
`.trim();
  }

  /**
   * Parse allocation response from AI.
   */
  private parseAllocationResponse(content: string): DomainAllocation {
    // Try to extract JSON from response (handle ```json blocks)
    const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonMatch = jsonBlockMatch ? jsonBlockMatch[1] : content.match(/\{[\s\S]*\}/)?.[0];

    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch);

    // Handle new format with subTasks
    if (parsed.subTasks && Array.isArray(parsed.subTasks)) {
      return {
        domains: parsed.subTasks.map((t: Record<string, unknown>) => {
          // Extract domain from title or infer from content
          const title = String(t.title || '');
          const description = String(t.description || '');
          let domain: Domain = 'backend';

          if (title.toLowerCase().includes('frontend') ||
              description.toLowerCase().includes('ui') ||
              description.toLowerCase().includes('component')) {
            domain = 'frontend';
          }

          return {
            domain,
            objective: title.replace(/^(frontend|backend):\s*/i, ''),
            successCriteria: [description],
            estimatedComplexity: Number(t.estimatedComplexity) || 5,
            dependencies: (t.dependencies as string[]) || [],
          };
        }),
        resourceAllocation: { frontend: 0.5, backend: 0.5 },
        priorities: parsed.decisions || [],
      };
    }

    // Handle legacy format with domains array
    if (parsed.domains && Array.isArray(parsed.domains)) {
      return {
        domains: parsed.domains.map((d: Record<string, unknown>) => ({
          domain: d.domain as Domain,
          objective: String(d.objective),
          successCriteria: d.successCriteria as string[],
          estimatedComplexity: Number(d.estimatedComplexity) || 5,
          dependencies: (d.dependencies as string[]) || [],
        })),
        resourceAllocation: parsed.resourceAllocation || { frontend: 0.5, backend: 0.5 },
        priorities: parsed.priorities || [],
      };
    }

    throw new Error('Invalid response format: no subTasks or domains array');
  }

  /**
   * Create default allocation when AI parsing fails.
   */
  private createDefaultAllocation(document: string): DomainAllocation {
    // Simple heuristic-based allocation
    const hasFrontend = /ui|component|page|style|react|vue|angular/i.test(document);
    const hasBackend = /api|endpoint|database|server|service/i.test(document);

    const domains: DomainTask[] = [];

    if (hasFrontend) {
      domains.push({
        domain: 'frontend',
        objective: 'Implement frontend requirements',
        successCriteria: ['UI components implemented', 'Styling applied', 'User interactions working'],
        estimatedComplexity: 5,
        dependencies: hasBackend ? ['backend'] : [],
      });
    }

    if (hasBackend) {
      domains.push({
        domain: 'backend',
        objective: 'Implement backend requirements',
        successCriteria: ['APIs implemented', 'Business logic working', 'Data persistence configured'],
        estimatedComplexity: 5,
        dependencies: [],
      });
    }

    // Default to both if neither detected
    if (domains.length === 0) {
      domains.push(
        {
          domain: 'frontend',
          objective: 'Implement frontend changes',
          successCriteria: ['Changes implemented'],
          estimatedComplexity: 5,
          dependencies: [],
        },
        {
          domain: 'backend',
          objective: 'Implement backend changes',
          successCriteria: ['Changes implemented'],
          estimatedComplexity: 5,
          dependencies: [],
        }
      );
    }

    return {
      domains,
      resourceAllocation: { frontend: 0.5, backend: 0.5 },
      priorities: [],
    };
  }

  /**
   * Extract title from planning document.
   */
  private extractTitle(document: string): string {
    // Try to find a title/header
    const lines = document.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/^#+\s*/, '');
      }
      if (trimmed.length > 0 && trimmed.length < 100) {
        return trimmed;
      }
    }
    return 'Untitled Mission';
  }

  /**
   * Extract description from planning document.
   */
  private extractDescription(document: string): string {
    // Get first 200 characters as description
    return document.substring(0, 200).trim() + (document.length > 200 ? '...' : '');
  }

  /**
   * Convert complexity to priority.
   */
  private getPriorityFromComplexity(complexity: number): TaskPriority {
    if (complexity >= 8) return TaskPriority.CRITICAL;
    if (complexity >= 6) return TaskPriority.HIGH;
    if (complexity >= 4) return TaskPriority.NORMAL;
    return TaskPriority.LOW;
  }
}
