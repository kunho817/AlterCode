/**
 * Knowledge Layer Types
 *
 * Types for knowledge management:
 * - Project Snapshot
 * - Semantic Index
 * - Conventions
 * - Error Memory
 */

import {
  AsyncResult,
  FilePath,
  RelativePath,
  SnapshotId,
  SourceLocation,
  TaskId,
  AgentId,
} from './common';
import { IStore } from './infrastructure';

// ============================================================================
// Project Snapshot Types
// ============================================================================

/** File tree node */
export interface FileTreeNode {
  readonly path: RelativePath;
  readonly type: 'file' | 'directory';
  readonly size?: number;
  readonly lastModified?: Date;
  readonly children?: FileTreeNode[];
}

/** Package.json manifest */
export interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly scripts: Record<string, string>;
  readonly main?: string;
  readonly types?: string;
}

/** Installed package info */
export interface InstalledPackage {
  readonly name: string;
  readonly version: string;
  readonly resolved: string;
  readonly integrity?: string;
  readonly dev: boolean;
}

/** TypeScript configuration */
export interface TypeScriptConfig {
  readonly compilerOptions: Record<string, unknown>;
  readonly include?: string[];
  readonly exclude?: string[];
  readonly extends?: string;
}

/** ESLint configuration */
export interface ESLintConfig {
  readonly extends?: string | string[];
  readonly rules?: Record<string, unknown>;
  readonly plugins?: string[];
  readonly parser?: string;
}

/** Prettier configuration */
export interface PrettierConfig {
  readonly semi?: boolean;
  readonly singleQuote?: boolean;
  readonly tabWidth?: number;
  readonly trailingComma?: 'none' | 'es5' | 'all';
  readonly printWidth?: number;
}

/** Jest configuration */
export interface JestConfig {
  readonly preset?: string;
  readonly testEnvironment?: string;
  readonly roots?: string[];
  readonly testMatch?: string[];
}

/** Project configurations */
export interface ProjectConfigs {
  readonly typescript: TypeScriptConfig | null;
  readonly eslint: ESLintConfig | null;
  readonly prettier: PrettierConfig | null;
  readonly jest: JestConfig | null;
  readonly custom: Record<string, unknown>;
}

/** Git commit info */
export interface CommitInfo {
  readonly hash: string;
  readonly shortHash: string;
  readonly message: string;
  readonly author: string;
  readonly date: Date;
}

/** Git state */
export interface GitState {
  readonly initialized: boolean;
  readonly branch: string;
  readonly remote: string | null;
  readonly uncommittedChanges: RelativePath[];
  readonly recentCommits: CommitInfo[];
  readonly ahead: number;
  readonly behind: number;
}

/** Project snapshot */
export interface ProjectSnapshot {
  readonly id: SnapshotId;
  readonly timestamp: Date;
  readonly projectRoot: FilePath;

  // File system state
  readonly fileTree: FileTreeNode[];
  readonly fileCount: number;
  readonly totalLines: number;
  readonly totalSize: number;

  // Dependencies
  readonly packageManifest: PackageManifest | null;
  readonly installedPackages: InstalledPackage[];
  readonly lockfileHash: string | null;

  // Configuration
  readonly configs: ProjectConfigs;

  // Git state
  readonly git: GitState | null;
}

/** Snapshot diff */
export interface SnapshotDiff {
  readonly from: SnapshotId;
  readonly to: SnapshotId;
  readonly filesAdded: RelativePath[];
  readonly filesModified: RelativePath[];
  readonly filesDeleted: RelativePath[];
  readonly dependenciesChanged: boolean;
  readonly configsChanged: string[];
}

// ============================================================================
// Semantic Index Types
// ============================================================================

/** Symbol kind */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'enum'
  | 'namespace'
  | 'module';

/** Base symbol definition */
export interface BaseSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly location: SourceLocation;
  readonly exported: boolean;
  readonly documentation?: string;
}

/** Parameter info */
export interface ParameterInfo {
  readonly name: string;
  readonly type: string;
  readonly optional: boolean;
  readonly defaultValue?: string;
  readonly rest?: boolean;
}

