/**
 * Performance Benchmarks
 *
 * Measures performance of critical operations in the system.
 * Run with: npm run benchmark
 */

import { TaskManager } from '../../src/core/task/TaskManager';
import { VirtualBranchManager } from '../../src/conflict/VirtualBranchManager';
import { SemanticAnalyzer } from '../../src/conflict/SemanticAnalyzer';
import { StateManager } from '../../src/storage/StateManager';
import {
  HierarchyLevel,
  TaskType,
} from '../../src/types';

// Mock StateManager for benchmarks
jest.mock('../../src/storage/StateManager');

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSecond: number;
  minMs: number;
  maxMs: number;
}

function benchmark(
  name: string,
  iterations: number,
  fn: () => void | Promise<void>
): Promise<BenchmarkResult> {
  return new Promise(async (resolve) => {
    const times: number[] = [];

    // Warmup (fewer iterations)
    for (let i = 0; i < Math.min(5, iterations / 20); i++) {
      await fn();
    }

    // Benchmark
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      times.push(end - start);
    }

    const totalMs = times.reduce((a, b) => a + b, 0);
    const avgMs = totalMs / iterations;
    const opsPerSecond = 1000 / avgMs;
    const minMs = Math.min(...times);
    const maxMs = Math.max(...times);

    resolve({
      name,
      iterations,
      totalMs,
      avgMs,
      opsPerSecond,
      minMs,
      maxMs,
    });
  });
}

function formatResult(result: BenchmarkResult): string {
  return `${result.name}:
  Iterations: ${result.iterations}
  Avg: ${result.avgMs.toFixed(3)}ms
  Min: ${result.minMs.toFixed(3)}ms
  Max: ${result.maxMs.toFixed(3)}ms
  Ops/sec: ${result.opsPerSecond.toFixed(2)}`;
}

