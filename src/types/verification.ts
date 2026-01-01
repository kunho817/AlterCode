/**
 * Verification Layer Types
 *
 * Types for reality verification:
 * - File Validation
 * - Symbol Resolution
 * - API Checking
 * - Dependency Verification
 * - Verification Pipeline
 */

import { AsyncResult, IntentId, SourceLocation } from './common';
import { SymbolKind, AnySymbol } from './knowledge';

// ============================================================================
// Verification Phase Types
// ============================================================================

/** Verification phase */
export type VerificationPhase =
  | 'pre-generation'   // Before LLM runs
  | 'post-generation'  // After LLM output
  | 'pre-apply';       // Before applying changes

/** Verification strictness */
export type VerificationStrictness = 'strict' | 'standard' | 'lenient';

/** Verification level */
export type VerificationLevel = 'quick' | 'minimal' | 'standard' | 'thorough' | 'exhaustive';

// ============================================================================
// File Validation Types
// ============================================================================

/** File suggestion for corrections */
export interface FileSuggestion {
  readonly path: string;
  readonly similarity: number;
  readonly reason: string;
}

/** File validation result */
export interface FileValidationResult {
  readonly path: string;
  readonly valid: boolean;
  readonly exists?: boolean;
  readonly isFile?: boolean;
  readonly isDirectory?: boolean;
  readonly size?: number;
  readonly lastModified?: Date;
  readonly error?: string;
  readonly suggestions?: FileSuggestion[];
}

/** File validation request */
export interface FileValidationRequest {
  readonly paths: string[];
  readonly checkContent?: boolean;
  readonly checkWritable?: boolean;
}

// ============================================================================
// Symbol Resolution Types
// ============================================================================

/** Symbol reference */
export interface SymbolReference {
  readonly name: string;
  readonly kind?: SymbolKind;
  readonly module?: string;
  readonly context?: string;
}

/** Symbol suggestion */
export interface SymbolSuggestion {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly location: SourceLocation;
  readonly similarity: number;
  readonly reason: string;
}

/** Symbol resolution result */
export interface SymbolResolutionResult {
  readonly reference: SymbolReference;
  readonly resolved: boolean;
  readonly symbol?: AnySymbol;
  readonly location?: SourceLocation;
  readonly error?: string;
  readonly suggestions?: SymbolSuggestion[];
}

/** Symbol resolution request */
export interface SymbolResolutionRequest {
  readonly symbols: SymbolReference[];
  readonly contextFile?: string;
}

// ============================================================================
// API Validation Types
// ============================================================================

/** Call argument */
export interface CallArgument {
  readonly position: number;
  readonly name?: string;
  readonly value: string;
  readonly inferredType: string;
}

/** Function call */
export interface FunctionCall {
  readonly name: string;
  readonly module?: string;
  readonly arguments: CallArgument[];
  readonly location: SourceLocation;
}

/** Argument error */
export interface ArgumentError {
  readonly position: number;
  readonly name?: string;
  readonly expected: string;
  readonly actual: string;
  readonly message: string;
}

/** API validation result */
export interface APIValidationResult {
  readonly call: FunctionCall;
  readonly valid: boolean;
  readonly functionExists: boolean;
  readonly signatureMatch: boolean;
  readonly argumentErrors: ArgumentError[];
  readonly expectedSignature?: string;
}

/** API validation request */
export interface APIValidationRequest {
  readonly calls: FunctionCall[];
}

// ============================================================================
// Dependency Validation Types
// ============================================================================

/** Import specifier */
export interface ImportSpecifierInfo {
  readonly imported: string;
  readonly local: string;
  readonly isDefault: boolean;
  readonly isNamespace: boolean;
}

/** Import statement */
export interface ImportStatement {
  readonly source: string;
  readonly specifiers: ImportSpecifierInfo[];
  readonly location: SourceLocation;
}

/** Dependency validation result */
export interface DependencyValidationResult {
  readonly import: ImportStatement;
  readonly valid: boolean;
  readonly moduleExists: boolean;
  readonly isInstalled: boolean;
  readonly version?: string;
  readonly exportsExist: boolean;
  readonly missingExports: string[];
  readonly installCommand?: string;
  readonly alternativeModule?: string;
}

/** Dependency validation request */
export interface DependencyValidationRequest {
  readonly imports: ImportStatement[];
}

// ============================================================================
// Code Validation Types
// ============================================================================

/** Syntax error */
export interface SyntaxError {
  readonly message: string;
  readonly location: SourceLocation;
  readonly suggestion?: string;
}

/** Type error */
export interface TypeError {
  readonly message: string;
  readonly location: SourceLocation;
  readonly expected?: string;
  readonly actual?: string;
}

/** Code validation result */
export interface CodeValidationResult {
  readonly valid: boolean;
  readonly syntaxErrors: SyntaxError[];
  readonly typeErrors: TypeError[];
  readonly language: string;
}

// ============================================================================
// Verification Content Types
// ============================================================================

/** Intent verification content */
export interface IntentVerificationContent {
  readonly type: 'intent';
  readonly intentId: IntentId;
  readonly action: string;
  readonly targets: string[];
  readonly scope: {
    readonly allowedFiles: string[];
    readonly forbiddenFiles: string[];
  };
}

/** Code verification content */
export interface CodeVerificationContent {
  readonly type: 'code';
  readonly code: string;
  readonly language: string;
  readonly filePath?: string;
}

