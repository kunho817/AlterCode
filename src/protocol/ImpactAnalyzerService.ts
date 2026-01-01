/**
 * Impact Analyzer Service
 *
 * Analyzes potential impact of proposed changes:
 * - Dependency graph analysis
 * - Affected file detection
 * - Risk assessment
 * - Change propagation prediction
 */

import {
  IImpactAnalyzerService,
  ISemanticIndexService,
  IFileSystem,
  ExtendedImpactAnalysis,
  FileChange,
  AffectedFile,
  ImpactScope,
  FilePath,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  RelativePath,
} from '../types';

/** Impact propagation depth limit */
const MAX_PROPAGATION_DEPTH = 5;

/**
 * Impact Analyzer Service implementation
 */
export class ImpactAnalyzerService implements IImpactAnalyzerService {
  private readonly semanticIndex: ISemanticIndexService;
  private readonly fileSystem: IFileSystem;
  private readonly projectRoot: FilePath;
  private readonly logger?: ILogger;

  constructor(
    semanticIndex: ISemanticIndexService,
    fileSystem: IFileSystem,
    projectRoot: FilePath,
    logger?: ILogger
  ) {
    this.semanticIndex = semanticIndex;
    this.fileSystem = fileSystem;
    this.projectRoot = projectRoot;
    this.logger = logger?.child('ImpactAnalyzerService');
  }

  async analyze(changes: FileChange[]): AsyncResult<ExtendedImpactAnalysis> {
    const startTime = Date.now();

    this.logger?.info('Analyzing impact', { changeCount: changes.length });

    try {
      const directlyAffected: AffectedFile[] = [];
      const indirectlyAffected: AffectedFile[] = [];
      const symbolChanges: Map<string, string[]> = new Map();

      // Analyze each change
      for (const change of changes) {
        const path = change.path as string;
        const relativePath = this.getRelativePath(path);

        // Direct impact
        directlyAffected.push({
          path,
          reason: `Directly ${change.type}d`,
          impactLevel: this.getDirectImpactLevel(change),
        });

        // Analyze content changes for symbol modifications
        if (change.content && (change.type === 'write' || change.type === 'create')) {
          const symbols = await this.extractModifiedSymbols(
            path,
            change.originalContent,
            change.content
          );
          if (symbols.length > 0) {
            symbolChanges.set(path, symbols);
          }
        }

        // Find files that import this one
        const dependents = this.findDependents(relativePath);
        for (const dep of dependents) {
          if (!directlyAffected.some((a) => a.path === dep)) {
            indirectlyAffected.push({
              path: dep,
              reason: `Imports ${path}`,
              impactLevel: 'medium',
            });
          }
        }
      }

      // Propagate impact through dependency graph
      const propagated = await this.propagateImpact(
        indirectlyAffected.map((a) => a.path),
        new Set(directlyAffected.map((a) => a.path))
      );

      for (const prop of propagated) {
        if (
          !directlyAffected.some((a) => a.path === prop.path) &&
          !indirectlyAffected.some((a) => a.path === prop.path)
        ) {
          indirectlyAffected.push(prop);
        }
      }

      // Calculate scope
      const scope = this.calculateScope(directlyAffected, indirectlyAffected);

      // Calculate risk score
      const riskScore = this.calculateRiskScore(changes, directlyAffected, indirectlyAffected);

      // Generate summary
      const summary = this.generateSummary(
        changes,
        directlyAffected,
        indirectlyAffected,
        scope
      );

      const analysis: ExtendedImpactAnalysis = {
        directlyAffected,
        indirectlyAffected,
        scope,
        riskScore,
        symbolChanges: Object.fromEntries(symbolChanges),
        summary,
        duration: Date.now() - startTime,
      };

      this.logger?.info('Impact analysis complete', {
        directCount: directlyAffected.length,
        indirectCount: indirectlyAffected.length,
        scope,
        riskScore,
        duration: analysis.duration,
      });

      return Ok(analysis);
    } catch (error) {
      this.logger?.error('Impact analysis failed', error as Error);
      return Err(
        new AppError('IMPACT', `Impact analysis failed: ${(error as Error).message}`)
      );
    }
  }

  getAffectedFiles(changes: FileChange[]): string[] {
    const affected = new Set<string>();

    for (const change of changes) {
      const path = change.path as string;
      affected.add(path);

      const relativePath = this.getRelativePath(path);
      const dependents = this.findDependents(relativePath);
      for (const dep of dependents) {
        affected.add(dep);
      }
    }

    return Array.from(affected);
  }

