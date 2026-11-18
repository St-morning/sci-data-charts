export interface Theme {
  unitsPerPt?: number;
  axisBounds?: {xMin?:number;xMax?:number;yMin?:number;yMax?:number};
  colors: string[];
  text: string;
  axis: string;
  bg: string;
  fontScale: number;
  fontFamily: string;
  tickFont: number;
  labelFont: number;
  titleFont: number;
  legendFont: number;
  grid: boolean;
  showAxisLabels: boolean;
}

export const PALETTES: Record<string, string[]> = {
  Nature: ["#E64B35", "#4DBBD5", "#00A087", "#3C5488", "#F39B7F", "#8491B4", "#91D1C2", "#DC0000", "#7E6148", "#B09C85"],
  Lancet: ["#00468B", "#ED0000", "#42B540", "#0099B4", "#925E9F", "#FDAF91", "#AD002A", "#ADB6B6", "#1B1919"],
  NEJM: ["#BC3C29", "#0072B5", "#E18727", "#20854E", "#7876B1", "#6F99AD", "#FFDC91", "#EE4C97"],
  JAMA: ["#374E55", "#DF8F44", "#00A1D5", "#B24745", "#79AF97", "#6A6599", "#80796B"],
  Tab10: ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"],
  "NMI 柔和": ["#8DD3C7", "#FFFFB3", "#BEBADA", "#FB8072", "#80B1D3", "#FDB462", "#B3DE69", "#FCCDE5", "#D9D9D9", "#BC80BD"],
  色盲安全: ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#000000", "#999999", "#661100"],
  单色蓝: ["#08306B", "#08519C", "#2171B5", "#4292C6", "#6BAED6", "#9ECAE1", "#C6DBEF", "#DEEBF7", "#3182BD", "#1F4E79"],
};

export const SIG_LEGEND = "*P < 0.05, **P < 0.01, ***P < 0.001, ****P < 0.0001. ns: P ≥ 0.05";

export function textWidth(s: string, fs: number): number {
  let w = 0;
  for (const ch of s) w += /[⺀-　-〿＀-￯]/.test(ch) ? fs : fs * 0.6;
  return w;
}

export function sigLegendSvg(t: Theme, x: number, y: number, fs?: number, centered = false): string {
  const fit = (centered ? x * 2 - 28 : 1000 - x - 14) / textWidth(SIG_LEGEND, 1);
  const size = Math.min(fs ?? t.tickFont * 0.92, fit);
  return `<text data-role="significance-legend" x="${x}" y="${y}" text-anchor="${centered ? "middle" : "start"}" fill="${t.text}" fill-opacity="0.75" font-size="${size.toFixed(1)}">${esc(SIG_LEGEND)}</text>`;
}

export const CMAPS: Record<string, string[]> = {
  "green black red": ["#008000", "#000000", "#ff0000"],
  "navy white firebrick3": ["#000080", "#ffffff", "#cd2626"],
  "olive white pink": ["#808000", "#ffffff", "#ffc0cb"],
  "蓝-红（相关）": ["#2166AC", "#F7F7F7", "#B2182B"],
  Viridis: ["#440154", "#31688E", "#35B779", "#FDE725"],
  "红-黄（表达）": ["#FFF5EB", "#FDBE85", "#D94701"],
  灰度: ["#FFFFFF", "#969696", "#000000"],
};

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