/** Changes verification content */
export interface ChangesVerificationContent {
  readonly type: 'changes';
  readonly changes: FileChange[];
}

/** File change action type */
export type FileChangeAction = 'create' | 'modify' | 'delete' | 'write';

/** File change */
export interface FileChange {
  readonly path: string;
  readonly action?: FileChangeAction;
  readonly type?: FileChangeAction; // Alias for action
  readonly content?: string;
  readonly originalContent?: string;
  readonly diff?: string;
}

/** Verification content */
export type VerificationContent =
  | IntentVerificationContent
  | CodeVerificationContent
  | ChangesVerificationContent;

// ============================================================================
// Verification Result Types
// ============================================================================

/** Check result */
export interface CheckResult {
  readonly check: string;
  readonly passed: boolean;
  readonly message: string;
  readonly duration: number;
  readonly details?: unknown;
}

/** Verification severity */
export type VerificationSeverity = 'error' | 'warning' | 'info' | 'suggestion';

/** Verification issue */
export interface VerificationIssue {
  readonly code?: string;
  readonly type?: 'file' | 'symbol' | 'api' | 'dependency';
  readonly message: string;
  readonly severity: VerificationSeverity;
  readonly location?: SourceLocation | { file: string };
  suggestion?: string;
  readonly autoFixable?: boolean;
  fix?: string | { type: string; original?: string; replacement?: string; command?: string };
}

/** Verification error */
export interface VerificationErrorInfo extends VerificationIssue {
  readonly severity: 'error';
}

/** Verification warning */
export interface VerificationWarningInfo extends VerificationIssue {
  readonly severity: 'warning';
}

/** Verification suggestion */
export interface VerificationSuggestionInfo extends VerificationIssue {
  readonly severity: 'suggestion';
}

/** Verification statistics */
export interface VerificationStats {
  readonly filesChecked: number;
  readonly symbolsResolved: number;
  readonly apiCallsVerified: number;
  readonly importsValidated?: number;
  readonly dependenciesChecked?: number;
  readonly errorsFound?: number;
  readonly warningsFound?: number;
  readonly issueCount?: number;
  readonly errorCount?: number;
  readonly warningCount?: number;
  readonly duration?: number;
}

/** Verification result */
export interface VerificationResult {
  readonly passed?: boolean;
  readonly phase?: VerificationPhase;
  readonly checks?: CheckResult[];
  readonly errors?: VerificationErrorInfo[];
  readonly warnings?: VerificationWarningInfo[];
  readonly suggestions?: VerificationSuggestionInfo[];
  readonly duration?: number;
  readonly timestamp?: Date;
  /** Alias for passed */
  readonly valid?: boolean;
  /** Verification statistics */
  readonly stats?: VerificationStats;
  /** Issues found */
  readonly issues?: VerificationIssue[];
  /** Summary of verification result */
  readonly summary?: string;
}

// ============================================================================
// Verification Request Types
// ============================================================================

/** Verification options */
export interface VerificationOptions {
  readonly strictness: VerificationStrictness;
  readonly skipChecks?: string[];
  readonly additionalChecks?: string[];
  readonly timeout?: number;
}

/** Verification request */
export interface VerificationRequest {
  readonly phase: VerificationPhase;
  readonly content: VerificationContent;
  readonly options: VerificationOptions;
  /** Verification level for the request */
  readonly level?: VerificationLevel;
  /** Context file for verification */
  readonly contextFile?: string;
  /** File paths to verify */
  readonly filePaths?: string[];
  /** Symbols to verify */
  readonly symbols?: SymbolReference[];
  /** API calls to verify */
  readonly apiCalls?: FunctionCall[];
  /** Imports to verify */
  readonly imports?: ImportStatement[];
}

// ============================================================================
// Default Values
// ============================================================================

/** Default verification options */
export const DEFAULT_VERIFICATION_OPTIONS: VerificationOptions = {
  strictness: 'standard',
  skipChecks: [],
  additionalChecks: [],
  timeout: 30000,
};

// ============================================================================
// Verification Service Interfaces
// ============================================================================

/** Verification pipeline service */
export interface IVerificationPipelineService {
  verify(request: VerificationRequest, cancellation?: import('./common').CancellationToken): AsyncResult<VerificationResult>;
  getLevel(content: string): VerificationLevel;
  quickVerify(request: VerificationRequest): AsyncResult<boolean>;
}

/** File validator service */
export interface IFileValidatorService {
  validate(request: FileValidationRequest): AsyncResult<FileValidationResult[]>;
  exists(path: string): boolean;
  isFile(path: string): boolean;
  isDirectory(path: string): boolean;
  suggestCorrection(invalidPath: string): FileSuggestion[];
}

/** Symbol resolver service */
export interface ISymbolResolverService {
  resolve(request: SymbolResolutionRequest): AsyncResult<SymbolResolutionResult[]>;
  exists(name: string, kind?: SymbolKind): boolean;
  suggest(name: string): SymbolSuggestion[];
}

/** API checker service */
export interface IAPICheckerService {
  validate(request: APIValidationRequest): AsyncResult<APIValidationResult[]>;
  getSignature(name: string, module?: string): string | null;
}

/** Dependency verifier service */
export interface IDependencyVerifierService {
  validate(request: DependencyValidationRequest): AsyncResult<DependencyValidationResult[]>;
  isInstalled(packageName: string): boolean;
  getVersion(packageName: string): string | null;
}
