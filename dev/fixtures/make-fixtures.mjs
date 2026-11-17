import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, pixelAt) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixelAt(x, y);
      const o = y * (1 + w * 3) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const W = 240, H = 160;
const WHITE = [255, 255, 255], RED = [214, 39, 40], GREEN = [44, 160, 44], BLACK = [20, 20, 20];
function figA(x, y) {
  if (y >= 145 && y <= 149 && x >= 150 && x <= 210) return BLACK;
  if (x >= 40 && x <= 90 && y >= 40 && y <= 130) return RED;
  if (x >= 140 && x <= 190 && y >= 70 && y <= 130) return GREEN;
  if (y === 131 && x >= 20 && x <= 220) return BLACK;
  return WHITE;
}
const out = path.dirname(fileURLToPath(import.meta.url));
fs.writeFileSync(path.join(out, "figA.png"), encodePNG(W, H, figA));
fs.writeFileSync(path.join(out, "figB_mirror.png"), encodePNG(W, H, (x, y) => figA(W - 1 - x, y)));
fs.writeFileSync(path.join(out, "figC_crop.png"), encodePNG(160, 140, (x, y) => figA(x, y)));
console.log("fixtures written:", fs.readdirSync(out).filter((f) => f.endsWith(".png")));