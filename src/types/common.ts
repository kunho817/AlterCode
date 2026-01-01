/**
 * Common Types
 *
 * Foundational type definitions used across all layers.
 */

// ============================================================================
// Branded Types
// ============================================================================

/**
 * Brand utility for creating nominal types.
 * Prevents accidental mixing of string IDs.
 */
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Mission identifier */
export type MissionId = Brand<string, 'MissionId'>;

/** Task identifier */
export type TaskId = Brand<string, 'TaskId'>;

/** Agent identifier */
export type AgentId = Brand<string, 'AgentId'>;

/** Intent identifier */
export type IntentId = Brand<string, 'IntentId'>;

/** Snapshot identifier */
export type SnapshotId = Brand<string, 'SnapshotId'>;

/** Absolute file path */
export type FilePath = Brand<string, 'FilePath'>;

/** Relative file path from project root */
export type RelativePath = Brand<string, 'RelativePath'>;

/** Glob pattern for file matching */
export type GlobPattern = Brand<string, 'GlobPattern'>;

/** Token count */
export type TokenCount = Brand<number, 'TokenCount'>;

/** Line number (1-indexed) */
export type LineNumber = Brand<number, 'LineNumber'>;

/** Column number (1-indexed) */
export type ColumnNumber = Brand<number, 'ColumnNumber'>;

// ============================================================================
// ID Factories
// ============================================================================

import { v4 as uuidv4 } from 'uuid';

export const createMissionId = (): MissionId => uuidv4() as MissionId;
export const createTaskId = (): TaskId => uuidv4() as TaskId;
export const createAgentId = (): AgentId => uuidv4() as AgentId;
export const createIntentId = (): IntentId => uuidv4() as IntentId;
export const createSnapshotId = (): SnapshotId => uuidv4() as SnapshotId;

export const toMissionId = (s: string): MissionId => s as MissionId;
export const toTaskId = (s: string): TaskId => s as TaskId;
export const toAgentId = (s: string): AgentId => s as AgentId;
export const toIntentId = (s: string): IntentId => s as IntentId;
export const toSnapshotId = (s: string): SnapshotId => s as SnapshotId;
export const toFilePath = (s: string): FilePath => s as FilePath;
export const toRelativePath = (s: string): RelativePath => s as RelativePath;
export const toGlobPattern = (s: string): GlobPattern => s as GlobPattern;
export const toTokenCount = (n: number): TokenCount => n as TokenCount;
export const toLineNumber = (n: number): LineNumber => n as LineNumber;
export const toColumnNumber = (n: number): ColumnNumber => n as ColumnNumber;

/** Convert FilePath to RelativePath (unsafe, use with caution) */
export const filePathToRelative = (fp: FilePath): RelativePath => fp as unknown as RelativePath;
/** Convert RelativePath to FilePath (unsafe, use with caution) */
export const relativePathToFile = (rp: RelativePath): FilePath => rp as unknown as FilePath;

// ============================================================================
// Result Type
// ============================================================================

/**
 * Result type for operations that can fail.
 * Forces explicit error handling at compile time.
 */
export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Async result type */
export type AsyncResult<T, E = AppError> = Promise<Result<T, E>>;

/** Create a success result */
export const Ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

/** Create a failure result */
export const Err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

// ============================================================================
// Result Utilities
// ============================================================================

/** Check if result is success */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/** Check if result is failure */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/** Map over success value */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return Ok(fn(result.value));
  }
  return result;
}

/** Map over error value */
export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) {
    return Err(fn(result.error));
  }
  return result;
}

/** Chain results (flatMap) */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/** Combine multiple results into one */
export function combineResults<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return Ok(values);
}

/** Unwrap result or throw */
export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/** Unwrap result with default value */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

/** Unwrap result with lazy default */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  if (result.ok) {
    return result.value;
  }
  return fn(result.error);
}

/** Convert Promise to AsyncResult */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorMapper?: (error: unknown) => AppError
): AsyncResult<T> {
  try {
    const value = await fn();
    return Ok(value);
  } catch (error) {
    if (error instanceof AppError) {
      return Err(error);
    }
    if (errorMapper) {
      return Err(errorMapper(error));
    }
    return Err(
      new InfrastructureError(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined
      )
    );
  }
}

