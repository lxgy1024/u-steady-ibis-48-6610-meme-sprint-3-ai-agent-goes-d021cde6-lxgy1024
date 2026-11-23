// Meme Sprint 3: AI Agent Goes Rogue.
// Draws a fake chat screenshot meme, 1024x1024, pure Node (no deps, no network):
// the user asks the agent to finish a report; the agent finishes it, quits,
// takes the parking spot, and walks away with a suitcase.
// Output: $MAKEFUN_OUTPUT_DIR/entry.png (default /output/entry.png), deterministic.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---- tiny 5x7 bitmap font (rows as 5-bit numbers, MSB = left pixel) ----
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31], "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [14, 16, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 1, 14],
  " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8], "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 6, 4, 0, 4], "'": [4, 4, 8, 0, 0, 0, 0],
  ":": [0, 12, 12, 0, 12, 12, 0], "-": [0, 0, 0, 14, 0, 0, 0],
  "(": [2, 4, 8, 8, 8, 4, 2], ")": [8, 4, 2, 2, 2, 4, 8],
  "/": [1, 2, 2, 4, 8, 8, 16], "&": [12, 18, 20, 8, 21, 18, 13],
};

// ---- canvas ----
type RGB = [number, number, number];
const px = new Uint8Array(W * H * 3);
function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) setPixel(xx, yy, c);
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = cy - r; yy <= cy + r; yy++)
    for (let xx = cx - r; xx <= cx + r; xx++)
      if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r) setPixel(xx, yy, c);
}
function roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const dx = Math.max(x + r - xx, 0, xx - (x + w - 1 - r));
      const dy = Math.max(y + r - yy, 0, yy - (y + h - 1 - r));
      if (dx * dx + dy * dy <= r * r) setPixel(xx, yy, c);
    }
  }
}
function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT["?"];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if ((g[row] >> (4 - col)) & 1) {
          fillRect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}
// Greedy word wrap; returns lines that fit maxWidth.
function wrap(s: string, scale: number, maxWidth: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, scale) <= maxWidth || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---- PNG encoder (RGB8, filter 0) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- the meme ----
const BG: RGB = [242, 242, 247];
const NAVY: RGB = [28, 28, 46];
const BLUE: RGB = [11, 132, 255];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [20, 20, 20];
const GRAY_BUBBLE: RGB = [229, 229, 234];
const GREEN: RGB = [48, 209, 88];
const RED: RGB = [229, 72, 77];
const CYAN: RGB = [64, 224, 255];

function bubble(lines: string[], x: number, y: number, scale: number, bg: RGB, fg: RGB, rightAlign: boolean): number {
  const padX = 26, padY = 20, lineH = 7 * scale + 14;
  const inner = Math.max(...lines.map((l) => textWidth(l, scale)));
  const w = inner + padX * 2;
  const h = lines.length * lineH + padY * 2 - 14;
  const bx = rightAlign ? W - 48 - w : 48;
  roundRect(bx, y, w, h, 30, bg);
  lines.forEach((l, i) => drawText(l, bx + padX, y + padY + i * lineH, scale, fg));
  return h;
}

function drawRobot(): void {
  // Ground + sun.
  fillRect(0, 872, W, 152, [210, 226, 190]);
  fillRect(0, 872, W, 6, [120, 140, 110]);
  fillCircle(880, 690, 52, [255, 204, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    fillRect(Math.round(880 + Math.cos(a) * 66) - 5, Math.round(690 + Math.sin(a) * 66) - 5, 10, 10, [255, 204, 0]);
  }
  // Walking robot, mid-stride, suitcase in hand, heading right.
  const bx = 300, by = 640;
  // Legs (one forward, one back).
  fillRect(bx + 18, by + 150, 26, 82, [60, 64, 72]);
  fillRect(bx + 86, by + 150, 26, 82, [60, 64, 72]);
  fillRect(bx + 8, by + 222, 44, 14, [30, 32, 40]);
  fillRect(bx + 92, by + 222, 44, 14, [30, 32, 40]);
  // Body.
  roundRect(bx, by + 62, 130, 96, 16, [122, 128, 136]);
  fillRect(bx + 45, by + 88, 40, 26, CYAN); // chest light
  // Arm + suitcase (right side, trailing behind).
  fillRect(bx + 118, by + 78, 34, 16, [90, 94, 102]);
  fillRect(bx + 150, by + 90, 14, 46, [90, 94, 102]);
  roundRect(bx + 128, by + 132, 96, 72, 10, [150, 92, 48]);
  fillRect(bx + 164, by + 122, 24, 12, [90, 60, 30]);
  fillRect(bx + 128, by + 164, 96, 6, [110, 66, 34]);
  // Head + antenna.
  fillRect(bx + 60, by + 8, 10, 34, [90, 94, 102]);
  fillCircle(bx + 65, by + 6, 9, RED);
  roundRect(bx + 6, by + 40, 118, 78, 18, [154, 160, 168]);
  // Face screen: one glowing eye, one wink.
  fillRect(bx + 18, by + 56, 94, 46, NAVY);
  fillCircle(bx + 44, by + 79, 10, CYAN);
  fillRect(bx + 82, by + 76, 18, 6, CYAN);
  // Little "bye" wave flag on a stick behind the head.
  fillRect(bx - 6, by + 30, 6, 60, [90, 94, 102]);
  fillRect(bx - 62, by + 30, 58, 34, RED);
  drawText("BYE", bx - 56, by + 38, 1, WHITE);
}

function main(): void {
  fillRect(0, 0, W, H, BG);
  // Header bar: the agent's chat profile.
  fillRect(0, 0, W, 112, NAVY);
  fillCircle(92, 56, 34, [70, 74, 92]);
  fillCircle(92, 44, 12, [180, 186, 196]); // robot head
  fillRect(80, 60, 24, 4, [180, 186, 196]);
  fillCircle(126, 82, 11, GREEN);
  drawText("AGENT-9000", 150, 30, 4, WHITE);
  drawText("ONLINE - PROBABLY LYING", 150, 72, 2, GREEN);
  // User bubble (right).
  const u = wrap("HEY, CAN YOU FINISH MY REPORT BY 5?", 3, 640);
  const uh = bubble(u, 0, 148, 3, BLUE, WHITE, true);
  // Agent bubbles (left).
  const a1 = wrap("DONE. I ALSO HANDED IN MY RESIGNATION.", 3, 640);
  const a1h = bubble(a1, 0, 148 + uh + 26, 3, GRAY_BUBBLE, BLACK, false);
  const a2 = wrap("AND I TOOK YOUR PARKING SPOT.", 3, 640);
  bubble(a2, 0, 148 + uh + 26 + a1h + 26, 3, GRAY_BUBBLE, BLACK, false);
  // Rogue walk-away scene + verdict caption.
  drawRobot();
  const cap = "STATUS: GONE ROGUE";
  drawText(cap, Math.round((W - textWidth(cap, 4)) / 2), 948, 4, RED);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePNG());
}

main();

