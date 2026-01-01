/**
 * Verification Pipeline Service
 *
 * Orchestrates all verification services to validate AI-generated content:
 * - File path validation
 * - Symbol resolution
 * - API call checking
 * - Dependency verification
 *
 * Returns unified verification results with suggestions for fixes.
 */

import {
  IVerificationPipelineService,
  IFileValidatorService,
  ISymbolResolverService,
  IAPICheckerService,
  IDependencyVerifierService,
  VerificationRequest,
  VerificationResult,
  VerificationLevel,
  VerificationIssue,
  IssueSeverity,
  FileValidationResult,
  SymbolResolutionResult,
  APIValidationResult,
  DependencyValidationResult,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
  CancellationToken,
} from '../types';

/**
 * Verification Pipeline Service implementation
 */
export class VerificationPipelineService implements IVerificationPipelineService {
  private readonly fileValidator: IFileValidatorService;
  private readonly symbolResolver: ISymbolResolverService;
  private readonly apiChecker: IAPICheckerService;
  private readonly dependencyVerifier: IDependencyVerifierService;
  private readonly logger?: ILogger;

  constructor(
    fileValidator: IFileValidatorService,
    symbolResolver: ISymbolResolverService,
    apiChecker: IAPICheckerService,
    dependencyVerifier: IDependencyVerifierService,
    logger?: ILogger
  ) {
    this.fileValidator = fileValidator;
    this.symbolResolver = symbolResolver;
    this.apiChecker = apiChecker;
    this.dependencyVerifier = dependencyVerifier;
    this.logger = logger?.child('VerificationPipelineService');
  }

  async verify(
    request: VerificationRequest,
    cancellation?: CancellationToken
  ): AsyncResult<VerificationResult> {
    const startTime = Date.now();
    this.logger?.info('Starting verification pipeline', {
      level: request.level,
      contextFile: request.contextFile,
    });

    try {
      const issues: VerificationIssue[] = [];

      // Quick verification - just file paths
      if (request.level === 'quick' || request.level === 'standard' || request.level === 'thorough') {
        if (cancellation?.isCancelled) {
          return Err(new AppError('CANCELLED', 'Verification cancelled'));
        }

        const fileIssues = await this.verifyFiles(request);
        issues.push(...fileIssues);
      }

      // Standard verification - add symbols
      if (request.level === 'standard' || request.level === 'thorough') {
        if (cancellation?.isCancelled) {
          return Err(new AppError('CANCELLED', 'Verification cancelled'));
        }

        const symbolIssues = await this.verifySymbols(request);
        issues.push(...symbolIssues);
      }

      // Thorough verification - add APIs and dependencies
      if (request.level === 'thorough') {
        if (cancellation?.isCancelled) {
          return Err(new AppError('CANCELLED', 'Verification cancelled'));
        }

        const [apiIssues, depIssues] = await Promise.all([
          this.verifyAPICalls(request),
          this.verifyDependencies(request),
        ]);

        issues.push(...apiIssues, ...depIssues);
      }

      // Calculate overall validity
      const hasErrors = issues.some((i) => i.severity === 'error');
      const hasWarnings = issues.some((i) => i.severity === 'warning');

      const result: VerificationResult = {
        valid: !hasErrors,
        issues,
        summary: this.generateSummary(issues),
        stats: {
          filesChecked: request.filePaths?.length ?? 0,
          symbolsResolved: request.symbols?.length ?? 0,
          apiCallsVerified: request.apiCalls?.length ?? 0,
          dependenciesChecked: request.imports?.length ?? 0,
          issueCount: issues.length,
          errorCount: issues.filter((i) => i.severity === 'error').length,
          warningCount: issues.filter((i) => i.severity === 'warning').length,
          duration: Date.now() - startTime,
        },
      };

      this.logger?.info('Verification complete', {
        valid: result.valid,
        issueCount: issues.length,
        duration: result.stats?.duration,
      });

      return Ok(result);
    } catch (error) {
      this.logger?.error('Verification pipeline failed', error as Error);
      return Err(
        new AppError('VERIFICATION', `Verification failed: ${(error as Error).message}`)
      );
    }
  }

