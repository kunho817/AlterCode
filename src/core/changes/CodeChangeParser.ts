/**
 * Code Change Parser
 *
 * Parses WORKER output to extract file changes.
 * Handles various output formats from Claude/GLM.
 */

import { FileChange } from '../../types';
import { Logger } from '../../utils/Logger';

/**
 * Change type values matching FileChange interface.
 */
type ChangeTypeValue = 'create' | 'modify' | 'delete';

/**
 * Parsed code block from AI output.
 */
interface ParsedCodeBlock {
  language: string;
  content: string;
  filePath?: string;
}

/**
 * Parses AI output to extract file changes.
 */
export class CodeChangeParser {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('CodeChangeParser');
  }

  /**
   * Parse WORKER output to extract file changes.
   */
  parseOutput(content: string): FileChange[] {
    const changes: FileChange[] = [];

    // Try JSON format first
    const jsonChanges = this.parseJsonFormat(content);
    if (jsonChanges.length > 0) {
      return jsonChanges;
    }

    // Try markdown code blocks with file paths
    const codeBlockChanges = this.parseCodeBlocks(content);
    if (codeBlockChanges.length > 0) {
      return codeBlockChanges;
    }

    // Try structured text format
    const structuredChanges = this.parseStructuredFormat(content);
    if (structuredChanges.length > 0) {
      return structuredChanges;
    }

    this.logger.debug('No file changes detected in output');
    return changes;
  }

  /**
   * Parse JSON format file changes.
   */
  private parseJsonFormat(content: string): FileChange[] {
    try {
      // Look for JSON block
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        content.match(/\{[\s\S]*"files?"[\s\S]*\}/);

      if (!jsonMatch) return [];

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      // Handle { files: [...] } format
      if (parsed.files && Array.isArray(parsed.files)) {
        return parsed.files.map((f: Record<string, unknown>) => this.normalizeFileChange(f));
      }

      // Handle { fileChanges: [...] } format
      if (parsed.fileChanges && Array.isArray(parsed.fileChanges)) {
        return parsed.fileChanges.map((f: Record<string, unknown>) => this.normalizeFileChange(f));
      }

      // Handle array directly
      if (Array.isArray(parsed)) {
        return parsed.map((f: Record<string, unknown>) => this.normalizeFileChange(f));
      }

      return [];
    } catch (error) {
      this.logger.debug('Failed to parse JSON format', error);
      return [];
    }
  }

  /**
   * Parse markdown code blocks with file paths.
   */
  private parseCodeBlocks(content: string): FileChange[] {
    const changes: FileChange[] = [];

    // Pattern: ```language:path/to/file.ext or // File: path/to/file.ext before code block
    const patterns = [
      // ```typescript:src/file.ts
      /```(\w+):([^\n]+)\n([\s\S]*?)```/g,
      // File: src/file.ts\n```typescript
      /(?:File|Path):\s*([^\n]+)\n```(\w*)\n([\s\S]*?)```/gi,
      // <!-- file: src/file.ts -->
      /<!--\s*file:\s*([^\n]+)\s*-->\n```(\w*)\n([\s\S]*?)```/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let filePath: string;
        let fileContent: string;

        if (pattern.source.startsWith('```(\\w+):')) {
          // Format: ```lang:path
          filePath = match[2].trim();
          fileContent = match[3];
        } else {
          // Format: File: path or <!-- file: path -->
          filePath = match[1].trim();
          fileContent = match[3];
        }

        changes.push({
          filePath,
          originalContent: null,
          modifiedContent: fileContent.trim(),
          diff: '',
          changeType: 'modify',
        });
      }

      if (changes.length > 0) break;
    }

    return changes;
  }

  /**
   * Parse structured text format.
   */
  private parseStructuredFormat(content: string): FileChange[] {
    const changes: FileChange[] = [];

    // Look for sections like "### File: src/file.ts" followed by code
    const sectionPattern = /###?\s*(?:File|Modify|Create|Update):\s*([^\n]+)\n([\s\S]*?)(?=###?\s*(?:File|Modify|Create|Update):|$)/gi;

    let match;
    while ((match = sectionPattern.exec(content)) !== null) {
      const filePath = match[1].trim();
      const sectionContent = match[2];

      // Extract code from the section
      const codeMatch = sectionContent.match(/```[\w]*\n([\s\S]*?)```/);
      if (codeMatch) {
        changes.push({
          filePath,
          originalContent: null,
          modifiedContent: codeMatch[1].trim(),
          diff: '',
          changeType: this.inferChangeType(match[0]),
        });
      }
    }

    return changes;
  }

  /**
   * Normalize a file change object from parsed JSON.
   */
  private normalizeFileChange(obj: Record<string, unknown>): FileChange {
    return {
      filePath: String(obj.filePath || obj.path || obj.file || ''),
      originalContent: obj.originalContent as string | null || null,
      modifiedContent: String(obj.newContent || obj.modifiedContent || obj.content || obj.code || ''),
      diff: String(obj.diff || ''),
      changeType: this.parseChangeType(obj.type as string || obj.changeType as string) || 'modify',
    };
  }

  /**
   * Parse change type from string.
   */
  private parseChangeType(typeStr: string | undefined): ChangeTypeValue | null {
    if (!typeStr) return null;
    const lower = typeStr.toLowerCase();
    if (lower.includes('create') || lower.includes('add')) return 'create';
    if (lower.includes('delete') || lower.includes('remove')) return 'delete';
    if (lower.includes('modify') || lower.includes('update') || lower.includes('change')) return 'modify';
    return 'modify';
  }

  /**
   * Infer change type from section header.
   */
  private inferChangeType(header: string): ChangeTypeValue {
    const lower = header.toLowerCase();
    if (lower.includes('create')) return 'create';
    if (lower.includes('delete')) return 'delete';
    return 'modify';
  }
}
