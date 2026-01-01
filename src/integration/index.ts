/**
 * Integration Layer
 *
 * Re-exports all integration layer implementations:
 * - ClaudeAdapter (Anthropic Claude API)
 * - OpenAIAdapter (OpenAI, Azure, local models)
 * - GLMAdapter (Zhipu AI GLM-4)
 * - HierarchyModelRouter (Hierarchy-based model selection)
 */

// Claude Adapter
export { ClaudeAdapter, createClaudeAdapter } from './ClaudeAdapter';

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
  type HierarchyModelConfig,
} from './HierarchyModelRouter';
