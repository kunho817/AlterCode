/**
 * Semantic Analyzer
 *
 * Analyzes code to identify semantic regions (functions, classes, imports, etc.)
 * Uses TypeScript compiler API for TS/JS files, regex patterns for others.
 */

import * as ts from 'typescript';
import { CodeRegion, RegionType } from '../types';
import { Logger } from '../utils/Logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Language support configuration.
 */
interface LanguageConfig {
  extensions: string[];
  parser: 'typescript' | 'regex';
}

/**
 * Supported languages and their configurations.
 */
const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  typescript: { extensions: ['.ts', '.tsx'], parser: 'typescript' },
  javascript: { extensions: ['.js', '.jsx', '.mjs', '.cjs'], parser: 'typescript' },
  // Future: Add more language parsers
};

/**
 * Analyzes code to identify semantic regions.
 */
export class SemanticAnalyzer {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('SemanticAnalyzer');
  }

  /**
   * Analyze a file and extract semantic regions.
   */
  analyzeFile(filePath: string, content: string): CodeRegion[] {
    const extension = this.getExtension(filePath);
    const config = this.getLanguageConfig(extension);

    if (!config) {
      this.logger.debug(`No parser for ${extension}, using line-based regions`);
      return this.analyzeAsLines(filePath, content);
    }

    switch (config.parser) {
      case 'typescript':
        return this.analyzeTypeScript(filePath, content);
      case 'regex':
        return this.analyzeWithRegex(filePath, content);
      default:
        return this.analyzeAsLines(filePath, content);
    }
  }

  /**
   * Analyze TypeScript/JavaScript file using compiler API.
   */
  private analyzeTypeScript(filePath: string, content: string): CodeRegion[] {
    const regions: CodeRegion[] = [];

    try {
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
          ? ts.ScriptKind.TSX
          : ts.ScriptKind.TS
      );

      const lines = content.split('\n');

      // Track import region
      let importStart: number | null = null;
      let importEnd: number | null = null;

      const visit = (node: ts.Node): void => {
        const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        const startLine = startPos.line + 1; // 1-indexed
        const endLine = endPos.line + 1;

        // Handle imports
        if (ts.isImportDeclaration(node)) {
          if (importStart === null) {
            importStart = startLine;
          }
          importEnd = endLine;
          return; // Don't add individual imports, aggregate them
        }

        // Handle different node types
        if (ts.isFunctionDeclaration(node) && node.name) {
          regions.push(this.createRegion(
            filePath,
            RegionType.FUNCTION,
            node.name.text,
            startLine,
            endLine,
            this.extractDependencies(node, sourceFile)
          ));
        } else if (ts.isClassDeclaration(node) && node.name) {
          regions.push(this.createRegion(
            filePath,
            RegionType.CLASS,
            node.name.text,
            startLine,
            endLine,
            this.extractDependencies(node, sourceFile)
          ));
        } else if (ts.isInterfaceDeclaration(node)) {
          regions.push(this.createRegion(
            filePath,
            RegionType.INTERFACE,
            node.name.text,
            startLine,
            endLine,
            []
          ));
        } else if (ts.isTypeAliasDeclaration(node)) {
          regions.push(this.createRegion(
            filePath,
            RegionType.TYPE_DEFINITION,
            node.name.text,
            startLine,
            endLine,
            []
          ));
        } else if (ts.isEnumDeclaration(node)) {
          regions.push(this.createRegion(
            filePath,
            RegionType.TYPE_DEFINITION,
            node.name.text,
            startLine,
            endLine,
            []
          ));
        } else if (ts.isVariableStatement(node)) {
          // Handle exported constants, etc.
          const declarations = node.declarationList.declarations;
          for (const decl of declarations) {
            if (ts.isIdentifier(decl.name)) {
              const isExport = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
              regions.push(this.createRegion(
                filePath,
                isExport ? RegionType.EXPORT : RegionType.VARIABLE,
                decl.name.text,
                startLine,
                endLine,
                this.extractDependencies(decl, sourceFile)
              ));
            }
          }
        } else if (ts.isExportAssignment(node)) {
          regions.push(this.createRegion(
            filePath,
            RegionType.EXPORT,
            'default',
            startLine,
            endLine,
            []
          ));
        } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
          // Arrow functions and function expressions within variable declarations
          // are handled by the parent VariableStatement
          return;
        }

        // Recurse into the node
        ts.forEachChild(node, visit);
      };

      // Visit all top-level statements
      for (const statement of sourceFile.statements) {
        visit(statement);
      }

      // Add aggregated import region
      if (importStart !== null && importEnd !== null) {
        regions.unshift(this.createRegion(
          filePath,
          RegionType.IMPORTS,
          'imports',
          importStart,
          importEnd,
          []
        ));
      }

      // Sort by start line
      regions.sort((a, b) => a.startLine - b.startLine);

      this.logger.debug(`Analyzed ${filePath}: found ${regions.length} regions`);
      return regions;
    } catch (error) {
      this.logger.error(`Failed to analyze ${filePath}`, error);
      return this.analyzeAsLines(filePath, content);
    }
  }

  /**
   * Extract dependencies (identifiers used) from a node.
   */
  private extractDependencies(node: ts.Node, sourceFile: ts.SourceFile): string[] {
    const deps = new Set<string>();

    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n)) {
        // Check if this identifier is a reference (not a declaration)
        const parent = n.parent;
        if (
          !ts.isVariableDeclaration(parent) ||
          (parent as ts.VariableDeclaration).name !== n
        ) {
          deps.add(n.text);
        }
      }
      ts.forEachChild(n, visit);
    };

    visit(node);
    return Array.from(deps);
  }

  /**
   * Analyze with regex patterns (fallback for unsupported languages).
   */
  private analyzeWithRegex(filePath: string, content: string): CodeRegion[] {
    const regions: CodeRegion[] = [];
    const lines = content.split('\n');

    // Common patterns
    const patterns = [
      { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, type: RegionType.FUNCTION },
      { regex: /^(?:export\s+)?class\s+(\w+)/m, type: RegionType.CLASS },
      { regex: /^(?:export\s+)?interface\s+(\w+)/m, type: RegionType.INTERFACE },
      { regex: /^(?:export\s+)?type\s+(\w+)/m, type: RegionType.TYPE_DEFINITION },
      { regex: /^(?:export\s+)?const\s+(\w+)/m, type: RegionType.VARIABLE },
    ];

    let currentLine = 0;
    for (const line of lines) {
      currentLine++;
      for (const { regex, type } of patterns) {
        const match = line.match(regex);
        if (match) {
          // Estimate end line (look for closing brace or next declaration)
          const endLine = this.findEndLine(lines, currentLine - 1);
          regions.push(this.createRegion(
            filePath,
            type,
            match[1],
            currentLine,
            endLine,
            []
          ));
        }
      }
    }

    return regions;
  }

  /**
   * Simple line-based analysis for unknown file types.
   */
  private analyzeAsLines(filePath: string, content: string): CodeRegion[] {
    const lines = content.split('\n');
    const chunkSize = 50; // Group lines into chunks
    const regions: CodeRegion[] = [];

    for (let i = 0; i < lines.length; i += chunkSize) {
      const startLine = i + 1;
      const endLine = Math.min(i + chunkSize, lines.length);
      regions.push(this.createRegion(
        filePath,
        RegionType.OTHER,
        `lines_${startLine}_${endLine}`,
        startLine,
        endLine,
        []
      ));
    }

    return regions;
  }

  /**
   * Find the end line of a code block.
   */
  private findEndLine(lines: string[], startIndex: number): number {
    let braceCount = 0;
    let foundBrace = false;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundBrace = true;
        } else if (char === '}') {
          braceCount--;
          if (foundBrace && braceCount === 0) {
            return i + 1; // 1-indexed
          }
        }
      }
    }

    return startIndex + 1; // Single-line declaration
  }

  /**
   * Create a code region.
   */
  private createRegion(
    filePath: string,
    type: RegionType,
    name: string,
    startLine: number,
    endLine: number,
    dependencies: string[]
  ): CodeRegion {
    return {
      id: uuidv4(),
      filePath,
      type,
      name,
      startLine,
      endLine,
      dependencies,
      modifiedBy: null,
    };
  }

  /**
   * Get the file extension.
   */
  private getExtension(filePath: string): string {
    const parts = filePath.split('.');
    if (parts.length < 2) return '';
    return '.' + parts[parts.length - 1].toLowerCase();
  }

  /**
   * Get language configuration for an extension.
   */
  private getLanguageConfig(extension: string): LanguageConfig | null {
    for (const config of Object.values(LANGUAGE_CONFIGS)) {
      if (config.extensions.includes(extension)) {
        return config;
      }
    }
    return null;
  }

  /**
   * Assign regions to workers to minimize conflicts.
   */
  assignRegionsToWorkers(
    regions: CodeRegion[],
    workerCount: number
  ): Map<number, CodeRegion[]> {
    const assignments = new Map<number, CodeRegion[]>();

    // Initialize worker assignments
    for (let i = 0; i < workerCount; i++) {
      assignments.set(i, []);
    }

    // Group regions by file to keep file edits together
    const byFile = new Map<string, CodeRegion[]>();
    for (const region of regions) {
      const existing = byFile.get(region.filePath) || [];
      existing.push(region);
      byFile.set(region.filePath, existing);
    }

    // Round-robin assign files to workers
    let workerIndex = 0;
    for (const [, fileRegions] of byFile) {
      const workerRegions = assignments.get(workerIndex)!;
      workerRegions.push(...fileRegions);
      workerIndex = (workerIndex + 1) % workerCount;
    }

    return assignments;
  }

  /**
   * Get regions that depend on a given region.
   */
  getDependentRegions(region: CodeRegion, allRegions: CodeRegion[]): CodeRegion[] {
    return allRegions.filter(r =>
      r.dependencies.includes(region.name) && r.id !== region.id
    );
  }

  /**
   * Check if two regions overlap.
   */
  regionsOverlap(r1: CodeRegion, r2: CodeRegion): boolean {
    if (r1.filePath !== r2.filePath) return false;
    return !(r1.endLine < r2.startLine || r2.endLine < r1.startLine);
  }
}
