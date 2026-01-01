/**
 * Semantic Analyzer Service
 *
 * Analyzes code files to identify semantic regions for conflict detection:
 * - TypeScript/JavaScript: Uses TypeScript compiler API
 * - Other languages: Regex-based pattern matching
 * - Fallback: Line-based chunking
 */

import * as ts from 'typescript';
import {
  ISemanticAnalyzerService,
  CodeRegion,
  RegionType,
  FilePath,
  LineNumber,
  toLineNumber,
  ILogger,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/** Language configuration */
interface LanguageConfig {
  extensions: string[];
  parser: 'typescript' | 'regex';
  patterns?: RegexPatterns;
}

/** Regex patterns for a language */
interface RegexPatterns {
  function?: RegExp;
  class?: RegExp;
  interface?: RegExp;
  type?: RegExp;
  variable?: RegExp;
  import?: RegExp;
  export?: RegExp;
}

/** Supported languages configuration */
const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  typescript: {
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    parser: 'typescript',
  },
  javascript: {
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    parser: 'typescript', // TS compiler can parse JS too
  },
  python: {
    extensions: ['.py'],
    parser: 'regex',
    patterns: {
      function: /^(?:async\s+)?def\s+(\w+)/,
      class: /^class\s+(\w+)/,
      variable: /^(\w+)\s*=\s*(?:lambda|def)/,
      import: /^from\s+\S+\s+import|^import\s+\S+/,
    },
  },
  rust: {
    extensions: ['.rs'],
    parser: 'regex',
    patterns: {
      function: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
      class: /^(?:pub\s+)?struct\s+(\w+)/,
      interface: /^(?:pub\s+)?trait\s+(\w+)/,
      type: /^(?:pub\s+)?(?:type|enum)\s+(\w+)/,
      import: /^use\s+/,
    },
  },
  go: {
    extensions: ['.go'],
    parser: 'regex',
    patterns: {
      function: /^func\s+(?:\([^)]+\)\s+)?(\w+)/,
      class: /^type\s+(\w+)\s+struct/,
      interface: /^type\s+(\w+)\s+interface/,
      import: /^import\s+/,
    },
  },
  java: {
    extensions: ['.java'],
    parser: 'regex',
    patterns: {
      function: /^\s*(?:public|private|protected)?\s*(?:static)?\s*\w+\s+(\w+)\s*\(/,
      class: /^\s*(?:public|private)?\s*(?:abstract|final)?\s*class\s+(\w+)/,
      interface: /^\s*(?:public)?\s*interface\s+(\w+)/,
      import: /^import\s+/,
    },
  },
};

/** Cache entry for file analysis */
interface CacheEntry {
  regions: CodeRegion[];
  hash: string;
}

/**
 * Semantic Analyzer Service Implementation
 */
export class SemanticAnalyzerService implements ISemanticAnalyzerService {
  private readonly logger?: ILogger;

  /** Analysis cache */
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly maxCacheSize = 1000;

  constructor(logger?: ILogger) {
    this.logger = logger?.child('SemanticAnalyzerService');
  }

  /**
   * Analyze a file and identify code regions
   */
  analyzeFile(filePath: FilePath, content: string): CodeRegion[] {
    // Check cache
    const hash = this.hashContent(content);
    const cached = this.cache.get(filePath);
    if (cached && cached.hash === hash) {
      return cached.regions;
    }

    // Determine language and analyze
    const extension = this.getExtension(filePath);
    const langConfig = this.getLanguageConfig(extension);

    let regions: CodeRegion[];

    if (!langConfig) {
      // Unsupported language, use line-based fallback
      regions = this.analyzeAsLines(filePath, content);
    } else if (langConfig.parser === 'typescript') {
      regions = this.analyzeTypeScript(filePath, content);
    } else {
      regions = this.analyzeWithRegex(filePath, content, langConfig.patterns!);
    }

    // Cache results
    this.evictCacheIfNeeded();
    this.cache.set(filePath, { regions, hash });

    return regions;
  }

  /**
   * Check if two regions overlap
   */
  regionsOverlap(r1: CodeRegion, r2: CodeRegion): boolean {
    // Must be in same file
    if (r1.filePath !== r2.filePath) {
      return false;
    }

    // Check line range overlap
    const r1Start = r1.startLine as number;
    const r1End = r1.endLine as number;
    const r2Start = r2.startLine as number;
    const r2End = r2.endLine as number;

    return r1Start <= r2End && r2Start <= r1End;
  }

  /**
   * Find all regions at a specific position
   */
  findRegionsAtPosition(
    filePath: FilePath,
    line: LineNumber,
    regions: CodeRegion[]
  ): CodeRegion[] {
    const lineNum = line as number;
    return regions.filter((r) => {
      if (r.filePath !== filePath) return false;
      const start = r.startLine as number;
      const end = r.endLine as number;
      return lineNum >= start && lineNum <= end;
    });
  }

