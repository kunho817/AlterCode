/**
 * Convention Extractor Service
 *
 * Analyzes the codebase to detect and extract coding conventions:
 * - Naming patterns (camelCase, PascalCase, etc.)
 * - Style conventions (indentation, quotes, semicolons)
 * - Structure conventions (test location, barrel exports)
 * - Pattern conventions (async style, error handling)
 */

import {
  IConventionExtractorService,
  ProjectConventions,
  DetectedConventions,
  ConventionConfidence,
  NamingConventions,
  NamingPattern,
  StyleConventions,
  StructureConventions,
  PatternConventions,
  ComplianceResult,
  ConventionViolation,
  IFileSystem,
  IKnowledgeStore,
  ILogger,
  FilePath,
  RelativePath,
  AsyncResult,
  Ok,
  Err,
  AppError,
  toRelativePath,
} from '../types';

/** Sample size for convention detection */
const DEFAULT_SAMPLE_SIZE = 50;

/**
 * Convention Extractor Service implementation
 */
export class ConventionExtractorService implements IConventionExtractorService {
  private readonly fileSystem: IFileSystem;
  private readonly store: IKnowledgeStore;
  private readonly projectRoot: FilePath;
  private readonly logger?: ILogger;
  private conventions: ProjectConventions | null = null;

  constructor(
    fileSystem: IFileSystem,
    store: IKnowledgeStore,
    projectRoot: FilePath,
    logger?: ILogger
  ) {
    this.fileSystem = fileSystem;
    this.store = store;
    this.projectRoot = projectRoot;
    this.logger = logger?.child('ConventionExtractorService');
  }

