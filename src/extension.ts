/**
 * extension.ts — Entry point for Funny Error Sounds
 *
 * Sound resolution priority:
 *   bundled:<name>  → MP3 shipped inside the extension's sounds/ folder
 *   builtin:<name>  → WAV generated on the fly by wavGenerator
 *   anything else   → user-supplied absolute file path (validated)
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';

import { BUILTIN_GENERATORS }                    from './wavGenerator';
import { playAudioFile, validateCustomSoundPath } from './soundPlayer';
import { DiagnosticWatcher, SoundType }           from './diagnosticWatcher';

// ─── Bundled MP3 map  ─────────────────────────────────────────────────────────
// Maps  bundled:<key>  →  filename inside sounds/

const BUNDLED_FILES: Record<string, string> = {
  'bundled:faaa':           'faaa.mp3',
  'bundled:henta_ahh':      'henta_ahh.mp3',
  'bundled:makabhosda_aag': 'makabhosda_aag.mp3',
};

// ─── Config key mapping ───────────────────────────────────────────────────────

const SOUND_CONFIG_KEY: Record<SoundType, string> = {
  single:   'funnyErrorSounds.singleErrorSound',
  multiple: 'funnyErrorSounds.multipleErrorsSound',
  many:     'funnyErrorSounds.manyErrorsSound',
};

// Default to the user's own bundled sounds
const DEFAULT_SOUND: Record<SoundType, string> = {
  single:   'bundled:faaa',
  multiple: 'bundled:henta_ahh',
  many:     'bundled:makabhosda_aag',
};

// ─── State ────────────────────────────────────────────────────────────────────

let watcher:       DiagnosticWatcher | undefined;
let statusBar:     vscode.StatusBarItem | undefined;
let builtinWavDir: string;   // global storage — for generated WAV builtins
let extensionDir:  string;   // extension install dir — for bundled MP3s

// ─── Activation ───────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  builtinWavDir = context.globalStorageUri.fsPath;
  extensionDir  = context.extensionPath;

  await fs.promises.mkdir(builtinWavDir, { recursive: true });

  // Pre-generate WAV files for builtin sounds (only on first run)
  await initBuiltinSounds();

  // Start diagnostic watcher
  watcher = new DiagnosticWatcher((soundType) => triggerSound(soundType));
  watcher.start();

  // Status bar toggle
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  updateStatusBar();
  statusBar.command = 'funnyErrorSounds.toggle';
  statusBar.show();

  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand('funnyErrorSounds.testSingle',   () => triggerSound('single',   true)),
    vscode.commands.registerCommand('funnyErrorSounds.testMultiple', () => triggerSound('multiple', true)),
    vscode.commands.registerCommand('funnyErrorSounds.testMany',     () => triggerSound('many',     true)),
    vscode.commands.registerCommand('funnyErrorSounds.toggle',       () => toggleEnabled()),
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

  if (!force && !config.get<boolean>('funnyErrorSounds.enabled', true)) {
    return;
  }

  const setting  = config.get<string>(SOUND_CONFIG_KEY[soundType], DEFAULT_SOUND[soundType]);
  const filePath = resolveSound(setting, soundType);
  if (filePath) {
    playAudioFile(filePath);
  }
}

/**
 * Resolve a setting string to an absolute file path.
 *
 *  bundled:<name>  → extension's sounds/ directory (MP3 shipped with the extension)
 *  builtin:<name>  → pre-generated WAV in VS Code global storage
 *  <anything else> → user-provided absolute path (validated)
 */
function resolveSound(setting: string, soundType: SoundType): string | null {

  // ── Bundled MP3 (your uploaded sounds) ──
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
      vscode.window.showErrorMessage(
        `[Funny Error Sounds] Bundled sound file missing: ${resolved}`
      );
      return null;
    }
    return resolved;
  }

  // ── Generated WAV builtins ──
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

  // ── User-supplied custom path ──
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
  if (!statusBar) return;
  const on = vscode.workspace.getConfiguration().get<boolean>('funnyErrorSounds.enabled', true);
  statusBar.text    = on ? '$(unmute) Error Sounds' : '$(mute) Error Sounds';
  statusBar.tooltip = `Funny Error Sounds — ${on ? 'ON (click to disable)' : 'OFF (click to enable)'}`;
}