/** Function symbol */
export interface FunctionSymbol extends BaseSymbol {
  readonly kind: 'function';
  readonly async: boolean;
  readonly generator: boolean;
  readonly parameters: ParameterInfo[];
  readonly returnType: string;
  readonly typeParameters?: string[];
}

/** Class member */
export interface ClassMember {
  readonly name: string;
  readonly kind: 'property' | 'method' | 'getter' | 'setter' | 'constructor';
  readonly visibility: 'public' | 'private' | 'protected';
  readonly static: boolean;
  readonly abstract?: boolean;
  readonly readonly?: boolean;
  readonly type?: string;
  readonly parameters?: ParameterInfo[];
  readonly returnType?: string;
}

/** Class symbol */
export interface ClassSymbol extends BaseSymbol {
  readonly kind: 'class';
  readonly abstract: boolean;
  readonly extends?: string;
  readonly implements: string[];
  readonly members: ClassMember[];
  readonly typeParameters?: string[];
}

/** Interface member */
export interface InterfaceMember {
  readonly name: string;
  readonly kind: 'property' | 'method' | 'index' | 'call';
  readonly optional: boolean;
  readonly readonly?: boolean;
  readonly type: string;
  readonly parameters?: ParameterInfo[];
}

/** Interface symbol */
export interface InterfaceSymbol extends BaseSymbol {
  readonly kind: 'interface';
  readonly extends: string[];
  readonly members: InterfaceMember[];
  readonly typeParameters?: string[];
}

/** Type symbol */
export interface TypeSymbol extends BaseSymbol {
  readonly kind: 'type';
  readonly definition: string;
  readonly typeParameters?: string[];
}

/** Variable symbol */
export interface VariableSymbol extends BaseSymbol {
  readonly kind: 'variable';
  readonly const: boolean;
  readonly type: string;
  readonly initializer?: string;
}

/** Enum member */
export interface EnumMember {
  readonly name: string;
  readonly value: string | number;
}

/** Enum symbol */
export interface EnumSymbol extends BaseSymbol {
  readonly kind: 'enum';
  readonly const: boolean;
  readonly members: EnumMember[];
}

/** Any symbol type */
export type AnySymbol =
  | FunctionSymbol
  | ClassSymbol
  | InterfaceSymbol
  | TypeSymbol
  | VariableSymbol
  | EnumSymbol;

/** Symbol table */
export interface SymbolTable {
  readonly functions: Map<string, FunctionSymbol[]>;
  readonly classes: Map<string, ClassSymbol[]>;
  readonly interfaces: Map<string, InterfaceSymbol[]>;
  readonly types: Map<string, TypeSymbol[]>;
  readonly variables: Map<string, VariableSymbol[]>;
  readonly enums: Map<string, EnumSymbol[]>;
}

/** Import info */
export interface ImportInfo {
  readonly source: string;
  readonly specifiers: ImportSpecifier[];
  readonly location: SourceLocation;
}

/** Import specifier */
export interface ImportSpecifier {
  readonly imported: string;
  readonly local: string;
  readonly isDefault: boolean;
  readonly isNamespace: boolean;
}

/** Export info */
export interface ExportInfo {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly isDefault: boolean;
  readonly isReExport: boolean;
  readonly from?: string;
  readonly location: SourceLocation;
}

/** Dependency graph */
export type DependencyGraph = Map<RelativePath, RelativePath[]>;

/** Call graph */
export type CallGraph = Map<string, string[]>;

/** Inheritance graph */
export type InheritanceGraph = Map<string, string[]>;

/** Semantic index */
export interface SemanticIndex {
  readonly version: number;
  readonly lastUpdated: Date;

  // Symbol tables
  readonly symbols: SymbolTable;

  // Per-file data
  readonly fileSymbols: Map<RelativePath, AnySymbol[]>;
  readonly fileImports: Map<RelativePath, ImportInfo[]>;
  readonly fileExports: Map<RelativePath, ExportInfo[]>;

  // Relationship graphs
  readonly imports: DependencyGraph;
  readonly exports: DependencyGraph;
  readonly calls: CallGraph;
  readonly inheritance: InheritanceGraph;
}

/** Search options */
export interface SearchOptions {
  readonly kinds?: SymbolKind[];
  readonly files?: string;  // Glob pattern
  readonly exported?: boolean;
  readonly limit?: number;
}

