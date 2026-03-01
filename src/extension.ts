/**
 * extension.ts — Funny Error Sounds
 *
 * Two error sources:
 *   1. Editor diagnostics  (red squiggles from language servers)
 *   2. Terminal commands   (any command that exits with non-zero code)
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';

import { BUILTIN_GENERATORS }                    from './wavGenerator';
import { playAudioFile, validateCustomSoundPath } from './soundPlayer';
import { DiagnosticWatcher, SoundType }           from './diagnosticWatcher';

// ─── Bundled MP3 map ──────────────────────────────────────────────────────────

const BUNDLED_FILES: Record<string, string> = {
  'bundled:faaa':           'faaa.mp3',
  'bundled:henta_ahh':      'henta_ahh.mp3',
  'bundled:makabhosda_aag': 'makabhosda_aag.mp3',
};

const SOUND_CONFIG_KEY: Record<SoundType, string> = {
  single:   'funnyErrorSounds.singleErrorSound',
  multiple: 'funnyErrorSounds.multipleErrorsSound',
  many:     'funnyErrorSounds.manyErrorsSound',
};

const DEFAULT_SOUND: Record<SoundType, string> = {
  single:   'bundled:faaa',
  multiple: 'bundled:henta_ahh',
  many:     'bundled:makabhosda_aag',
};

// ─── State ────────────────────────────────────────────────────────────────────

let watcher:       DiagnosticWatcher | undefined;
let statusBar:     vscode.StatusBarItem | undefined;
let outputChannel: vscode.OutputChannel;
let builtinWavDir: string;
let extensionDir:  string;

function log(msg: string): void {
  const ts = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${ts}] ${msg}`);
}

// ─── Activation ───────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  builtinWavDir  = context.globalStorageUri.fsPath;
  extensionDir   = context.extensionPath;
  outputChannel  = vscode.window.createOutputChannel('Funny Error Sounds');
  context.subscriptions.push(outputChannel);

  log('Extension activated ✓');
  log(`Extension path: ${extensionDir}`);
  log(`VS Code version: ${vscode.version}`);

  await fs.promises.mkdir(builtinWavDir, { recursive: true });
  await initBuiltinSounds();
  log('Builtin sounds ready ✓');

  // ── 1. Editor diagnostics ────────────────────────────────────────────────
  watcher = new DiagnosticWatcher((soundType) => triggerSound(soundType));
  watcher.start();
  log('Diagnostic watcher started ✓');

  // ── 2. Terminal — shell integration events ───────────────────────────────
  // Log current terminals and their shell integration status at startup
  log(`Open terminals at startup: ${vscode.window.terminals.length}`);
  for (const t of vscode.window.terminals) {
    const hasIntegration = !!(t as any).shellIntegration;
    log(`  Terminal "${t.name}" — shell integration: ${hasIntegration ? 'YES ✓' : 'NO (waiting...)'}`);
  }

  // Fire when shell integration becomes active on a terminal
  context.subscriptions.push(
    vscode.window.onDidChangeTerminalShellIntegration((event) => {
      log(`Shell integration NOW ACTIVE on terminal: "${event.terminal.name}" ✓`);
    })
  );

  // Fire when a shell command ends — this is the main trigger
  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution((event) => {
      const code = event.exitCode;
      log(`Terminal command finished — exit code: ${code ?? 'unknown'} — terminal: "${event.terminal.name}"`);

      const cfg = vscode.workspace.getConfiguration();
      if (!cfg.get<boolean>('funnyErrorSounds.enabled', true))              { return; }
      if (!cfg.get<boolean>('funnyErrorSounds.terminalErrorEnabled', true)) { return; }
      if (code === undefined || code === 0) {
        log('  → Exit code 0 (success) or unknown — no sound');
        return;
      }

      log(`  → ERROR detected (exit code ${code}) — playing terminal error sound`);
      const soundSetting = cfg.get<string>('funnyErrorSounds.terminalErrorSound', 'bundled:faaa');
      if (!soundSetting) { return; }

      const filePath = resolveSound(soundSetting, 'many');
      if (filePath) {
        log(`  → Playing: ${filePath}`);
        playAudioFile(filePath);
      }
    })
  );

  // Also open a new terminal to force shell integration injection (if none open)
  if (vscode.window.terminals.length === 0) {
    log('No terminals open — shell integration will activate when you open a terminal');
  }

  // ── 3. Status bar ─────────────────────────────────────────────────────────
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  updateStatusBar();
  statusBar.command = 'funnyErrorSounds.toggle';
  statusBar.show();

  // ── 4. Commands ───────────────────────────────────────────────────────────
  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand('funnyErrorSounds.testSingle',   () => triggerSound('single',   true)),
    vscode.commands.registerCommand('funnyErrorSounds.testMultiple', () => triggerSound('multiple', true)),
    vscode.commands.registerCommand('funnyErrorSounds.testMany',     () => triggerSound('many',     true)),
    vscode.commands.registerCommand('funnyErrorSounds.testTerminal', () => {
      log('Manual terminal sound test triggered');
      const cfg          = vscode.workspace.getConfiguration();
      const soundSetting = cfg.get<string>('funnyErrorSounds.terminalErrorSound', 'bundled:faaa');
      const filePath     = resolveSound(soundSetting, 'many');
      if (filePath) { playAudioFile(filePath); }
    }),
    vscode.commands.registerCommand('funnyErrorSounds.toggle', () => toggleEnabled()),
    vscode.commands.registerCommand('funnyErrorSounds.showLog', () => {
      outputChannel.show();
    }),
    vscode.commands.registerCommand('funnyErrorSounds.checkStatus', () => {
      outputChannel.show();
      log('─── STATUS CHECK ───────────────────────────────────');
      log(`Extension enabled: ${vscode.workspace.getConfiguration().get('funnyErrorSounds.enabled')}`);
      log(`Terminal sounds:   ${vscode.workspace.getConfiguration().get('funnyErrorSounds.terminalErrorEnabled')}`);
      log(`Open terminals: ${vscode.window.terminals.length}`);
      for (const t of vscode.window.terminals) {
        const si = (t as any).shellIntegration;
        log(`  • "${t.name}" — shell integration: ${si ? 'ACTIVE ✓' : 'NOT ACTIVE ✗'}`);
      }
      if (vscode.window.terminals.length === 0) {
        log('  ⚠ No terminals open — open a new terminal to get shell integration');
      }
      log('────────────────────────────────────────────────────');
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('funnyErrorSounds.enabled')) { updateStatusBar(); }
    })
  );

  log('All listeners registered ✓');
  log('─── Open the terminal and run a failing command to test ───');
}

export function deactivate(): void {
  watcher?.dispose();
}

// ─── Sound resolution ─────────────────────────────────────────────────────────

function triggerSound(soundType: SoundType, force = false): void {
  const config = vscode.workspace.getConfiguration();
  if (!force && !config.get<boolean>('funnyErrorSounds.enabled', true)) { return; }
  const setting  = config.get<string>(SOUND_CONFIG_KEY[soundType], DEFAULT_SOUND[soundType]);
  const filePath = resolveSound(setting, soundType);
  if (filePath) { playAudioFile(filePath); }
}

function resolveSound(setting: string, soundType: SoundType): string | null {
  if (setting.startsWith('bundled:')) {
    const fileName = BUNDLED_FILES[setting];
    if (!fileName) {
      vscode.window.showErrorMessage(`[Funny Error Sounds] Unknown bundled sound: "${setting}"`);
      return null;
    }
    const resolved = path.join(extensionDir, 'sounds', fileName);
    if (!fs.existsSync(resolved)) {
      log(`ERROR: Bundled sound missing at: ${resolved}`);
      vscode.window.showErrorMessage(`[Funny Error Sounds] Missing sound file: ${resolved}`);
      return null;
    }
    return resolved;
  }

  if (setting.startsWith('builtin:')) {
    if (!BUILTIN_GENERATORS[setting]) {
      vscode.window.showErrorMessage(`[Funny Error Sounds] Unknown builtin: "${setting}"`);
      return null;
    }
    return path.join(builtinWavDir, setting.replace('builtin:', '') + '.wav');
  }

  const err = validateCustomSoundPath(setting);
  if (err) {
    vscode.window.showErrorMessage(`[Funny Error Sounds] Invalid path for "${soundType}" sound: ${err}`);
    return null;
  }
  return setting;
}

async function initBuiltinSounds(): Promise<void> {
  for (const [name, generate] of Object.entries(BUILTIN_GENERATORS)) {
    const filePath = path.join(builtinWavDir, name.replace('builtin:', '') + '.wav');
    if (!fs.existsSync(filePath)) {
      await fs.promises.writeFile(filePath, generate());
    }
  }
}

// ─── Toggle / Status bar ──────────────────────────────────────────────────────

async function toggleEnabled(): Promise<void> {
  const config  = vscode.workspace.getConfiguration();
  const current = config.get<boolean>('funnyErrorSounds.enabled', true);
  await config.update('funnyErrorSounds.enabled', !current, vscode.ConfigurationTarget.Global);
  updateStatusBar();
  vscode.window.showInformationMessage(`Funny Error Sounds: ${!current ? '🔊 Enabled' : '🔇 Disabled'}`);
}

function updateStatusBar(): void {
  if (!statusBar) { return; }
  const on = vscode.workspace.getConfiguration().get<boolean>('funnyErrorSounds.enabled', true);
  statusBar.text    = on ? '$(unmute) Error Sounds' : '$(mute) Error Sounds';
  statusBar.tooltip = `Funny Error Sounds — ${on ? 'ON (click to disable)' : 'OFF (click to enable)'}`;
}