  /**
   * Get the most specific (smallest) region at a position
   */
  getMostSpecificRegion(
    filePath: FilePath,
    line: LineNumber,
    regions: CodeRegion[]
  ): CodeRegion | null {
    const matching = this.findRegionsAtPosition(filePath, line, regions);
    if (matching.length === 0) return null;

    // Return smallest region (most specific)
    return matching.reduce((smallest, current) => {
      const smallestSize = (smallest.endLine as number) - (smallest.startLine as number);
      const currentSize = (current.endLine as number) - (current.startLine as number);
      return currentSize < smallestSize ? current : smallest;
    });
  }

  /**
   * Assign regions to workers to minimize conflicts
   */
  assignRegionsToWorkers(
    regions: CodeRegion[],
    workerCount: number
  ): Map<number, CodeRegion[]> {
    const assignments = new Map<number, CodeRegion[]>();

    // Initialize worker buckets
    for (let i = 0; i < workerCount; i++) {
      assignments.set(i, []);
    }

    // Group regions by file
    const byFile = new Map<string, CodeRegion[]>();
    for (const region of regions) {
      const path = region.filePath as string;
      if (!byFile.has(path)) {
        byFile.set(path, []);
      }
      byFile.get(path)!.push(region);
    }

    // Round-robin assign files to workers (keeps file regions together)
    let workerIndex = 0;
    for (const fileRegions of byFile.values()) {
      const workerBucket = assignments.get(workerIndex)!;
      workerBucket.push(...fileRegions);
      workerIndex = (workerIndex + 1) % workerCount;
    }

    return assignments;
  }

  /**
   * Get regions that depend on a given region
   */
  getDependentRegions(region: CodeRegion, allRegions: CodeRegion[]): CodeRegion[] {
    // Find regions that reference any of this region's dependencies
    return allRegions.filter((r) => {
      if (r.id === region.id) return false;
      return r.dependencies.some((dep) => region.dependencies.includes(dep));
    });
  }

  /**
   * Check if a file type is supported for analysis
   */
  isSupported(filePath: FilePath): boolean {
    const extension = this.getExtension(filePath);
    return this.getLanguageConfig(extension) !== null;
  }

  /**
   * Get list of supported file extensions
   */
  getSupportedExtensions(): string[] {
    const extensions: string[] = [];
    for (const config of Object.values(LANGUAGE_CONFIGS)) {
      extensions.push(...config.extensions);
    }
    return extensions;
  }

  /**
   * Analyze TypeScript/JavaScript using the TypeScript compiler
   */
  private analyzeTypeScript(filePath: FilePath, content: string): CodeRegion[] {
    const regions: CodeRegion[] = [];
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    // Track imports as a single region
    let importStart: number | null = null;
    let importEnd: number | null = null;

    const visit = (node: ts.Node) => {
      const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

      if (ts.isImportDeclaration(node)) {
        // Track import range
        if (importStart === null) importStart = startLine;
        importEnd = endLine;
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        regions.push(this.createRegion(
          filePath,
          'function',
          node.name.getText(),
          startLine,
          endLine,
          this.extractDependencies(node, sourceFile)
        ));
      } else if (ts.isClassDeclaration(node) && node.name) {
        regions.push(this.createRegion(
          filePath,
          'class',
          node.name.getText(),
          startLine,
          endLine,
          this.extractDependencies(node, sourceFile)
        ));
      } else if (ts.isInterfaceDeclaration(node)) {
        regions.push(this.createRegion(
          filePath,
          'interface',
          node.name.getText(),
          startLine,
          endLine,
          []
        ));
      } else if (ts.isTypeAliasDeclaration(node)) {
        regions.push(this.createRegion(
          filePath,
          'type_definition',
          node.name.getText(),
          startLine,
          endLine,
          []
        ));
      } else if (ts.isEnumDeclaration(node)) {
        regions.push(this.createRegion(
          filePath,
          'type_definition',
          node.name.getText(),
          startLine,
          endLine,
          []
        ));
      } else if (ts.isVariableStatement(node)) {
        const declarations = node.declarationList.declarations;
        for (const decl of declarations) {
          if (ts.isIdentifier(decl.name)) {
            regions.push(this.createRegion(
              filePath,
              'variable',
              decl.name.getText(),
              startLine,
              endLine,
              this.extractDependencies(decl, sourceFile)
            ));
          }
        }
      } else if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
        regions.push(this.createRegion(
          filePath,
          'export',
          'export',
          startLine,
          endLine,
          []
        ));
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Add imports region if any imports exist
    if (importStart !== null && importEnd !== null) {
      regions.unshift(this.createRegion(
        filePath,
        'imports',
        'imports',
        importStart,
        importEnd,
        []
      ));
    }

    // Sort by start line
    regions.sort((a, b) => (a.startLine as number) - (b.startLine as number));

    return regions;
  }

  /**
   * Analyze using regex patterns
   */
  private analyzeWithRegex(
    filePath: FilePath,
    content: string,
    patterns: RegexPatterns
  ): CodeRegion[] {
    const regions: CodeRegion[] = [];
    const lines = content.split('\n');

    let importStart: number | null = null;
    let importEnd: number | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const lineNum = i + 1;

      // Check for imports
      if (patterns.import?.test(line)) {
        if (importStart === null) importStart = lineNum;
        importEnd = lineNum;
        continue;
      }

      // Check for functions
      const funcMatch = patterns.function?.exec(line);
      if (funcMatch) {
        const endLine = this.findBlockEnd(lines, i);
        regions.push(this.createRegion(
          filePath,
          'function',
          funcMatch[1] || 'anonymous',
          lineNum,
          endLine,
          []
        ));
        continue;
      }

      // Check for classes
      const classMatch = patterns.class?.exec(line);
      if (classMatch) {
        const endLine = this.findBlockEnd(lines, i);
        regions.push(this.createRegion(
          filePath,
          'class',
          classMatch[1] || 'anonymous',
          lineNum,
          endLine,
          []
        ));
        continue;
      }

      // Check for interfaces
      const interfaceMatch = patterns.interface?.exec(line);
      if (interfaceMatch) {
        const endLine = this.findBlockEnd(lines, i);
        regions.push(this.createRegion(
          filePath,
          'interface',
          interfaceMatch[1] || 'anonymous',
          lineNum,
          endLine,
          []
        ));
        continue;
      }

      // Check for types
      const typeMatch = patterns.type?.exec(line);
      if (typeMatch) {
        const endLine = this.findBlockEnd(lines, i);
        regions.push(this.createRegion(
          filePath,
          'type_definition',
          typeMatch[1] || 'anonymous',
          lineNum,
          endLine,
          []
        ));
        continue;
      }

      // Check for variables
      const varMatch = patterns.variable?.exec(line);
      if (varMatch) {
        regions.push(this.createRegion(
          filePath,
          'variable',
          varMatch[1] || 'anonymous',
          lineNum,
          lineNum,
          []
        ));
      }
    }

    // Add imports region
    if (importStart !== null && importEnd !== null) {
      regions.unshift(this.createRegion(
        filePath,
        'imports',
        'imports',
        importStart,
        importEnd,
        []
      ));
    }

    return regions;
  }

