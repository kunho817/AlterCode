/**
 * Semantic Index Service
 *
 * Parses TypeScript/JavaScript files to extract:
 * - Symbol definitions (functions, classes, interfaces, types)
 * - Import/export relationships
 * - Call graphs and inheritance hierarchies
 */

import * as ts from 'typescript';
import {
  ISemanticIndexService,
  SemanticIndex,
  SymbolTable,
  AnySymbol,
  FunctionSymbol,
  ClassSymbol,
  InterfaceSymbol,
  TypeSymbol,
  VariableSymbol,
  EnumSymbol,
  ClassMember,
  InterfaceMember,
  EnumMember,
  ParameterInfo,
  ImportInfo,
  ImportSpecifier,
  ExportInfo,
  SymbolKind,
  SearchOptions,
  SearchResult,
  TextMatch,
  SourceLocation,
  IFileSystem,
  ILogger,
  IKnowledgeStore,
  FilePath,
  RelativePath,
  AsyncResult,
  Ok,
  Err,
  AppError,
  createSourceLocation,
  toRelativePath,
  toLineNumber,
  toColumnNumber,
} from '../types';

/** File extensions to parse */
const PARSEABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Semantic Index Service implementation
 */
export class SemanticIndexService implements ISemanticIndexService {
  private readonly fileSystem: IFileSystem;
  private readonly store: IKnowledgeStore;
  private readonly projectRoot: FilePath;
  private readonly logger?: ILogger;
  private _index: SemanticIndex | null = null;

  constructor(
    fileSystem: IFileSystem,
    store: IKnowledgeStore,
    projectRoot: FilePath,
    logger?: ILogger
  ) {
    this.fileSystem = fileSystem;
    this.store = store;
    this.projectRoot = projectRoot;
    this.logger = logger?.child('SemanticIndexService');
  }

  async index(_projectRoot: string): AsyncResult<SemanticIndex> {
    // Delegate to buildIndex which uses the configured projectRoot
    return this.buildIndex();
  }

