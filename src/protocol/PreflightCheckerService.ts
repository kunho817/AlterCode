/**
 * Preflight Checker Service
 *
 * Performs pre-execution validation and risk assessment:
 * - Validates proposed changes before execution
 * - Assesses risk levels
 * - Checks prerequisites
 * - Generates warnings for potentially dangerous operations
 */

import {
  IPreflightCheckerService,
  IFileSystem,
  IScopeGuardService,
  IVerificationPipelineService,
  PreflightRequest,
  PreflightResult,
  PreflightCheck,
  RiskLevel,
  FilePath,
  FileChange,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  toFilePath,
  toLineNumber,
  toColumnNumber,
} from '../types';

/** Risk weights for different operation types */
const RISK_WEIGHTS: Record<string, number> = {
  delete: 5,
  create: 2,
  write: 3,
  rename: 3,
  move: 4,
};

/** High-risk file patterns */
const HIGH_RISK_PATTERNS = [
  /package\.json$/,
  /tsconfig\.json$/,
  /\.config\.(js|ts|json)$/,
  /index\.(ts|js)$/,
  /main\.(ts|js)$/,
  /app\.(ts|js)$/,
];

/** Critical file patterns - require explicit confirmation */
const CRITICAL_PATTERNS = [
  /\.env/,
  /webpack\.config/,
  /vite\.config/,
  /jest\.config/,
  /eslint/,
  /prettier/,
];

/**
 * Preflight Checker Service implementation
 */
export class PreflightCheckerService implements IPreflightCheckerService {
  private readonly fileSystem: IFileSystem;
  private readonly scopeGuard: IScopeGuardService;
  private readonly verificationPipeline?: IVerificationPipelineService;
  private readonly logger?: ILogger;

  constructor(
    fileSystem: IFileSystem,
    scopeGuard: IScopeGuardService,
    verificationPipeline?: IVerificationPipelineService,
    logger?: ILogger
  ) {
    this.fileSystem = fileSystem;
    this.scopeGuard = scopeGuard;
    this.verificationPipeline = verificationPipeline;
    this.logger = logger?.child('PreflightCheckerService');
  }

  async check(request: PreflightRequest): AsyncResult<PreflightResult> {
    const startTime = Date.now();
    this.logger?.info('Running preflight checks', {
      changeCount: request.changes.length,
      missionId: request.missionId,
    });

    try {
      const checks: PreflightCheck[] = [];

      // Run all checks
      checks.push(...await this.checkScope(request));
      checks.push(...await this.checkFileState(request));
      checks.push(...await this.checkSyntax(request));
      checks.push(...await this.checkDependencies(request));
      checks.push(...await this.checkConflicts(request));

      // Calculate overall risk
      const riskLevel = this.calculateRiskLevel(request.changes, checks);

      // Determine if we can proceed
      const hasBlockers = checks.some(
        (c) => c.status === 'fail' && c.severity === 'error'
      );
      const requiresConfirmation = checks.some(
        (c) => c.status === 'warning' || c.requiresConfirmation
      );

      const result: PreflightResult = {
        canProceed: !hasBlockers,
        checks,
        riskLevel,
        requiresConfirmation: requiresConfirmation && !hasBlockers,
        warnings: checks
          .filter((c) => c.status === 'warning')
          .map((c) => c.message),
        errors: checks
          .filter((c) => c.status === 'fail')
          .map((c) => c.message),
        duration: Date.now() - startTime,
      };

      this.logger?.info('Preflight complete', {
        canProceed: result.canProceed,
        riskLevel,
        checkCount: checks.length,
        duration: result.duration,
      });

      return Ok(result);
    } catch (error) {
      this.logger?.error('Preflight check failed', error as Error);
      return Err(
        new AppError('PREFLIGHT', `Preflight check failed: ${(error as Error).message}`)
      );
    }
  }

  assessRisk(changes: FileChange[]): RiskLevel {
    return this.calculateRiskLevel(changes, []);
  }

  getRequiredConfirmations(changes: FileChange[]): string[] {
    const confirmations: string[] = [];

    for (const change of changes) {
      const path = change.path as string;

      // Critical files
      if (CRITICAL_PATTERNS.some((p) => p.test(path))) {
        confirmations.push(`Modifying critical config file: ${path}`);
      }

      // Delete operations
      if (change.type === 'delete') {
        confirmations.push(`Deleting file: ${path}`);
      }

      // Large changes
      if (change.content && change.content.length > 10000) {
        confirmations.push(`Large change (${change.content.length} chars) to: ${path}`);
      }
    }

    return confirmations;
  }

