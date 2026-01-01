/**
 * Integration Layer
 *
 * Re-exports all integration layer implementations:
 * - ClaudeAdapter (Anthropic Claude API)
 * - OpenAIAdapter (OpenAI, Azure, local models)
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
