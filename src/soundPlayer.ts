/**
 * soundPlayer.ts
 * Plays audio files using platform-native tools.
 *
 * Security:
 *  - All file paths are passed via environment variables, never embedded
 *    in command strings → zero shell injection risk.
 *  - execFile() is used (no shell spawned).
 *  - User paths are strictly validated before use.
 *
 * Windows MP3: uses MCI (winmm.dll) via PowerShell Add-Type — most reliable
 *              approach for MP3 on Windows 10/11 without extra installs.
 * Windows WAV: System.Media.SoundPlayer — lightweight built-in.
 * macOS:       afplay — handles WAV, MP3, AAC, AIFF natively.
 * Linux:       paplay/aplay (WAV), mpg123/ffplay (MP3).
 */

import * as cp   from 'child_process';
import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';

const ALLOWED_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.aac', '.flac', '.m4a']);

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

export function playAudioFile(filePath: string): void {
  const platform = os.platform();
  const ext      = path.extname(filePath).toLowerCase();
  const safeEnv  = { ...process.env, FES_SOUND_PATH: filePath };

  try {
    if (platform === 'darwin') {
      cp.execFile('afplay', [filePath], { timeout: 30_000 }, handleError);

    } else if (platform === 'linux') {
      if (ext === '.wav') {
        cp.execFile('paplay', [filePath], { timeout: 30_000 }, (err) => {
          if (err) {
            cp.execFile('aplay', [filePath], { timeout: 30_000 }, handleError);
          }
        });
      } else {
        cp.execFile('mpg123', ['-q', filePath], { timeout: 30_000 }, (err) => {
          if (err) {
            cp.execFile('ffplay', ['-nodisp', '-autoexit', filePath],
              { timeout: 30_000 }, handleError);
          }
        });
      }

    } else if (platform === 'win32') {
      if (ext === '.wav') {
        // WAV: lightweight SoundPlayer
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
        // MP3 / OGG / AAC: MCI via winmm.dll — works on all Windows 10/11 systems
        // Path is read from $env:FES_SOUND_PATH so no injection is possible.
        const script = `
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using System.Text;
public class FESWAV {
    [DllImport("winmm.dll", CharSet=CharSet.Auto)]
    public static extern int mciSendString(string cmd, StringBuilder ret, int retLen, System.IntPtr cb);
}
'@
$p = $env:FES_SOUND_PATH
[FESWAV]::mciSendString("open \`"$p\`" type mpegvideo alias fes", $null, 0, [System.IntPtr]::Zero)
[FESWAV]::mciSendString("play fes wait", $null, 0, [System.IntPtr]::Zero)
[FESWAV]::mciSendString("close fes", $null, 0, [System.IntPtr]::Zero)
`.trim();

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
    console.error('[Funny Error Sounds] Playback error:', err.message);
  }
}
