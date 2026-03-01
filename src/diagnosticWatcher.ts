/**
 * diagnosticWatcher.ts
 * Watches VS Code diagnostics and fires a callback when error thresholds are crossed.
 *
 * Thresholds:
 *   1–3 errors  → 'single'
 *   4–5 errors  → 'multiple'
 *   6+  errors  → 'many'
 */

import * as vscode from 'vscode';

export type SoundType = 'single' | 'multiple' | 'many';

export class DiagnosticWatcher {
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastErrorCount = -1; // -1 means "not yet observed"
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly onPlay: (sound: SoundType) => void) {}

  start(): void {
    // React to any diagnostic change (all files, all languages)
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics(() => this.schedule())
    );

    // When the user switches to a different file, treat its errors as "fresh"
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.lastErrorCount = -1;
        this.schedule();
      })
    );
  }

  private schedule(): void {
    const config = vscode.workspace.getConfiguration('funnyErrorSounds');
    const delay = config.get<number>('debounceDelay', 1500);

    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this.check(), delay);
  }

  private check(): void {
    const config = vscode.workspace.getConfiguration('funnyErrorSounds');
    if (!config.get<boolean>('enabled', true)) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const errorCount = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error
    ).length;

    const prev = this.lastErrorCount;
    this.lastErrorCount = errorCount;

    if (errorCount === 0) {
      return; // No errors — silence is golden
    }

    const onlyOnIncrease = config.get<boolean>('onlyOnIncrease', true);
    if (onlyOnIncrease && prev !== -1 && errorCount <= prev) {
      return; // Errors didn't increase — stay quiet
    }

    // Pick the appropriate sound tier
    if (errorCount > 5) {
      this.onPlay('many');
    } else if (errorCount > 3) {
      this.onPlay('multiple');
    } else {
      this.onPlay('single');
    }
  }

  dispose(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}