  async buildIndex(): AsyncResult<SemanticIndex> {
    try {
      this.logger?.info('Building semantic index');
      const startTime = Date.now();

      // Find all source files
      const files = await this.findSourceFiles();
      this.logger?.debug('Found source files', { count: files.length });

      // Initialize empty index
      const symbols: SymbolTable = {
        functions: new Map(),
        classes: new Map(),
        interfaces: new Map(),
        types: new Map(),
        variables: new Map(),
        enums: new Map(),
      };

      const fileSymbols = new Map<RelativePath, AnySymbol[]>();
      const fileImports = new Map<RelativePath, ImportInfo[]>();
      const fileExports = new Map<RelativePath, ExportInfo[]>();
      const imports = new Map<RelativePath, RelativePath[]>();
      const exports = new Map<RelativePath, RelativePath[]>();
      const calls = new Map<string, string[]>();
      const inheritance = new Map<string, string[]>();

      // Parse each file
      for (const file of files) {
        try {
          const result = await this.parseFile(file);
          if (result) {
            // Add to file-specific maps
            fileSymbols.set(file, result.symbols);
            fileImports.set(file, result.imports);
            fileExports.set(file, result.exports);

            // Add to symbol tables
            for (const symbol of result.symbols) {
              this.addToSymbolTable(symbols, symbol);
            }

            // Build import graph
            const importedFiles = result.imports
              .map((imp) => this.resolveImportPath(file, imp.source))
              .filter((p): p is RelativePath => p !== null);
            if (importedFiles.length > 0) {
              imports.set(file, importedFiles);
            }
          }
        } catch (error) {
          this.logger?.warn('Failed to parse file', { file, error });
        }
      }

      const index: SemanticIndex = {
        version: 1,
        lastUpdated: new Date(),
        symbols,
        fileSymbols,
        fileImports,
        fileExports,
        imports,
        exports,
        calls,
        inheritance,
      };

      // Save to store
      const saveResult = await this.store.saveIndex(index);
      if (!saveResult.ok) {
        this.logger?.warn('Failed to save index to store');
      }

      this._index = index;

      const duration = Date.now() - startTime;
      this.logger?.info('Semantic index built', {
        files: files.length,
        functions: symbols.functions.size,
        classes: symbols.classes.size,
        interfaces: symbols.interfaces.size,
        duration,
      });

      return Ok(index);
    } catch (error) {
      this.logger?.error('Failed to build index', error as Error);
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to build index: ${(error as Error).message}`)
      );
    }
  }

  async updateFile(path: RelativePath): AsyncResult<void> {
    if (!this._index) {
      return Err(new AppError('INFRASTRUCTURE', 'Index not built'));
    }

    try {
      const result = await this.parseFile(path);
      if (result) {
        // Remove old symbols
        await this.removeFile(path);

        // Add new symbols
        this._index.fileSymbols.set(path, result.symbols);
        this._index.fileImports.set(path, result.imports);
        this._index.fileExports.set(path, result.exports);

        for (const symbol of result.symbols) {
          this.addToSymbolTable(this._index.symbols, symbol);
        }
      }

      return Ok(undefined);
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to update file: ${(error as Error).message}`)
      );
    }
  }

  async removeFile(path: RelativePath): AsyncResult<void> {
    if (!this._index) {
      return Ok(undefined);
    }

    // Remove from file maps
    const oldSymbols = this._index.fileSymbols.get(path) ?? [];
    this._index.fileSymbols.delete(path);
    this._index.fileImports.delete(path);
    this._index.fileExports.delete(path);

    // Remove from symbol tables
    for (const symbol of oldSymbols) {
      this.removeFromSymbolTable(this._index.symbols, symbol);
    }

    return Ok(undefined);
  }

  findSymbol(name: string, kind?: SymbolKind): AnySymbol[] {
    if (!this._index) return [];

    const results: AnySymbol[] = [];
    const { symbols } = this._index;

    if (!kind || kind === 'function') {
      const funcs = symbols.functions.get(name);
      if (funcs) results.push(...funcs);
    }

    if (!kind || kind === 'class') {
      const classes = symbols.classes.get(name);
      if (classes) results.push(...classes);
    }

    if (!kind || kind === 'interface') {
      const interfaces = symbols.interfaces.get(name);
      if (interfaces) results.push(...interfaces);
    }

    if (!kind || kind === 'type') {
      const types = symbols.types.get(name);
      if (types) results.push(...types);
    }

    if (!kind || kind === 'variable') {
      const vars = symbols.variables.get(name);
      if (vars) results.push(...vars);
    }

    if (!kind || kind === 'enum') {
      const enums = symbols.enums.get(name);
      if (enums) results.push(...enums);
    }

    return results;
  }

  findSymbolsInFile(path: RelativePath): AnySymbol[] {
    if (!this._index) return [];
    return this._index.fileSymbols.get(path) ?? [];
  }

  getImports(path: RelativePath): ImportInfo[] {
    if (!this._index) return [];
    return this._index.fileImports.get(path) ?? [];
  }

  getExports(path: RelativePath): ExportInfo[] {
    if (!this._index) return [];
    return this._index.fileExports.get(path) ?? [];
  }

  getCallers(symbol: string): SourceLocation[] {
    // TODO: Implement call graph analysis
    return [];
  }

  getCallees(symbol: string): string[] {
    if (!this._index) return [];
    return this._index.calls.get(symbol) ?? [];
  }

  search(query: string, options?: SearchOptions): SearchResult[] {
    if (!this._index) return [];

    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();
    const limit = options?.limit ?? 50;

    // Search through all symbol tables
    const searchTable = <T extends AnySymbol>(
      table: Map<string, T[]>,
      kind: SymbolKind
    ): void => {
      if (options?.kinds && !options.kinds.includes(kind)) {
        return;
      }

      for (const [name, symbols] of table) {
        const nameLower = name.toLowerCase();

        // Calculate match score
        let score = 0;
        const matches: TextMatch[] = [];

        if (nameLower === queryLower) {
          score = 100; // Exact match
          matches.push({ text: name, start: 0, end: name.length });
        } else if (nameLower.startsWith(queryLower)) {
          score = 80; // Prefix match
          matches.push({ text: name.substring(0, query.length), start: 0, end: query.length });
        } else if (nameLower.includes(queryLower)) {
          score = 60; // Contains match
          const idx = nameLower.indexOf(queryLower);
          matches.push({ text: name.substring(idx, idx + query.length), start: idx, end: idx + query.length });
        } else {
          continue;
        }

        for (const symbol of symbols) {
          // Apply filters
          if (options?.exported !== undefined && symbol.exported !== options.exported) {
            continue;
          }

          if (options?.files) {
            const filePath = symbol.location.file as string;
            const pattern = new RegExp(options.files.replace(/\*/g, '.*'));
            if (!pattern.test(filePath)) {
              continue;
            }
          }

          results.push({ symbol, score, matches });

          if (results.length >= limit) {
            return;
          }
        }
      }
    };

    searchTable(this._index.symbols.functions, 'function');
    searchTable(this._index.symbols.classes, 'class');
    searchTable(this._index.symbols.interfaces, 'interface');
    searchTable(this._index.symbols.types, 'type');
    searchTable(this._index.symbols.variables, 'variable');
    searchTable(this._index.symbols.enums, 'enum');

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * Find all source files in the project
   */
  private async findSourceFiles(): Promise<RelativePath[]> {
    const pattern = `**/*{${PARSEABLE_EXTENSIONS.join(',')}}`;
    const files = await this.fileSystem.glob(pattern, this.projectRoot);

    // Filter out test files and node_modules
    return files.filter((f) => {
      const path = f as string;
      return (
        !path.includes('node_modules') &&
        !path.includes('.d.ts') &&
        !path.includes('.test.') &&
        !path.includes('.spec.')
      );
    });
  }

  /**
   * Parse a single file and extract symbols
   */
  private async parseFile(
    relativePath: RelativePath
  ): Promise<{
    symbols: AnySymbol[];
    imports: ImportInfo[];
    exports: ExportInfo[];
  } | null> {
    const fullPath = this.fileSystem.join(this.projectRoot as string, relativePath as string);

    if (!(await this.fileSystem.exists(fullPath))) {
      return null;
    }

    const content = await this.fileSystem.readFile(fullPath);
    const sourceFile = ts.createSourceFile(
      relativePath as string,
      content,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(relativePath)
    );

    const symbols: AnySymbol[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];

    const visit = (node: ts.Node): void => {
      // Extract imports
      if (ts.isImportDeclaration(node)) {
        const importInfo = this.extractImport(node, sourceFile, relativePath);
        if (importInfo) imports.push(importInfo);
      }

      // Extract exports
      if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
        const exportInfo = this.extractExport(node, sourceFile, relativePath);
        if (exportInfo) exports.push(exportInfo);
      }

      // Extract function declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        const func = this.extractFunction(node, sourceFile, relativePath);
        if (func) symbols.push(func);
      }

      // Extract class declarations
      if (ts.isClassDeclaration(node) && node.name) {
        const cls = this.extractClass(node, sourceFile, relativePath);
        if (cls) symbols.push(cls);
      }

      // Extract interface declarations
      if (ts.isInterfaceDeclaration(node)) {
        const iface = this.extractInterface(node, sourceFile, relativePath);
        if (iface) symbols.push(iface);
      }

      // Extract type aliases
      if (ts.isTypeAliasDeclaration(node)) {
        const type = this.extractType(node, sourceFile, relativePath);
        if (type) symbols.push(type);
      }

      // Extract variable declarations
      if (ts.isVariableStatement(node)) {
        const vars = this.extractVariables(node, sourceFile, relativePath);
        symbols.push(...vars);
      }

      // Extract enum declarations
      if (ts.isEnumDeclaration(node)) {
        const enumSymbol = this.extractEnum(node, sourceFile, relativePath);
        if (enumSymbol) symbols.push(enumSymbol);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return { symbols, imports, exports };
  }

  /**
   * Get script kind for file
   */
  private getScriptKind(path: RelativePath): ts.ScriptKind {
    const ext = this.fileSystem.extname(path as unknown as FilePath).toLowerCase();
    switch (ext) {
      case '.ts':
        return ts.ScriptKind.TS;
      case '.tsx':
        return ts.ScriptKind.TSX;
      case '.js':
        return ts.ScriptKind.JS;
      case '.jsx':
        return ts.ScriptKind.JSX;
      default:
        return ts.ScriptKind.TS;
    }
  }

  /**
   * Create source location from node
   */
  private createLocation(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    relativePath: RelativePath
  ): SourceLocation {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    return createSourceLocation(
      relativePath,
      toLineNumber(line + 1),
      toColumnNumber(character + 1),
      toLineNumber(endPos.line + 1),
      toColumnNumber(endPos.character + 1)
    );
  }

  /**
   * Extract function symbol
   */
  private extractFunction(
    node: ts.FunctionDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: RelativePath
  ): FunctionSymbol | null {
    if (!node.name) return null;

    const parameters = this.extractParameters(node.parameters);
    const returnType = node.type ? node.type.getText(sourceFile) : 'void';

    return {
      name: node.name.text,
      kind: 'function',
      location: this.createLocation(node, sourceFile, relativePath),
      exported: this.hasExportModifier(node),
      async: this.hasAsyncModifier(node),
      generator: !!node.asteriskToken,
      parameters,
      returnType,
      typeParameters: this.extractTypeParameters(node.typeParameters),
      documentation: this.extractDocumentation(node, sourceFile),
    };
  }

  /**
   * Extract class symbol
   */
  private extractClass(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: RelativePath
  ): ClassSymbol | null {
    if (!node.name) return null;

    const members: ClassMember[] = [];

    for (const member of node.members) {
      const memberInfo = this.extractClassMember(member, sourceFile);
      if (memberInfo) members.push(memberInfo);
    }

    let extendsClause: string | undefined;
    const implementsClauses: string[] = [];

    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          extendsClause = clause.types[0]?.getText(sourceFile);
        } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
          for (const type of clause.types) {
            implementsClauses.push(type.getText(sourceFile));
          }
        }
      }
    }

    return {
      name: node.name.text,
      kind: 'class',
      location: this.createLocation(node, sourceFile, relativePath),
      exported: this.hasExportModifier(node),
      abstract: this.hasAbstractModifier(node),
      extends: extendsClause,
      implements: implementsClauses,
      members,
      typeParameters: this.extractTypeParameters(node.typeParameters),
      documentation: this.extractDocumentation(node, sourceFile),
    };
  }

  /**
   * Extract class member
   */
  private extractClassMember(member: ts.ClassElement, sourceFile: ts.SourceFile): ClassMember | null {
    let name = '';
    let kind: ClassMember['kind'];
    let type: string | undefined;
    let parameters: ParameterInfo[] | undefined;
    let returnType: string | undefined;

    if (ts.isConstructorDeclaration(member)) {
      name = 'constructor';
      kind = 'constructor';
      parameters = this.extractParameters(member.parameters);
    } else if (ts.isMethodDeclaration(member)) {
      if (!member.name) return null;
      name = member.name.getText(sourceFile);
      kind = 'method';
      parameters = this.extractParameters(member.parameters);
      returnType = member.type?.getText(sourceFile);
    } else if (ts.isPropertyDeclaration(member)) {
      if (!member.name) return null;
      name = member.name.getText(sourceFile);
      kind = 'property';
      type = member.type?.getText(sourceFile);
    } else if (ts.isGetAccessor(member)) {
      if (!member.name) return null;
      name = member.name.getText(sourceFile);
      kind = 'getter';
      returnType = member.type?.getText(sourceFile);
    } else if (ts.isSetAccessor(member)) {
      if (!member.name) return null;
      name = member.name.getText(sourceFile);
      kind = 'setter';
      parameters = this.extractParameters(member.parameters);
    } else {
      return null;
    }

    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    const visibility = this.getVisibility(modifiers);
    const isStatic = this.hasStaticModifier(member);
    const isAbstract = this.hasAbstractModifier(member);
    const isReadonly = this.hasReadonlyModifier(member);

    return {
      name,
      kind,
      visibility,
      static: isStatic,
      abstract: isAbstract,
      readonly: isReadonly,
      type,
      parameters,
      returnType,
    };
  }

  /**
   * Extract interface symbol
   */
  private extractInterface(
    node: ts.InterfaceDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: RelativePath
  ): InterfaceSymbol {
    const members: InterfaceMember[] = [];

    for (const member of node.members) {
      const memberInfo = this.extractInterfaceMember(member, sourceFile);
      if (memberInfo) members.push(memberInfo);
    }

    const extendsClauses: string[] = [];
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const type of clause.types) {
            extendsClauses.push(type.getText(sourceFile));
          }
        }
      }
    }

    return {
      name: node.name.text,
      kind: 'interface',
      location: this.createLocation(node, sourceFile, relativePath),
      exported: this.hasExportModifier(node),
      extends: extendsClauses,
      members,
      typeParameters: this.extractTypeParameters(node.typeParameters),
      documentation: this.extractDocumentation(node, sourceFile),
    };
  }

  /**
   * Extract interface member
   */
  private extractInterfaceMember(
    member: ts.TypeElement,
    sourceFile: ts.SourceFile
  ): InterfaceMember | null {
    if (ts.isPropertySignature(member)) {
      return {
        name: member.name.getText(sourceFile),
        kind: 'property',
        optional: !!member.questionToken,
        readonly: this.hasReadonlyModifier(member),
        type: member.type?.getText(sourceFile) ?? 'unknown',
      };
    }

    if (ts.isMethodSignature(member)) {
      return {
        name: member.name.getText(sourceFile),
        kind: 'method',
        optional: !!member.questionToken,
        type: member.type?.getText(sourceFile) ?? 'void',
        parameters: this.extractParameters(member.parameters),
      };
    }

    return null;
  }

  /**
   * Extract type alias symbol
   */
  private extractType(
    node: ts.TypeAliasDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: RelativePath
  ): TypeSymbol {
    return {
      name: node.name.text,
      kind: 'type',
      location: this.createLocation(node, sourceFile, relativePath),
      exported: this.hasExportModifier(node),
      definition: node.type.getText(sourceFile),
      typeParameters: this.extractTypeParameters(node.typeParameters),
      documentation: this.extractDocumentation(node, sourceFile),
    };
  }

  /**
   * Extract variable symbols
   */
  private extractVariables(
    node: ts.VariableStatement,
    sourceFile: ts.SourceFile,
    relativePath: RelativePath
  ): VariableSymbol[] {
    const symbols: VariableSymbol[] = [];
    const isExported = this.hasExportModifier(node);
    const isConst = !!(node.declarationList.flags & ts.NodeFlags.Const);

    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        symbols.push({
          name: decl.name.text,
          kind: 'variable',
          location: this.createLocation(decl, sourceFile, relativePath),
          exported: isExported,
          const: isConst,
          type: decl.type?.getText(sourceFile) ?? 'unknown',
          initializer: decl.initializer?.getText(sourceFile)?.substring(0, 100),
          documentation: this.extractDocumentation(node, sourceFile),
        });
      }
    }

    return symbols;
  }

  /**
   * Extract enum symbol
   */
  private extractEnum(
    node: ts.EnumDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: RelativePath
  ): EnumSymbol {
    const members: EnumMember[] = node.members.map((member, index) => ({
      name: member.name.getText(sourceFile),
      value: member.initializer?.getText(sourceFile) ?? index,
    }));

    return {
      name: node.name.text,
      kind: 'enum',
      location: this.createLocation(node, sourceFile, relativePath),
      exported: this.hasExportModifier(node),
      const: this.hasConstModifier(node),
      members,
      documentation: this.extractDocumentation(node, sourceFile),
    };
  }

  /**
   * Extract import information
   */
  private extractImport(
    node: ts.ImportDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: RelativePath
  ): ImportInfo | null {
    const moduleSpecifier = node.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) return null;

    const source = moduleSpecifier.text;
    const specifiers: ImportSpecifier[] = [];

    const importClause = node.importClause;
    if (importClause) {
      // Default import
      if (importClause.name) {
        specifiers.push({
          imported: 'default',
          local: importClause.name.text,
          isDefault: true,
          isNamespace: false,
        });
      }

      // Named imports
      if (importClause.namedBindings) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          specifiers.push({
            imported: '*',
            local: importClause.namedBindings.name.text,
            isDefault: false,
            isNamespace: true,
          });
        } else {
          for (const element of importClause.namedBindings.elements) {
            specifiers.push({
              imported: element.propertyName?.text ?? element.name.text,
              local: element.name.text,
              isDefault: false,
              isNamespace: false,
            });
          }
        }
      }
    }

    return {
      source,
      specifiers,
      location: this.createLocation(node, sourceFile, relativePath),
    };
  }

  /**
   * Extract export information
   */
  private extractExport(
    node: ts.ExportDeclaration | ts.ExportAssignment,
    sourceFile: ts.SourceFile,
    relativePath: RelativePath
  ): ExportInfo | null {
    if (ts.isExportAssignment(node)) {
      return {
        name: 'default',
        kind: 'variable',
        isDefault: true,
        isReExport: false,
        location: this.createLocation(node, sourceFile, relativePath),
      };
    }

    // Re-export
    if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      return {
        name: '*',
        kind: 'module',
        isDefault: false,
        isReExport: true,
        from: node.moduleSpecifier.text,
        location: this.createLocation(node, sourceFile, relativePath),
      };
    }

    return null;
  }

  /**
   * Extract function parameters
   */
  private extractParameters(params: ts.NodeArray<ts.ParameterDeclaration>): ParameterInfo[] {
    return params.map((param) => ({
      name: param.name.getText(),
      type: param.type?.getText() ?? 'unknown',
      optional: !!param.questionToken,
      defaultValue: param.initializer?.getText(),
      rest: !!param.dotDotDotToken,
    }));
  }

  /**
   * Extract type parameters
   */
  private extractTypeParameters(
    params: ts.NodeArray<ts.TypeParameterDeclaration> | undefined
  ): string[] | undefined {
    if (!params) return undefined;
    return params.map((p) => p.name.text);
  }

  /**
   * Extract JSDoc documentation
   */
  private extractDocumentation(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
    const jsDocs = (node as { jsDoc?: ts.JSDoc[] }).jsDoc;
    if (!jsDocs || jsDocs.length === 0) return undefined;

    return jsDocs
      .map((doc) => doc.comment)
      .filter((c): c is string => typeof c === 'string')
      .join('\n');
  }

  // Modifier helpers
  private hasExportModifier(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }

  private hasAsyncModifier(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
  }

  private hasAbstractModifier(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword) ?? false;
  }

  private hasStaticModifier(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
  }

  private hasReadonlyModifier(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false;
  }

  private hasConstModifier(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some((m) => m.kind === ts.SyntaxKind.ConstKeyword) ?? false;
  }

  private getVisibility(modifiers: readonly ts.Modifier[] | undefined): 'public' | 'private' | 'protected' {
    if (!modifiers) return 'public';
    if (modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) return 'private';
    if (modifiers.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)) return 'protected';
    return 'public';
  }

  /**
   * Add symbol to symbol table
   */
  private addToSymbolTable(table: SymbolTable, symbol: AnySymbol): void {
    switch (symbol.kind) {
      case 'function':
        this.addToMap(table.functions, symbol.name, symbol);
        break;
      case 'class':
        this.addToMap(table.classes, symbol.name, symbol);
        break;
      case 'interface':
        this.addToMap(table.interfaces, symbol.name, symbol);
        break;
      case 'type':
        this.addToMap(table.types, symbol.name, symbol);
        break;
      case 'variable':
        this.addToMap(table.variables, symbol.name, symbol);
        break;
      case 'enum':
        this.addToMap(table.enums, symbol.name, symbol);
        break;
    }
  }

  /**
   * Remove symbol from symbol table
   */
  private removeFromSymbolTable(table: SymbolTable, symbol: AnySymbol): void {
    const removeFromMap = <T extends AnySymbol>(map: Map<string, T[]>, name: string, sym: T): void => {
      const arr = map.get(name);
      if (arr) {
        const idx = arr.findIndex(
          (s) => s.location.file === sym.location.file && s.location.line === sym.location.line
        );
        if (idx !== -1) arr.splice(idx, 1);
        if (arr.length === 0) map.delete(name);
      }
    };

    switch (symbol.kind) {
      case 'function':
        removeFromMap(table.functions, symbol.name, symbol);
        break;
      case 'class':
        removeFromMap(table.classes, symbol.name, symbol);
        break;
      case 'interface':
        removeFromMap(table.interfaces, symbol.name, symbol);
        break;
      case 'type':
        removeFromMap(table.types, symbol.name, symbol);
        break;
      case 'variable':
        removeFromMap(table.variables, symbol.name, symbol);
        break;
      case 'enum':
        removeFromMap(table.enums, symbol.name, symbol);
        break;
    }
  }

  /**
   * Add to map with array value
   */
  private addToMap<T>(map: Map<string, T[]>, key: string, value: T): void {
    const arr = map.get(key) ?? [];
    arr.push(value);
    map.set(key, arr);
  }

  /**
   * Resolve import path to relative path
   */
  private resolveImportPath(from: RelativePath, importSource: string): RelativePath | null {
    // Skip node_modules imports
    if (!importSource.startsWith('.')) return null;

    const fromDir = this.fileSystem.dirname(from as unknown as FilePath);
    const resolved = this.fileSystem.join(fromDir as string, importSource);

    // Try with extensions
    for (const ext of PARSEABLE_EXTENSIONS) {
      const withExt = resolved + ext;
      // Note: We can't async check existence here, so we just return the path
      return toRelativePath(withExt as string);
    }

    return toRelativePath(resolved as string);
  }
}

/**
 * Create a semantic index service
 */
export function createSemanticIndexService(
  fileSystem: IFileSystem,
  store: IKnowledgeStore,
  projectRoot: FilePath,
  logger?: ILogger
): ISemanticIndexService {
  return new SemanticIndexService(fileSystem, store, projectRoot, logger);
}