  estimateScope(changes: FileChange[]): ImpactScope {
    const affectedCount = this.getAffectedFiles(changes).length;

    if (affectedCount <= 1) return 'file';
    if (affectedCount <= 5) return 'module';
    if (affectedCount <= 20) return 'feature';
    return 'system';
  }

  /**
   * Find files that depend on a given file
   */
  private findDependents(filePath: RelativePath): string[] {
    const dependents: string[] = [];

    // Search for imports of this file
    const searchResults = this.semanticIndex.search(filePath as string, {
      kinds: ['module'],
      limit: 100,
    });

    for (const result of searchResults) {
      const importerPath = result.symbol.location.file as string;
      if (importerPath !== filePath) {
        dependents.push(importerPath);
      }
    }

    return dependents;
  }

  /**
   * Propagate impact through dependency graph
   */
  private async propagateImpact(
    startFiles: string[],
    seen: Set<string>,
    depth: number = 0
  ): Promise<AffectedFile[]> {
    if (depth >= MAX_PROPAGATION_DEPTH) {
      return [];
    }

    const affected: AffectedFile[] = [];

    for (const file of startFiles) {
      if (seen.has(file)) continue;
      seen.add(file);

      const relativePath = this.getRelativePath(file);
      const dependents = this.findDependents(relativePath);

      for (const dep of dependents) {
        if (!seen.has(dep)) {
          affected.push({
            path: dep,
            reason: `Transitively affected (depth ${depth + 1})`,
            impactLevel: depth < 2 ? 'low' : 'minimal',
          });
        }
      }

      // Recursive propagation
      if (dependents.length > 0) {
        const nested = await this.propagateImpact(dependents, seen, depth + 1);
        affected.push(...nested);
      }
    }

    return affected;
  }

  /**
   * Extract symbols that changed between old and new content
   */
  private async extractModifiedSymbols(
    path: string,
    oldContent: string | undefined,
    newContent: string
  ): Promise<string[]> {
    const modifiedSymbols: string[] = [];

    // Get symbols from old content
    const oldSymbols = oldContent
      ? this.extractSymbolNames(oldContent)
      : new Set<string>();

    // Get symbols from new content
    const newSymbols = this.extractSymbolNames(newContent);

    // Find added symbols
    for (const sym of newSymbols) {
      if (!oldSymbols.has(sym)) {
        modifiedSymbols.push(`+${sym}`);
      }
    }

    // Find removed symbols
    for (const sym of oldSymbols) {
      if (!newSymbols.has(sym)) {
        modifiedSymbols.push(`-${sym}`);
      }
    }

    return modifiedSymbols;
  }

  /**
   * Extract symbol names from content (simplified)
   */
  private extractSymbolNames(content: string): Set<string> {
    const symbols = new Set<string>();

    // Functions
    const funcMatches = content.matchAll(/(?:function|const|let|var)\s+(\w+)/g);
    for (const match of funcMatches) {
      if (match[1]) symbols.add(match[1]);
    }

    // Classes
    const classMatches = content.matchAll(/class\s+(\w+)/g);
    for (const match of classMatches) {
      if (match[1]) symbols.add(match[1]);
    }

    // Interfaces/types
    const typeMatches = content.matchAll(/(?:interface|type)\s+(\w+)/g);
    for (const match of typeMatches) {
      if (match[1]) symbols.add(match[1]);
    }

    // Exports
    const exportMatches = content.matchAll(/export\s+(?:const|let|function|class|interface|type)\s+(\w+)/g);
    for (const match of exportMatches) {
      if (match[1]) symbols.add(match[1]);
    }

    return symbols;
  }

  /**
   * Get direct impact level for a change
   */
  private getDirectImpactLevel(change: FileChange): AffectedFile['impactLevel'] {
    switch (change.type) {
      case 'delete':
        return 'critical';
      case 'create':
        return 'high';
      case 'write':
        // Estimate based on content size difference
        if (change.originalContent && change.content) {
          const sizeDiff = Math.abs(
            change.content.length - change.originalContent.length
          );
          const percentChange = sizeDiff / Math.max(change.originalContent.length, 1);

          if (percentChange > 0.5) return 'high';
          if (percentChange > 0.2) return 'medium';
          return 'low';
        }
        return 'medium';
      default:
        return 'medium';
    }
  }

