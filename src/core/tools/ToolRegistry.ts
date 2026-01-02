/**
 * Tool Registry
 *
 * Manages registration and lookup of available tools.
 */

import type {
  ToolDefinition,
  RegisteredTool,
  ToolExecutorFn,
} from './definitions';

export class ToolRegistry {
  private readonly tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a tool
   */
  register(definition: ToolDefinition, execute: ToolExecutorFn): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool '${definition.name}' is already registered`);
    }

    this.tools.set(definition.name, { definition, execute });
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a registered tool
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tool definitions (for sending to LLM)
   */
  getDefinitions(): ToolDefinition[] {
    return this.getAll().map((t) => t.definition);
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): RegisteredTool[] {
    return this.getAll().filter((t) => t.definition.category === category);
  }

  /**
   * Get tools that require approval
   */
  getApprovalRequired(): RegisteredTool[] {
    return this.getAll().filter((t) => t.definition.requiresApproval);
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Get tool count
   */
  get size(): number {
    return this.tools.size;
  }
}

/**
 * Create a new tool registry
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