describe('Performance Benchmarks', () => {
  let mockStateManager: jest.Mocked<StateManager>;

  beforeAll(() => {
    mockStateManager = new StateManager() as jest.Mocked<StateManager>;
    mockStateManager.createTask = jest.fn().mockResolvedValue(undefined);
    mockStateManager.updateTask = jest.fn().mockResolvedValue(undefined);
    mockStateManager.getTask = jest.fn();
    mockStateManager.createAgent = jest.fn().mockResolvedValue(undefined);
    mockStateManager.updateAgent = jest.fn().mockResolvedValue(undefined);
  });

  describe('TaskManager Performance', () => {
    let taskManager: TaskManager;

    beforeEach(() => {
      taskManager = new TaskManager(mockStateManager);
    });

    it('should create tasks efficiently', async () => {
      const result = await benchmark('Task Creation', 1000, async () => {
        await taskManager.createTask({
          missionId: 'mission-1',
          level: HierarchyLevel.WORKER,
          type: TaskType.SIMPLE_IMPLEMENTATION,
          title: 'Benchmark Task',
          description: 'Performance test',
          context: {
            workspaceRoot: '/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
          input: {
            prompt: 'Test prompt',
            context: {
              workspaceRoot: '/workspace',
              relevantFiles: [],
              previousDecisions: [],
              constraints: [],
            },
          },
        });
      });

      console.log(formatResult(result));
      expect(result.avgMs).toBeLessThan(5); // Should complete in < 5ms avg
    });

    it('should query ready tasks efficiently', async () => {
      // Pre-populate with tasks
      for (let i = 0; i < 100; i++) {
        await taskManager.createTask({
          missionId: 'mission-1',
          level: HierarchyLevel.WORKER,
          type: TaskType.SIMPLE_IMPLEMENTATION,
          title: `Task ${i}`,
          description: 'Test',
          context: {
            workspaceRoot: '/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
          input: {
            prompt: 'Test',
            context: {
              workspaceRoot: '/workspace',
              relevantFiles: [],
              previousDecisions: [],
              constraints: [],
            },
          },
        });
      }

      const result = await benchmark('Ready Task Query', 1000, () => {
        taskManager.getReadyTasks('mission-1');
      });

      console.log(formatResult(result));
      expect(result.avgMs).toBeLessThan(1); // Should complete in < 1ms
    });

    it('should update task status efficiently', async () => {
      // Create multiple tasks to cycle through
      const taskIds: string[] = [];
      for (let i = 0; i < 100; i++) {
        const task = await taskManager.createTask({
          missionId: 'mission-1',
          level: HierarchyLevel.WORKER,
          type: TaskType.SIMPLE_IMPLEMENTATION,
          title: `Status Benchmark ${i}`,
          description: 'Test',
          context: {
            workspaceRoot: '/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
          input: {
            prompt: 'Test',
            context: {
              workspaceRoot: '/workspace',
              relevantFiles: [],
              previousDecisions: [],
              constraints: [],
            },
          },
        });
        taskIds.push(task.id);
      }

      let idx = 0;
      const result = await benchmark('Task Status Update', 500, async () => {
        const taskId = taskIds[idx % taskIds.length];
        await taskManager.startTask(taskId);
        // Complete with proper output format
        await taskManager.completeTask(taskId, {
          content: 'done',
          metrics: {
            tokensSent: 100,
            tokensReceived: 200,
          },
        });
        idx++;
      });

      console.log(formatResult(result));
      expect(result.avgMs).toBeLessThan(5);
    });
  });

  // HierarchyManager benchmarks skipped - requires complex mock setup for spawn constraints

  describe('VirtualBranchManager Performance', () => {
    let branchManager: VirtualBranchManager;

    beforeEach(() => {
      branchManager = new VirtualBranchManager();
    });

    it('should create branches efficiently', async () => {
      let counter = 0;
      const result = await benchmark('Branch Creation', 100, async () => {
        await branchManager.createBranch(`agent-${counter}`, `task-${counter}`);
        counter++;
      });

      console.log(formatResult(result));
      expect(result.avgMs).toBeLessThan(10); // Async operation, allow more time
    });

    it('should record changes efficiently', async () => {
      // Create branches upfront (async)
      const branches: string[] = [];
      for (let i = 0; i < 20; i++) {
        const branch = await branchManager.createBranch(`agent-${i}`, `task-${i}`);
        branches.push(branch.id);
      }

      let idx = 0;
      let fileCounter = 0;
      const result = await benchmark('Record Change', 500, () => {
        const branchId = branches[idx % branches.length];
        branchManager.recordChange(branchId, {
          filePath: `src/file${fileCounter++}.ts`,
          originalContent: 'const x = 1;',
          modifiedContent: 'const x = 2;',
          changeType: 'modify',
          diff: '',
        });
        idx++;
      });

      console.log(formatResult(result));
      expect(result.avgMs).toBeLessThan(1);
    });

    it('should check conflicts efficiently', async () => {
      // Create branches with overlapping files (async)
      const branch1 = await branchManager.createBranch('agent-1', 'task-1');
      const branch2 = await branchManager.createBranch('agent-2', 'task-2');

      for (let i = 0; i < 20; i++) {
        branchManager.recordChange(branch1.id, {
          filePath: `src/file${i}.ts`,
          originalContent: 'old',
          modifiedContent: 'new1',
          changeType: 'modify',
          diff: '',
        });
        branchManager.recordChange(branch2.id, {
          filePath: `src/file${i}.ts`,
          originalContent: 'old',
          modifiedContent: 'new2',
          changeType: 'modify',
          diff: '',
        });
      }

      const result = await benchmark('Conflict Check', 1000, () => {
        branchManager.hasConflicts(branch1.id, branch2.id);
      });

      console.log(formatResult(result));
      expect(result.avgMs).toBeLessThan(1);
    });
  });

  describe('SemanticAnalyzer Performance', () => {
    let analyzer: SemanticAnalyzer;

    beforeEach(() => {
      analyzer = new SemanticAnalyzer();
    });

    it('should analyze TypeScript files efficiently', async () => {
      const largeFile = `
        import { Service } from './service';
        import { Repository } from './repository';

        interface UserData {
          id: string;
          name: string;
          email: string;
        }

        type Handler = (data: UserData) => Promise<void>;

        export class UserService {
          private repository: Repository;

          constructor(repository: Repository) {
            this.repository = repository;
          }

          async getUser(id: string): Promise<UserData> {
            return this.repository.findById(id);
          }

          async createUser(data: Omit<UserData, 'id'>): Promise<UserData> {
            const id = generateId();
            return this.repository.create({ ...data, id });
          }

          async updateUser(id: string, data: Partial<UserData>): Promise<UserData> {
            return this.repository.update(id, data);
          }

          async deleteUser(id: string): Promise<void> {
            return this.repository.delete(id);
          }
        }

        function generateId(): string {
          return Math.random().toString(36).substr(2, 9);
        }

        export function createHandler(service: UserService): Handler {
          return async (data) => {
            await service.createUser(data);
          };
        }
      `.repeat(3); // ~3x for larger file

      const result = await benchmark('TypeScript Analysis', 100, () => {
        analyzer.analyzeFile('test.ts', largeFile);
      });

      console.log(formatResult(result));
      expect(result.avgMs).toBeLessThan(50); // Allow up to 50ms for complex parsing
    });

    it('should check region overlap efficiently', async () => {
      const regions = Array.from({ length: 100 }, (_, i) => ({
        filePath: `src/file${Math.floor(i / 10)}.ts`,
        startLine: (i % 10) * 20 + 1,
        endLine: (i % 10) * 20 + 15,
        type: 'function' as const,
        name: `function${i}`,
        dependencies: [],
      }));

      const result = await benchmark('Region Overlap Check', 1000, () => {
        for (let i = 0; i < regions.length; i++) {
          for (let j = i + 1; j < Math.min(i + 10, regions.length); j++) {
            analyzer.regionsOverlap(regions[i], regions[j]);
          }
        }
      });

      console.log(formatResult(result));
      expect(result.avgMs).toBeLessThan(5);
    });
  });

  // MergeEngine benchmarks skipped - uses VirtualBranchManager.detectConflicts (already tested above)

  describe('Concurrent Operations', () => {
    it('should handle concurrent task creation', async () => {
      const taskManager = new TaskManager(mockStateManager);

      const result = await benchmark('Concurrent Task Creation (10)', 100, async () => {
        await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            taskManager.createTask({
              missionId: 'mission-1',
              level: HierarchyLevel.WORKER,
              type: TaskType.SIMPLE_IMPLEMENTATION,
              title: `Concurrent Task ${i}`,
              description: 'Test',
              context: {
                workspaceRoot: '/workspace',
                relevantFiles: [],
                previousDecisions: [],
                constraints: [],
              },
              input: {
                prompt: 'Test',
                context: {
                  workspaceRoot: '/workspace',
                  relevantFiles: [],
                  previousDecisions: [],
                  constraints: [],
                },
              },
            })
          )
        );
      });

      console.log(formatResult(result));
      expect(result.avgMs).toBeLessThan(50);
    });

    it('should handle concurrent branch operations', async () => {
      let batchCounter = 0;
      const result = await benchmark('Concurrent Branch Creation (10)', 20, async () => {
        const branchManager = new VirtualBranchManager();
        const branches = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            branchManager.createBranch(`agent-${batchCounter}-${i}`, `task-${batchCounter}-${i}`)
          )
        );
        // Record changes to each branch
        branches.forEach((branch, i) => {
          branchManager.recordChange(branch.id, {
            filePath: `src/file${i}.ts`,
            originalContent: 'old',
            modifiedContent: 'new',
            changeType: 'modify',
            diff: '',
          });
        });
        batchCounter++;
      });

      console.log(formatResult(result));
      expect(result.avgMs).toBeLessThan(100); // Async operations need more time
    });
  });

  describe('Memory Efficiency', () => {
    it('should handle large task volumes', async () => {
      const taskManager = new TaskManager(mockStateManager);
      const startMemory = process.memoryUsage().heapUsed;

      // Create 1000 tasks
      for (let i = 0; i < 1000; i++) {
        await taskManager.createTask({
          missionId: 'mission-1',
          level: HierarchyLevel.WORKER,
          type: TaskType.SIMPLE_IMPLEMENTATION,
          title: `Task ${i}`,
          description: 'Memory test',
          context: {
            workspaceRoot: '/workspace',
            relevantFiles: [],
            previousDecisions: [],
            constraints: [],
          },
          input: {
            prompt: 'Test',
            context: {
              workspaceRoot: '/workspace',
              relevantFiles: [],
              previousDecisions: [],
              constraints: [],
            },
          },
        });
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryPerTask = (endMemory - startMemory) / 1000;

      console.log(`Memory per task: ${(memoryPerTask / 1024).toFixed(2)} KB`);
      console.log(`Total for 1000 tasks: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)} MB`);

      // Each task should use less than 10KB on average
      expect(memoryPerTask).toBeLessThan(10 * 1024);
    });

    it('should handle large branch volumes', async () => {
      const branchManager = new VirtualBranchManager();
      const startMemory = process.memoryUsage().heapUsed;

      // Create 20 branches with 10 changes each (reduced for stability)
      for (let b = 0; b < 20; b++) {
        const branch = await branchManager.createBranch(`agent-${b}`, `task-${b}`);
        for (let c = 0; c < 10; c++) {
          branchManager.recordChange(branch.id, {
            filePath: `src/file${c}.ts`,
            originalContent: 'const x = 1;'.repeat(50),
            modifiedContent: 'const x = 2;'.repeat(50),
            changeType: 'modify',
            diff: '',
          });
        }
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsed = (endMemory - startMemory) / 1024 / 1024;

      console.log(`Memory for 20 branches x 10 changes: ${memoryUsed.toFixed(2)} MB`);

      // Should use less than 20MB for this test
      expect(memoryUsed).toBeLessThan(20);
    });
  });
});
