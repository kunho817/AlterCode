/**
 * Dependency Verifier Service
 *
 * Validates import statements and package dependencies:
 * - Module existence verification
 * - Export availability checking
 * - Package installation status
 */

import {
  IDependencyVerifierService,
  IFileSystem,
  ISemanticIndexService,
  DependencyValidationRequest,
  DependencyValidationResult,
  ImportStatement,
  FilePath,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  toFilePath,
} from '../types';

/** Node.js built-in modules */
const BUILTIN_MODULES = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys',
  'timers', 'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm',
  'worker_threads', 'zlib',
]);

/**
 * Dependency Verifier Service implementation
 */
export class DependencyVerifierService implements IDependencyVerifierService {
  private readonly fileSystem: IFileSystem;
  private readonly semanticIndex: ISemanticIndexService;
  private readonly projectRoot: FilePath;
  private readonly logger?: ILogger;

  // Cached package info
  private packageJson: Record<string, unknown> | null = null;
  private nodeModulesCache: Set<string> = new Set();

  constructor(
    fileSystem: IFileSystem,
    semanticIndex: ISemanticIndexService,
    projectRoot: FilePath,
    logger?: ILogger
  ) {
    this.fileSystem = fileSystem;
    this.semanticIndex = semanticIndex;
    this.projectRoot = projectRoot;
    this.logger = logger?.child('DependencyVerifierService');
  }

  async validate(request: DependencyValidationRequest): AsyncResult<DependencyValidationResult[]> {
    try {
      this.logger?.info('Validating dependencies', { count: request.imports.length });

      // Load package.json if not cached
      await this.loadPackageJson();

      const results: DependencyValidationResult[] = [];

      for (const importStmt of request.imports) {
        const result = await this.validateImport(importStmt);
        results.push(result);
      }

      const validCount = results.filter((r) => r.valid).length;
      this.logger?.info('Dependency validation complete', {
        total: results.length,
        valid: validCount,
        invalid: results.length - validCount,
      });

      return Ok(results);
    } catch (error) {
      this.logger?.error('Dependency validation failed', error as Error);
      return Err(
        new AppError('VERIFICATION', `Dependency validation failed: ${(error as Error).message}`)
      );
    }
  }

  isInstalled(packageName: string): boolean {
    // Check cache first
    if (this.nodeModulesCache.has(packageName)) {
      return true;
    }

    // Check built-in modules
    if (BUILTIN_MODULES.has(packageName)) {
      return true;
    }

    // Check package.json dependencies
    if (this.packageJson) {
      const deps = this.packageJson.dependencies as Record<string, string> | undefined;
      const devDeps = this.packageJson.devDependencies as Record<string, string> | undefined;
      const peerDeps = this.packageJson.peerDependencies as Record<string, string> | undefined;

      if (deps?.[packageName] || devDeps?.[packageName] || peerDeps?.[packageName]) {
        return true;
      }
    }

    return false;
  }

  getVersion(packageName: string): string | null {
    if (!this.packageJson) return null;

    const deps = this.packageJson.dependencies as Record<string, string> | undefined;
    const devDeps = this.packageJson.devDependencies as Record<string, string> | undefined;

    return deps?.[packageName] ?? devDeps?.[packageName] ?? null;
  }

  /**
   * Validate a single import statement
   */
  private async validateImport(importStmt: ImportStatement): Promise<DependencyValidationResult> {
    const { source, specifiers, location } = importStmt;

    // Determine import type
    const isRelative = source.startsWith('.') || source.startsWith('/');
    const isBuiltin = BUILTIN_MODULES.has(source) || source.startsWith('node:');

    if (isBuiltin) {
      return {
        import: importStmt,
        valid: true,
        moduleExists: true,
        isInstalled: true,
        exportsExist: true,
        missingExports: [],
      };
    }

    if (isRelative) {
      return this.validateRelativeImport(importStmt);
    }

    return this.validatePackageImport(importStmt);
  }

  /**
   * Validate a relative import
   */
  private async validateRelativeImport(
    importStmt: ImportStatement
  ): Promise<DependencyValidationResult> {
    const { source, specifiers, location } = importStmt;

    // Resolve the import path
    const fromDir = this.fileSystem.dirname(location.file as FilePath);
    let resolvedPath = this.fileSystem.join(fromDir as string, source);

    // Try different extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx', '/index.js'];
    let moduleExists = false;

    for (const ext of extensions) {
      const pathWithExt = resolvedPath + ext;
      if (await this.fileSystem.exists(pathWithExt as FilePath)) {
        moduleExists = true;
        resolvedPath = pathWithExt as FilePath;
        break;
      }
    }

    // Also try without extension (might already have it)
    if (!moduleExists && await this.fileSystem.exists(resolvedPath as FilePath)) {
      moduleExists = true;
    }

    if (!moduleExists) {
      return {
        import: importStmt,
        valid: false,
        moduleExists: false,
        isInstalled: true, // Relative imports don't need installation
        exportsExist: false,
        missingExports: specifiers.map((s) => s.imported),
      };
    }

    // Check if exports exist
    const missingExports = await this.checkExports(resolvedPath, specifiers);

    return {
      import: importStmt,
      valid: missingExports.length === 0,
      moduleExists: true,
      isInstalled: true,
      exportsExist: missingExports.length === 0,
      missingExports,
    };
  }

