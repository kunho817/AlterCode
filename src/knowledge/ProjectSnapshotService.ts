/**
 * Project Snapshot Service
 *
 * Captures and manages snapshots of project state including:
 * - File tree structure
 * - Package dependencies
 * - Configuration files
 * - Git state
 */

import * as path from 'path';
import {
  IProjectSnapshotService,
  ProjectSnapshot,
  SnapshotDiff,
  FileTreeNode,
  PackageManifest,
  InstalledPackage,
  ProjectConfigs,
  TypeScriptConfig,
  ESLintConfig,
  PrettierConfig,
  JestConfig,
  GitState,
  CommitInfo,
  IFileSystem,
  ILogger,
  IKnowledgeStore,
  FilePath,
  RelativePath,
  SnapshotId,
  AsyncResult,
  Ok,
  Err,
  AppError,
  createSnapshotId,
  toRelativePath,
  Disposable,
} from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Files and directories to ignore */
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.cache',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
  '.idea',
  '.vscode',
];

/** Supported source extensions */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Project Snapshot Service implementation
 */
export class ProjectSnapshotService implements IProjectSnapshotService {
  private readonly fileSystem: IFileSystem;
  private readonly store: IKnowledgeStore;
  private readonly projectRoot: FilePath;
  private readonly logger?: ILogger;
  private latestSnapshot: ProjectSnapshot | null = null;
  private fileWatcher?: Disposable;

  constructor(
    fileSystem: IFileSystem,
    store: IKnowledgeStore,
    projectRoot: FilePath,
    logger?: ILogger
  ) {
    this.fileSystem = fileSystem;
    this.store = store;
    this.projectRoot = projectRoot;
    this.logger = logger?.child('ProjectSnapshotService');
  }