  getLevel(content: string): VerificationLevel {
    // Determine appropriate verification level based on content
    const lines = content.split('\n').length;
    const hasImports = /^import\s+/m.test(content);
    const hasFunctionCalls = /\w+\s*\([^)]*\)/m.test(content);
    const hasFileRefs = /['"`]\.{0,2}\/[\w/.-]+['"`]/m.test(content);

    // Large content with many features - thorough
    if (lines > 100 && hasImports && hasFunctionCalls) {
      return 'thorough';
    }

    // Medium content or has imports/calls - standard
    if (lines > 20 || hasImports || hasFunctionCalls) {
      return 'standard';
    }

    // Small content - quick
    return 'quick';
  }

  async quickVerify(request: VerificationRequest): AsyncResult<boolean> {
    const result = await this.verify({ ...request, level: 'quick' });

    if (!result.ok) {
      return Err(result.error);
    }

    return Ok(result.value.valid ?? true);
  }

  /**
   * Verify file paths
   */
  private async verifyFiles(request: VerificationRequest): Promise<VerificationIssue[]> {
    const issues: VerificationIssue[] = [];

    if (!request.filePaths || request.filePaths.length === 0) {
      return issues;
    }

    const result = await this.fileValidator.validate({
      paths: request.filePaths,
      checkContent: request.level === 'thorough',
    });

    if (!result.ok) {
      issues.push({
        type: 'file',
        severity: 'error',
        message: `File validation failed: ${result.error.message}`,
        location: { file: 'unknown' },
      });
      return issues;
    }

    for (const validation of result.value) {
      if (!validation.valid) {
        const issue: VerificationIssue = {
          type: 'file',
          severity: 'error',
          message: validation.error ?? `File not found: ${validation.path}`,
          location: { file: validation.path },
        };

        // Add suggestions if available
        if (validation.suggestions && validation.suggestions.length > 0) {
          const firstSuggestion = validation.suggestions[0];
          if (firstSuggestion) {
            issue.suggestion = `Did you mean: ${firstSuggestion.path}?`;
            issue.fix = {
              type: 'replace',
              original: validation.path,
              replacement: firstSuggestion.path,
            };
          }
        }

        issues.push(issue);
      }
    }

    return issues;
  }

  /**
   * Verify symbol references
   */
  private async verifySymbols(request: VerificationRequest): Promise<VerificationIssue[]> {
    const issues: VerificationIssue[] = [];

    if (!request.symbols || request.symbols.length === 0) {
      return issues;
    }

    const result = await this.symbolResolver.resolve({
      symbols: request.symbols,
      contextFile: request.contextFile,
    });

    if (!result.ok) {
      issues.push({
        type: 'symbol',
        severity: 'error',
        message: `Symbol resolution failed: ${result.error.message}`,
        location: { file: request.contextFile ?? 'unknown' },
      });
      return issues;
    }

    for (const resolution of result.value) {
      if (!resolution.resolved) {
        const issue: VerificationIssue = {
          type: 'symbol',
          severity: 'error',
          message: resolution.error ?? `Symbol not found: ${resolution.reference.name}`,
          location: { file: request.contextFile ?? 'unknown' },
        };

        // Add suggestions if available
        if (resolution.suggestions && resolution.suggestions.length > 0) {
          const firstSuggestion = resolution.suggestions[0];
          if (firstSuggestion) {
            issue.suggestion = `Did you mean: ${firstSuggestion.name}? (${firstSuggestion.reason})`;
            issue.fix = {
              type: 'replace',
              original: resolution.reference.name,
              replacement: firstSuggestion.name,
            };
          }
        }

        issues.push(issue);
      }
    }

    return issues;
  }

