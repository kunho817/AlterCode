/**
 * GLMAgent Unit Tests
 */

import axios from 'axios';
import { GLMAgent } from '../../../src/agents/glm/GLMAgent';
import { createAgentRequest } from '../../mocks/factories';
import { AIModel, GLMConfig } from '../../../src/types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GLMAgent', () => {
  let glmAgent: GLMAgent;

  const testConfig: GLMConfig = {
    apiKey: 'test-api-key',
    endpoint: 'https://api.test.com/chat',
    model: 'glm-4-7',
    maxTokens: 4096,
    temperature: 0.7,
  };

  const mockHttpClient = {
    post: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock axios.create to return our mock client
    mockedAxios.create.mockReturnValue(mockHttpClient as any);
    mockedAxios.isCancel.mockReturnValue(false);

    glmAgent = new GLMAgent(testConfig);
  });

  describe('constructor', () => {
    it('should create agent with unique ID', () => {
      const agent1 = new GLMAgent(testConfig);
      const agent2 = new GLMAgent(testConfig);

      expect(agent1.id).toBeDefined();
      expect(agent2.id).toBeDefined();
      expect(agent1.id).not.toBe(agent2.id);
    });

    it('should set provider to glm', () => {
      expect(glmAgent.provider).toBe('glm');
    });

    it('should set model to GLM_4_7', () => {
      expect(glmAgent.model).toBe(AIModel.GLM_4_7);
    });

    it('should create HTTP client with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: testConfig.endpoint,
          headers: expect.objectContaining({
            'Authorization': `Bearer ${testConfig.apiKey}`,
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('execute', () => {
    const mockGLMResponse = {
      data: {
        id: 'response-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'glm-4-7',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Here is the generated code...',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 100,
          total_tokens: 150,
        },
      },
    };

    beforeEach(() => {
      mockHttpClient.post.mockResolvedValue(mockGLMResponse);
    });

    it('should return success response on successful execution', async () => {
      const request = createAgentRequest({
        taskId: 'test-task',
        prompt: 'Generate a function',
      });

      const response = await glmAgent.execute(request);

      expect(response.status).toBe('success');
      expect(response.taskId).toBe('test-task');
      expect(response.result.content).toBe('Here is the generated code...');
    });

    it('should include execution metrics', async () => {
      const request = createAgentRequest();

      const response = await glmAgent.execute(request);

      expect(response.metrics).toBeDefined();
      expect(response.metrics.tokensSent).toBe(50);
      expect(response.metrics.tokensReceived).toBe(100);
      expect(response.metrics.model).toBe(AIModel.GLM_4_7);
      expect(response.metrics.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include metadata in result', async () => {
      const request = createAgentRequest();

      const response = await glmAgent.execute(request);

      expect(response.result.metadata).toBeDefined();
      expect(response.result.metadata?.finishReason).toBe('stop');
      expect(response.result.metadata?.modelUsed).toBe('glm-4-7');
    });

    it('should send correct request payload', async () => {
      const request = createAgentRequest({
        prompt: 'Generate code',
        constraints: { maxTokens: 2000, temperature: 0.5 },
      });

      await glmAgent.execute(request);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '',
        expect.objectContaining({
          model: 'glm-4-7',
          messages: expect.any(Array),
          max_tokens: 2000,
          temperature: 0.5,
          stream: false,
        }),
        expect.any(Object)
      );
    });

    it('should include system prompt in messages', async () => {
      const request = createAgentRequest({
        systemPrompt: 'You are a helpful assistant.',
        prompt: 'Hello',
      });

      await glmAgent.execute(request);

      const call = mockHttpClient.post.mock.calls[0];
      const messages = call[1].messages;

      expect(messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.',
      });
    });

    it('should use default system prompt when none provided', async () => {
      const request = createAgentRequest({
        prompt: 'Hello',
      });

      await glmAgent.execute(request);

      const call = mockHttpClient.post.mock.calls[0];
      const messages = call[1].messages;

      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('AlterCode');
    });

    it('should include file context in user message', async () => {
      const request = createAgentRequest({
        prompt: 'Fix the bug',
        context: {
          workspaceRoot: '/workspace',
          relevantFiles: [
            { path: 'src/file1.ts', relevance: 'primary' },
            { path: 'src/file2.ts', relevance: 'secondary' },
          ],
          previousDecisions: [],
          constraints: [],
        },
      });

      await glmAgent.execute(request);

      const call = mockHttpClient.post.mock.calls[0];
      const userMessage = call[1].messages.find((m: { role: string }) => m.role === 'user');

      expect(userMessage.content).toContain('src/file1.ts');
      expect(userMessage.content).toContain('src/file2.ts');
      expect(userMessage.content).toContain('Fix the bug');
    });

    it('should return failure response on API error', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
        message: 'Request failed',
      };
      mockHttpClient.post.mockRejectedValue(error);

      const request = createAgentRequest();
      const response = await glmAgent.execute(request);

      expect(response.status).toBe('failure');
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('500');
    });

    it('should mark server errors as retryable', async () => {
      const error = {
        response: { status: 503 },
        message: 'Service unavailable',
      };
      mockHttpClient.post.mockRejectedValue(error);

      const request = createAgentRequest();
      const response = await glmAgent.execute(request);

      expect(response.error?.retryable).toBe(true);
    });

    it('should mark rate limit errors as retryable', async () => {
      const error = {
        response: { status: 429 },
        message: 'Rate limited',
      };
      mockHttpClient.post.mockRejectedValue(error);

      const request = createAgentRequest();
      const response = await glmAgent.execute(request);

      expect(response.error?.retryable).toBe(true);
    });

    it('should mark client errors as not retryable', async () => {
      const error = {
        response: { status: 400 },
        message: 'Bad request',
      };
      mockHttpClient.post.mockRejectedValue(error);

      const request = createAgentRequest();
      const response = await glmAgent.execute(request);

      expect(response.error?.retryable).toBe(false);
    });
  });

  describe('cancel', () => {
    it('should not throw when called', () => {
      expect(() => glmAgent.cancel()).not.toThrow();
    });
  });
});