export function mix(a: string, b: string, t: number): string {
  const ca = hexRgb(a), cb = hexRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function cmapColor(stops: string[], t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function niceTicks(lo: number, hi: number, count = 5): { ticks: number[]; lo: number; hi: number } {
  if (!isFinite(lo) || !isFinite(hi)) return { ticks: [0, 1], lo: 0, hi: 1 };
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  const step0 = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  return { ticks, lo, hi };
}

export function tickLabel(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(1);
  return String(Number(v.toPrecision(4)));
}

export interface FrameOpts {
  w: number; h: number;
  ml: number; mr: number; mt: number; mb: number;
  xlo: number; xhi: number; ylo: number; yhi: number;
  xticks?: number[]; yticks?: number[];
  xcat?: { at: number; label: string }[];
  xlabel?: string; ylabel?: string; title?: string;
  theme: Theme;
  grid?: boolean;
  y2?: { lo: number; hi: number; ticks: number[]; label: string };
}

export interface Frame {
  svg: string;
  X: (v: number) => number;
  Y: (v: number) => number;
  px: number; py: number; pw: number; ph: number;
}

export function frame(o: FrameOpts): Frame {
  const t = o.theme;
  const b=t.axisBounds;
  if(b) { o={...o,xlo:b.xMin??o.xlo,xhi:b.xMax??o.xhi,ylo:b.yMin??o.ylo,yhi:b.yMax??o.yhi}; if(o.xlo>=o.xhi||o.ylo>=o.yhi)throw new Error("坐标轴最大值必须大于最小值"); }
  const xt = o.xticks ?? niceTicks(o.xlo, o.xhi).ticks;
  const yt = o.yticks ?? niceTicks(o.ylo, o.yhi).ticks;
  let ml = o.ml, mr = o.mr, mb = o.mb;
  if (t.showAxisLabels && o.xlabel) {
    mb = Math.max(mb, 12 + t.tickFont + t.labelFont * 0.8 + 16);
  }
  if (t.showAxisLabels && o.ylabel) {
    const tickW = yt.reduce((a, v) => Math.max(a, textWidth(tickLabel(v), t.tickFont)), 0);
    ml = Math.max(ml, t.labelFont * 0.8 + 2 + 8 + tickW + 10);
  }
  if (o.y2 && t.showAxisLabels) {
    const tickW2 = o.y2.ticks.reduce((a, v) => Math.max(a, textWidth(tickLabel(v), t.tickFont)), 0);
    mr = Math.max(mr, t.labelFont * 0.8 + 2 + 8 + tickW2 + 10);
  }
  const px = ml, py = o.mt, pw = o.w - ml - mr, ph = o.h - o.mt - mb;
  const X = (v: number) => px + ((v - o.xlo) / (o.xhi - o.xlo || 1)) * pw;
  const Y = (v: number) => py + ph - ((v - o.ylo) / (o.yhi - o.ylo || 1)) * ph;
  let s = "";
  for (const v of yt) {
    const y = Y(v);
    if (o.grid ?? t.grid) s += `<line x1="${px}" y1="${y}" x2="${px + pw}" y2="${y}" stroke="${t.axis}" stroke-width="1.2" stroke-opacity="0.16"/>`;
    s += `<line x1="${px - 6}" y1="${y}" x2="${px}" y2="${y}" stroke="${t.axis}" stroke-width="2"/>`;
    s += `<text x="${px - 10}" y="${y}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${tickLabel(v)}</text>`;
  }
  if (o.xcat) {
    for (const c of o.xcat) {
      const x = X(c.at);
      s += `<line x1="${x}" y1="${py + ph}" x2="${x}" y2="${py + ph + 6}" stroke="${t.axis}" stroke-width="2"/>`;
      s += `<text x="${x}" y="${py + ph + 12}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle" dominant-baseline="hanging">${esc(c.label)}</text>`;
    }
  } else {
    for (const v of xt) {
      const x = X(v);
      s += `<line x1="${x}" y1="${py + ph}" x2="${x}" y2="${py + ph + 6}" stroke="${t.axis}" stroke-width="2"/>`;
      s += `<text x="${x}" y="${py + ph + 12}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle" dominant-baseline="hanging">${tickLabel(v)}</text>`;
    }
  }
  s += `<line x1="${px}" y1="${py}" x2="${px}" y2="${py + ph}" stroke="${t.axis}" stroke-width="2.5"/>`;
  s += `<line x1="${px}" y1="${py + ph}" x2="${px + pw}" y2="${py + ph}" stroke="${t.axis}" stroke-width="2.5"/>`;
  if (t.showAxisLabels && o.xlabel) {
    const xfs = Math.min(t.labelFont, (pw * 0.96) / textWidth(o.xlabel, 1));
    s += `<text x="${px + pw / 2}" y="${o.h - 14}" fill="${t.text}" font-size="${xfs.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.xlabel)}</text>`;
  }
  if (t.showAxisLabels && o.ylabel) {
    const lx = Math.max(18, t.labelFont * 0.8 + 2);
    s += `<text x="${lx}" y="${py + ph / 2}" fill="${t.text}" font-size="${t.labelFont.toFixed(1)}" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${lx} ${py + ph / 2})">${esc(o.ylabel)}</text>`;
  }
  if (o.title) {
    const tfs = Math.min(t.titleFont, (o.w - 40) / textWidth(o.title, 1));
    s += `<text x="${px + pw / 2}" y="${py - 16}" fill="${t.text}" font-size="${tfs.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  }
  if (o.y2) {
    const X2r = px + pw;
    const Y2 = (v: number) => py + ph - ((v - o.y2!.lo) / (o.y2!.hi - o.y2!.lo || 1)) * ph;
    for (const v of o.y2.ticks) {
      const y = Y2(v);
      s += `<line x1="${X2r}" y1="${y}" x2="${X2r + 6}" y2="${y}" stroke="${t.axis}" stroke-width="2"/>`;
      s += `<text x="${X2r + 10}" y="${y}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" dominant-baseline="middle">${tickLabel(v)}</text>`;
    }
    s += `<line x1="${X2r}" y1="${py}" x2="${X2r}" y2="${py + ph}" stroke="${t.axis}" stroke-width="2.5"/>`;
    if (t.showAxisLabels) {
      const rx = Math.min(o.w - 12, o.w - t.labelFont * 0.8 - 2);
      s += `<text x="${rx}" y="${py + ph / 2}" fill="${t.text}" font-size="${t.labelFont.toFixed(1)}" font-weight="bold" text-anchor="middle" transform="rotate(90 ${rx} ${py + ph / 2})">${esc(o.y2.label)}</text>`;
    }
  }
  return { svg: s, X, Y, px, py, pw, ph };
}

export function legend(items: { name: string; color: string; shape?: "rect" | "line" | "dot" }[], x: number, y: number, t: Theme, title?: string): string {
  const fs = t.legendFont;
  let s = "";
  let cx = x;
  if (title) {
    s += `<text x="${cx}" y="${y}" fill="${t.text}" font-size="${(fs * 1.05).toFixed(1)}" font-weight="bold" dominant-baseline="middle">${esc(title)}</text>`;
    cx += title.length * fs * 0.62 + 18;
  }
  for (const it of items) {
    if (it.shape === "line") s += `<line x1="${cx}" y1="${y}" x2="${cx + 26}" y2="${y}" stroke="${it.color}" stroke-width="4"/>`;
    else if (it.shape === "dot") s += `<circle cx="${cx + 10}" cy="${y}" r="7" fill="${it.color}"/>`;
    else s += `<rect x="${cx}" y="${y - 9}" width="18" height="18" fill="${it.color}" fill-opacity="0.85"/>`;
    s += `<text x="${cx + 32}" y="${y}" fill="${t.text}" font-size="${fs.toFixed(1)}" dominant-baseline="middle">${esc(it.name)}</text>`;
    cx += 32 + it.name.length * fs * 0.62 + 26;
  }
  return s;
}

export function bracket(x1: number, x2: number, y: number, label: string, t: Theme, drop = 8): string {
  const fs = t.tickFont;
  return `<path d="M ${x1} ${y + drop} L ${x1} ${y} L ${x2} ${y} L ${x2} ${y + drop}" fill="none" stroke="${t.text}" stroke-width="2"/>` +
    `<text x="${(x1 + x2) / 2}" y="${y - 6}" fill="${t.text}" font-size="${fs.toFixed(1)}" text-anchor="middle">${esc(label)}</text>`;
}

export function svgDocument(inner: string, w: number, h: number, widthCm: number, t: Theme): string {
  const heightCm = (widthCm * h) / w;
  const bg = t.bg === "transparent" ? "" : `<rect x="0" y="0" width="${w}" height="${h}" fill="${t.bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthCm}cm" height="${heightCm.toFixed(3)}cm" viewBox="0 0 ${w} ${h}" font-family="${esc(t.fontFamily)}">${bg}<g>${inner}</g></svg>`;
}

export function scaleChartGeometry(inner: string, lineScale: number, pointScale: number): string {
  let out = inner.replace(/stroke-width="([0-9.]+)"/g, (_m, v) => `stroke-width="${(Number(v) * lineScale).toFixed(2)}"`);
  if (pointScale !== 1) out = out.replace(/<circle\b[^>]*\br="([0-9.]+)"/g, (tag, v) => tag.replace(`r="${v}"`, `r="${(Number(v) * pointScale).toFixed(2)}"`));
  return out;
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadSvg(name: string, svg: string): void {
  downloadBlob(name, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(png.length + 21);
  out.set(png.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(png.subarray(33), 54);
  return out;
}

export async function svgToPngBlob(svg: string, widthCm: number, heightCm: number, dpi = 600): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("SVG 渲染失败"));
      img.src = url;
    });
    const w = Math.round((widthCm / 2.54) * dpi);
    const h = Math.round((heightCm / 2.54) * dpi);
    if(w<1||h<1||w*h>64000000||w>20000||h>20000)throw new Error("导出像素尺寸过大，请缩小出版尺寸或减少面板（可改用 SVG）");
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    const raw = new Uint8Array(await (await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"))).arrayBuffer());
    return new Blob([withDpi(raw, dpi) as unknown as BlobPart], { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
