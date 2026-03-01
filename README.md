# Funny Error Sounds 🔊

Plays hilarious sounds when your code has errors — so you *feel* the pain.

## Features

| Errors | Sound | Default |
|--------|-------|---------|
| 1 – 3  | Single error | Sad Trombone 🎺 (*wah wah wah waaah*) |
| 4 – 5  | Multiple errors | Dun Dun DUN 🥁 (dramatic crescendo) |
| 6+     | Many errors | ALARM 🚨 (full panic mode) |

- Sounds play automatically when errors appear in the active file
- Status bar button to toggle on/off instantly
- All sounds are **generated locally** — no internet required, no audio files to install

## Changing Sounds

Open VS Code Settings (`Ctrl+,`) and search for `Funny Error Sounds`.

### Use a builtin sound

```
builtin:sadTrombone   ← wah wah wah waaah
builtin:dundunDun     ← dun dun DUN!
builtin:alarm         ← rapid beeping alarm
```

### Use your own sound file

Set the value to an absolute path to a `.wav`, `.mp3`, or `.ogg` file:

**Windows:**
```
C:\Users\YourName\Sounds\mybeep.wav
```

**macOS / Linux:**
```
/Users/yourname/sounds/mybeep.wav
```

## All Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `funnyErrorSounds.enabled` | `true` | Enable / disable sounds |
| `funnyErrorSounds.debounceDelay` | `1500` | Wait (ms) after typing before playing |
| `funnyErrorSounds.singleErrorSound` | `builtin:sadTrombone` | Sound for 1–3 errors |
| `funnyErrorSounds.multipleErrorsSound` | `builtin:dundunDun` | Sound for 4–5 errors |
| `funnyErrorSounds.manyErrorsSound` | `builtin:alarm` | Sound for 6+ errors |
| `funnyErrorSounds.onlyOnIncrease` | `true` | Only play when error count goes up |

## Commands

Open the Command Palette (`Ctrl+Shift+P`) and type **Funny Error Sounds**:

- `Funny Error Sounds: Test: Single Error Sound`
- `Funny Error Sounds: Test: Multiple Errors Sound`
- `Funny Error Sounds: Test: Many Errors Sound`
- `Funny Error Sounds: Toggle On/Off`

## Requirements

| Platform | Requirement |
|----------|-------------|
| Windows  | PowerShell (built-in) |
| macOS    | `afplay` (built-in) |
| Linux    | `paplay` (PulseAudio) or `aplay` (ALSA) |

## Privacy & Security

- No network requests
- No telemetry
- No external dependencies
- Sound file paths are validated and passed safely (no shell injection possible)
- All builtin sounds are generated locally from math — no audio files downloaded

## License

MIT