  /**
   * Check scope violations
   */
  private async checkScope(request: PreflightRequest): Promise<PreflightCheck[]> {
    const checks: PreflightCheck[] = [];

    for (const change of request.changes) {
      const violation = this.scopeGuard.check({
        type: (change.type ?? 'write') as import('../types').ExtendedFileOperationType,
        path: change.path as import('../types').FilePath,
        missionId: request.missionId,
        content: change.content,
      });

      if (violation) {
        checks.push({
          name: 'scope',
          status: violation.requiresConfirmation ? 'warning' : 'fail',
          message: violation.reason,
          severity: violation.severity,
          file: change.path as string,
          requiresConfirmation: violation.requiresConfirmation,
        });
      }
    }

    if (checks.length === 0) {
      checks.push({
        name: 'scope',
        status: 'pass',
        message: 'All changes within allowed scope',
        severity: 'info',
      });
    }

    return checks;
  }

  /**
   * Check file state (existence, permissions)
   */
  private async checkFileState(request: PreflightRequest): Promise<PreflightCheck[]> {
    const checks: PreflightCheck[] = [];

    for (const change of request.changes) {
      const path = change.path;
      const exists = await this.fileSystem.exists(toFilePath(path));

      if (change.type === 'create' && exists) {
        checks.push({
          name: 'file_state',
          status: 'warning',
          message: `File already exists and will be overwritten: ${path}`,
          severity: 'warning',
          file: path as string,
          requiresConfirmation: true,
        });
      }

      if ((change.type === 'write' || change.type === 'delete') && !exists) {
        checks.push({
          name: 'file_state',
          status: 'fail',
          message: `File does not exist: ${path}`,
          severity: 'error',
          file: path as string,
        });
      }

      // Check if file is readonly (simplified - check if we can stat it)
      if (exists) {
        try {
          await this.fileSystem.stat(toFilePath(path));
        } catch {
          checks.push({
            name: 'file_state',
            status: 'fail',
            message: `Cannot access file: ${path}`,
            severity: 'error',
            file: path as string,
          });
        }
      }
    }

    if (checks.length === 0) {
      checks.push({
        name: 'file_state',
        status: 'pass',
        message: 'All file states valid',
        severity: 'info',
      });
    }

    return checks;
  }

  /**
   * Check syntax of new/modified content
   */
  private async checkSyntax(request: PreflightRequest): Promise<PreflightCheck[]> {
    const checks: PreflightCheck[] = [];

    for (const change of request.changes) {
      if (!change.content || change.type === 'delete') {
        continue;
      }

      const path = change.path as string;
      const ext = this.getExtension(path);

      // TypeScript/JavaScript syntax check (basic)
      if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
        const syntaxErrors = this.checkJSSyntax(change.content);
        if (syntaxErrors.length > 0) {
          checks.push({
            name: 'syntax',
            status: 'fail',
            message: `Syntax errors in ${path}: ${syntaxErrors[0]}`,
            severity: 'error',
            file: path,
          });
        }
      }

      // JSON syntax check
      if (ext === 'json') {
        try {
          JSON.parse(change.content);
        } catch (error) {
          checks.push({
            name: 'syntax',
            status: 'fail',
            message: `Invalid JSON in ${path}: ${(error as Error).message}`,
            severity: 'error',
            file: path,
          });
        }
      }
    }

    if (checks.length === 0) {
      checks.push({
        name: 'syntax',
        status: 'pass',
        message: 'Syntax check passed',
        severity: 'info',
      });
    }