  /**
   * Calculate overall scope
   */
  private calculateScope(
    direct: AffectedFile[],
    indirect: AffectedFile[]
  ): ImpactScope {
    const totalAffected = direct.length + indirect.length;

    // Check for critical files
    const hasCritical = direct.some((a) => a.impactLevel === 'critical');
    if (hasCritical) return 'system';

    if (totalAffected <= 1) return 'file';
    if (totalAffected <= 5) return 'module';
    if (totalAffected <= 20) return 'feature';
    return 'system';
  }

  /**
   * Calculate risk score (0-100)
   */
  private calculateRiskScore(
    changes: FileChange[],
    direct: AffectedFile[],
    indirect: AffectedFile[]
  ): number {
    let score = 0;

    // Base score from change types
    for (const change of changes) {
      switch (change.type) {
        case 'delete':
          score += 20;
          break;
        case 'create':
          score += 5;
          break;
        case 'write':
          score += 10;
          break;
      }
    }

    // Score from impact levels
    for (const affected of [...direct, ...indirect]) {
      switch (affected.impactLevel) {
        case 'critical':
          score += 15;
          break;
        case 'high':
          score += 10;
          break;
        case 'medium':
          score += 5;
          break;
        case 'low':
          score += 2;
          break;
        case 'minimal':
          score += 1;
          break;
      }
    }

    // Score from propagation
    score += Math.min(indirect.length * 2, 20);

    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Generate analysis summary
   */
  private generateSummary(
    changes: FileChange[],
    direct: AffectedFile[],
    indirect: AffectedFile[],
    scope: ImpactScope
  ): string {
    const parts: string[] = [];

    // Change summary
    const creates = changes.filter((c) => c.type === 'create').length;
    const writes = changes.filter((c) => c.type === 'write').length;
    const deletes = changes.filter((c) => c.type === 'delete').length;

    const changeParts: string[] = [];
    if (creates > 0) changeParts.push(`${creates} created`);
    if (writes > 0) changeParts.push(`${writes} modified`);
    if (deletes > 0) changeParts.push(`${deletes} deleted`);

    parts.push(`Changes: ${changeParts.join(', ')}`);

    // Impact summary
    parts.push(`Impact: ${direct.length} direct, ${indirect.length} indirect files affected`);

    // Scope
    parts.push(`Scope: ${scope}`);

    // Warnings
    const criticalCount = [...direct, ...indirect].filter(
      (a) => a.impactLevel === 'critical'
    ).length;
    if (criticalCount > 0) {
      parts.push(`⚠️ ${criticalCount} critical impact(s) detected`);
    }

    return parts.join('\n');
  }

  /**
   * Get relative path from absolute
   */
  private getRelativePath(absolutePath: string): RelativePath {
    return this.fileSystem.relative(
      this.projectRoot,
      absolutePath as FilePath
    );
  }

  /**
   * Analyze changes to specific symbols
   */
  async analyzeSymbolChange(
    symbolName: string,
    changeType: 'rename' | 'delete' | 'modify'
  ): AsyncResult<AffectedFile[]> {
    const affected: AffectedFile[] = [];

    // Find all references to the symbol
    const refs = this.semanticIndex.findSymbol(symbolName);

    for (const ref of refs) {
      const filePath = ref.location.file as string;

      affected.push({
        path: filePath,
        reason: `References ${symbolName}`,
        impactLevel: changeType === 'delete' ? 'high' : 'medium',
      });

      // Also find files that import from the file containing this symbol
      const dependents = this.findDependents(filePath as RelativePath);
      for (const dep of dependents) {
        if (!affected.some((a) => a.path === dep)) {
          affected.push({
            path: dep,
            reason: `Imports from file containing ${symbolName}`,
            impactLevel: 'low',
          });
        }
      }
    }

    return Ok(affected);
  }

  /**
   * Get dependency graph for visualization
   */
  getDependencyGraph(rootFiles: string[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    const visited = new Set<string>();

    const traverse = (file: string, depth: number) => {
      if (visited.has(file) || depth > MAX_PROPAGATION_DEPTH) return;
      visited.add(file);

      const relativePath = this.getRelativePath(file);
      const dependents = this.findDependents(relativePath);

      graph.set(file, dependents);

      for (const dep of dependents) {
        traverse(dep, depth + 1);
      }
    };

    for (const root of rootFiles) {
      traverse(root, 0);
    }

    return graph;
  }
}

/**
 * Create an impact analyzer service
 */
export function createImpactAnalyzerService(
  semanticIndex: ISemanticIndexService,
  fileSystem: IFileSystem,
  projectRoot: FilePath,
  logger?: ILogger
): IImpactAnalyzerService {
  return new ImpactAnalyzerService(semanticIndex, fileSystem, projectRoot, logger);
}
