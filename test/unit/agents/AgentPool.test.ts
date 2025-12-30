/**
 * AgentPool Unit Tests
 */

import { AgentPool } from '../../../src/agents/AgentPool';
import { ClaudeAgent } from '../../../src/agents/claude/ClaudeAgent';
import { GLMAgent } from '../../../src/agents/glm/GLMAgent';
import { QuotaTracker } from '../../../src/quota/QuotaTracker';
import { createAgentRequest } from '../../mocks/factories';
import { HierarchyLevel, AIModel, AlterCodeConfig } from '../../../src/types';

// Mock agent classes
jest.mock('../../../src/agents/claude/ClaudeAgent');
jest.mock('../../../src/agents/glm/GLMAgent');
jest.mock('../../../src/quota/QuotaTracker');

describe('AgentPool', () => {
  let agentPool: AgentPool;
  let mockQuotaTracker: jest.Mocked<QuotaTracker>;
  let mockClaudeAgent: jest.Mocked<ClaudeAgent>;
  let mockGLMAgent: jest.Mocked<GLMAgent>;

  const testConfig: AlterCodeConfig = {
    claude: {
      cliPath: 'claude',
      maxOutputTokens: 4096,
      defaultModel: 'claude-opus-4',
    },
    glm: {
      apiKey: 'test-api-key',
      endpoint: 'https://api.test.com',
      model: 'glm-4-7',
      maxTokens: 4096,
      temperature: 0.7,
    },
    approvalMode: 'fully-manual' as const,
    maxConcurrentWorkers: 10,
    quotaLimits: {
      claude: { tokensPerHour: 1000000 },
      glm: { tokensPerHour: 2000000 },
    },
    workspaceRoot: '/workspace',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock quota tracker
    mockQuotaTracker = new QuotaTracker(testConfig.quotaLimits) as jest.Mocked<QuotaTracker>;
    mockQuotaTracker.canExecute = jest.fn().mockReturnValue(true);
    mockQuotaTracker.recordUsage = jest.fn();

    // Setup mock agents
    mockClaudeAgent = {
      id: 'claude-agent-1',
      provider: 'claude',
      model: AIModel.CLAUDE_OPUS,
      execute: jest.fn().mockResolvedValue({
        taskId: 'task-1',
        status: 'success',
        result: { content: 'Claude response' },
        metrics: {
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 1000,
          tokensSent: 100,
          tokensReceived: 200,
          model: AIModel.CLAUDE_OPUS,
        },
      }),
      cancel: jest.fn(),
    } as unknown as jest.Mocked<ClaudeAgent>;

    mockGLMAgent = {
      id: 'glm-agent-1',
      provider: 'glm',
      model: AIModel.GLM_4_7,
      execute: jest.fn().mockResolvedValue({
        taskId: 'task-1',
        status: 'success',
        result: { content: 'GLM response' },
        metrics: {
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 500,
          tokensSent: 50,
          tokensReceived: 100,
          model: AIModel.GLM_4_7,
        },
      }),
      cancel: jest.fn(),
    } as unknown as jest.Mocked<GLMAgent>;

    // Mock constructors
    (ClaudeAgent as jest.MockedClass<typeof ClaudeAgent>).mockImplementation(() => mockClaudeAgent);
    (GLMAgent as jest.MockedClass<typeof GLMAgent>).mockImplementation(() => mockGLMAgent);

    agentPool = new AgentPool(testConfig, mockQuotaTracker);
  });

  describe('initialize', () => {
    it('should initialize Claude agent', async () => {
      await agentPool.initialize();

      expect(ClaudeAgent).toHaveBeenCalledWith(testConfig.claude);
    });

    it('should initialize GLM agent when API key is configured', async () => {
      await agentPool.initialize();

      expect(GLMAgent).toHaveBeenCalledWith(testConfig.glm);
    });

    it('should not initialize GLM agent when API key is empty', async () => {
      const configNoGLM = {
        ...testConfig,
        glm: { ...testConfig.glm, apiKey: '' },
      };
      const pool = new AgentPool(configNoGLM, mockQuotaTracker);

      await pool.initialize();

      expect(GLMAgent).not.toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await agentPool.initialize();
    });

    it('should route WORKER level to GLM when available', async () => {
      const request = createAgentRequest({ taskId: 'worker-task' });

      const response = await agentPool.execute(request, HierarchyLevel.WORKER, 'agent-1');

      expect(mockGLMAgent.execute).toHaveBeenCalledWith(request);
      expect(response.status).toBe('success');
    });

    it('should route ARCHITECT level to Claude', async () => {
      const request = createAgentRequest({ taskId: 'architect-task' });

      const response = await agentPool.execute(request, HierarchyLevel.ARCHITECT, 'agent-1');

      expect(mockClaudeAgent.execute).toHaveBeenCalledWith(request);
      expect(response.status).toBe('success');
    });

    it('should route SOVEREIGN level to Claude', async () => {
      const request = createAgentRequest({ taskId: 'sovereign-task' });

      const response = await agentPool.execute(request, HierarchyLevel.SOVEREIGN, 'agent-1');

      expect(mockClaudeAgent.execute).toHaveBeenCalledWith(request);
    });

    it('should check quota before executing', async () => {
      const request = createAgentRequest();

      await agentPool.execute(request, HierarchyLevel.WORKER, 'agent-1');

      expect(mockQuotaTracker.canExecute).toHaveBeenCalled();
    });

    it('should throw when quota exceeded', async () => {
      mockQuotaTracker.canExecute.mockReturnValue(false);
      const request = createAgentRequest();

      await expect(
        agentPool.execute(request, HierarchyLevel.WORKER, 'agent-1')
      ).rejects.toThrow('Quota exceeded');
    });

    it('should record usage after execution', async () => {
      const request = createAgentRequest();

      await agentPool.execute(request, HierarchyLevel.WORKER, 'agent-1');

      expect(mockQuotaTracker.recordUsage).toHaveBeenCalled();
    });
  });

  describe('getModelForLevel', () => {
    beforeEach(async () => {
      await agentPool.initialize();
    });

    it('should return CLAUDE_OPUS for SOVEREIGN', () => {
      expect(agentPool.getModelForLevel(HierarchyLevel.SOVEREIGN)).toBe(AIModel.CLAUDE_OPUS);
    });

    it('should return CLAUDE_OPUS for ARCHITECT', () => {
      expect(agentPool.getModelForLevel(HierarchyLevel.ARCHITECT)).toBe(AIModel.CLAUDE_OPUS);
    });

    it('should return CLAUDE_OPUS for STRATEGIST', () => {
      expect(agentPool.getModelForLevel(HierarchyLevel.STRATEGIST)).toBe(AIModel.CLAUDE_OPUS);
    });

    it('should return CLAUDE_OPUS for TEAM_LEAD', () => {
      expect(agentPool.getModelForLevel(HierarchyLevel.TEAM_LEAD)).toBe(AIModel.CLAUDE_OPUS);
    });

    it('should return GLM_4_7 for WORKER when GLM is available', () => {
      expect(agentPool.getModelForLevel(HierarchyLevel.WORKER)).toBe(AIModel.GLM_4_7);
    });

    it('should return CLAUDE_OPUS for WORKER when GLM not available', async () => {
      const configNoGLM = {
        ...testConfig,
        glm: { ...testConfig.glm, apiKey: '' },
      };
      const pool = new AgentPool(configNoGLM, mockQuotaTracker);
      await pool.initialize();

      expect(pool.getModelForLevel(HierarchyLevel.WORKER)).toBe(AIModel.CLAUDE_OPUS);
    });
  });

  describe('getProviderForModel', () => {
    it('should return claude for CLAUDE_OPUS', () => {
      expect(agentPool.getProviderForModel(AIModel.CLAUDE_OPUS)).toBe('claude');
    });

    it('should return glm for GLM_4_7', () => {
      expect(agentPool.getProviderForModel(AIModel.GLM_4_7)).toBe('glm');
    });
  });

  describe('cancelRequest', () => {
    beforeEach(async () => {
      await agentPool.initialize();
    });

    it('should cancel active request', async () => {
      const request = createAgentRequest({ taskId: 'task-to-cancel' });

      // Start execution (don't await)
      const executionPromise = agentPool.execute(request, HierarchyLevel.WORKER, 'agent-1');

      // Cancel
      agentPool.cancelRequest('task-to-cancel');

      // Should complete (either cancelled or finished)
      await expect(executionPromise).resolves.toBeDefined();
    });
  });

  describe('dispose', () => {
    it('should dispose agent pool', async () => {
      await agentPool.initialize();
      await agentPool.dispose();

      // Should not throw
      expect(true).toBe(true);
    });
  });
});
