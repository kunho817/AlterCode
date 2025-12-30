/**
 * Status Bar Provider
 *
 * Provides status bar item for AlterCode.
 */

import * as vscode from 'vscode';
import { AlterCodeCore } from '../core/AlterCodeCore';
import { MissionStatus } from '../types';
import { getClaudeCliValidator, ClaudeCliStatus } from '../utils/ClaudeCliValidator';

/**
 * Manages the AlterCode status bar item.
 */
export class StatusBarProvider implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly cliStatusItem: vscode.StatusBarItem;
  private readonly core: AlterCodeCore;
  private readonly disposables: vscode.Disposable[] = [];
  private cliStatus: ClaudeCliStatus | null = null;

  constructor(core: AlterCodeCore) {
    this.core = core;

    // Create main status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'altercode.showMissionControl';

    // Create CLI status item (shown to the left of main item)
    this.cliStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      101
    );
    this.cliStatusItem.command = 'altercode.checkCliStatus';

    // Initial update
    this.update();
    this.updateCliStatus();

    // Subscribe to state changes
    const stateDisposable = this.core.onStateChange(() => this.update());
    this.disposables.push(stateDisposable);

    // Periodically check CLI status
    const intervalId = setInterval(() => this.updateCliStatus(), 60000);
    this.disposables.push({ dispose: () => clearInterval(intervalId) });

    // Show status bar
    this.statusBarItem.show();
    this.cliStatusItem.show();
  }

  /**
   * Update CLI status indicator.
   */
  private async updateCliStatus(): Promise<void> {
    const validator = getClaudeCliValidator();
    this.cliStatus = await validator.validate();

    if (this.cliStatus.installed && this.cliStatus.authenticated) {
      this.cliStatusItem.text = '$(check) Claude';
      this.cliStatusItem.tooltip = `Claude CLI ready (v${this.cliStatus.version})`;
      this.cliStatusItem.backgroundColor = undefined;
    } else if (this.cliStatus.installed) {
      this.cliStatusItem.text = '$(warning) Claude';
      this.cliStatusItem.tooltip = 'Claude CLI needs authentication';
      this.cliStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.cliStatusItem.text = '$(error) Claude';
      this.cliStatusItem.tooltip = 'Claude CLI not installed - click to setup';
      this.cliStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
  }

  /**
   * Get current CLI status.
   */
  getCliStatus(): ClaudeCliStatus | null {
    return this.cliStatus;
  }

  /**
   * Update status bar display.
   */
  private update(): void {
    const state = this.core.getHiveState();
    const mission = state.activeMission;

    if (!mission) {
      this.statusBarItem.text = '$(beaker) AlterCode: Idle';
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    // Calculate progress
    const totalTasks = state.taskQueue.length + state.runningTasks.length + state.completedTasks.length;
    const completedCount = state.completedTasks.length;
    const percentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

    // Count active workers
    const activeWorkers = state.agents.filter((a) => a.status === 'busy').length;

    // Build status text
    let statusIcon = '$(sync~spin)';
    if (mission.status === MissionStatus.PAUSED) {
      statusIcon = '$(debug-pause)';
    } else if (mission.status === MissionStatus.COMPLETED) {
      statusIcon = '$(check)';
    } else if (mission.status === MissionStatus.FAILED) {
      statusIcon = '$(error)';
    }

    this.statusBarItem.text = `${statusIcon} AlterCode: ${activeWorkers} agents | ${percentage}%`;

    // Build detailed tooltip
    const tooltipLines = [
      `Mission: ${mission.title.substring(0, 50)}`,
      `Status: ${mission.status}`,
      `Progress: ${completedCount}/${totalTasks} tasks (${percentage}%)`,
      `Active agents: ${activeWorkers}`,
      `Queue: ${state.taskQueue.length} pending`,
      '',
      'Click to open Mission Control',
    ];
    this.statusBarItem.tooltip = tooltipLines.join('\n');

    // Set background based on quota status
    const claudeQuota = state.quotaStatus.claude;
    const glmQuota = state.quotaStatus.glm;

    if (claudeQuota?.status === 'exceeded' || glmQuota?.status === 'exceeded') {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (claudeQuota?.status === 'critical' || glmQuota?.status === 'critical') {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.statusBarItem.backgroundColor = undefined;
    }
  }

  /**
   * Refresh CLI status.
   */
  async refreshCliStatus(): Promise<void> {
    const validator = getClaudeCliValidator();
    validator.clearCache();
    await this.updateCliStatus();
  }

  /**
   * Dispose resources.
   */
  dispose(): void {
    this.statusBarItem.dispose();
    this.cliStatusItem.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
