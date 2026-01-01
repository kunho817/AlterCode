/**
 * Symbol Resolver Service
 *
 * Resolves symbol references against the semantic index:
 * - Symbol existence verification
 * - Type-aware resolution
 * - Similar symbol suggestions
 */

import {
  ISymbolResolverService,
  ISemanticIndexService,
  SymbolResolutionRequest,
  SymbolResolutionResult,
  SymbolReference,
  SymbolSuggestion,
  SymbolKind,
  AnySymbol,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
} from '../types';

/** Similarity threshold for suggestions */
const SUGGESTION_THRESHOLD = 0.5;

/** Maximum suggestions per symbol */
const MAX_SUGGESTIONS = 5;

/**
 * Symbol Resolver Service implementation
 */
export class SymbolResolverService implements ISymbolResolverService {
  private readonly semanticIndex: ISemanticIndexService;
  private readonly logger?: ILogger;

  constructor(semanticIndex: ISemanticIndexService, logger?: ILogger) {
    this.semanticIndex = semanticIndex;
    this.logger = logger?.child('SymbolResolverService');
  }

  async resolve(request: SymbolResolutionRequest): AsyncResult<SymbolResolutionResult[]> {
    try {
      this.logger?.info('Resolving symbols', { count: request.symbols.length });

      const results: SymbolResolutionResult[] = [];

      for (const reference of request.symbols) {
        const result = this.resolveSymbol(reference, request.contextFile);
        results.push(result);
      }

      const resolvedCount = results.filter((r) => r.resolved).length;
      this.logger?.info('Resolution complete', {
        total: results.length,
        resolved: resolvedCount,
        unresolved: results.length - resolvedCount,
      });

      return Ok(results);
    } catch (error) {
      this.logger?.error('Resolution failed', error as Error);
      return Err(
        new AppError('VERIFICATION', `Symbol resolution failed: ${(error as Error).message}`)
      );
    }
  }

  exists(name: string, kind?: SymbolKind): boolean {
    const symbols = this.semanticIndex.findSymbol(name, kind);
    return symbols.length > 0;
  }

