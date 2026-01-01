/**
 * Scope Guard Service
 *
 * Enforces scope boundaries to prevent unauthorized changes:
 * - File access control (read/write/delete permissions)
 * - Directory boundaries
 * - Pattern-based exclusions
 * - Mission scope enforcement
 */

import {
  IScopeGuardService,
  ExtendedScopePolicy,
  ExtendedScopeViolation,
  ExtendedFileOperation,
  ExtendedFileOperationType,
  FilePath,
  MissionId,
  IFileSystem,
  ILogger,
  toFilePath,
} from '../types';

/** Type alias for convenience */
type ScopePolicy = ExtendedScopePolicy;
type ScopeViolation = ExtendedScopeViolation;
type FileOperation = ExtendedFileOperation;

/** Default patterns to exclude */
const DEFAULT_EXCLUSIONS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.env*',
  '*.pem',
  '*.key',
  '*.cert',
];

/** Sensitive file patterns */
const SENSITIVE_PATTERNS = [
  /\.env/i,
  /secrets?\./i,
  /credentials?\./i,
  /password/i,
  /\.pem$/i,
  /\.key$/i,
  /private/i,
  /\.ssh/i,
];

/**
 * Scope Guard Service implementation
 */
export class ScopeGuardService implements IScopeGuardService {
  private readonly fileSystem: IFileSystem;
  private readonly projectRoot: FilePath;
  private readonly logger?: ILogger;

  // Active policies by mission
  private missionPolicies: Map<string, ScopePolicy> = new Map();

  // Global policy (applies to all missions)
  private globalPolicy: ScopePolicy;

  constructor(fileSystem: IFileSystem, projectRoot: FilePath, logger?: ILogger) {
    this.fileSystem = fileSystem;
    this.projectRoot = projectRoot;
    this.logger = logger?.child('ScopeGuardService');

    // Initialize global policy with defaults
    this.globalPolicy = {
      allowedPaths: ['**/*'],
      excludedPaths: DEFAULT_EXCLUSIONS,
      allowedOperations: ['read', 'write', 'create'],
      maxFileSize: 1024 * 1024, // 1MB
      maxFilesPerOperation: 50,
      requireConfirmation: ['delete'],
    };
  }

  check(operation: FileOperation): ScopeViolation | null {
    const { type, path, missionId } = operation;

    this.logger?.debug('Checking operation', { type, path, missionId });

    // Get applicable policy
    const policy = missionId
      ? this.getMergedPolicy(missionId as string)
      : this.globalPolicy;

    // Check if operation type is allowed
    if (!policy.allowedOperations.includes(type)) {
      return {
        operation,
        reason: `Operation '${type}' is not allowed`,
        severity: 'error',
        policy: 'operation_type',
      };
    }

    // Normalize path
    const normalizedPath = this.normalizePath(path);

    // Check if path is within project
    if (!this.isWithinProject(normalizedPath)) {
      return {
        operation,
        reason: 'Path is outside project root',
        severity: 'error',
        policy: 'project_boundary',
      };
    }

    // Check exclusion patterns
    const exclusionMatch = this.matchesExclusion(normalizedPath, policy);
    if (exclusionMatch) {
      return {
        operation,
        reason: `Path matches exclusion pattern: ${exclusionMatch}`,
        severity: 'error',
        policy: 'exclusion_pattern',
      };
    }

    // Check allowed paths
    if (!this.matchesAllowed(normalizedPath, policy)) {
      return {
        operation,
        reason: 'Path is not in allowed paths',
        severity: 'error',
        policy: 'allowed_paths',
      };
    }

    // Check for sensitive files
    if (this.isSensitiveFile(normalizedPath)) {
      if (type === 'write' || type === 'delete' || type === 'create') {
        return {
          operation,
          reason: 'Cannot modify sensitive files',
          severity: 'error',
          policy: 'sensitive_files',
        };
      }
      // Warn on read
      this.logger?.warn('Reading sensitive file', { path: normalizedPath });
    }

    // Check file size for write operations
    if (operation.content && type === 'write') {
      const size = new TextEncoder().encode(operation.content).length;
      if (size > policy.maxFileSize) {
        return {
          operation,
          reason: `File size (${size} bytes) exceeds limit (${policy.maxFileSize} bytes)`,
          severity: 'error',
          policy: 'max_file_size',
        };
      }
    }

    // Check if confirmation is required
    if (policy.requireConfirmation.includes(type)) {
      return {
        operation,
        reason: `Operation '${type}' requires user confirmation`,
        severity: 'warning',
        policy: 'requires_confirmation',
        requiresConfirmation: true,
      };
    }

    // All checks passed
    return null;
  }

  setPolicy(missionId: MissionId, policy: Partial<ScopePolicy>): void {
    const existing = this.missionPolicies.get(missionId as string) ?? { ...this.globalPolicy };

    const merged: ScopePolicy = {
      ...existing,
      ...policy,
      // Merge arrays instead of replacing
      allowedPaths: policy.allowedPaths ?? existing.allowedPaths,
      excludedPaths: [
        ...new Set([
          ...(existing.excludedPaths ?? []),
          ...(policy.excludedPaths ?? []),
        ]),
      ],
      allowedOperations: policy.allowedOperations ?? existing.allowedOperations,
      requireConfirmation: [
        ...new Set([
          ...(existing.requireConfirmation ?? []),
          ...(policy.requireConfirmation ?? []),
        ]),
      ],
    };

    this.missionPolicies.set(missionId as string, merged);
    this.logger?.info('Policy set for mission', { missionId, policy: merged });
  }