/** Text match */
export interface TextMatch {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** Search result */
export interface SearchResult {
  readonly symbol: AnySymbol;
  readonly score: number;
  readonly matches: TextMatch[];
}

// ============================================================================
// Convention Types
// ============================================================================

/** Naming pattern */
export type NamingPattern =
  | 'camelCase'
  | 'PascalCase'
  | 'snake_case'
  | 'SCREAMING_SNAKE_CASE'
  | 'kebab-case'
  | 'unknown';

/** Naming conventions */
export interface NamingConventions {
  readonly files: NamingPattern;
  readonly directories: NamingPattern;
  readonly functions: NamingPattern;
  readonly classes: NamingPattern;
  readonly interfaces: NamingPattern;
  readonly types: NamingPattern;
  readonly variables: NamingPattern;
  readonly constants: NamingPattern;
  readonly typeParameters: NamingPattern;
}

/** Style conventions */
export interface StyleConventions {
  readonly indentation: 'tabs' | 'spaces';
  readonly indentSize: number;
  readonly quotes: 'single' | 'double';
  readonly semicolons: boolean;
  readonly trailingCommas: 'none' | 'es5' | 'all';
  readonly lineWidth: number;
  readonly endOfLine: 'lf' | 'crlf' | 'auto';
}

/** Structure conventions */
export interface StructureConventions {
  readonly sourceDir: RelativePath;
  readonly testDir: RelativePath;
  readonly testPattern: string;
  readonly testLocation: 'colocated' | 'separate' | 'mixed';
  readonly indexFiles: boolean;
  readonly barrelExports: boolean;
}

/** Pattern conventions */
export interface PatternConventions {
  readonly asyncStyle: 'async-await' | 'promises' | 'callbacks' | 'mixed';
  readonly errorHandling: 'try-catch' | 'result-type' | 'callback' | 'mixed';
  readonly importStyle: 'named' | 'default' | 'namespace' | 'mixed';
  readonly exportStyle: 'named' | 'default' | 'mixed';
}

/** Detected conventions */
export interface DetectedConventions {
  readonly naming: NamingConventions;
  readonly style: StyleConventions;
  readonly structure: StructureConventions;
  readonly patterns: PatternConventions;
}

/** Convention confidence */
export interface ConventionConfidence {
  readonly naming: number;
  readonly style: number;
  readonly structure: number;
  readonly patterns: number;
  readonly overall: number;
}

/** Project conventions */
export interface ProjectConventions {
  readonly detected: DetectedConventions;
  readonly confidence: ConventionConfidence;
  readonly sampleSize: number;
  readonly lastAnalyzed: Date;
}

/** Convention violation */
export interface ConventionViolation {
  readonly convention: string;
  readonly expected: string;
  readonly actual: string;
  readonly location?: SourceLocation;
  readonly autoFixable: boolean;
  readonly fix?: string;
}

/** Compliance result */
export interface ComplianceResult {
  readonly compliant: boolean;
  readonly violations: ConventionViolation[];
}

// ============================================================================
// Error Memory Types
// ============================================================================

/** Error category */
export type ErrorPatternCategory =
  | 'syntax'
  | 'type'
  | 'reference'
  | 'import'
  | 'runtime'
  | 'logic'
  | 'hallucination'
  | 'scope-violation'
  | 'other';

/** Error pattern */
export interface ErrorPattern {
  readonly id: string;
  readonly fingerprint: string;
  readonly category: ErrorPatternCategory;
  readonly messagePattern: string;
  readonly codePattern?: string;
  readonly occurrences: number;
  readonly firstSeen: Date;
  readonly lastSeen: Date;
  readonly prevention: string;
  readonly autoFixable: boolean;
  readonly autoFix?: string;
}

/** Error occurrence */
export interface ErrorOccurrence {
  readonly id: string;
  readonly patternId: string;
  readonly timestamp: Date;
  readonly taskId: TaskId;
  readonly agentId: AgentId;
  readonly file?: RelativePath;
  readonly line?: number;
  readonly code?: string;
  readonly errorMessage: string;
  readonly resolved: boolean;
  readonly resolution?: string;
  readonly resolutionTime?: number;
}

/** Error statistics */
export interface ErrorStatistics {
  readonly totalErrors: number;
  readonly errorsByCategory: Record<ErrorPatternCategory, number>;
  readonly errorsByAgent: Record<string, number>;
  readonly averageResolutionTime: number;
  readonly topPatterns: ErrorPattern[];
}

/** Error memory */
export interface ErrorMemory {
  readonly patterns: ErrorPattern[];
  readonly recentErrors: ErrorOccurrence[];
  readonly statistics: ErrorStatistics;
}

/** Error context */
export interface ErrorContext {
  readonly taskId: TaskId;
  readonly agentId: AgentId;
  readonly file?: RelativePath;
  readonly code?: string;
  readonly intent?: string;
}

// ============================================================================
// Knowledge Store Interface
// ============================================================================

/** Knowledge store interface */
export interface IKnowledgeStore extends IStore {
  // Project Snapshots
  saveSnapshot(snapshot: ProjectSnapshot): AsyncResult<void>;
  getLatestSnapshot(): AsyncResult<ProjectSnapshot | null>;
  getSnapshot(id: SnapshotId): AsyncResult<ProjectSnapshot | null>;
  listSnapshots(limit?: number): AsyncResult<ProjectSnapshot[]>;
  diffSnapshots(from: SnapshotId, to: SnapshotId): AsyncResult<SnapshotDiff>;

