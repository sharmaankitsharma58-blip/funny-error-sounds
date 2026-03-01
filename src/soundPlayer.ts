/**
 * soundPlayer.ts
 * Plays audio files using platform-native tools.
 *
 * Security design:
 *  - File paths are passed via environment variable (not embedded in shell commands)
 *    so there is zero risk of command/shell injection.
 *  - execFile() is used (not exec/spawn with shell:true) — no shell is invoked.
 *  - All user-supplied paths are validated before use.
 *  - Only absolute paths with allowed audio extensions are accepted.
 *
 * Format support:
 *  - Windows WAV  → System.Media.SoundPlayer  (lightweight, built-in)
 *  - Windows MP3/others → Windows Media Player COM object (built-in on Win10/11)
 *  - macOS        → afplay  (supports WAV, MP3, AAC, AIFF, etc.)
 *  - Linux        → paplay → aplay fallback (WAV); mpg123 → ffplay fallback (MP3)
 */

import * as cp   from 'child_process';
import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';

/** Audio extensions allowed for custom sounds */
const ALLOWED_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.aac', '.flac', '.m4a']);

/** Validate a user-supplied custom sound path. Returns an error string or null. */
export function validateCustomSoundPath(filePath: string): string | null {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return 'Sound path must be a non-empty string.';
  }
  if (!path.isAbsolute(filePath)) {
    return 'Sound path must be an absolute path (e.g. C:\\Sounds\\beep.wav).';
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `Unsupported file type "${ext}". Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}.`;
  }
  if (!fs.existsSync(filePath)) {
    return `File not found: ${filePath}`;
  }
  if (!fs.statSync(filePath).isFile()) {
    return `Path is not a file: ${filePath}`;
  }
  return null;
}

/**
 * Play an audio file using the OS-native player.
 * The file path is always passed via an environment variable — never
 * interpolated into a shell command string — preventing injection.
 */
export function playAudioFile(filePath: string): void {
  const platform = os.platform();
  const safeEnv  = { ...process.env, FES_SOUND_PATH: filePath };
  const ext      = path.extname(filePath).toLowerCase();

  try {
    if (platform === 'darwin') {
      // afplay supports WAV, MP3, AAC, AIFF — works out of the box on all Macs
      cp.execFile('afplay', [filePath], { timeout: 30_000 }, handleError);

    } else if (platform === 'linux') {
      if (ext === '.wav') {
        // WAV: try PulseAudio first, fall back to ALSA
        cp.execFile('paplay', [filePath], { timeout: 30_000 }, (err) => {
          if (err) {
            cp.execFile('aplay', [filePath], { timeout: 30_000 }, handleError);
          }
        });
      } else {
        // MP3/others: try mpg123, then ffplay
        cp.execFile('mpg123', ['-q', filePath], { timeout: 30_000 }, (err) => {
          if (err) {
            cp.execFile('ffplay', ['-nodisp', '-autoexit', filePath],
              { timeout: 30_000 }, handleError);
          }
        });
      }

    } else if (platform === 'win32') {
      if (ext === '.wav') {
        // WAV: System.Media.SoundPlayer — lightweight, no extra setup
        cp.execFile(
          'powershell',
          [
            '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
            '-Command',
            '[System.Media.SoundPlayer]::new($env:FES_SOUND_PATH).PlaySync()',
          ],
          { env: safeEnv, windowsHide: true, timeout: 30_000 },
          handleError
        );
      } else {
        // MP3 / OGG / AAC etc.: Windows Media Player COM object
        // Polls playState until done (3 = Playing), max 30 s.
        // Path comes from $env:FES_SOUND_PATH — no injection possible.
        const script = [
          '$wmp = New-Object -ComObject WMPlayer.OCX.7',
          '$wmp.settings.autoStart = $true',
          '$wmp.URL = $env:FES_SOUND_PATH',
          '$wmp.controls.play()',
          '$limit = 150',   // 150 × 200 ms = 30 s max
          '$i = 0',
          'while ($wmp.playState -eq 3 -and $i -lt $limit) { Start-Sleep -Milliseconds 200; $i++ }',
          '$wmp.controls.stop()',
        ].join('; ');

        cp.execFile(
          'powershell',
          [
            '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
            '-Command', script,
          ],
          { env: safeEnv, windowsHide: true, timeout: 35_000 },
          handleError
        );
      }

    } else {
      console.warn('[Funny Error Sounds] Unsupported platform:', platform);
    }
  } catch (err) {
    handleError(err as Error);
  }
}

function handleError(err: Error | null | undefined): void {
  if (err) {
    // Fail silently — never crash the extension or the user's editor
    console.error('[Funny Error Sounds] Playback error:', err.message);
  }
}
