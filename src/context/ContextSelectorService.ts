/**
 * Context Selector Service
 *
 * Intelligently selects relevant context for LLM requests:
 * - Target file/symbol selection
 * - Dependency expansion
 * - Priority-based filtering
 * - Token budget fitting
 */

import {
  IContextSelectorService,
  ISemanticIndexService,
  IFileSystem,
  ITokenBudgetService,
  ContextRequest,
  ContextSelection,
  SelectedFile,
  SelectedSymbol,
  SelectionExplanation,
  SelectionStats,
  DisclosureLevel,
  RelativePath,
  TokenCount,
  FilePath,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  toTokenCount,
  toRelativePath,
} from '../types';

/** Priority calculation for files/symbols */
interface PriorityItem {
  path: RelativePath;
  priority: number;
  reason: string;
}

/**
 * Context Selector Service implementation
 */
export class ContextSelectorService implements IContextSelectorService {
  private readonly semanticIndex: ISemanticIndexService;
  private readonly fileSystem: IFileSystem;
  private readonly tokenBudget: ITokenBudgetService;
  private readonly projectRoot: FilePath;
  private readonly logger?: ILogger;

  constructor(
    semanticIndex: ISemanticIndexService,
    fileSystem: IFileSystem,
    tokenBudget: ITokenBudgetService,
    projectRoot: FilePath,
    logger?: ILogger
  ) {
    this.semanticIndex = semanticIndex;
    this.fileSystem = fileSystem;
    this.tokenBudget = tokenBudget;
    this.projectRoot = projectRoot;
    this.logger = logger?.child('ContextSelectorService');
  }

  async select(request: ContextRequest): AsyncResult<ContextSelection> {
    try {
      this.logger?.info('Selecting context', {
        targets: request.task.targets.length,
        symbols: request.task.symbols.length,
      });

      const { task, budget, strategy } = request;
      const { limits, priorities, expand } = strategy;

      // Step 1: Build initial candidate list from targets
      const candidates = this.buildCandidateList(task, priorities);

      // Step 2: Expand candidates based on rules
      const expanded = await this.expandCandidates(candidates, expand, limits.maxDepth ?? 3);

      // Step 3: Sort by priority and filter to limits
      const sorted = expanded.sort((a, b) => b.priority - a.priority);
      const filtered = sorted.slice(0, limits.maxFiles);

      // Step 4: Load content and fit to budget
      const selectedFiles: SelectedFile[] = [];
      const selectedSymbols: SelectedSymbol[] = [];
      let totalTokens = toTokenCount(0);
      const selectionReasons = new Map<string, string>();
      const maxTokens = budget.context as number;

      for (const candidate of filtered) {
        // Check if we're within budget
        if ((totalTokens as number) >= maxTokens) {
          break;
        }

        try {
          const fullPath = this.fileSystem.join(this.projectRoot as string, candidate.path as string);
          const content = await this.fileSystem.readFile(fullPath);
          const tokens = this.tokenBudget.countTokens(content);

          // Determine disclosure level based on remaining budget
          const remaining = maxTokens - (totalTokens as number);
          const level = this.determineDisclosureLevel(tokens as number, remaining);

          // Get content at disclosure level
          const { levelContent, levelTokens } = this.getContentAtLevel(content, level);

          // Check if it fits
          if ((totalTokens as number) + (levelTokens as number) <= maxTokens) {
            selectedFiles.push({
              path: candidate.path,
              content: levelContent,
              tokens: levelTokens,
              relevance: candidate.priority,
              reason: candidate.reason,
              level,
            });

            totalTokens = toTokenCount((totalTokens as number) + (levelTokens as number));
            selectionReasons.set(candidate.path as string, candidate.reason);
          }
        } catch (error) {
          this.logger?.debug('Failed to load file', { path: candidate.path, error });
        }
      }

      // Step 5: Add symbols if budget permits
      for (const symbolName of task.symbols) {
        if ((totalTokens as number) >= maxTokens) break;

        const symbols = this.semanticIndex.findSymbol(symbolName);
        for (const symbol of symbols.slice(0, limits.maxSymbolsPerFile)) {
          if (selectedSymbols.length >= limits.maxTotalSymbols) break;

          // Format symbol for context
          const formatted = this.formatSymbol(symbol);
          const tokens = this.tokenBudget.countTokens(formatted);

          if ((totalTokens as number) + (tokens as number) <= maxTokens) {
            selectedSymbols.push({
              name: symbol.name,
              file: symbol.location.file as unknown as RelativePath,
              content: formatted,
              tokens,
              relevance: 0.9, // High relevance for directly requested symbols
              reason: 'Directly requested symbol',
            });

            totalTokens = toTokenCount((totalTokens as number) + (tokens as number));
            selectionReasons.set(`${symbol.location.file}:${symbol.name}`, 'Requested symbol');
          }
        }
      }

      const stats: SelectionStats = {
        filesConsidered: candidates.length,
        filesSelected: selectedFiles.length,
        symbolsConsidered: task.symbols.length,
        symbolsSelected: selectedSymbols.length,
        tokensUsed: totalTokens,
        tokensAvailable: budget.context,
        compressionRatio:
          candidates.length > 0
            ? selectedFiles.length / candidates.length
            : 1,
      };

      const selection: ContextSelection = {
        files: selectedFiles,
        symbols: selectedSymbols,
        totalTokens,
        selectionReasons,
        stats,
      };

      this.logger?.info('Context selected', stats);
      return Ok(selection);
    } catch (error) {
      this.logger?.error('Failed to select context', error as Error);
      return Err(
        new AppError('INFRASTRUCTURE', `Context selection failed: ${(error as Error).message}`)
      );
    }
  }