  // Semantic Index
  saveIndex(index: SemanticIndex): AsyncResult<void>;
  getIndex(): AsyncResult<SemanticIndex | null>;
  updateIndexFile(path: RelativePath, symbols: AnySymbol[]): AsyncResult<void>;
  removeIndexFile(path: RelativePath): AsyncResult<void>;

  // Conventions
  saveConventions(conventions: ProjectConventions): AsyncResult<void>;
  getConventions(): AsyncResult<ProjectConventions | null>;

  // Error Memory
  saveErrorPattern(pattern: ErrorPattern): AsyncResult<void>;
  getErrorPattern(id: string): AsyncResult<ErrorPattern | null>;
  listErrorPatterns(): AsyncResult<ErrorPattern[]>;
  recordErrorOccurrence(occurrence: ErrorOccurrence): AsyncResult<void>;
  getErrorStatistics(): AsyncResult<ErrorStatistics>;
}

// ============================================================================
// Knowledge Service Interfaces
// ============================================================================

/** Project snapshot service */
export interface IProjectSnapshotService {
  capture(): AsyncResult<ProjectSnapshot>;
  getLatest(): ProjectSnapshot | null;
  diff(from: SnapshotId, to: SnapshotId): AsyncResult<SnapshotDiff>;
  watch(): { dispose(): void };
}

/** Semantic index service */
export interface ISemanticIndexService {
  /** Index a project directory */
  index(projectRoot: string): AsyncResult<SemanticIndex>;
  buildIndex(): AsyncResult<SemanticIndex>;
  updateFile(path: RelativePath): AsyncResult<void>;
  removeFile(path: RelativePath): AsyncResult<void>;

  findSymbol(name: string, kind?: SymbolKind): AnySymbol[];
  findSymbolsInFile(path: RelativePath): AnySymbol[];
  getImports(path: RelativePath): ImportInfo[];
  getExports(path: RelativePath): ExportInfo[];
  getCallers(symbol: string): SourceLocation[];
  getCallees(symbol: string): string[];

  search(query: string, options?: SearchOptions): Array<{ symbol: AnySymbol; score: number }>;
}

/** Convention extractor service */
export interface IConventionExtractorService {
  analyze(): AsyncResult<ProjectConventions>;
  getConventions(): ProjectConventions | null;
  checkCompliance(code: string, file: RelativePath): ComplianceResult;
}

/** Error memory service */
export interface IErrorMemoryService {
  recordError(error: Error, context: ErrorContext): AsyncResult<void>;
  recordResolution(patternId: string, resolution: string): AsyncResult<void>;
  getPatterns(): ErrorPattern[];
  getPattern(id: string): ErrorPattern | null;
  findSimilar(error: Error): ErrorPattern[];
  getPreventionHints(context: { intent: string; targets: string[] }): string[];
}
