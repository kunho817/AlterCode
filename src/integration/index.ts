/**
 * Integration Layer
 *
 * Re-exports all integration layer implementations:
 * - ClaudeAdapter (Anthropic Claude API - direct)
 * - ClaudeCodeAdapter (Claude Code CLI)
 * - OpenAIAdapter (OpenAI, Azure, local models)
 * - GLMAdapter (Zhipu AI GLM-4)
 * - HierarchyModelRouter (Hierarchy-based model selection)
 */

// Claude Adapter (Direct API)
export { ClaudeAdapter, createClaudeAdapter } from './ClaudeAdapter';

// Claude Code CLI Adapter
export {
  ClaudeCodeAdapter,
  createClaudeCodeAdapter,
  type ClaudeCodeConfig,
} from './ClaudeCodeAdapter';

// OpenAI-compatible Adapter
export {
  OpenAIAdapter,
  createOpenAIAdapter,
  createLocalModelAdapter,
  createAzureOpenAIAdapter,
} from './OpenAIAdapter';

// GLM Adapter
export { GLMAdapter, createGLMAdapter, createGLMFlashAdapter } from './GLMAdapter';

// Hierarchy Model Router
export {
  HierarchyModelRouter,
  createHierarchyModelRouter,
  createApiModeRouter,
  createCliModeRouter,
  type HierarchyModelConfig,
  type ClaudeMode,
} from './HierarchyModelRouter';