  explainSelection(selection: ContextSelection): SelectionExplanation {
    const perFile = new Map<RelativePath, string>();
    const perSymbol = new Map<string, string>();

    for (const file of selection.files) {
      perFile.set(file.path, file.reason);
    }

    for (const symbol of selection.symbols) {
      perSymbol.set(`${symbol.file}:${symbol.name}`, symbol.reason);
    }

    const summary = [
      `Selected ${selection.files.length} files and ${selection.symbols.length} symbols.`,
      `Total tokens: ${selection.totalTokens}`,
      `Compression ratio: ${(selection.stats.compressionRatio * 100).toFixed(1)}%`,
    ].join(' ');

    return {
      summary,
      perFile,
      perSymbol,
    };
  }

  /**
   * Build initial candidate list from task targets
   */
  private buildCandidateList(
    task: ContextRequest['task'],
    priorities: ContextRequest['strategy']['priorities']
  ): PriorityItem[] {
    const candidates: PriorityItem[] = [];

    // Add direct targets with highest priority
    for (const target of task.targets) {
      candidates.push({
        path: target,
        priority: priorities.directTargets,
        reason: 'Direct target',
      });
    }

    // Add files containing requested symbols
    for (const symbolName of task.symbols) {
      const symbols = this.semanticIndex.findSymbol(symbolName);
      for (const symbol of symbols) {
        const symbolPath = symbol.location.file as unknown as RelativePath;
        const existing = candidates.find((c) => c.path === symbolPath);
        if (!existing) {
          candidates.push({
            path: symbolPath,
            priority: priorities.directTargets * 0.9,
            reason: `Contains symbol: ${symbolName}`,
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Expand candidates based on rules
   */
  private async expandCandidates(
    initial: PriorityItem[],
    rules: ContextRequest['strategy']['expand'],
    maxDepth: number
  ): Promise<PriorityItem[]> {
    const result = new Map<string, PriorityItem>();

    // Add initial candidates
    for (const item of initial) {
      result.set(item.path as string, item);
    }

    // BFS expansion
    let frontier = initial;
    let depth = 0;

    while (depth < maxDepth && frontier.length > 0) {
      const nextFrontier: PriorityItem[] = [];
      const depthPenalty = Math.pow(0.7, depth + 1);

      for (const item of frontier) {
        // Get imports
        if (rules.includeImports) {
          const imports = this.semanticIndex.getImports(item.path);
          for (const imp of imports) {
            if (imp.source.startsWith('.')) {
              const resolved = this.resolveRelativeImport(item.path, imp.source);
              if (resolved && !result.has(resolved as string)) {
                const newItem: PriorityItem = {
                  path: resolved,
                  priority: item.priority * depthPenalty * 0.8,
                  reason: `Imported by ${item.path}`,
                };
                result.set(resolved as string, newItem);
                nextFrontier.push(newItem);
              }
            }
          }
        }

        // Get tests
        if (rules.includeTests) {
          const testPath = this.findTestFile(item.path);
          if (testPath && !result.has(testPath as string)) {
            const newItem: PriorityItem = {
              path: testPath,
              priority: item.priority * depthPenalty * 0.6,
              reason: `Test for ${item.path}`,
            };
            result.set(testPath as string, newItem);
            nextFrontier.push(newItem);
          }
        }
      }

      frontier = nextFrontier;
      depth++;
    }

    return Array.from(result.values());
  }

  /**
   * Resolve relative import path
   */
  private resolveRelativeImport(from: RelativePath, importPath: string): RelativePath | null {
    try {
      const fromDir = this.fileSystem.dirname(from as unknown as FilePath);
      const resolved = this.fileSystem.join(fromDir as string, importPath);

      // Try with extensions
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
        const withExt = ext ? `${resolved}${ext}` : resolved;
        // Note: Can't async check here, return best guess
        return toRelativePath(
          this.fileSystem.relative(this.projectRoot, withExt as FilePath) as string
        );
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Find test file for a source file
   */
  private findTestFile(sourcePath: RelativePath): RelativePath | null {
    const baseName = this.fileSystem.basename(sourcePath as unknown as FilePath);
    const dirName = this.fileSystem.dirname(sourcePath as unknown as FilePath);
    const ext = this.fileSystem.extname(sourcePath as unknown as FilePath);
    const nameWithoutExt = baseName.replace(ext, '');

    // Common test file patterns
    const patterns = [
      `${nameWithoutExt}.test${ext}`,
      `${nameWithoutExt}.spec${ext}`,
      `__tests__/${baseName}`,
    ];

    for (const pattern of patterns) {
      const testPath = this.fileSystem.join(dirName as string, pattern);
      const relative = this.fileSystem.relative(this.projectRoot, testPath as FilePath);
      return relative;
    }

    return null;
  }

  /**
   * Determine disclosure level based on budget
   */
  private determineDisclosureLevel(tokens: number, remaining: number): DisclosureLevel {
    if (tokens <= remaining * 0.3) {
      return 'full';
    } else if (tokens * 0.3 <= remaining) {
      return 'summary';
    } else {
      return 'signature';
    }
  }

  /**
   * Get content at a specific disclosure level
   */
  private getContentAtLevel(
    content: string,
    level: DisclosureLevel
  ): { levelContent: string; levelTokens: TokenCount } {
    switch (level) {
      case 'full':
        return {
          levelContent: content,
          levelTokens: this.tokenBudget.countTokens(content),
        };

      case 'summary': {
        // Extract key parts: imports, exports, function/class signatures
        const lines = content.split('\n');
        const summary: string[] = [];
        let inMultilineComment = false;

        for (const line of lines) {
          const trimmed = line.trim();

          // Track multiline comments
          if (trimmed.startsWith('/*')) inMultilineComment = true;
          if (trimmed.endsWith('*/')) {
            inMultilineComment = false;
            continue;
          }
          if (inMultilineComment) continue;

          // Include imports
          if (trimmed.startsWith('import ')) {
            summary.push(line);
            continue;
          }

          // Include exports
          if (trimmed.startsWith('export ')) {
            summary.push(line);
            // Don't include body
            if (!trimmed.includes('{') || trimmed.includes('from')) {
              continue;
            }
          }

          // Include function/class declarations (just the signature)
          if (
            trimmed.match(/^(export\s+)?(async\s+)?function\s+\w+/) ||
            trimmed.match(/^(export\s+)?class\s+\w+/) ||
            trimmed.match(/^(export\s+)?interface\s+\w+/) ||
            trimmed.match(/^(export\s+)?type\s+\w+/)
          ) {
            summary.push(line);
            // Add just the signature, not the body
            if (trimmed.includes('{') && !trimmed.includes('}')) {
              summary.push('  // ... implementation');
              summary.push('}');
            }
          }
        }

        const levelContent = summary.join('\n');
        return {
          levelContent,
          levelTokens: this.tokenBudget.countTokens(levelContent),
        };
      }

      case 'signature': {
        // Extract only export signatures
        const lines = content.split('\n');
        const signatures: string[] = [];

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('export ')) {
            // Get just the first line of the export
            signatures.push(line);
          }
        }

        const levelContent = signatures.join('\n');
        return {
          levelContent,
          levelTokens: this.tokenBudget.countTokens(levelContent),
        };
      }
    }
  }

  /**
   * Format a symbol for context
   */
  private formatSymbol(symbol: import('../types').AnySymbol): string {
    const location = `// ${symbol.location.file}:${symbol.location.line}`;

    switch (symbol.kind) {
      case 'function': {
        const func = symbol as import('../types').FunctionSymbol;
        const params = func.parameters
          .map((p) => `${p.name}: ${p.type}`)
          .join(', ');
        return `${location}\n${func.async ? 'async ' : ''}function ${func.name}(${params}): ${func.returnType}`;
      }

      case 'class': {
        const cls = symbol as import('../types').ClassSymbol;
        return `${location}\nclass ${cls.name}${cls.extends ? ` extends ${cls.extends}` : ''}`;
      }

      case 'interface': {
        const iface = symbol as import('../types').InterfaceSymbol;
        return `${location}\ninterface ${iface.name}`;
      }

      case 'type': {
        const type = symbol as import('../types').TypeSymbol;
        return `${location}\ntype ${type.name} = ${type.definition}`;
      }

      case 'variable': {
        const variable = symbol as import('../types').VariableSymbol;
        return `${location}\n${variable.const ? 'const' : 'let'} ${variable.name}: ${variable.type}`;
      }

      case 'enum': {
        const enumSym = symbol as import('../types').EnumSymbol;
        return `${location}\nenum ${enumSym.name}`;
      }

      default: {
        // Fallback for any other symbol types
        const anySymbol = symbol as { name: string };
        return `${location}\n${anySymbol.name}`;
      }
    }
  }
}

/**
 * Create a context selector service
 */
export function createContextSelectorService(
  semanticIndex: ISemanticIndexService,
  fileSystem: IFileSystem,
  tokenBudget: ITokenBudgetService,
  projectRoot: FilePath,
  logger?: ILogger
): IContextSelectorService {
  return new ContextSelectorService(
    semanticIndex,
    fileSystem,
    tokenBudget,
    projectRoot,
    logger
  );
}
