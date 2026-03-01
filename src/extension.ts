/**
 * extension.ts — Entry point for Funny Error Sounds
 *
 * Two error sources:
 *   1. Editor diagnostics  — red squiggles from language servers
 *   2. Terminal commands   — any command that exits with a non-zero code
 *
 * Sound resolution:
 *   bundled:<name>  → MP3 shipped inside extension's sounds/ folder
 *   builtin:<name>  → WAV generated on the fly by wavGenerator
 *   anything else   → user-supplied absolute file path (validated)
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

// ─── Config keys ──────────────────────────────────────────────────────────────

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
let builtinWavDir: string;
let extensionDir:  string;

// ─── Activation ───────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  builtinWavDir = context.globalStorageUri.fsPath;
  extensionDir  = context.extensionPath;

  await fs.promises.mkdir(builtinWavDir, { recursive: true });
  await initBuiltinSounds();

  // ── 1. Watch editor diagnostics (red squiggles) ──────────────────────────
  watcher = new DiagnosticWatcher((soundType) => triggerSound(soundType));
  watcher.start();

  // ── 2. Watch terminal command exit codes ─────────────────────────────────
  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution((event) => {
      const cfg = vscode.workspace.getConfiguration();
      if (!cfg.get<boolean>('funnyErrorSounds.enabled', true))         { return; }
      if (!cfg.get<boolean>('funnyErrorSounds.terminalErrorEnabled', true)) { return; }

      const code = event.exitCode;
      if (code === undefined || code === 0) { return; } // success or unknown — stay silent

      // Any non-zero exit code = error — play the terminal error sound
      const soundSetting = cfg.get<string>(
        'funnyErrorSounds.terminalErrorSound',
        'bundled:makabhosda_aag'
      );
      if (!soundSetting) { return; } // empty string = user disabled terminal sounds

      const filePath = resolveSound(soundSetting, 'many');
      if (filePath) { playAudioFile(filePath); }
    })
  );

  // ── Status bar ───────────────────────────────────────────────────────────
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  updateStatusBar();
  statusBar.command = 'funnyErrorSounds.toggle';
  statusBar.show();

  // ── Commands ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand('funnyErrorSounds.testSingle',   () => triggerSound('single',   true)),
    vscode.commands.registerCommand('funnyErrorSounds.testMultiple', () => triggerSound('multiple', true)),
    vscode.commands.registerCommand('funnyErrorSounds.testMany',     () => triggerSound('many',     true)),
    vscode.commands.registerCommand('funnyErrorSounds.testTerminal', () => {
      // Simulate a terminal error for testing
      const cfg = vscode.workspace.getConfiguration();
      const soundSetting = cfg.get<string>(
        'funnyErrorSounds.terminalErrorSound',
        'bundled:makabhosda_aag'
      );
      const filePath = resolveSound(soundSetting, 'many');
      if (filePath) { playAudioFile(filePath); }
    }),
    vscode.commands.registerCommand('funnyErrorSounds.toggle', () => toggleEnabled()),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('funnyErrorSounds.enabled')) {
        updateStatusBar();
      }
    })
  );
}

export function deactivate(): void {
  watcher?.dispose();
}

// ─── Sound playback ───────────────────────────────────────────────────────────

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
      vscode.window.showErrorMessage(
        `[Funny Error Sounds] Unknown bundled sound: "${setting}". ` +
        `Valid: ${Object.keys(BUNDLED_FILES).join(', ')}`
      );
      return null;
    }
    const resolved = path.join(extensionDir, 'sounds', fileName);
    if (!fs.existsSync(resolved)) {
      vscode.window.showErrorMessage(`[Funny Error Sounds] Bundled sound file missing: ${resolved}`);
      return null;
    }
    return resolved;
  }

  if (setting.startsWith('builtin:')) {
    if (!BUILTIN_GENERATORS[setting]) {
      vscode.window.showErrorMessage(
        `[Funny Error Sounds] Unknown builtin: "${setting}". ` +
        `Valid: ${Object.keys(BUILTIN_GENERATORS).join(', ')}`
      );
      return null;
    }
    return path.join(builtinWavDir, setting.replace('builtin:', '') + '.wav');
  }

  const err = validateCustomSoundPath(setting);
  if (err) {
    vscode.window.showErrorMessage(
      `[Funny Error Sounds] Invalid path for "${soundType}" sound: ${err}`
    );
    return null;
  }
  return setting;
}

// ─── Init generated WAV builtins ─────────────────────────────────────────────

async function initBuiltinSounds(): Promise<void> {
  for (const [name, generate] of Object.entries(BUILTIN_GENERATORS)) {
    const filePath = path.join(builtinWavDir, name.replace('builtin:', '') + '.wav');
    if (!fs.existsSync(filePath)) {
      await fs.promises.writeFile(filePath, generate());
    }
  }
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

async function toggleEnabled(): Promise<void> {
  const config  = vscode.workspace.getConfiguration();
  const current = config.get<boolean>('funnyErrorSounds.enabled', true);
  await config.update('funnyErrorSounds.enabled', !current, vscode.ConfigurationTarget.Global);
  updateStatusBar();
  vscode.window.showInformationMessage(
    `Funny Error Sounds: ${!current ? '🔊 Enabled' : '🔇 Disabled'}`
  );
}

function updateStatusBar(): void {
  if (!statusBar) { return; }
  const on = vscode.workspace.getConfiguration().get<boolean>('funnyErrorSounds.enabled', true);
  statusBar.text    = on ? '$(unmute) Error Sounds' : '$(mute) Error Sounds';
  statusBar.tooltip = `Funny Error Sounds — ${on ? 'ON (click to disable)' : 'OFF (click to enable)'}`;
}