    return checks;
  }

  /**
   * Check dependencies (imports)
   */
  private async checkDependencies(request: PreflightRequest): Promise<PreflightCheck[]> {
    const checks: PreflightCheck[] = [];

    if (!this.verificationPipeline) {
      return checks;
    }

    // Extract imports from new content
    for (const change of request.changes) {
      if (!change.content || change.type === 'delete') {
        continue;
      }

      const imports = this.extractImports(change.content);
      if (imports.length === 0) {
        continue;
      }

      // Verify imports exist
      const verifyResult = await this.verificationPipeline.verify({
        phase: 'pre-generation',
        content: { type: 'code', code: change.content ?? '', language: 'typescript' },
        options: { strictness: 'lenient' },
        level: 'quick',
        imports: imports.map((imp) => ({
          source: imp.source,
          specifiers: imp.specifiers.map((s) => ({
            imported: s,
            local: s,
            isDefault: false,
            isNamespace: false,
          })),
          location: { file: toFilePath(change.path), line: toLineNumber(1), column: toColumnNumber(1) },
        })),
        contextFile: change.path as string,
      });

      if (verifyResult.ok && !verifyResult.value.valid) {
        const issues = verifyResult.value.issues ?? [];
        for (const issue of issues) {
          const severity = issue.severity === 'suggestion' ? 'info' : issue.severity;
          checks.push({
            name: 'dependencies',
            status: severity === 'error' ? 'fail' : 'warning',
            message: issue.message,
            severity: severity as 'error' | 'warning' | 'info',
            file: change.path as string,
          });
        }
      }
    }

    return checks;
  }

  /**
   * Check for conflicts between changes
   */
  private async checkConflicts(request: PreflightRequest): Promise<PreflightCheck[]> {
    const checks: PreflightCheck[] = [];

    // Check for duplicate paths
    const paths = request.changes.map((c) => c.path as string);
    const duplicates = paths.filter((p, i) => paths.indexOf(p) !== i);

    if (duplicates.length > 0) {
      checks.push({
        name: 'conflicts',
        status: 'fail',
        message: `Conflicting changes to same file: ${duplicates[0]}`,
        severity: 'error',
        file: duplicates[0],
      });
    }

    // Check for circular dependencies in creates
    const creates = request.changes
      .filter((c) => c.type === 'create')
      .map((c) => c.path as string);

    for (const change of request.changes) {
      if (!change.content || change.type === 'delete') {
        continue;
      }

      const imports = this.extractImports(change.content);
      for (const imp of imports) {
        // Check if importing from a file that doesn't exist and isn't being created
        if (imp.source.startsWith('.')) {
          const resolvedPath = this.resolveRelativeImport(
            change.path as string,
            imp.source
          );
          const willExist = creates.some((c) => c.includes(resolvedPath));
          const exists = await this.fileSystem.exists(toFilePath(resolvedPath));

          if (!willExist && !exists) {
            checks.push({
              name: 'conflicts',
              status: 'warning',
              message: `Import from non-existent file: ${imp.source} in ${change.path}`,
              severity: 'warning',
              file: change.path as string,
            });
          }
        }
      }
    }

    return checks;
  }

  /**
   * Calculate overall risk level
   */
  private calculateRiskLevel(changes: FileChange[], checks: PreflightCheck[]): RiskLevel {
    let riskScore = 0;

    // Score based on operation types
    for (const change of changes) {
      const changeType = change.type ?? change.action ?? 'write';
      riskScore += RISK_WEIGHTS[changeType] ?? 1;

      // High-risk files
      const path = change.path as string;
      if (HIGH_RISK_PATTERNS.some((p) => p.test(path))) {
        riskScore += 3;
      }
      if (CRITICAL_PATTERNS.some((p) => p.test(path))) {
        riskScore += 5;
      }
    }

    // Score based on check results
    for (const check of checks) {
      if (check.status === 'fail') {
        riskScore += 10;
      } else if (check.status === 'warning') {
        riskScore += 3;
      }
    }

    // Normalize by number of changes
    const normalizedScore = riskScore / Math.max(changes.length, 1);

    if (normalizedScore >= 10) return 'critical';
    if (normalizedScore >= 7) return 'high';
    if (normalizedScore >= 4) return 'medium';
    return 'low';
  }

  /**
   * Basic JS/TS syntax check
   */
  private checkJSSyntax(content: string): string[] {
    const errors: string[] = [];

    // Check for unmatched brackets
    const brackets: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const stack: string[] = [];
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const prev = content[i - 1];
      if (!char) continue;

      // Handle strings
      if ((char === '"' || char === "'" || char === '`') && prev !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (inString) continue;

      // Handle brackets
      const matchingBracket = brackets[char];
      if (matchingBracket) {
        stack.push(matchingBracket);
      } else if (Object.values(brackets).includes(char)) {
        if (stack.pop() !== char) {
          errors.push(`Unmatched bracket '${char}' at position ${i}`);
        }
      }
    }

    if (stack.length > 0) {
      errors.push(`Missing closing bracket(s): ${stack.join(', ')}`);
    }

    return errors;
  }

  /**
   * Extract imports from content
   */
  private extractImports(content: string): Array<{ source: string; specifiers: string[] }> {
    const imports: Array<{ source: string; specifiers: string[] }> = [];
    const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const source = match[3];
      if (!source) continue;

      const specifiers = match[1]
        ? match[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter((s): s is string => !!s)
        : (match[2] ? [match[2]] : []);
      imports.push({
        source,
        specifiers: specifiers.filter((s): s is string => !!s),
      });
    }

    return imports;
  }

  /**
   * Get file extension
   */
  private getExtension(path: string): string {
    const parts = path.split('.');
    return parts.length > 1 ? parts.pop()! : '';
  }

  /**
   * Resolve relative import path
   */
  private resolveRelativeImport(fromFile: string, importPath: string): string {
    const dir = fromFile.substring(0, fromFile.lastIndexOf('/'));
    const parts = [...dir.split('/'), ...importPath.split('/')];
    const resolved: string[] = [];

    for (const part of parts) {
      if (part === '..') {
        resolved.pop();
      } else if (part !== '.') {
        resolved.push(part);
      }
    }

    return resolved.join('/');
  }
}

/**
 * Create a preflight checker service
 */
export function createPreflightCheckerService(
  fileSystem: IFileSystem,
  scopeGuard: IScopeGuardService,
  verificationPipeline?: IVerificationPipelineService,
  logger?: ILogger
): IPreflightCheckerService {
  return new PreflightCheckerService(fileSystem, scopeGuard, verificationPipeline, logger);
}