  /**
   * Analyze as line-based chunks (fallback)
   */
  private analyzeAsLines(filePath: FilePath, content: string): CodeRegion[] {
    const lines = content.split('\n');
    const regions: CodeRegion[] = [];
    const chunkSize = 50;

    for (let i = 0; i < lines.length; i += chunkSize) {
      const startLine = i + 1;
      const endLine = Math.min(i + chunkSize, lines.length);

      regions.push(this.createRegion(
        filePath,
        'other',
        `lines_${startLine}_${endLine}`,
        startLine,
        endLine,
        []
      ));
    }

    return regions;
  }

  /**
   * Create a code region
   */
  private createRegion(
    filePath: FilePath,
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
      startLine: toLineNumber(startLine),
      endLine: toLineNumber(endLine),
      dependencies,
      modifiedBy: null,
    };
  }

  /**
   * Extract dependencies from a TypeScript node
   */
  private extractDependencies(node: ts.Node, sourceFile: ts.SourceFile): string[] {
    const deps = new Set<string>();

    const visit = (n: ts.Node) => {
      if (ts.isIdentifier(n)) {
        deps.add(n.getText(sourceFile));
      }
      ts.forEachChild(n, visit);
    };

    ts.forEachChild(node, visit);
    return Array.from(deps);
  }

  /**
   * Find the end of a code block (simple brace matching)
   */
  private findBlockEnd(lines: string[], startIndex: number): number {
    let braceCount = 0;
    let started = false;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      for (const char of line) {
        if (char === '{' || char === ':') {
          braceCount++;
          started = true;
        } else if (char === '}') {
          braceCount--;
        }
      }

      // Python/indentation-based: look for dedent
      if (!started && i > startIndex && line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('\t')) {
        return i;
      }

      if (started && braceCount === 0) {
        return i + 1;
      }
    }

    return lines.length;
  }

  /**
   * Get file extension
   */
  private getExtension(filePath: FilePath): string {
    const path = filePath as string;
    const lastDot = path.lastIndexOf('.');
    return lastDot >= 0 ? path.substring(lastDot).toLowerCase() : '';
  }

  /**
   * Get language configuration for an extension
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
   * Simple content hash for cache validation
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Evict oldest cache entries if needed
   */
  private evictCacheIfNeeded(): void {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove first 10% of entries
      const toRemove = Math.floor(this.maxCacheSize * 0.1);
      const keys = Array.from(this.cache.keys()).slice(0, toRemove);
      for (const key of keys) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Create a new semantic analyzer service
 */
export function createSemanticAnalyzerService(logger?: ILogger): ISemanticAnalyzerService {
  return new SemanticAnalyzerService(logger);
}