  suggest(name: string): SymbolSuggestion[] {
    const suggestions: SymbolSuggestion[] = [];
    const nameLower = name.toLowerCase();

    // Search for similar symbols
    const searchResults = this.semanticIndex.search(name, { limit: 20 });

    for (const result of searchResults) {
      const similarity = this.calculateSimilarity(nameLower, result.symbol.name.toLowerCase());

      if (similarity >= SUGGESTION_THRESHOLD) {
        suggestions.push({
          name: result.symbol.name,
          kind: result.symbol.kind,
          location: result.symbol.location,
          similarity,
          reason: this.getSuggestionReason(name, result.symbol),
        });
      }
    }

    // Sort by similarity and return top suggestions
    return suggestions
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_SUGGESTIONS);
  }

  /**
   * Resolve a single symbol reference
   */
  private resolveSymbol(reference: SymbolReference, contextFile?: string): SymbolResolutionResult {
    const { name, kind, module } = reference;

    // Try to find the symbol
    let symbols = this.semanticIndex.findSymbol(name, kind);

    // Filter by module if specified
    if (module && symbols.length > 0) {
      symbols = symbols.filter((s) => {
        const filePath = s.location.file as string;
        return filePath.includes(module) || filePath.endsWith(module);
      });
    }

    // If still not found, try with context file
    if (symbols.length === 0 && contextFile) {
      // Check if it's an import from the context file
      const imports = this.semanticIndex.getImports(contextFile as import('../types').RelativePath);
      for (const imp of imports) {
        for (const spec of imp.specifiers) {
          if (spec.local === name || spec.imported === name) {
            // Try to resolve from the import source
            const importedSymbols = this.semanticIndex.findSymbol(spec.imported, kind);
            if (importedSymbols.length > 0) {
              symbols = importedSymbols;
              break;
            }
          }
        }
        if (symbols.length > 0) break;
      }
    }

    if (symbols.length === 0) {
      // Not found, provide suggestions
      const suggestions = this.suggest(name);

      return {
        reference,
        resolved: false,
        error: `Symbol not found: ${name}${kind ? ` (${kind})` : ''}`,
        suggestions,
      };
    }

    // Found - return the best match
    const bestMatch = this.selectBestMatch(symbols, reference, contextFile);

    if (!bestMatch) {
      return {
        reference,
        resolved: false,
        suggestions: this.findSimilarSymbols(reference.name),
      };
    }

    return {
      reference,
      resolved: true,
      symbol: bestMatch,
      location: bestMatch.location,
    };
  }

  /**
   * Select the best matching symbol from candidates
   */
  private selectBestMatch(
    symbols: AnySymbol[],
    reference: SymbolReference,
    contextFile?: string
  ): AnySymbol | null {
    if (symbols.length === 0) {
      return null;
    }
    if (symbols.length === 1) {
      return symbols[0] ?? null;
    }

    // Score each symbol
    const scored = symbols.map((symbol) => ({
      symbol,
      score: this.scoreMatch(symbol, reference, contextFile),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored[0]?.symbol ?? null;
  }

  /**
   * Score how well a symbol matches a reference
   */
  private scoreMatch(symbol: AnySymbol, reference: SymbolReference, contextFile?: string): number {
    let score = 0;

    // Exact name match
    if (symbol.name === reference.name) {
      score += 10;
    }

    // Kind match
    if (reference.kind && symbol.kind === reference.kind) {
      score += 5;
    }

    // Module match
    if (reference.module) {
      const filePath = symbol.location.file as string;
      if (filePath.includes(reference.module)) {
        score += 3;
      }
    }

    // Context file proximity
    if (contextFile) {
      const symbolFile = symbol.location.file as string;
      if (symbolFile === contextFile) {
        score += 4; // Same file
      } else if (this.isSameDirectory(symbolFile, contextFile)) {
        score += 2; // Same directory
      }
    }

    // Exported symbols are preferred
    if (symbol.exported) {
      score += 1;
    }

    return score;
  }

  /**
   * Check if two paths are in the same directory
   */
  private isSameDirectory(path1: string, path2: string): boolean {
    const dir1 = path1.substring(0, path1.lastIndexOf('/'));
    const dir2 = path2.substring(0, path2.lastIndexOf('/'));
    return dir1 === dir2;
  }

  /**
   * Get reason for suggestion
   */
  private getSuggestionReason(query: string, symbol: AnySymbol): string {
    const queryLower = query.toLowerCase();
    const nameLower = symbol.name.toLowerCase();

    // Case mismatch
    if (queryLower === nameLower && query !== symbol.name) {
      return 'Case mismatch';
    }

    // Prefix match
    if (nameLower.startsWith(queryLower)) {
      return 'Prefix match';
    }

    // Suffix match
    if (nameLower.endsWith(queryLower)) {
      return 'Suffix match';
    }

    // Contains
    if (nameLower.includes(queryLower)) {
      return 'Contains query';
    }

    // Typo correction
    return 'Similar spelling';
  }

  /**
   * Calculate string similarity
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Jaro-Winkler similarity
    const matchWindow = Math.floor(Math.max(a.length, b.length) / 2) - 1;
    const aMatches: boolean[] = new Array(a.length).fill(false);
    const bMatches: boolean[] = new Array(b.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matches
    for (let i = 0; i < a.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, b.length);

      for (let j = start; j < end; j++) {
        if (bMatches[j] || a[i] !== b[j]) continue;
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    // Count transpositions
    let k = 0;
    for (let i = 0; i < a.length; i++) {
      if (!aMatches[i]) continue;
      while (!bMatches[k]) k++;
      if (a[i] !== b[k]) transpositions++;
      k++;
    }

    const jaro =
      (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;

    // Winkler modification - boost for common prefix
    let prefixLength = 0;
    for (let i = 0; i < Math.min(4, Math.min(a.length, b.length)); i++) {
      if (a[i] === b[i]) prefixLength++;
      else break;
    }

    return jaro + prefixLength * 0.1 * (1 - jaro);
  }

  /**
   * Resolve a type reference
   */
  resolveType(typeName: string): AnySymbol | null {
    // Try interface first
    const interfaces = this.semanticIndex.findSymbol(typeName, 'interface');
    if (interfaces.length > 0) return interfaces[0] ?? null;

    // Then type alias
    const types = this.semanticIndex.findSymbol(typeName, 'type');
    if (types.length > 0) return types[0] ?? null;

    // Then class
    const classes = this.semanticIndex.findSymbol(typeName, 'class');
    if (classes.length > 0) return classes[0] ?? null;

    // Then enum
    const enums = this.semanticIndex.findSymbol(typeName, 'enum');
    if (enums.length > 0) return enums[0] ?? null;

    return null;
  }

  /**
   * Resolve a function reference
   */
  resolveFunction(funcName: string, module?: string): AnySymbol | null {
    let functions = this.semanticIndex.findSymbol(funcName, 'function');

    if (module && functions.length > 0) {
      functions = functions.filter((f) => (f.location.file as string).includes(module));
    }

    return functions[0] ?? null;
  }

  /**
   * Get all symbols of a kind
   */
  getAllOfKind(kind: SymbolKind): AnySymbol[] {
    return this.semanticIndex.search('', { kinds: [kind], limit: 1000 }).map((r) => r.symbol);
  }

  /**
   * Find similar symbols by name (for suggestions)
   */
  private findSimilarSymbols(name: string): SymbolSuggestion[] {
    const results = this.semanticIndex.search(name, { limit: 5 });
    return results.map((r) => ({
      name: r.symbol.name,
      kind: r.symbol.kind,
      location: r.symbol.location,
      similarity: r.score,
      reason: this.getSuggestionReason(name, r.symbol),
    }));
  }
}

/**
 * Create a symbol resolver service
 */
export function createSymbolResolverService(
  semanticIndex: ISemanticIndexService,
  logger?: ILogger
): ISymbolResolverService {
  return new SymbolResolverService(semanticIndex, logger);
}
