/**
 * ClaudeAgent Unit Tests
 */

import { EventEmitter } from 'events';
import { ClaudeAgent } from '../../../src/agents/claude/ClaudeAgent';
import { createAgentRequest } from '../../mocks/factories';
import { AIModel, ClaudeConfig } from '../../../src/types';

// Mock child_process
const mockChildProcess = {
  stdout: new EventEmitter(),
  stderr: new EventEmitter(),
  stdin: {
    write: jest.fn(),
    end: jest.fn(),
  },
  kill: jest.fn(),
  on: jest.fn(),
};

jest.mock('child_process', () => ({
  spawn: jest.fn(() => mockChildProcess),
}));

import { spawn } from 'child_process';
const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('ClaudeAgent', () => {
  let claudeAgent: ClaudeAgent;

  const testConfig: ClaudeConfig = {
    cliPath: '/usr/local/bin/claude',
    maxOutputTokens: 4096,
    defaultModel: 'claude-opus-4',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock child process
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.stdin.write = jest.fn();
    mockChildProcess.stdin.end = jest.fn();
    mockChildProcess.kill = jest.fn();
    mockChildProcess.on = jest.fn();

    mockedSpawn.mockReturnValue(mockChildProcess as any);

    claudeAgent = new ClaudeAgent(testConfig);
  });

  describe('constructor', () => {
    it('should create agent with unique ID', () => {
      const agent1 = new ClaudeAgent(testConfig);
      const agent2 = new ClaudeAgent(testConfig);

      expect(agent1.id).toBeDefined();
      expect(agent2.id).toBeDefined();
      expect(agent1.id).not.toBe(agent2.id);
    });

    it('should set provider to claude', () => {
      expect(claudeAgent.provider).toBe('claude');
    });

    it('should set model to CLAUDE_OPUS', () => {
      expect(claudeAgent.model).toBe(AIModel.CLAUDE_OPUS);
    });
  });

  describe('execute', () => {
    it('should spawn Claude CLI with correct arguments', async () => {
      const request = createAgentRequest({
        prompt: 'Generate code',
        context: {
          workspaceRoot: '/test/workspace',
          relevantFiles: [],
          previousDecisions: [],
          constraints: [],
        },
      });

      // Simulate successful execution
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Generated code output'));
        const closeHandler = mockChildProcess.on.mock.calls.find(
          (call) => call[0] === 'close'
        )?.[1];
        if (closeHandler) closeHandler(0);
      }, 10);

      const response = await claudeAgent.execute(request);

      expect(mockedSpawn).toHaveBeenCalledWith(
        testConfig.cliPath,
        ['--print', '--output-format', 'text', '-'],
        expect.objectContaining({
          cwd: '/test/workspace',
          shell: true,
        })
      );
    });

    it('should write prompt to stdin', async () => {
      const request = createAgentRequest({
        prompt: 'Test prompt',
      });

      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Response'));
        const closeHandler = mockChildProcess.on.mock.calls.find(
          (call) => call[0] === 'close'
        )?.[1];
        if (closeHandler) closeHandler(0);
      }, 10);

      await claudeAgent.execute(request);

      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('Test prompt');
      expect(mockChildProcess.stdin.end).toHaveBeenCalled();
    });

    it('should prepend system prompt when provided', async () => {
      const request = createAgentRequest({
        prompt: 'User prompt',
        systemPrompt: 'System instructions',
      });

      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Response'));
        const closeHandler = mockChildProcess.on.mock.calls.find(
          (call) => call[0] === 'close'
        )?.[1];
        if (closeHandler) closeHandler(0);
      }, 10);

      await claudeAgent.execute(request);

      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('System instructions')
      );
      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('User prompt')
      );
    });

    it('should return success response on successful execution', async () => {
      const request = createAgentRequest({
        taskId: 'test-task',
        prompt: 'Generate code',
      });

      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Generated code'));
        const closeHandler = mockChildProcess.on.mock.calls.find(
          (call) => call[0] === 'close'
        )?.[1];
        if (closeHandler) closeHandler(0);
      }, 10);

      const response = await claudeAgent.execute(request);

      expect(response.status).toBe('success');
      expect(response.taskId).toBe('test-task');
      expect(response.result.content).toBe('Generated code');
    });

    it('should include execution metrics', async () => {
      const request = createAgentRequest();

      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Response'));
        const closeHandler = mockChildProcess.on.mock.calls.find(
          (call) => call[0] === 'close'
        )?.[1];
        if (closeHandler) closeHandler(0);
      }, 10);

      const response = await claudeAgent.execute(request);

      expect(response.metrics).toBeDefined();
      expect(response.metrics.model).toBe(AIModel.CLAUDE_OPUS);
      expect(response.metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(response.metrics.tokensSent).toBeGreaterThan(0);
    });

    it('should return failure response on non-zero exit code with stderr', async () => {
      const request = createAgentRequest();

      setTimeout(() => {
        mockChildProcess.stderr.emit('data', Buffer.from('CLI error message'));
        const closeHandler = mockChildProcess.on.mock.calls.find(
          (call) => call[0] === 'close'
        )?.[1];
        if (closeHandler) closeHandler(1);
      }, 10);

      const response = await claudeAgent.execute(request);

      expect(response.status).toBe('failure');
      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('CLI error message');
    });

    it('should handle spawn error', async () => {
      const request = createAgentRequest();

      setTimeout(() => {
        const errorHandler = mockChildProcess.on.mock.calls.find(
          (call) => call[0] === 'error'
        )?.[1];
        if (errorHandler) errorHandler(new Error('Spawn failed'));
      }, 10);

      const response = await claudeAgent.execute(request);

      expect(response.status).toBe('failure');
      expect(response.error?.message).toContain('Spawn failed');
    });

    it('should set environment variables for max output tokens', async () => {
      const request = createAgentRequest();

      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Response'));
        const closeHandler = mockChildProcess.on.mock.calls.find(
          (call) => call[0] === 'close'
        )?.[1];
        if (closeHandler) closeHandler(0);
      }, 10);

      await claudeAgent.execute(request);

      expect(mockedSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            CLAUDE_CODE_MAX_OUTPUT_TOKENS: '4096',
          }),
        })
      );
    });

    it('should use default CLI path when not configured', async () => {
      const configNoCLI: ClaudeConfig = {
        maxOutputTokens: 4096,
        defaultModel: 'claude-opus-4',
      };
      const agent = new ClaudeAgent(configNoCLI);

      const request = createAgentRequest();

      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Response'));
        const closeHandler = mockChildProcess.on.mock.calls.find(
          (call) => call[0] === 'close'
        )?.[1];
        if (closeHandler) closeHandler(0);
      }, 10);

      await agent.execute(request);

      expect(mockedSpawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.any(Object)
      );
    });
  });

  describe('cancel', () => {
    it('should kill the active process', async () => {
      const request = createAgentRequest();

      // Start execution but don't wait
      const executionPromise = claudeAgent.execute(request);

      // Cancel immediately
      claudeAgent.cancel();

      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');

      // Complete the execution to avoid hanging
      const closeHandler = mockChildProcess.on.mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];
      if (closeHandler) closeHandler(null);

      // Wait for promise to settle
      await expect(executionPromise).resolves.toBeDefined();
    });

    it('should not throw when no active process', () => {
      expect(() => claudeAgent.cancel()).not.toThrow();
    });
  });
});