/** Convert sync function to Result */
export function tryCatchSync<T>(
  fn: () => T,
  errorMapper?: (error: unknown) => AppError
): Result<T> {
  try {
    const value = fn();
    return Ok(value);
  } catch (error) {
    if (error instanceof AppError) {
      return Err(error);
    }
    if (errorMapper) {
      return Err(errorMapper(error));
    }
    return Err(
      new InfrastructureError(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined
      )
    );
  }
}

// ============================================================================
// Error Types
// ============================================================================

/** Error category for classification */
export type ErrorCategory =
  | 'validation'
  | 'verification'
  | 'execution'
  | 'infrastructure'
  | 'integration'
  | 'user'
  | 'cancelled';

/** Serializable error information */
export interface ErrorInfo {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly message: string;
  readonly timestamp: Date;
  readonly cause?: string;
  readonly stack?: string;
}

/**
 * Base application error class.
 * Can be instantiated directly or extended.
 */
export class AppError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly timestamp = new Date();

  constructor(
    code: string,
    message: string,
    category: ErrorCategory = 'execution',
    cause?: Error
  ) {
    super(message, { cause });
    this.code = code;
    this.category = category;
    this.name = this.constructor.name;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /** Convert to serializable object */
  toJSON(): ErrorInfo {
    return {
      code: this.code,
      category: this.category,
      message: this.message,
      timestamp: this.timestamp,
      cause: (this.cause as Error | undefined)?.message,
      stack: this.stack,
    };
  }
}

// ============================================================================
// Specific Error Types
// ============================================================================

/** Validation errors (user input problems) */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly details?: Record<string, string>
  ) {
    super('VALIDATION_ERROR', message, 'validation');
  }
}

/** Verification errors (reality check failures) */
export class VerificationError extends AppError {
  constructor(
    code: string,
    message: string,
    public readonly location?: SourceLocation,
    public readonly suggestions?: string[]
  ) {
    super(code, message, 'verification');
  }
}

/** File not found error */
export class FileNotFoundError extends VerificationError {
  constructor(path: string, suggestions?: string[]) {
    super('FILE_NOT_FOUND', `File not found: ${path}`, undefined, suggestions);
  }
}

/** Symbol not found error */
export class SymbolNotFoundError extends VerificationError {
  constructor(symbol: string, suggestions?: string[]) {
    super('SYMBOL_NOT_FOUND', `Symbol not found: ${symbol}`, undefined, suggestions);
  }
}

/** Execution errors (runtime problems) */
export class ExecutionError extends AppError {
  constructor(
    code: string,
    message: string,
    cause?: Error
  ) {
    super(code, message, 'execution', cause);
  }
}

/** Task failed error */
export class TaskFailedError extends ExecutionError {
  constructor(taskId: TaskId, message: string, cause?: Error) {
    super('TASK_FAILED', `Task ${taskId} failed: ${message}`, cause);
  }
}

/** Agent error */
export class AgentError extends ExecutionError {
  constructor(agentId: AgentId, message: string, cause?: Error) {
    super('AGENT_ERROR', `Agent ${agentId} error: ${message}`, cause);
  }
}

/** Infrastructure errors (system problems) */
export class InfrastructureError extends AppError {
  constructor(
    code: string,
    message: string,
    cause?: Error
  ) {
    super(code, message, 'infrastructure', cause);
  }
}

/** Database error */
export class DatabaseError extends InfrastructureError {
  constructor(message: string, cause?: Error) {
    super('DATABASE_ERROR', message, cause);
  }
}

/** Cache error */
export class CacheError extends InfrastructureError {
  constructor(message: string, cause?: Error) {
    super('CACHE_ERROR', message, cause);
  }
}

/** Integration errors (external service problems) */
export class IntegrationError extends AppError {
  constructor(
    code: string,
    message: string,
    public readonly provider: string,
    cause?: Error
  ) {
    super(code, message, 'integration', cause);
  }
}

/** AI provider error */
export class AIProviderError extends IntegrationError {
  constructor(provider: string, message: string, cause?: Error) {
    super('AI_PROVIDER_ERROR', message, provider, cause);
  }
}

