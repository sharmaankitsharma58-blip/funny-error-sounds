/**
 * wavGenerator.ts
 * Generates funny WAV audio buffers programmatically using pure Node.js.
 * No external dependencies — no supply chain risk.
 */

const SAMPLE_RATE = 22050; // 22 kHz — good quality, small files

/** Builds a WAV file buffer from a Float32 PCM sample array */
function buildWav(samples: Float32Array): Buffer {
  const dataSize = samples.length * 2; // 16-bit PCM = 2 bytes per sample
  const buf = Buffer.alloc(44 + dataSize);

  // RIFF header
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');

  // fmt chunk
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);           // PCM chunk size
  buf.writeUInt16LE(1, 20);            // PCM format
  buf.writeUInt16LE(1, 22);            // Mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // Byte rate
  buf.writeUInt16LE(2, 32);            // Block align
  buf.writeUInt16LE(16, 34);           // 16-bit

  // data chunk
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);

  // Write PCM samples clamped to [-1, 1]
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  return buf;
}

/** Concatenate multiple sample arrays */
function concat(...arrays: Float32Array[]): Float32Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/**
 * Generate a tone with an ADSR-style envelope.
 * Phase is tracked accurately to avoid clicks between notes.
 */
function tone(
  freq: number,
  duration: number,
  amplitude: number = 0.6,
  phaseIn: number = 0
): { samples: Float32Array; phaseOut: number } {
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(n);
  const attack = Math.floor(n * 0.08);
  const release = Math.floor(n * 0.25);
  const sustain = 0.75;

  let phase = phaseIn;
  for (let i = 0; i < n; i++) {
    let env: number;
    if (i < attack) {
      env = i / attack;
    } else if (i > n - release) {
      env = ((n - i) / release) * sustain;
    } else {
      env = sustain + (1 - sustain) * (1 - (i - attack) / (n - attack - release));
      env = Math.min(1, env);
    }
    samples[i] = amplitude * env * Math.sin(2 * Math.PI * phase);
    phase += freq / SAMPLE_RATE;
    if (phase >= 1) phase -= 1;
  }
  return { samples, phaseOut: phase };
}

/**
 * Generate a pitch slide (portamento) — the "wah" effect.
 * Frequency glides smoothly from startFreq to endFreq.
 */
function slide(
  startFreq: number,
  endFreq: number,
  duration: number,
  amplitude: number = 0.6
): Float32Array {
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(n);
  const release = Math.floor(n * 0.2);
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const progress = i / n;
    // Exponential interpolation for natural pitch slide
    const freq = startFreq * Math.pow(endFreq / startFreq, progress);
    const env = i > n - release ? ((n - i) / release) : 1;
    samples[i] = amplitude * env * Math.sin(2 * Math.PI * phase);
    phase += freq / SAMPLE_RATE;
    if (phase >= 1) phase -= 1;
  }
  return samples;
}

/** Short silence gap between notes */
function silence(duration: number): Float32Array {
  return new Float32Array(Math.floor(SAMPLE_RATE * duration));
}

// ─── Builtin Sounds ────────────────────────────────────────────────────────

/**
 * SAD TROMBONE — for 1–3 errors
 * Classic "wah wah wah waaah" descending chromatic slide.
 */
export function generateSadTrombone(): Buffer {
  // Three quick "wah" slides, then a long sad low note
  const wah1 = slide(466, 415, 0.22, 0.55);   // Bb4 → Ab4
  const gap1 = silence(0.04);
  const wah2 = slide(440, 392, 0.22, 0.60);   // A4 → G4
  const gap2 = silence(0.04);
  const wah3 = slide(415, 370, 0.22, 0.65);   // Ab4 → F#4
  const gap3 = silence(0.05);
  const waah = slide(370, 311, 0.70, 0.55);   // Long, sad, fading glide

  return buildWav(concat(wah1, gap1, wah2, gap2, wah3, gap3, waah));
}

/**
 * DUN DUN DUN — for 4–5 errors
 * Three dramatic low tones, crescendo style.
 */
export function generateDunDunDun(): Buffer {
  const { samples: dun1 } = tone(130.81, 0.28, 0.45); // C3
  const { samples: dun2 } = tone(123.47, 0.28, 0.62); // B2 — slightly louder
  const { samples: dun3 } = tone(110.00, 0.65, 0.80); // A2 — dramatic finale

  const gap = silence(0.12);

  return buildWav(concat(dun1, gap, dun2, gap, dun3));
}

/**
 * ALARM — for 6+ errors
 * Rapid alternating high/low beeps — full panic mode.
 */
export function generateAlarm(): Buffer {
  const segments: Float32Array[] = [];
  const cycles = 10;

  for (let i = 0; i < cycles; i++) {
    // Slight amplitude increase each cycle for urgency
    const vol = 0.5 + (i / cycles) * 0.25;
    const beepDur = 0.09;

    const { samples: hi } = tone(880, beepDur, vol);  // A5
    const { samples: lo } = tone(659, beepDur, vol);  // E5
    segments.push(hi, lo);
  }

  return buildWav(concat(...segments));
}

/** Map builtin names to generator functions */
export const BUILTIN_GENERATORS: Record<string, () => Buffer> = {
  'builtin:sadTrombone': generateSadTrombone,
  'builtin:dundunDun':   generateDunDunDun,
  'builtin:alarm':       generateAlarm,
};