  /**
   * Validate a package import
   */
  private async validatePackageImport(
    importStmt: ImportStatement
  ): Promise<DependencyValidationResult> {
    const { source, specifiers } = importStmt;

    // Extract package name (handle scoped packages)
    const packageName = source.startsWith('@')
      ? source.split('/').slice(0, 2).join('/')
      : source.split('/')[0] ?? source;

    const isInstalled = this.isInstalled(packageName);
    const version = this.getVersion(packageName);

    if (!isInstalled) {
      return {
        import: importStmt,
        valid: false,
        moduleExists: false,
        isInstalled: false,
        exportsExist: false,
        missingExports: specifiers.map((s) => s.imported),
        installCommand: `npm install ${packageName}`,
      };
    }

    // Check if module exists in node_modules
    const modulePath = this.fileSystem.join(
      this.projectRoot as string,
      'node_modules',
      source
    );

    const moduleExists = await this.checkNodeModulesPath(packageName ?? source);

    if (!moduleExists) {
      return {
        import: importStmt,
        valid: false,
        moduleExists: false,
        isInstalled: true, // Listed in package.json but not installed
        version: version ?? undefined,
        exportsExist: false,
        missingExports: specifiers.map((s) => s.imported),
        installCommand: 'npm install',
      };
    }

    // For installed packages, we trust that exports exist
    // Full validation would require parsing the package's type definitions
    return {
      import: importStmt,
      valid: true,
      moduleExists: true,
      isInstalled: true,
      version: version ?? undefined,
      exportsExist: true,
      missingExports: [],
    };
  }

  /**
   * Check if specific exports exist in a module
   */
  private async checkExports(
    modulePath: FilePath,
    specifiers: ImportStatement['specifiers']
  ): Promise<string[]> {
    const missingExports: string[] = [];

    // Get exports from semantic index
    const relativePath = this.fileSystem.relative(this.projectRoot, modulePath);
    const exports = this.semanticIndex.getExports(relativePath);
    const symbols = this.semanticIndex.findSymbolsInFile(relativePath);

    const availableExports = new Set<string>();

    // Add named exports
    for (const exp of exports) {
      availableExports.add(exp.name);
    }

    // Add exported symbols
    for (const symbol of symbols) {
      if (symbol.exported) {
        availableExports.add(symbol.name);
      }
    }

    // Check each specifier
    for (const specifier of specifiers) {
      if (specifier.isDefault) {
        // Check for default export
        if (!exports.some((e) => e.isDefault)) {
          missingExports.push('default');
        }
      } else if (specifier.isNamespace) {
        // Namespace import always works if module exists
        continue;
      } else {
        // Named import
        if (!availableExports.has(specifier.imported)) {
          missingExports.push(specifier.imported);
        }
      }
    }

    return missingExports;
  }

  /**
   * Check if a package exists in node_modules
   */
  private async checkNodeModulesPath(packageName: string): Promise<boolean> {
    if (this.nodeModulesCache.has(packageName)) {
      return true;
    }

    const modulePath = this.fileSystem.join(
      this.projectRoot as string,
      'node_modules',
      packageName
    );

    try {
      const exists = await this.fileSystem.exists(modulePath as FilePath);
      if (exists) {
        this.nodeModulesCache.add(packageName);
      }
      return exists;
    } catch {
      return false;
    }
  }

  /**
   * Load package.json
   */
  private async loadPackageJson(): Promise<void> {
    if (this.packageJson) return;

    try {
      const packagePath = this.fileSystem.join(this.projectRoot as string, 'package.json');
      const content = await this.fileSystem.readFile(packagePath as FilePath);
      this.packageJson = JSON.parse(content);
    } catch (error) {
      this.logger?.warn('Failed to load package.json', { error });
      this.packageJson = {};
    }
  }

  /**
   * Get suggested alternative modules
   */
  getSuggestedAlternative(packageName: string): string | null {
    // Common alternatives
    const alternatives: Record<string, string> = {
      'moment': 'dayjs or date-fns',
      'request': 'node-fetch or axios',
      'lodash': 'lodash-es (for ES modules)',
      'underscore': 'lodash',
    };

    return alternatives[packageName] ?? null;
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.packageJson = null;
    this.nodeModulesCache.clear();
  }
}

/**
 * Create a dependency verifier service
 */
export function createDependencyVerifierService(
  fileSystem: IFileSystem,
  semanticIndex: ISemanticIndexService,
  projectRoot: FilePath,
  logger?: ILogger
): IDependencyVerifierService {
  return new DependencyVerifierService(fileSystem, semanticIndex, projectRoot, logger);
}
