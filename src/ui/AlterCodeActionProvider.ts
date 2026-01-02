/**
 * AlterCode Code Action Provider
 *
 * Provides quick actions in the editor:
 * - Add to Mission: Queue selected code/file for mission context
 * - Analyze Dependencies: Show semantic analysis of selected code
 * - Quick fix suggestions based on AlterCode analysis
 */

import * as vscode from 'vscode';
import {
  ISemanticAnalyzerService,
  IEventBus,
  ILogger,
  CodeRegion,
  FilePath,
  toFilePath,
} from '../types';

/** Context item for mission */
export interface MissionContextItem {
  filePath: string;
  selection?: {
    startLine: number;
    endLine: number;
    text: string;
  };
  regions?: CodeRegion[];
  addedAt: Date;
}

/** Dependency analysis result */
export interface DependencyAnalysis {
  filePath: string;
  regions: CodeRegion[];
  imports: string[];
  exports: string[];
  dependencies: Map<string, string[]>;
}

/**
 * AlterCode Code Action Provider
 */
export class AlterCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
    vscode.CodeActionKind.Source,
  ];

  private readonly semanticAnalyzer: ISemanticAnalyzerService;
  private readonly eventBus: IEventBus;
  private readonly logger?: ILogger;

  /** Mission context queue */
  private missionContext: MissionContextItem[] = [];

  constructor(
    semanticAnalyzer: ISemanticAnalyzerService,
    eventBus: IEventBus,
    logger?: ILogger
  ) {
    this.semanticAnalyzer = semanticAnalyzer;
    this.eventBus = eventBus;
    this.logger = logger?.child('AlterCodeActionProvider');
  }

  /**
   * Provide code actions for the given document and range
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Add to Mission action
    const addToMissionAction = new vscode.CodeAction(
      'Add to Mission Context',
      vscode.CodeActionKind.Source
    );
    addToMissionAction.command = {
      command: 'altercode.addToMission',
      title: 'Add to Mission Context',
      arguments: [document.uri, range],
    };
    actions.push(addToMissionAction);

    // Analyze Dependencies action (only for supported file types)
    if (this.semanticAnalyzer.isSupported(toFilePath(document.uri.fsPath))) {
      const analyzeAction = new vscode.CodeAction(
        'Analyze Dependencies',
        vscode.CodeActionKind.Source
      );
      analyzeAction.command = {
        command: 'altercode.analyzeDependencies',
        title: 'Analyze Dependencies',
        arguments: [document.uri, range],
      };
      actions.push(analyzeAction);
    }

    // If there's a selection, add selection-specific actions
    if (!range.isEmpty) {
      const explainAction = new vscode.CodeAction(
        'Explain Selection with AlterCode',
        vscode.CodeActionKind.QuickFix
      );
      explainAction.command = {
        command: 'altercode.explainSelection',
        title: 'Explain Selection',
        arguments: [document.uri, range],
      };
      actions.push(explainAction);
    }

    return actions;
  }

  /**
   * Add file/selection to mission context
   */
  async addToMission(uri: vscode.Uri, range?: vscode.Range): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    const filePath = uri.fsPath;

    let item: MissionContextItem = {
      filePath,
      addedAt: new Date(),
    };

    // If there's a selection, include it
    if (range && !range.isEmpty) {
      const text = document.getText(range);
      item.selection = {
        startLine: range.start.line + 1,
        endLine: range.end.line + 1,
        text,
      };

      // Analyze regions in selection
      if (this.semanticAnalyzer.isSupported(toFilePath(filePath))) {
        const fullContent = document.getText();
        const allRegions = this.semanticAnalyzer.analyzeFile(toFilePath(filePath), fullContent);

        // Filter to regions that intersect with selection
        item.regions = allRegions.filter(r =>
          r.startLine <= range.end.line + 1 && r.endLine >= range.start.line + 1
        );
      }
    } else {
      // Analyze full file
      if (this.semanticAnalyzer.isSupported(toFilePath(filePath))) {
        const content = document.getText();
        item.regions = this.semanticAnalyzer.analyzeFile(toFilePath(filePath), content);
      }
    }

    // Add to context (avoid duplicates)
    const existingIndex = this.missionContext.findIndex(c =>
      c.filePath === filePath &&
      c.selection?.startLine === item.selection?.startLine &&
      c.selection?.endLine === item.selection?.endLine
    );

    if (existingIndex >= 0) {
      this.missionContext[existingIndex] = item;
      vscode.window.showInformationMessage(`Updated in mission context: ${this.getShortPath(filePath)}`);
    } else {
      this.missionContext.push(item);
      vscode.window.showInformationMessage(`Added to mission context: ${this.getShortPath(filePath)}`);
    }

    // Emit event
    this.eventBus.emit('missionContext:updated', {
      type: 'missionContext:updated',
      context: this.missionContext,
      timestamp: new Date(),
    });

    this.logger?.debug('Added to mission context', { filePath, hasSelection: !!item.selection });
  }

  /**
   * Analyze dependencies in file/selection
   */
  async analyzeDependencies(uri: vscode.Uri, range?: vscode.Range): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    const filePath = toFilePath(uri.fsPath);

    if (!this.semanticAnalyzer.isSupported(filePath)) {
      vscode.window.showWarningMessage(`Dependency analysis not supported for this file type`);
      return;
    }

    const content = document.getText();
    const regions = this.semanticAnalyzer.analyzeFile(filePath, content);

    // Filter regions if there's a selection
    let targetRegions = regions;
    if (range && !range.isEmpty) {
      targetRegions = regions.filter(r =>
        r.startLine <= range.end.line + 1 && r.endLine >= range.start.line + 1
      );
    }

    // Build dependency map
    const dependencies = new Map<string, string[]>();
    for (const region of targetRegions) {
      if (region.dependencies.length > 0) {
        dependencies.set(region.name, region.dependencies);
      }
    }

    // Find imports
    const imports = regions
      .filter(r => r.type === 'imports')
      .map(r => r.name);

    // Find exports
    const exports = regions
      .filter(r => r.type === 'export')
      .map(r => r.name);

    // Show analysis results
    await this.showDependencyAnalysis({
      filePath: uri.fsPath,
      regions: targetRegions,
      imports,
      exports,
      dependencies,
    });

    this.logger?.debug('Analyzed dependencies', {
      filePath: uri.fsPath,
      regionCount: targetRegions.length,
      dependencyCount: dependencies.size
    });
  }

  /**
   * Show dependency analysis in a new document
   */
  private async showDependencyAnalysis(analysis: DependencyAnalysis): Promise<void> {
    const fileName = analysis.filePath.split(/[\\/]/).pop() || 'Unknown';

    let content = `# Dependency Analysis: ${fileName}\n\n`;
    content += `File: ${analysis.filePath}\n`;
    content += `Regions analyzed: ${analysis.regions.length}\n\n`;

    // Imports section
    if (analysis.imports.length > 0) {
      content += `## Imports (${analysis.imports.length})\n\n`;
      for (const imp of analysis.imports) {
        content += `- ${imp}\n`;
      }
      content += '\n';
    }

    // Exports section
    if (analysis.exports.length > 0) {
      content += `## Exports (${analysis.exports.length})\n\n`;
      for (const exp of analysis.exports) {
        content += `- ${exp}\n`;
      }
      content += '\n';
    }

    // Regions section
    content += `## Code Regions (${analysis.regions.length})\n\n`;
    content += '| Type | Name | Lines | Dependencies |\n';
    content += '|------|------|-------|-------------|\n';

    for (const region of analysis.regions) {
      const deps = region.dependencies.length > 0
        ? region.dependencies.slice(0, 3).join(', ') + (region.dependencies.length > 3 ? '...' : '')
        : '-';
      content += `| ${region.type} | ${region.name} | ${region.startLine}-${region.endLine} | ${deps} |\n`;
    }
    content += '\n';

    // Dependencies detail
    if (analysis.dependencies.size > 0) {
      content += `## Dependency Graph\n\n`;
      for (const [name, deps] of analysis.dependencies) {
        content += `### ${name}\n`;
        content += `Dependencies: ${deps.join(', ')}\n\n`;
      }
    }

    // Show in a new untitled document
    const doc = await vscode.workspace.openTextDocument({
      content,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  /**
   * Get mission context
   */
  getMissionContext(): MissionContextItem[] {
    return [...this.missionContext];
  }

  /**
   * Clear mission context
   */
  clearMissionContext(): void {
    this.missionContext = [];
    this.eventBus.emit('missionContext:cleared', {
      type: 'missionContext:cleared',
      timestamp: new Date(),
    });
    vscode.window.showInformationMessage('Mission context cleared');
  }

  /**
   * Remove item from mission context
   */
  removeFromMissionContext(filePath: string, startLine?: number): void {
    const index = this.missionContext.findIndex(c =>
      c.filePath === filePath &&
      (startLine === undefined || c.selection?.startLine === startLine)
    );

    if (index >= 0) {
      this.missionContext.splice(index, 1);
      this.eventBus.emit('missionContext:updated', {
        type: 'missionContext:updated',
        context: this.missionContext,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get short path for display
   */
  private getShortPath(filePath: string): string {
    const parts = filePath.split(/[\\/]/);
    return parts.length > 2
      ? `.../${parts.slice(-2).join('/')}`
      : parts.join('/');
  }
}

/**
 * Create AlterCode action provider
 */
export function createAlterCodeActionProvider(
  semanticAnalyzer: ISemanticAnalyzerService,
  eventBus: IEventBus,
  logger?: ILogger
): AlterCodeActionProvider {
  return new AlterCodeActionProvider(semanticAnalyzer, eventBus, logger);
}
