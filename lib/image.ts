export type RGB = [number, number, number];

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法读取图片：${file.name}`));
    };
    img.src = url;
  });
}

export function toCanvas(img: HTMLImageElement, maxDim = 512): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function grayscale(canvas: HTMLCanvasElement, w: number, h: number): number[] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    out.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return out;
}

// 差值哈希：相邻像素亮度比较，64 位
export function dHash(canvas: HTMLCanvasElement): boolean[] {
  const g = grayscale(canvas, 9, 8);
  const bits: boolean[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits.push(g[y * 9 + x] > g[y * 9 + x + 1]);
    }
  }
  return bits;
}

export function flipHorizontal(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return c;
}

export function hamming(a: boolean[], b: boolean[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export function similarity(a: boolean[], b: boolean[]): number {
  return 1 - hamming(a, b) / a.length;
}

// 分块平均哈希，用于裁剪重叠检测
export function blockHashes(canvas: HTMLCanvasElement, grid = 4): boolean[][] {
  const blocks: boolean[][] = [];
  const bw = Math.floor(canvas.width / grid);
  const bh = Math.floor(canvas.height / grid);
  for (let by = 0; by < grid; by++) {
    for (let bx = 0; bx < grid; bx++) {
      const c = document.createElement("canvas");
      c.width = bw;
      c.height = bh;
      c.getContext("2d")!.drawImage(canvas, bx * bw, by * bh, bw, bh, 0, 0, bw, bh);
      const g = grayscale(c, 8, 8);
      const avg = g.reduce((a, b) => a + b, 0) / g.length;
      blocks.push(g.map((v) => v > avg));
    }
  }
  return blocks;
}

export interface DominantColor {
  rgb: RGB;
  share: number;
}

// 简易 k-means 提取主色（忽略接近白/黑的背景像素）
export function dominantColors(canvas: HTMLCanvasElement, k = 5): DominantColor[] {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  const pts: RGB[] = [];
  const step = Math.max(1, Math.floor((w * h) / 4000));
  for (let i = 0; i < w * h; i += step) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    if (a < 128) continue;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mn > 235 || mx < 25) continue;
    if (mx - mn < 12 && mn > 200) continue;
    pts.push([r, g, b]);
  }
  if (pts.length === 0) return [];
  const centers: RGB[] = [];
  for (let i = 0; i < Math.min(k, pts.length); i++) {
    centers.push([...pts[Math.floor((i * pts.length) / Math.min(k, pts.length))]] as RGB);
  }
  const assign = new Array<number>(pts.length).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    for (let i = 0; i < pts.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d =
          (pts[i][0] - centers[c][0]) ** 2 +
          (pts[i][1] - centers[c][1]) ** 2 +
          (pts[i][2] - centers[c][2]) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      assign[i] = best;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      const s = sums[assign[i]];
      s[0] += pts[i][0]; s[1] += pts[i][1]; s[2] += pts[i][2]; s[3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3] > 0) {
        centers[c] = [
          Math.round(sums[c][0] / sums[c][3]),
          Math.round(sums[c][1] / sums[c][3]),
          Math.round(sums[c][2] / sums[c][3]),
        ];
      }
    }
  }
  const counts = centers.map((_, c) => assign.filter((a) => a === c).length);
  const total = counts.reduce((a, b) => a + b, 0);
  return centers
    .map((rgb, i) => ({ rgb, share: counts[i] / total }))
    .filter((c) => c.share > 0.02)
    .sort((a, b) => b.share - a.share);
}

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab([r, g, b]: RGB): [number, number, number] {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  let x = (0.4124 * rl + 0.3576 * gl + 0.1805 * bl) / 0.95047;
  let y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  let z = (0.0193 * rl + 0.1192 * gl + 0.9505 * bl) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function deltaE(a: RGB, b: RGB): number {
  const la = rgbToLab(a);
  const lb = rgbToLab(b);
  return Math.sqrt((la[0] - lb[0]) ** 2 + (la[1] - lb[1]) ** 2 + (la[2] - lb[2]) ** 2);
}

export function luminance([r, g, b]: RGB): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type CvdType = "protanopia" | "deuteranopia" | "tritanopia";

export const CVD_LABELS: Record<CvdType, string> = {
  protanopia: "红色盲（Protanopia）",
  deuteranopia: "绿色盲（Deuteranopia）",
  tritanopia: "蓝色盲（Tritanopia）",
};

// 经典色觉模拟矩阵（近似）
const CVD_MATRICES: Record<CvdType, number[]> = {
  protanopia: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  deuteranopia: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  tritanopia: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
};

export function simulateCvdRgb(rgb: RGB, type: CvdType): RGB {
  const m = CVD_MATRICES[type];
  return [
    Math.min(255, Math.round(m[0] * rgb[0] + m[1] * rgb[1] + m[2] * rgb[2])),
    Math.min(255, Math.round(m[3] * rgb[0] + m[4] * rgb[1] + m[5] * rgb[2])),
    Math.min(255, Math.round(m[6] * rgb[0] + m[7] * rgb[1] + m[8] * rgb[2])),
  ];
}

export function renderCvd(canvas: HTMLCanvasElement, type: CvdType): string {
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, c.width, c.height);
  const d = imgData.data;
  const m = CVD_MATRICES[type];
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    d[i] = m[0] * r + m[1] * g + m[2] * b;
    d[i + 1] = m[3] * r + m[4] * g + m[5] * b;
    d[i + 2] = m[6] * r + m[7] * g + m[8] * b;
  }
  ctx.putImageData(imgData, 0, 0);
  return c.toDataURL("image/png");
}

export interface ScaleBarHit {
  x: number;
  y: number;
  w: number;
  h: number;
  dark: boolean;
}

// 启发式：在图片上下边缘区域寻找细长的纯色横条（比例尺候选）
export function detectScaleBar(canvas: HTMLCanvasElement): ScaleBarHit | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  const zones = [
    { y0: Math.floor(h * 0.82), y1: h },
    { y0: 0, y1: Math.ceil(h * 0.18) },
  ];
  let best: ScaleBarHit | null = null;
  for (const zone of zones) {
    for (let y = zone.y0; y < zone.y1; y++) {
      let runStart = -1;
      let runDark = false;
      let runLen = 0;
      const flush = (end: number) => {
        if (runLen >= Math.max(12, w * 0.06) && runLen <= w * 0.6) {
          const thickness = measureThickness(data, w, runStart, y, runDark);
          if (thickness >= 2 && thickness <= Math.max(6, h * 0.03)) {
            const hit = { x: runStart, y, w: runLen, h: thickness, dark: runDark };
            if (!best || hit.w > best.w) best = hit;
          }
        }
        runLen = 0;
        runStart = -1;
      };
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const dark = lum < 80;
        const light = lum > 200;
        if (dark || light) {
          if (runStart < 0 || (dark !== runDark)) {
            flush(x);
            runStart = x;
            runDark = dark;
          }
          runLen++;
        } else {
          flush(x);
        }
      }
      flush(w);
    }
  }
  return best;
}

function measureThickness(
  data: Uint8ClampedArray,
  w: number,
  x: number,
  y: number,
  dark: boolean,
): number {
  const match = (yy: number) => {
    const i = (yy * w + x + 2) * 4;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return dark ? lum < 80 : lum > 200;
  };
  let t = 1;
  const hTotal = data.length / 4 / w;
  while (y + t < hTotal && match(y + t) && t < 40) t++;
  let up = 0;
  while (y - up - 1 >= 0 && match(y - up - 1) && up < 40) up++;
  return t + up;
}

export function rgbCss([r, g, b]: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function rgbHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}