  /**
   * Verify API calls
   */
  private async verifyAPICalls(request: VerificationRequest): Promise<VerificationIssue[]> {
    const issues: VerificationIssue[] = [];

    if (!request.apiCalls || request.apiCalls.length === 0) {
      return issues;
    }

    const result = await this.apiChecker.validate({
      calls: request.apiCalls,
    });

    if (!result.ok) {
      issues.push({
        type: 'api',
        severity: 'error',
        message: `API validation failed: ${result.error.message}`,
        location: { file: request.contextFile ?? 'unknown' },
      });
      return issues;
    }

    for (const validation of result.value) {
      if (!validation.valid) {
        // Function doesn't exist
        if (!validation.functionExists) {
          issues.push({
            type: 'api',
            severity: 'error',
            message: `Function not found: ${validation.call.name}`,
            location: validation.call.location,
          });
          continue;
        }

        // Signature mismatch - report argument errors
        for (const argError of validation.argumentErrors) {
          const severity: IssueSeverity = argError.message.includes('Missing required')
            ? 'error'
            : 'warning';

          issues.push({
            type: 'api',
            severity,
            message: `${validation.call.name}: ${argError.message}`,
            location: validation.call.location,
            suggestion: validation.expectedSignature
              ? `Expected signature: ${validation.expectedSignature}`
              : undefined,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Verify dependencies
   */
  private async verifyDependencies(request: VerificationRequest): Promise<VerificationIssue[]> {
    const issues: VerificationIssue[] = [];

    if (!request.imports || request.imports.length === 0) {
      return issues;
    }

    const result = await this.dependencyVerifier.validate({
      imports: request.imports,
    });

    if (!result.ok) {
      issues.push({
        type: 'dependency',
        severity: 'error',
        message: `Dependency validation failed: ${result.error.message}`,
        location: { file: request.contextFile ?? 'unknown' },
      });
      return issues;
    }

    for (const validation of result.value) {
      if (!validation.valid) {
        const importStmt = validation.import;

        // Package not installed
        if (!validation.isInstalled) {
          issues.push({
            type: 'dependency',
            severity: 'error',
            message: `Package not installed: ${importStmt.source}`,
            location: importStmt.location,
            suggestion: validation.installCommand
              ? `Run: ${validation.installCommand}`
              : undefined,
            fix: validation.installCommand
              ? { type: 'command', command: validation.installCommand }
              : undefined,
          });
          continue;
        }

        // Module doesn't exist
        if (!validation.moduleExists) {
          issues.push({
            type: 'dependency',
            severity: 'error',
            message: `Module not found: ${importStmt.source}`,
            location: importStmt.location,
          });
          continue;
        }

        // Missing exports
        if (validation.missingExports.length > 0) {
          issues.push({
            type: 'dependency',
            severity: 'error',
            message: `Missing exports from ${importStmt.source}: ${validation.missingExports.join(', ')}`,
            location: importStmt.location,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Generate summary of verification issues
   */
  private generateSummary(issues: VerificationIssue[]): string {
    if (issues.length === 0) {
      return 'All verifications passed';
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const infoCount = issues.filter((i) => i.severity === 'info').length;

    const parts: string[] = [];

    if (errorCount > 0) {
      parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
    }
    if (warningCount > 0) {
      parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    }
    if (infoCount > 0) {
      parts.push(`${infoCount} info`);
    }

    // Group by type
    const byType = new Map<string, number>();
    for (const issue of issues) {
      const issueType = issue.type ?? 'unknown';
      byType.set(issueType, (byType.get(issueType) ?? 0) + 1);
    }

    const typeBreakdown = Array.from(byType.entries())
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');

    return `Found ${parts.join(', ')} (${typeBreakdown})`;
  }
}

/**
 * Create a verification pipeline service
 */
export function createVerificationPipelineService(
  fileValidator: IFileValidatorService,
  symbolResolver: ISymbolResolverService,
  apiChecker: IAPICheckerService,
  dependencyVerifier: IDependencyVerifierService,
  logger?: ILogger
): IVerificationPipelineService {
  return new VerificationPipelineService(
    fileValidator,
    symbolResolver,
    apiChecker,
    dependencyVerifier,
    logger
  );
}