  async analyze(): AsyncResult<ProjectConventions> {
    try {
      this.logger?.info('Analyzing project conventions');
      const startTime = Date.now();

      // Find sample files
      const files = await this.getSampleFiles();
      this.logger?.debug('Analyzing files', { count: files.length });

      // Analyze different aspects
      const namingResult = await this.analyzeNamingConventions(files);
      const styleResult = await this.analyzeStyleConventions(files);
      const structureResult = await this.analyzeStructureConventions();
      const patternsResult = await this.analyzePatternConventions(files);

      const detected: DetectedConventions = {
        naming: namingResult.conventions,
        style: styleResult.conventions,
        structure: structureResult.conventions,
        patterns: patternsResult.conventions,
      };

      const confidence: ConventionConfidence = {
        naming: namingResult.confidence,
        style: styleResult.confidence,
        structure: structureResult.confidence,
        patterns: patternsResult.confidence,
        overall:
          (namingResult.confidence +
            styleResult.confidence +
            structureResult.confidence +
            patternsResult.confidence) /
          4,
      };

      const conventions: ProjectConventions = {
        detected,
        confidence,
        sampleSize: files.length,
        lastAnalyzed: new Date(),
      };

      // Save to store
      const saveResult = await this.store.saveConventions(conventions);
      if (!saveResult.ok) {
        this.logger?.warn('Failed to save conventions to store');
      }

      this.conventions = conventions;

      const duration = Date.now() - startTime;
      this.logger?.info('Convention analysis complete', {
        confidence: confidence.overall.toFixed(2),
        duration,
      });

      return Ok(conventions);
    } catch (error) {
      this.logger?.error('Failed to analyze conventions', error as Error);
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to analyze conventions: ${(error as Error).message}`)
      );
    }
  }

  getConventions(): ProjectConventions | null {
    return this.conventions;
  }

  checkCompliance(code: string, file: RelativePath): ComplianceResult {
    const violations: ConventionViolation[] = [];

    if (!this.conventions) {
      return { compliant: true, violations: [] };
    }

    const { detected } = this.conventions;

    // Check naming conventions
    const namingViolations = this.checkNamingCompliance(code, detected.naming);
    violations.push(...namingViolations);

    // Check style conventions
    const styleViolations = this.checkStyleCompliance(code, detected.style);
    violations.push(...styleViolations);

    return {
      compliant: violations.length === 0,
      violations,
    };
  }

  /**
   * Get sample files for analysis
   */
  private async getSampleFiles(): Promise<RelativePath[]> {
    const pattern = '**/*.{ts,tsx,js,jsx}';
    const allFiles = await this.fileSystem.glob(pattern, this.projectRoot);

    // Filter out unwanted files
    const filteredFiles = allFiles.filter((f) => {
      const path = f as string;
      return (
        !path.includes('node_modules') &&
        !path.includes('.d.ts') &&
        !path.includes('.min.') &&
        !path.includes('dist/') &&
        !path.includes('build/')
      );
    });

    // Sample files if too many
    if (filteredFiles.length > DEFAULT_SAMPLE_SIZE) {
      return this.sampleArray(filteredFiles, DEFAULT_SAMPLE_SIZE);
    }

    return filteredFiles;
  }

  /**
   * Randomly sample array
   */
  private sampleArray<T>(array: T[], size: number): T[] {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, size);
  }

  /**
   * Analyze naming conventions
   */
  private async analyzeNamingConventions(
    files: RelativePath[]
  ): Promise<{ conventions: NamingConventions; confidence: number }> {
    const patterns: Record<string, NamingPattern[]> = {
      files: [],
      directories: [],
      functions: [],
      classes: [],
      interfaces: [],
      types: [],
      variables: [],
      constants: [],
      typeParameters: [],
    };

    // Analyze file names
    for (const file of files) {
      const fileAsPath = file as unknown as FilePath;
      const basename = this.fileSystem.basename(fileAsPath, this.fileSystem.extname(fileAsPath));
      patterns.files?.push(this.detectNamingPattern(basename));
    }

    // Analyze code patterns (simplified)
    for (const file of files) {
      try {
        const fullPath = this.fileSystem.join(this.projectRoot as string, file as string);
        const content = await this.fileSystem.readFile(fullPath);

        // Extract identifiers and classify
        const functionMatches = content.matchAll(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
        for (const match of functionMatches) {
          if (match[1]) patterns.functions?.push(this.detectNamingPattern(match[1]));
        }

        const classMatches = content.matchAll(/class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
        for (const match of classMatches) {
          if (match[1]) patterns.classes?.push(this.detectNamingPattern(match[1]));
        }

        const interfaceMatches = content.matchAll(/interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
        for (const match of interfaceMatches) {
          if (match[1]) patterns.interfaces?.push(this.detectNamingPattern(match[1]));
        }

        const typeMatches = content.matchAll(/type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
        for (const match of typeMatches) {
          if (match[1]) patterns.types?.push(this.detectNamingPattern(match[1]));
        }

        const constMatches = content.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=/g);
        for (const match of constMatches) {
          if (match[1]) patterns.constants?.push(this.detectNamingPattern(match[1]));
        }

        const varMatches = content.matchAll(/(?:let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
        for (const match of varMatches) {
          if (match[1]) patterns.variables?.push(this.detectNamingPattern(match[1]));
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Calculate most common pattern for each category
    const getMostCommon = (arr: NamingPattern[]): NamingPattern => {
      if (arr.length === 0) return 'camelCase';
      const counts = new Map<NamingPattern, number>();
      for (const p of arr) {
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
      let max = 0;
      let result: NamingPattern = 'camelCase';
      for (const [pattern, count] of counts) {
        if (count > max) {
          max = count;
          result = pattern;
        }
      }
      return result;
    };

    const conventions: NamingConventions = {
      files: getMostCommon(patterns.files ?? []),
      directories: getMostCommon(patterns.files ?? []), // Use file pattern as proxy
      functions: getMostCommon(patterns.functions ?? []),
      classes: getMostCommon(patterns.classes ?? []),
      interfaces: getMostCommon(patterns.interfaces ?? []),
      types: getMostCommon(patterns.types ?? []),
      variables: getMostCommon(patterns.variables ?? []),
      constants: getMostCommon(patterns.constants ?? []),
      typeParameters: 'PascalCase', // Standard convention
    };

    // Calculate confidence based on consistency
    const totalSamples = Object.values(patterns).reduce((sum, arr) => sum + arr.length, 0);
    const confidence = Math.min(totalSamples / 100, 1);

    return { conventions, confidence };
  }

  /**
   * Detect naming pattern of an identifier
   */
  private detectNamingPattern(name: string): NamingPattern {
    if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
    if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) return 'snake_case';
    if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name)) return 'SCREAMING_SNAKE_CASE';
    if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) return 'kebab-case';
    return 'unknown';
  }

  /**
   * Analyze style conventions
   */
  private async analyzeStyleConventions(
    files: RelativePath[]
  ): Promise<{ conventions: StyleConventions; confidence: number }> {
    let tabCount = 0;
    let spaceCount = 0;
    let indent2 = 0;
    let indent4 = 0;
    let singleQuote = 0;
    let doubleQuote = 0;
    let semiCount = 0;
    let noSemiCount = 0;
    let totalLines = 0;

    for (const file of files) {
      try {
        const fullPath = this.fileSystem.join(this.projectRoot as string, file as string);
        const content = await this.fileSystem.readFile(fullPath);
        const lines = content.split('\n');
        totalLines += lines.length;

        for (const line of lines) {
          // Check indentation
          const leadingWhitespace = line.match(/^(\s*)/)?.[1] ?? '';
          if (leadingWhitespace.includes('\t')) {
            tabCount++;
          } else if (leadingWhitespace.length > 0) {
            spaceCount++;
            if (leadingWhitespace.length % 2 === 0) indent2++;
            if (leadingWhitespace.length % 4 === 0) indent4++;
          }

          // Check quotes (simplified)
          const singleMatches = line.match(/'/g)?.length ?? 0;
          const doubleMatches = line.match(/"/g)?.length ?? 0;
          singleQuote += singleMatches;
          doubleQuote += doubleMatches;

          // Check semicolons
          const trimmed = line.trim();
          if (trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
            if (trimmed.endsWith(';')) {
              semiCount++;
            } else if (trimmed.endsWith('{') || trimmed.endsWith('}')) {
              // Ignore lines ending with braces
            } else {
              noSemiCount++;
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    const conventions: StyleConventions = {
      indentation: tabCount > spaceCount ? 'tabs' : 'spaces',
      indentSize: indent4 > indent2 ? 4 : 2,
      quotes: singleQuote > doubleQuote ? 'single' : 'double',
      semicolons: semiCount > noSemiCount,
      trailingCommas: 'es5', // Default, would need more analysis
      lineWidth: 100, // Default
      endOfLine: 'lf', // Default
    };

    const confidence = Math.min(totalLines / 1000, 1);

    return { conventions, confidence };
  }

  /**
   * Analyze structure conventions
   */
  private async analyzeStructureConventions(): Promise<{
    conventions: StructureConventions;
    confidence: number;
  }> {
    // Check for common source directories
    const srcDirs = ['src', 'lib', 'source', 'app'];
    let sourceDir: RelativePath = toRelativePath('src');

    for (const dir of srcDirs) {
      const dirPath = this.fileSystem.join(this.projectRoot as string, dir);
      if (await this.fileSystem.exists(dirPath)) {
        sourceDir = toRelativePath(dir);
        break;
      }
    }

    // Check for test directories
    const testDirs = ['test', 'tests', '__tests__', 'spec'];
    let testDir: RelativePath = toRelativePath('test');
    let testLocation: 'colocated' | 'separate' | 'mixed' = 'separate';

    for (const dir of testDirs) {
      const dirPath = this.fileSystem.join(this.projectRoot as string, dir);
      if (await this.fileSystem.exists(dirPath)) {
        testDir = toRelativePath(dir);
        break;
      }
    }

    // Check for colocated tests
    const sourceFiles = await this.fileSystem.glob('**/*.{ts,tsx,js,jsx}', this.projectRoot);
    const hasColocatedTests = sourceFiles.some(
      (f) => (f as string).includes('.test.') || (f as string).includes('.spec.')
    );

    if (hasColocatedTests) {
      testLocation = testDir === toRelativePath('test') ? 'colocated' : 'mixed';
    }

    // Check for index files
    const indexFiles = await this.fileSystem.glob('**/index.{ts,tsx,js,jsx}', this.projectRoot);
    const hasIndexFiles = indexFiles.length > 0;

    // Check for barrel exports
    let hasBarrelExports = false;
    if (indexFiles.length > 0) {
      try {
        const firstIndex = this.fileSystem.join(
          this.projectRoot as string,
          indexFiles[0] as string
        );
        const content = await this.fileSystem.readFile(firstIndex);
        hasBarrelExports = content.includes('export *') || content.includes('export {');
      } catch {
        // Ignore
      }
    }

    const conventions: StructureConventions = {
      sourceDir,
      testDir,
      testPattern: '**/*.{test,spec}.{ts,tsx,js,jsx}',
      testLocation,
      indexFiles: hasIndexFiles,
      barrelExports: hasBarrelExports,
    };

    return { conventions, confidence: 0.7 }; // Medium confidence for structure
  }

  /**
   * Analyze pattern conventions
   */
  private async analyzePatternConventions(
    files: RelativePath[]
  ): Promise<{ conventions: PatternConventions; confidence: number }> {
    let asyncAwaitCount = 0;
    let promiseCount = 0;
    let callbackCount = 0;
    let tryCatchCount = 0;
    let resultTypeCount = 0;
    let namedImports = 0;
    let defaultImports = 0;
    let namedExports = 0;
    let defaultExports = 0;

    for (const file of files) {
      try {
        const fullPath = this.fileSystem.join(this.projectRoot as string, file as string);
        const content = await this.fileSystem.readFile(fullPath);

        // Async patterns
        asyncAwaitCount += (content.match(/async\s+/g)?.length ?? 0);
        promiseCount += (content.match(/\.then\(/g)?.length ?? 0);
        callbackCount += (content.match(/callback|cb\)/gi)?.length ?? 0);

        // Error handling
        tryCatchCount += (content.match(/try\s*{/g)?.length ?? 0);
        resultTypeCount += (content.match(/Result<|Ok\(|Err\(/g)?.length ?? 0);

        // Import style
        namedImports += (content.match(/import\s+{/g)?.length ?? 0);
        defaultImports += (content.match(/import\s+[a-zA-Z_$]/g)?.length ?? 0);

        // Export style
        namedExports += (content.match(/export\s+{|export\s+(?:const|function|class|interface|type)/g)?.length ?? 0);
        defaultExports += (content.match(/export\s+default/g)?.length ?? 0);
      } catch {
        // Skip files that can't be read
      }
    }

    const conventions: PatternConventions = {
      asyncStyle:
        asyncAwaitCount > promiseCount && asyncAwaitCount > callbackCount
          ? 'async-await'
          : promiseCount > callbackCount
            ? 'promises'
            : callbackCount > 0
              ? 'callbacks'
              : 'mixed',
      errorHandling:
        resultTypeCount > tryCatchCount ? 'result-type' : tryCatchCount > 0 ? 'try-catch' : 'mixed',
      importStyle:
        namedImports > defaultImports
          ? 'named'
          : defaultImports > namedImports
            ? 'default'
            : 'mixed',
      exportStyle:
        namedExports > defaultExports
          ? 'named'
          : defaultExports > namedExports
            ? 'default'
            : 'mixed',
    };

    const totalPatterns =
      asyncAwaitCount +
      promiseCount +
      callbackCount +
      tryCatchCount +
      namedImports +
      defaultImports;
    const confidence = Math.min(totalPatterns / 100, 1);

    return { conventions, confidence };
  }

  /**
   * Check naming compliance
   */
  private checkNamingCompliance(code: string, conventions: NamingConventions): ConventionViolation[] {
    const violations: ConventionViolation[] = [];

    // Check function names
    const functionMatches = code.matchAll(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
    for (const match of functionMatches) {
      const name = match[1];
      if (name) {
        const pattern = this.detectNamingPattern(name);
        if (pattern !== conventions.functions && pattern !== 'unknown') {
          violations.push({
            convention: 'naming.functions',
            expected: conventions.functions,
            actual: pattern,
            autoFixable: false,
          });
        }
      }
    }

    // Check class names
    const classMatches = code.matchAll(/class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
    for (const match of classMatches) {
      const name = match[1];
      if (name) {
        const pattern = this.detectNamingPattern(name);
        if (pattern !== conventions.classes && pattern !== 'unknown') {
          violations.push({
            convention: 'naming.classes',
            expected: conventions.classes,
            actual: pattern,
            autoFixable: false,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check style compliance
   */
  private checkStyleCompliance(code: string, conventions: StyleConventions): ConventionViolation[] {
    const violations: ConventionViolation[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Check indentation
      const leadingWhitespace = line.match(/^(\s*)/)?.[1] ?? '';
      if (leadingWhitespace.length > 0) {
        const hasTabs = leadingWhitespace.includes('\t');
        const hasSpaces = leadingWhitespace.includes(' ') && !leadingWhitespace.includes('\t');

        if (conventions.indentation === 'tabs' && hasSpaces) {
          violations.push({
            convention: 'style.indentation',
            expected: 'tabs',
            actual: 'spaces',
            autoFixable: true,
          });
        } else if (conventions.indentation === 'spaces' && hasTabs) {
          violations.push({
            convention: 'style.indentation',
            expected: 'spaces',
            actual: 'tabs',
            autoFixable: true,
          });
        }
      }
    }

    return violations;
  }
}

/**
 * Create a convention extractor service
 */
export function createConventionExtractorService(
  fileSystem: IFileSystem,
  store: IKnowledgeStore,
  projectRoot: FilePath,
  logger?: ILogger
): IConventionExtractorService {
  return new ConventionExtractorService(fileSystem, store, projectRoot, logger);
}