  async capture(): AsyncResult<ProjectSnapshot> {
    try {
      this.logger?.info('Capturing project snapshot');
      const startTime = Date.now();

      // Build file tree
      const fileTreeResult = await this.buildFileTree(this.projectRoot);
      if (!fileTreeResult.ok) return fileTreeResult;

      const { tree, fileCount, totalLines, totalSize } = fileTreeResult.value;

      // Load package manifest
      const packageManifest = await this.loadPackageManifest();

      // Load installed packages
      const installedPackages = await this.loadInstalledPackages();

      // Calculate lockfile hash
      const lockfileHash = await this.calculateLockfileHash();

      // Load project configs
      const configs = await this.loadProjectConfigs();

      // Load Git state
      const git = await this.loadGitState();

      const snapshot: ProjectSnapshot = {
        id: createSnapshotId(),
        timestamp: new Date(),
        projectRoot: this.projectRoot,
        fileTree: tree,
        fileCount,
        totalLines,
        totalSize,
        packageManifest,
        installedPackages,
        lockfileHash,
        configs,
        git,
      };

      // Save to store
      const saveResult = await this.store.saveSnapshot(snapshot);
      if (!saveResult.ok) {
        this.logger?.warn('Failed to save snapshot to store', { error: saveResult.error });
      }

      this.latestSnapshot = snapshot;

      const duration = Date.now() - startTime;
      this.logger?.info('Project snapshot captured', {
        fileCount,
        totalLines,
        duration,
      });

      return Ok(snapshot);
    } catch (error) {
      this.logger?.error('Failed to capture snapshot', error as Error);
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to capture snapshot: ${(error as Error).message}`)
      );
    }
  }

  getLatest(): ProjectSnapshot | null {
    return this.latestSnapshot;
  }

  async diff(from: SnapshotId, to: SnapshotId): AsyncResult<SnapshotDiff> {
    return this.store.diffSnapshots(from, to);
  }

  watch(): Disposable {
    // Watch for file changes and invalidate snapshot
    this.fileWatcher = this.fileSystem.watch(this.projectRoot, (event) => {
      const relPath = this.fileSystem.relative(this.projectRoot, event.path);

      // Ignore changes in ignored directories
      for (const pattern of IGNORE_PATTERNS) {
        if ((relPath as string).includes(pattern)) {
          return;
        }
      }

      this.logger?.debug('File change detected, snapshot may be stale', {
        type: event.type,
        path: relPath,
      });

      // Could invalidate latestSnapshot here if needed
    });

    return {
      dispose: () => {
        this.fileWatcher?.dispose();
        this.fileWatcher = undefined;
      },
    };
  }

  /**
   * Build file tree recursively
   */
  private async buildFileTree(
    rootPath: FilePath
  ): AsyncResult<{
    tree: FileTreeNode[];
    fileCount: number;
    totalLines: number;
    totalSize: number;
  }> {
    try {
      const tree: FileTreeNode[] = [];
      let fileCount = 0;
      let totalLines = 0;
      let totalSize = 0;

      const buildTree = async (dir: FilePath, relativePath: string): Promise<FileTreeNode[]> => {
        const entries = await this.fileSystem.readdir(dir);
        const nodes: FileTreeNode[] = [];

        for (const entry of entries) {
          // Skip ignored patterns
          if (IGNORE_PATTERNS.some((p) => entry.includes(p))) {
            continue;
          }

          // Skip hidden files/directories
          if (entry.startsWith('.')) {
            continue;
          }

          const fullPath = this.fileSystem.join(dir as string, entry);
          const entryRelPath = relativePath ? `${relativePath}/${entry}` : entry;
          const stats = await this.fileSystem.stat(fullPath);

          if (stats.isDirectory) {
            const children = await buildTree(fullPath, entryRelPath);
            if (children.length > 0) {
              nodes.push({
                path: toRelativePath(entryRelPath),
                type: 'directory',
                children,
              });
            }
          } else if (stats.isFile) {
            fileCount++;
            totalSize += stats.size;

            // Count lines for source files
            const ext = this.fileSystem.extname(fullPath);
            if (SOURCE_EXTENSIONS.includes(ext)) {
              try {
                const content = await this.fileSystem.readFile(fullPath);
                totalLines += content.split('\n').length;
              } catch {
                // Ignore read errors
              }
            }

            nodes.push({
              path: toRelativePath(entryRelPath),
              type: 'file',
              size: stats.size,
              lastModified: stats.modifiedAt,
            });
          }
        }

        // Sort: directories first, then alphabetically
        nodes.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return (a.path as string).localeCompare(b.path as string);
        });

        return nodes;
      };

      const rootTree = await buildTree(rootPath, '');

      return Ok({
        tree: rootTree,
        fileCount,
        totalLines,
        totalSize,
      });
    } catch (error) {
      return Err(
        new AppError('INFRASTRUCTURE', `Failed to build file tree: ${(error as Error).message}`)
      );
    }
  }

  /**
   * Load package.json manifest
   */
  private async loadPackageManifest(): Promise<PackageManifest | null> {
    try {
      const packagePath = this.fileSystem.join(this.projectRoot as string, 'package.json');

      if (!(await this.fileSystem.exists(packagePath))) {
        return null;
      }

      const content = await this.fileSystem.readFile(packagePath);
      const pkg = JSON.parse(content);

      return {
        name: pkg.name ?? 'unknown',
        version: pkg.version ?? '0.0.0',
        dependencies: pkg.dependencies ?? {},
        devDependencies: pkg.devDependencies ?? {},
        peerDependencies: pkg.peerDependencies,
        scripts: pkg.scripts ?? {},
        main: pkg.main,
        types: pkg.types,
      };
    } catch (error) {
      this.logger?.warn('Failed to load package.json', { error });
      return null;
    }
  }

  /**
   * Load installed packages from node_modules
   */
  private async loadInstalledPackages(): Promise<InstalledPackage[]> {
    try {
      const lockPath = this.fileSystem.join(this.projectRoot as string, 'package-lock.json');

      if (!(await this.fileSystem.exists(lockPath))) {
        return [];
      }

      const content = await this.fileSystem.readFile(lockPath);
      const lock = JSON.parse(content);
      const packages: InstalledPackage[] = [];

      // Parse package-lock.json v2/v3 format
      const deps = lock.packages ?? lock.dependencies ?? {};

      for (const [pkgPath, info] of Object.entries(deps)) {
        // Skip root package
        if (!pkgPath || pkgPath === '') continue;

        const pkgInfo = info as Record<string, unknown>;
        const name = pkgPath.replace(/^node_modules\//, '');

        // Skip nested dependencies
        if (name.includes('node_modules/')) continue;

        packages.push({
          name,
          version: (pkgInfo.version as string) ?? 'unknown',
          resolved: (pkgInfo.resolved as string) ?? '',
          integrity: pkgInfo.integrity as string | undefined,
          dev: (pkgInfo.dev as boolean) ?? false,
        });
      }

      return packages;
    } catch (error) {
      this.logger?.warn('Failed to load installed packages', { error });
      return [];
    }
  }

  /**
   * Calculate hash of lockfile
   */
  private async calculateLockfileHash(): Promise<string | null> {
    try {
      const lockPaths = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

      for (const lockFile of lockPaths) {
        const lockPath = this.fileSystem.join(this.projectRoot as string, lockFile);

        if (await this.fileSystem.exists(lockPath)) {
          const crypto = await import('crypto');
          const content = await this.fileSystem.readFile(lockPath);
          return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
        }
      }

      return null;
    } catch (error) {
      this.logger?.warn('Failed to calculate lockfile hash', { error });
      return null;
    }
  }

  /**
   * Load project configuration files
   */
  private async loadProjectConfigs(): Promise<ProjectConfigs> {
    const typescript = await this.loadTypeScriptConfig();
    const eslint = await this.loadESLintConfig();
    const prettier = await this.loadPrettierConfig();
    const jest = await this.loadJestConfig();

    return {
      typescript,
      eslint,
      prettier,
      jest,
      custom: {},
    };
  }

  /**
   * Load TypeScript configuration
   */
  private async loadTypeScriptConfig(): Promise<TypeScriptConfig | null> {
    try {
      const configPath = this.fileSystem.join(this.projectRoot as string, 'tsconfig.json');

      if (!(await this.fileSystem.exists(configPath))) {
        return null;
      }

      const content = await this.fileSystem.readFile(configPath);
      // Remove comments from tsconfig.json (it supports JSONC)
      const jsonContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const config = JSON.parse(jsonContent);

      return {
        compilerOptions: config.compilerOptions ?? {},
        include: config.include,
        exclude: config.exclude,
        extends: config.extends,
      };
    } catch (error) {
      this.logger?.warn('Failed to load tsconfig.json', { error });
      return null;
    }
  }

  /**
   * Load ESLint configuration
   */
  private async loadESLintConfig(): Promise<ESLintConfig | null> {
    try {
      const configFiles = ['.eslintrc.js', '.eslintrc.json', '.eslintrc'];

      for (const configFile of configFiles) {
        const configPath = this.fileSystem.join(this.projectRoot as string, configFile);

        if (await this.fileSystem.exists(configPath)) {
          // For .js files, we can't easily evaluate them
          if (configFile.endsWith('.js')) {
            return { extends: 'custom' }; // Placeholder
          }

          const content = await this.fileSystem.readFile(configPath);
          const config = JSON.parse(content);

          return {
            extends: config.extends,
            rules: config.rules,
            plugins: config.plugins,
            parser: config.parser,
          };
        }
      }

      return null;
    } catch (error) {
      this.logger?.warn('Failed to load ESLint config', { error });
      return null;
    }
  }

  /**
   * Load Prettier configuration
   */
  private async loadPrettierConfig(): Promise<PrettierConfig | null> {
    try {
      const configFiles = ['.prettierrc', '.prettierrc.json', 'prettier.config.js'];

      for (const configFile of configFiles) {
        const configPath = this.fileSystem.join(this.projectRoot as string, configFile);

        if (await this.fileSystem.exists(configPath)) {
          if (configFile.endsWith('.js')) {
            return {}; // Placeholder
          }

          const content = await this.fileSystem.readFile(configPath);
          const config = JSON.parse(content);

          return {
            semi: config.semi,
            singleQuote: config.singleQuote,
            tabWidth: config.tabWidth,
            trailingComma: config.trailingComma,
            printWidth: config.printWidth,
          };
        }
      }

      return null;
    } catch (error) {
      this.logger?.warn('Failed to load Prettier config', { error });
      return null;
    }
  }

  /**
   * Load Jest configuration
   */
  private async loadJestConfig(): Promise<JestConfig | null> {
    try {
      const configFiles = ['jest.config.js', 'jest.config.json'];

      for (const configFile of configFiles) {
        const configPath = this.fileSystem.join(this.projectRoot as string, configFile);

        if (await this.fileSystem.exists(configPath)) {
          if (configFile.endsWith('.js')) {
            return {}; // Placeholder
          }

          const content = await this.fileSystem.readFile(configPath);
          const config = JSON.parse(content);

          return {
            preset: config.preset,
            testEnvironment: config.testEnvironment,
            roots: config.roots,
            testMatch: config.testMatch,
          };
        }
      }

      return null;
    } catch (error) {
      this.logger?.warn('Failed to load Jest config', { error });
      return null;
    }
  }

  /**
   * Load Git state
   */
  private async loadGitState(): Promise<GitState | null> {
    try {
      const gitDir = this.fileSystem.join(this.projectRoot as string, '.git');

      if (!(await this.fileSystem.exists(gitDir))) {
        return null;
      }

      const cwd = this.projectRoot as string;

      // Get current branch
      const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });

      // Get remote
      let remote: string | null = null;
      try {
        const { stdout: remoteOut } = await execAsync('git remote get-url origin', { cwd });
        remote = remoteOut.trim();
      } catch {
        // No remote configured
      }

      // Get uncommitted changes
      const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd });
      const uncommittedChanges = statusOut
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => toRelativePath(line.substring(3)));

      // Get recent commits
      const { stdout: logOut } = await execAsync(
        'git log -5 --format="%H|%h|%s|%an|%aI"',
        { cwd }
      );
      const recentCommits: CommitInfo[] = logOut
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => {
          const parts = line.split('|');
          return {
            hash: parts[0] ?? '',
            shortHash: parts[1] ?? '',
            message: parts[2] ?? '',
            author: parts[3] ?? '',
            date: new Date(parts[4] ?? Date.now()),
          };
        });

      // Get ahead/behind counts
      let ahead = 0;
      let behind = 0;
      try {
        const { stdout: countOut } = await execAsync(
          'git rev-list --left-right --count HEAD...@{u}',
          { cwd }
        );
        const countParts = countOut.trim().split('\t');
        ahead = parseInt(countParts[0] ?? '0', 10) || 0;
        behind = parseInt(countParts[1] ?? '0', 10) || 0;
      } catch {
        // No upstream configured
      }

      return {
        initialized: true,
        branch: branch.trim(),
        remote,
        uncommittedChanges,
        recentCommits,
        ahead,
        behind,
      };
    } catch (error) {
      this.logger?.warn('Failed to load Git state', { error });
      return {
        initialized: false,
        branch: '',
        remote: null,
        uncommittedChanges: [],
        recentCommits: [],
        ahead: 0,
        behind: 0,
      };
    }
  }
}

/**
 * Create a project snapshot service
 */
export function createProjectSnapshotService(
  fileSystem: IFileSystem,
  store: IKnowledgeStore,
  projectRoot: FilePath,
  logger?: ILogger
): IProjectSnapshotService {
  return new ProjectSnapshotService(fileSystem, store, projectRoot, logger);
}
