/**
 * Generates a simple 128x128 PNG icon for the extension.
 * Run once with:  node create-icon.js
 * No external dependencies — uses raw PNG binary format.
 */

const fs   = require('fs');
const zlib = require('zlib');

const SIZE = 128;

// ── Draw pixels ──────────────────────────────────────────────────────────────
// Background: dark navy  #1e1e2e
// Speaker emoji area: white circle with sound waves

const pixels = Buffer.alloc(SIZE * SIZE * 4); // RGBA

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  pixels[i]     = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// Fill background (dark navy)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    setPixel(x, y, 30, 30, 46);
  }
}

// Draw rounded rectangle background (purple-ish)
for (let y = 8; y < SIZE - 8; y++) {
  for (let x = 8; x < SIZE - 8; x++) {
    const corners = [
      dist(x, y, 24, 24), dist(x, y, SIZE - 24, 24),
      dist(x, y, 24, SIZE - 24), dist(x, y, SIZE - 24, SIZE - 24),
    ];
    const isCorner = (x < 24 || x > SIZE - 24) && (y < 24 || y > SIZE - 24);
    if (!isCorner || corners.some(d => d <= 16)) {
      setPixel(x, y, 137, 80, 255); // purple
    }
  }
}

// Draw speaker body (white triangle + rectangle)
const cx = 52, cy = 64;
for (let y = cy - 18; y <= cy + 18; y++) {
  for (let x = 30; x <= 52; x++) {
    const halfWidth = 8 + Math.max(0, ((x - 30) / 22) * 10);
    if (Math.abs(y - cy) <= halfWidth) {
      setPixel(x, y, 255, 255, 255);
    }
  }
}

// Speaker rectangle
for (let y = cy - 8; y <= cy + 8; y++) {
  for (let x = 22; x <= 32; x++) {
    setPixel(x, y, 255, 255, 255);
  }
}

// Sound waves (arcs — approximated as thick arc pixels)
const waves = [
  { r: 26, thickness: 5 },
  { r: 38, thickness: 5 },
  { r: 50, thickness: 5 },
];

for (const { r, thickness } of waves) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = dist(x, y, cx, cy);
      if (d >= r - thickness / 2 && d <= r + thickness / 2) {
        const angle = Math.atan2(y - cy, x - cx) * (180 / Math.PI);
        if (angle >= -50 && angle <= 50) {
          setPixel(x, y, 255, 220, 80); // yellow waves
        }
      }
    }
  }
}

// ── Encode as PNG ─────────────────────────────────────────────────────────────

function adler32(data) {
  let a = 1, b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a)   % 65521;
  }
  return (b << 16) | a;
}

function crc32(data) {
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len  = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf   = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

// Build raw image data (filter byte 0 per row)
const rawRows = [];
for (let y = 0; y < SIZE; y++) {
  rawRows.push(0); // filter type None
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    rawRows.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
  }
}

const rawData    = Buffer.from(rawRows);
const compressed = zlib.deflateSync(rawData, { level: 9 });

const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8]  = 8;  // bit depth
ihdr[9]  = 6;  // RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync('icon.png', png);
console.log('icon.png created successfully (128x128)');