  getPolicy(missionId?: MissionId): ScopePolicy {
    if (missionId) {
      return this.getMergedPolicy(missionId as string);
    }
    return { ...this.globalPolicy };
  }

  isAllowed(path: string, operation: FileOperation['type']): boolean {
    const violation = this.check({
      type: operation,
      path: toFilePath(path),
    });

    return violation === null || violation.requiresConfirmation === true;
  }

  /**
   * Get merged policy for a mission
   */
  private getMergedPolicy(missionId: string): ScopePolicy {
    const missionPolicy = this.missionPolicies.get(missionId);

    if (!missionPolicy) {
      return { ...this.globalPolicy };
    }

    // Mission policy takes precedence but inherits from global
    return {
      allowedPaths: missionPolicy.allowedPaths.length > 0
        ? missionPolicy.allowedPaths
        : this.globalPolicy.allowedPaths,
      excludedPaths: [
        ...new Set([
          ...this.globalPolicy.excludedPaths,
          ...missionPolicy.excludedPaths,
        ]),
      ],
      allowedOperations: missionPolicy.allowedOperations,
      maxFileSize: Math.min(
        missionPolicy.maxFileSize,
        this.globalPolicy.maxFileSize
      ),
      maxFilesPerOperation: Math.min(
        missionPolicy.maxFilesPerOperation,
        this.globalPolicy.maxFilesPerOperation
      ),
      requireConfirmation: [
        ...new Set([
          ...this.globalPolicy.requireConfirmation,
          ...missionPolicy.requireConfirmation,
        ]),
      ],
    };
  }

  /**
   * Normalize a file path
   */
  private normalizePath(path: FilePath): string {
    const pathStr = path as string;

    // Convert to forward slashes
    let normalized = pathStr.replace(/\\/g, '/');

    // Remove leading ./
    if (normalized.startsWith('./')) {
      normalized = normalized.slice(2);
    }

    return normalized;
  }

  /**
   * Check if path is within project root
   */
  private isWithinProject(path: string): boolean {
    try {
      const fullPath = this.resolvePath(path);
      const relative = this.fileSystem.relative(this.projectRoot, fullPath);

      // If relative path starts with .., it's outside project
      return !(relative as string).startsWith('..');
    } catch {
      return false;
    }
  }

  /**
   * Check if path matches any exclusion pattern
   */
  private matchesExclusion(path: string, policy: ScopePolicy): string | null {
    for (const pattern of policy.excludedPaths) {
      if (this.matchGlob(path, pattern)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Check if path matches allowed patterns
   */
  private matchesAllowed(path: string, policy: ScopePolicy): boolean {
    // If no allowed paths specified, allow all (except exclusions)
    if (policy.allowedPaths.length === 0) {
      return true;
    }

    for (const pattern of policy.allowedPaths) {
      if (this.matchGlob(path, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file is sensitive
   */
  private isSensitiveFile(path: string): boolean {
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(path)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob matching
   */
  private matchGlob(path: string, pattern: string): boolean {
    // Convert glob to regex
    let regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*')
      .replace(/\?/g, '.');

    // Handle leading **/ (match any prefix)
    if (regexStr.startsWith('.*')) {
      regexStr = '(?:^|/)' + regexStr.slice(2);
    } else {
      regexStr = '^' + regexStr;
    }

    // Handle trailing /** (match any suffix)
    if (!regexStr.endsWith('.*')) {
      regexStr = regexStr + '$';
    }

    try {
      const regex = new RegExp(regexStr, 'i');
      return regex.test(path);
    } catch {
      // Invalid pattern - fall back to simple includes check
      return path.includes(pattern.replace(/\*/g, ''));
    }
  }

  /**
   * Resolve path relative to project root
   */
  private resolvePath(path: string): FilePath {
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
      return toFilePath(path);
    }
    return this.fileSystem.join(this.projectRoot as string, path);
  }

  /**
   * Clear mission-specific policy
   */
  clearPolicy(missionId: MissionId): void {
    this.missionPolicies.delete(missionId as string);
    this.logger?.debug('Policy cleared for mission', { missionId });
  }

  /**
   * Update global policy
   */
  updateGlobalPolicy(policy: Partial<ScopePolicy>): void {
    this.globalPolicy = {
      ...this.globalPolicy,
      ...policy,
    };
    this.logger?.info('Global policy updated', { policy: this.globalPolicy });
  }

  /**
   * Add exclusion patterns
   */
  addExclusions(patterns: string[]): void {
    this.globalPolicy.excludedPaths = [
      ...new Set([
        ...this.globalPolicy.excludedPaths,
        ...patterns,
      ]),
    ];
  }

  /**
   * Get all violations for a batch of operations
   */
  checkBatch(operations: FileOperation[]): ScopeViolation[] {
    const violations: ScopeViolation[] = [];

    // Check individual operations
    for (const op of operations) {
      const violation = this.check(op);
      if (violation) {
        violations.push(violation);
      }
    }

    // Check batch size
    const missionId = operations[0]?.missionId;
    const policy = missionId
      ? this.getMergedPolicy(missionId as string)
      : this.globalPolicy;

    const firstOp = operations[0];
    if (firstOp && operations.length > policy.maxFilesPerOperation) {
      violations.push({
        operation: firstOp,
        reason: `Batch size (${operations.length}) exceeds limit (${policy.maxFilesPerOperation})`,
        severity: 'error',
        policy: 'max_files_per_operation',
      });
    }

    return violations;
  }
}

/**
 * Create a scope guard service
 */
export function createScopeGuardService(
  fileSystem: IFileSystem,
  projectRoot: FilePath,
  logger?: ILogger
): IScopeGuardService {
  return new ScopeGuardService(fileSystem, projectRoot, logger);
}
