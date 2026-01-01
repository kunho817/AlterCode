/**
 * Progressive Disclosure Service
 *
 * Generates multiple disclosure levels for files and symbols:
 * - Signature: Just exports and signatures
 * - Summary: Signatures + doc comments + structure
 * - Full: Complete content
 */

import {
  IProgressiveDisclosureService,
  IFileSystem,
  ITokenBudgetService,
  ISemanticIndexService,
  FileDisclosure,
  SymbolDisclosure,
  DisclosureLevel,
  DisclosureLevelContent,
  RelativePath,
  FilePath,
  TokenCount,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  toTokenCount,
} from '../types';

/**
 * Progressive Disclosure Service implementation
 */
export class ProgressiveDisclosureService implements IProgressiveDisclosureService {
  private readonly fileSystem: IFileSystem;
  private readonly tokenBudget: ITokenBudgetService;
  private readonly semanticIndex: ISemanticIndexService;
  private readonly projectRoot: FilePath;
  private readonly logger?: ILogger;

  // Cache for generated disclosures
  private readonly fileCache = new Map<string, FileDisclosure>();
  private readonly symbolCache = new Map<string, SymbolDisclosure>();

  constructor(
    fileSystem: IFileSystem,
    tokenBudget: ITokenBudgetService,
    semanticIndex: ISemanticIndexService,
    projectRoot: FilePath,
    logger?: ILogger
  ) {
    this.fileSystem = fileSystem;
    this.tokenBudget = tokenBudget;
    this.semanticIndex = semanticIndex;
    this.projectRoot = projectRoot;
    this.logger = logger?.child('ProgressiveDisclosureService');
  }

