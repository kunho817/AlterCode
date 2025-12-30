/**
 * AlterCode Action Provider
 *
 * Provides inline code actions for quick AlterCode operations.
 */

import * as vscode from 'vscode';

/**
 * Provides code actions for AlterCode.
 */
export class AlterCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
  ];

  /**
   * Provide code actions.
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Only show actions when there's a selection
    if (range.isEmpty) {
      return actions;
    }

    // Review action
    const reviewAction = new vscode.CodeAction(
      '🐝 AlterCode: Review this code',
      vscode.CodeActionKind.QuickFix
    );
    reviewAction.command = {
      command: 'altercode.reviewSelection',
      title: 'Review Selection',
      arguments: [document, range],
    };
    reviewAction.isPreferred = false;
    actions.push(reviewAction);

    // Refactor action
    const refactorAction = new vscode.CodeAction(
      '🐝 AlterCode: Refactor this code',
      vscode.CodeActionKind.Refactor
    );
    refactorAction.command = {
      command: 'altercode.refactorSelection',
      title: 'Refactor Selection',
      arguments: [document, range],
    };
    actions.push(refactorAction);

    // Explain action
    const explainAction = new vscode.CodeAction(
      '🐝 AlterCode: Explain this code',
      vscode.CodeActionKind.QuickFix
    );
    explainAction.command = {
      command: 'altercode.explainSelection',
      title: 'Explain Selection',
      arguments: [document, range],
    };
    actions.push(explainAction);

    // Generate tests action
    const testAction = new vscode.CodeAction(
      '🐝 AlterCode: Generate tests',
      vscode.CodeActionKind.QuickFix
    );
    testAction.command = {
      command: 'altercode.generateTests',
      title: 'Generate Tests',
      arguments: [document, range],
    };
    actions.push(testAction);

    return actions;
  }
}