/** Rate limit error */
export class RateLimitError extends IntegrationError {
  constructor(
    provider: string,
    public readonly retryAfter?: number
  ) {
    super('RATE_LIMIT', `Rate limit exceeded for ${provider}`, provider);
  }
}

/** Cancellation error */
export class CancellationError extends AppError {
  constructor(reason?: string) {
    super('CANCELLED', reason ?? 'Operation cancelled', 'cancelled');
  }
}

/** Timeout error */
export class TimeoutError extends ExecutionError {
  constructor(operation: string, timeoutMs: number) {
    super('TIMEOUT', `Operation '${operation}' timed out after ${timeoutMs}ms`);
  }
}

// ============================================================================
// Source Location
// ============================================================================

/** Source location in a file */
export interface SourceLocation {
  readonly file: FilePath;
  readonly line: LineNumber;
  readonly column: ColumnNumber;
  readonly endLine?: LineNumber;
  readonly endColumn?: ColumnNumber;
}

/** Create a source location */
export function createSourceLocation(
  file: FilePath | string,
  line: number,
  column: number,
  endLine?: number,
  endColumn?: number
): SourceLocation {
  return {
    file: typeof file === 'string' ? toFilePath(file) : file,
    line: toLineNumber(line),
    column: toColumnNumber(column),
    endLine: endLine !== undefined ? toLineNumber(endLine) : undefined,
    endColumn: endColumn !== undefined ? toColumnNumber(endColumn) : undefined,
  };
}

// ============================================================================
// Disposable
// ============================================================================

/** Disposable resource interface */
export interface Disposable {
  dispose(): void;
}

/** Create a disposable from a cleanup function */
export function createDisposable(dispose: () => void): Disposable {
  return { dispose };
}

/** Combine multiple disposables */
export function combineDisposables(...disposables: Disposable[]): Disposable {
  return {
    dispose: () => {
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // Ignore disposal errors
        }
      }
    },
  };
}

// ============================================================================
// Cancellation Token
// ============================================================================

/** Cancellation token for long-running operations */
export interface CancellationToken {
  readonly isCancelled: boolean;
  readonly reason?: string;
  throwIfCancelled?(): void;
  onCancelled?(callback: () => void): Disposable;
  // Optional methods for mutable tokens
  cancel?(reason?: string): void;
  onCancel?(callback: () => void): void;
}

/** Cancellation token source */
export interface CancellationTokenSource {
  readonly token: CancellationToken;
  cancel(reason?: string): void;
  dispose(): void;
}

/** None token that never cancels */
export const CancellationToken_None: CancellationToken = {
  isCancelled: false,
  reason: undefined,
  throwIfCancelled: () => {
    /* no-op */
  },
  onCancelled: () => ({ dispose: () => {} }),
};

/** Create a new cancellation token source */
export function createCancellationTokenSource(): CancellationTokenSource {
  let isCancelled = false;
  let reason: string | undefined;
  const callbacks = new Set<() => void>();

  const token: CancellationToken = {
    get isCancelled() {
      return isCancelled;
    },
    get reason() {
      return reason;
    },
    throwIfCancelled() {
      if (isCancelled) {
        throw new CancellationError(reason);
      }
    },
    onCancelled(callback: () => void): Disposable {
      if (isCancelled) {
        callback();
        return { dispose: () => {} };
      }
      callbacks.add(callback);
      return {
        dispose: () => callbacks.delete(callback),
      };
    },
  };

  return {
    token,
    cancel(r?: string) {
      if (isCancelled) {
        return;
      }
      isCancelled = true;
      reason = r;
      for (const callback of callbacks) {
        try {
          callback();
        } catch {
          // Ignore callback errors
        }
      }
    },
    dispose() {
      callbacks.clear();
    },
  };
}

// ============================================================================
// Utility Types
// ============================================================================

/** Make all properties deeply readonly */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/** Make specific properties optional */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Make specific properties required */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/** Extract keys of type */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/** Non-empty array */
export type NonEmptyArray<T> = [T, ...T[]];

/** Optional promise */
export type MaybePromise<T> = T | Promise<T>;