  async generateLevels(file: RelativePath): AsyncResult<FileDisclosure> {
    // Check cache
    const cacheKey = file as string;
    const cached = this.fileCache.get(cacheKey);
    if (cached) {
      return Ok(cached);
    }

    try {
      const fullPath = this.fileSystem.join(this.projectRoot as string, file as string);
      const content = await this.fileSystem.readFile(fullPath);

      // Generate signature level
      const signatureContent = this.generateSignatureLevel(content);
      const signatureTokens = this.tokenBudget.countTokens(signatureContent);

      // Generate summary level
      const summaryContent = this.generateSummaryLevel(content);
      const summaryTokens = this.tokenBudget.countTokens(summaryContent);

      // Full level
      const fullTokens = this.tokenBudget.countTokens(content);

      const disclosure: FileDisclosure = {
        path: file,
        levels: {
          signature: {
            level: 'signature',
            content: signatureContent,
            tokens: signatureTokens,
          },
          summary: {
            level: 'summary',
            content: summaryContent,
            tokens: summaryTokens,
          },
          full: {
            level: 'full',
            content,
            tokens: fullTokens,
          },
        },
        currentLevel: 'signature',
      };

      // Cache result
      this.fileCache.set(cacheKey, disclosure);

      this.logger?.debug('Generated file disclosure', {
        file,
        signatureTokens,
        summaryTokens,
        fullTokens,
      });

      return Ok(disclosure);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to generate disclosure: ${(error as Error).message}`)
      );
    }
  }

  async getAtLevel(file: RelativePath, level: DisclosureLevel): AsyncResult<string> {
    const disclosureResult = await this.generateLevels(file);
    if (!disclosureResult.ok) {
      return disclosureResult;
    }

    return Ok(disclosureResult.value.levels[level].content);
  }

  async generateSymbolLevels(name: string, file: RelativePath): AsyncResult<SymbolDisclosure> {
    const cacheKey = `${file}:${name}`;
    const cached = this.symbolCache.get(cacheKey);
    if (cached) {
      return Ok(cached);
    }

    try {
      // Find symbol in semantic index
      const symbols = this.semanticIndex.findSymbol(name);
      const symbol = symbols.find((s) => (s.location.file as string) === (file as string));

      if (!symbol) {
        return Err(new AppError('NOT_FOUND', `Symbol not found: ${name} in ${file}`));
      }

      // Generate levels based on symbol type
      const signatureContent = this.generateSymbolSignature(symbol);
      const summaryContent = this.generateSymbolSummary(symbol);
      const fullContent = await this.getSymbolFullContent(symbol, file);

      const disclosure: SymbolDisclosure = {
        name,
        file,
        levels: {
          signature: {
            level: 'signature',
            content: signatureContent,
            tokens: this.tokenBudget.countTokens(signatureContent),
          },
          summary: {
            level: 'summary',
            content: summaryContent,
            tokens: this.tokenBudget.countTokens(summaryContent),
          },
          full: {
            level: 'full',
            content: fullContent,
            tokens: this.tokenBudget.countTokens(fullContent),
          },
        },
        currentLevel: 'signature',
      };

      this.symbolCache.set(cacheKey, disclosure);

      return Ok(disclosure);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to generate symbol disclosure: ${(error as Error).message}`)
      );
    }
  }

  /**
   * Generate signature level content
   */
  private generateSignatureLevel(content: string): string {
    const lines = content.split('\n');
    const signatures: string[] = [];
    let inMultilineComment = false;
    let braceDepth = 0;
    let capturingSignature = false;
    let currentSignature: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Track multiline comments
      if (trimmed.includes('/*')) inMultilineComment = true;
      if (trimmed.includes('*/')) {
        inMultilineComment = false;
        continue;
      }
      if (inMultilineComment) continue;
      if (trimmed.startsWith('//')) continue;

      // Track braces for capturing signatures
      const openBraces = (trimmed.match(/{/g) || []).length;
      const closeBraces = (trimmed.match(/}/g) || []).length;

      if (capturingSignature) {
        currentSignature.push(line);
        braceDepth += openBraces - closeBraces;
        if (braceDepth <= 0) {
          capturingSignature = false;
          signatures.push(currentSignature.join('\n'));
          currentSignature = [];
          braceDepth = 0;
        }
        continue;
      }

      // Include imports
      if (trimmed.startsWith('import ')) {
        signatures.push(line);
        continue;
      }

      // Include export declarations
      if (trimmed.startsWith('export ')) {
        if (
          trimmed.includes('function') ||
          trimmed.includes('class') ||
          trimmed.includes('interface') ||
          trimmed.includes('type') ||
          trimmed.includes('const') ||
          trimmed.includes('enum')
        ) {
          // Just the declaration line
          if (trimmed.includes('{') && !trimmed.includes('}')) {
            // Multi-line declaration, just show first line + placeholder
            signatures.push(line);
            signatures.push('  // ...');
            signatures.push('}');
          } else {
            signatures.push(line);
          }
        } else if (trimmed.startsWith('export {') || trimmed.startsWith('export *')) {
          signatures.push(line);
        }
      }
    }

    return signatures.join('\n');
  }

  /**
   * Generate summary level content
   */
  private generateSummaryLevel(content: string): string {
    const lines = content.split('\n');
    const summary: string[] = [];
    let inMultilineComment = false;
    let lastWasJsDoc = false;
    let braceDepth = 0;
    let skipUntilBraceClose = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const trimmed = line.trim();

      // Track multiline comments (keep JSDoc)
      if (trimmed.startsWith('/**')) {
        inMultilineComment = true;
        lastWasJsDoc = true;
        summary.push(line);
        continue;
      }
      if (trimmed.includes('*/') && inMultilineComment) {
        inMultilineComment = false;
        summary.push(line);
        continue;
      }
      if (inMultilineComment) {
        summary.push(line);
        continue;
      }

      // Skip implementation bodies
      if (skipUntilBraceClose) {
        braceDepth += (trimmed.match(/{/g) || []).length;
        braceDepth -= (trimmed.match(/}/g) || []).length;
        if (braceDepth <= 0) {
          skipUntilBraceClose = false;
          summary.push('}');
        }
        continue;
      }

      // Include imports
      if (trimmed.startsWith('import ')) {
        summary.push(line);
        lastWasJsDoc = false;
        continue;
      }

      // Include exports with structure
      if (trimmed.startsWith('export ')) {
        summary.push(line);

        // Check if this starts a body we need to skip
        if (
          (trimmed.includes('function') || trimmed.includes('class')) &&
          trimmed.includes('{') &&
          !trimmed.includes('}')
        ) {
          braceDepth = 1;
          skipUntilBraceClose = true;
        }

        lastWasJsDoc = false;
        continue;
      }

      // Include non-exported declarations with JSDoc
      if (
        lastWasJsDoc &&
        (trimmed.startsWith('function') ||
          trimmed.startsWith('class') ||
          trimmed.startsWith('interface') ||
          trimmed.startsWith('type') ||
          trimmed.startsWith('const') ||
          trimmed.startsWith('async function'))
      ) {
        summary.push(line);
        if (trimmed.includes('{') && !trimmed.includes('}')) {
          braceDepth = 1;
          skipUntilBraceClose = true;
        }
      }

      lastWasJsDoc = false;
    }

    return summary.join('\n');
  }

  /**
   * Generate symbol signature
   */
  private generateSymbolSignature(symbol: import('../types').AnySymbol): string {
    switch (symbol.kind) {
      case 'function': {
        const func = symbol as import('../types').FunctionSymbol;
        const params = func.parameters
          .map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`)
          .join(', ');
        const async = func.async ? 'async ' : '';
        return `${async}function ${func.name}(${params}): ${func.returnType}`;
      }

      case 'class': {
        const cls = symbol as import('../types').ClassSymbol;
        const ext = cls.extends ? ` extends ${cls.extends}` : '';
        const impl = cls.implements.length > 0 ? ` implements ${cls.implements.join(', ')}` : '';
        return `class ${cls.name}${ext}${impl}`;
      }

      case 'interface': {
        const iface = symbol as import('../types').InterfaceSymbol;
        const ext = iface.extends.length > 0 ? ` extends ${iface.extends.join(', ')}` : '';
        return `interface ${iface.name}${ext}`;
      }

      case 'type': {
        const type = symbol as import('../types').TypeSymbol;
        return `type ${type.name} = ${type.definition}`;
      }

      case 'variable': {
        const variable = symbol as import('../types').VariableSymbol;
        const kw = variable.const ? 'const' : 'let';
        return `${kw} ${variable.name}: ${variable.type}`;
      }

      case 'enum': {
        const enumSym = symbol as import('../types').EnumSymbol;
        return `enum ${enumSym.name}`;
      }

      default: {
        // Fallback for any other symbol types
        const anySymbol = symbol as { name: string };
        return anySymbol.name;
      }
    }
  }

  /**
   * Generate symbol summary
   */
  private generateSymbolSummary(symbol: import('../types').AnySymbol): string {
    const lines: string[] = [];

    // Add documentation if available
    if (symbol.documentation) {
      lines.push(`/**`);
      lines.push(` * ${symbol.documentation}`);
      lines.push(` */`);
    }

    // Add signature
    lines.push(this.generateSymbolSignature(symbol));

    // Add structure for classes and interfaces
    if (symbol.kind === 'class') {
      const cls = symbol as import('../types').ClassSymbol;
      lines.push('{');
      for (const member of cls.members.slice(0, 10)) {
        const visibility = member.visibility === 'public' ? '' : `${member.visibility} `;
        const static_ = member.static ? 'static ' : '';
        if (member.kind === 'property') {
          lines.push(`  ${visibility}${static_}${member.name}: ${member.type};`);
        } else if (member.kind === 'method') {
          const params = member.parameters?.map((p) => `${p.name}: ${p.type}`).join(', ') ?? '';
          lines.push(`  ${visibility}${static_}${member.name}(${params}): ${member.returnType};`);
        }
      }
      if (cls.members.length > 10) {
        lines.push(`  // ... ${cls.members.length - 10} more members`);
      }
      lines.push('}');
    } else if (symbol.kind === 'interface') {
      const iface = symbol as import('../types').InterfaceSymbol;
      lines.push('{');
      for (const member of iface.members.slice(0, 10)) {
        const optional = member.optional ? '?' : '';
        if (member.kind === 'property') {
          lines.push(`  ${member.name}${optional}: ${member.type};`);
        } else if (member.kind === 'method') {
          const params = member.parameters?.map((p) => `${p.name}: ${p.type}`).join(', ') ?? '';
          lines.push(`  ${member.name}${optional}(${params}): ${member.type};`);
        }
      }
      if (iface.members.length > 10) {
        lines.push(`  // ... ${iface.members.length - 10} more members`);
      }
      lines.push('}');
    } else if (symbol.kind === 'enum') {
      const enumSym = symbol as import('../types').EnumSymbol;
      lines.push('{');
      for (const member of enumSym.members.slice(0, 10)) {
        lines.push(`  ${member.name} = ${member.value},`);
      }
      if (enumSym.members.length > 10) {
        lines.push(`  // ... ${enumSym.members.length - 10} more members`);
      }
      lines.push('}');
    }

    return lines.join('\n');
  }

  /**
   * Get full symbol content from file
   */
  private async getSymbolFullContent(
    symbol: import('../types').AnySymbol,
    file: RelativePath
  ): Promise<string> {
    try {
      const fullPath = this.fileSystem.join(this.projectRoot as string, file as string);
      const content = await this.fileSystem.readFile(fullPath);
      const lines = content.split('\n');

      // Extract from start line to end line
      const startLine = (symbol.location.line as number) - 1;
      const endLine = (symbol.location.endLine as number) ?? startLine + 50;

      return lines.slice(startLine, endLine).join('\n');
    } catch {
      return this.generateSymbolSummary(symbol);
    }
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.fileCache.clear();
    this.symbolCache.clear();
  }
}

/**
 * Create a progressive disclosure service
 */
export function createProgressiveDisclosureService(
  fileSystem: IFileSystem,
  tokenBudget: ITokenBudgetService,
  semanticIndex: ISemanticIndexService,
  projectRoot: FilePath,
  logger?: ILogger
): IProgressiveDisclosureService {
  return new ProgressiveDisclosureService(
    fileSystem,
    tokenBudget,
    semanticIndex,
    projectRoot,
    logger
  );
}
