import { Theme, esc, frame, legend, textWidth, tickLabel } from "@/lib/chartcore";
import { SetsModel, PackModel, LabelSeriesModel, WordsModel, PlotOpts, Rendered } from "@/lib/chartmodel";

const W = 1000, H = 700;

function titleSvg(t: Theme, title: string, x = W / 2, y = 44): string {
  if (!title) return "";
  return `<text x="${x}" y="${y}" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(title)}</text>`;
}

function legendRight(items: { name: string; color: string; shape?: "rect" | "line" | "dot" }[], y: number, t: Theme): string {
  const fs = t.legendFont;
  const w = items.reduce((a, it) => a + 32 + it.name.length * fs * 0.62 + 26, 0);
  return legend(items, Math.max(20, W - 30 - w), y, t);
}

export function venn(m: SetsModel, t: Theme, o: PlotOpts): Rendered {
  const k = Math.min(3, m.names.length);
  const names = m.names.slice(0, k);
  const counts = new Map<string, number>();
  for (const r of m.regions) {
    const comb = [...r.comb].sort((a, b) => a - b);
    if (comb.some((i) => i >= k)) continue;
    const key = comb.join(",");
    counts.set(key, (counts.get(key) ?? 0) + r.n);
  }
  let s = titleSvg(t, o.title);
  const centers: { x: number; y: number }[] = [];
  const R = k === 3 ? 190 : 210;
  if (k === 1) centers.push({ x: 500, y: 370 });
  else if (k === 2) centers.push({ x: 390, y: 370 }, { x: 610, y: 370 });
  else centers.push({ x: 410, y: 300 }, { x: 590, y: 300 }, { x: 500, y: 455 });
  centers.forEach((c, i) => {
    const col = t.colors[i % t.colors.length];
    s += `<circle cx="${c.x}" cy="${c.y}" r="${R}" fill="${col}" fill-opacity="0.3" stroke="${col}" stroke-width="3"/>`;
  });
  // 各区域几何中心（经典布局）
  const pos: Record<string, [number, number]> = {};
  if (k === 1) pos["0"] = [500, 370];
  else if (k === 2) { pos["0"] = [300, 370]; pos["1"] = [700, 370]; pos["0,1"] = [500, 370]; }
  else {
    pos["0"] = [330, 240]; pos["1"] = [670, 240]; pos["2"] = [500, 555];
    pos["0,1"] = [500, 252]; pos["0,2"] = [413, 430]; pos["1,2"] = [587, 430];
    pos["0,1,2"] = [500, 352];
  }
  for (const key of Object.keys(pos)) {
    const [x, y] = pos[key];
    s += `<text x="${x}" y="${y}" fill="${t.text}" font-size="${t.labelFont.toFixed(1)}" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(String(counts.get(key) ?? 0))}</text>`;
  }
  // 集合名放在圆外侧
  names.forEach((nm, i) => {
    let x: number, y: number;
    if (k === 1) { x = 500; y = 370 - R - 20; }
    else if (k === 2) { x = centers[i].x + (i === 0 ? -60 : 60); y = centers[i].y - R - 18; }
    else if (i < 2) { x = centers[i].x + (i === 0 ? -95 : 95); y = centers[i].y - R - 14; }
    else { x = centers[2].x; y = centers[2].y + R + 32; }
    s += `<text x="${x}" y="${y}" fill="${t.colors[i % t.colors.length]}" font-size="${t.labelFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(nm)}</text>`;
  });
  if (m.names.length > 3) {
    s += `<text x="${W - 20}" y="${H - 16}" fill="${t.text}" fill-opacity="0.7" font-size="${(t.tickFont * 0.9).toFixed(1)}" text-anchor="end">${esc("仅显示前 3 集合，完整交集见 UpSet")}</text>`;
  }
  return { inner: s, w: W, h: H };
}

export function upset(m: SetsModel, t: Theme, o: PlotOpts): Rendered {
  const nrows = m.names.length;
  const cols = [...m.regions].sort((a, b) => b.n - a.n).slice(0, 12);
  const ncol = cols.length;
  const sizes = m.names.map((_, r) => m.regions.reduce((a, reg) => a + (reg.comb.includes(r) ? reg.n : 0), 0));
  const maxSize = Math.max(1, ...sizes);
  const maxN = Math.max(1, ...cols.map((c) => c.n));
  const nameW = Math.max(0, ...m.names.map((nm) => textWidth(nm, t.tickFont)));
  const sizeBarW = 150;
  const LW = Math.min(430, Math.max(220, nameW + sizeBarW + 46));
  const f = frame({ w: W, h: 310, ml: LW, mr: 40, mt: 76, mb: 16, xlo: 0, xhi: Math.max(1, ncol), ylo: 0, yhi: maxN * 1.18, xticks: [], xcat: cols.map((_, i) => ({ at: i + 0.5, label: "" })), ylabel: "交集大小", title: o.title, theme: t });
  let s = f.svg;
  const colW = f.pw / Math.max(1, ncol);
  const matrixTop = 352;
  const rowH = Math.min(32, (H - 30 - matrixTop) / Math.max(1, nrows));
  // 行条纹背景
  for (let r = 0; r < nrows; r++) {
    if (r % 2 === 0) s += `<rect x="16" y="${matrixTop + r * rowH}" width="${W - 32}" height="${rowH}" fill="${t.axis}" fill-opacity="0.06"/>`;
  }
  // 上部：交集大小柱
  cols.forEach((c, i) => {
    const cx = f.X(i + 0.5);
    const bw = colW * 0.6;
    const y1 = f.Y(c.n);
    s += `<rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(0, f.Y(0) - y1)}" fill="${t.colors[0]}" fill-opacity="0.85"/>`;
    s += `<text x="${cx}" y="${y1 - 6}" fill="${t.text}" font-size="${(t.tickFont * 0.9).toFixed(1)}" text-anchor="middle">${esc(tickLabel(c.n))}</text>`;
  });
  // 中部：点阵矩阵（同交集实心点竖线连接）
  cols.forEach((c, i) => {
    const cx = f.X(i + 0.5);
    const active = c.comb.filter((r) => r >= 0 && r < nrows);
    if (active.length > 1) {
      const y1 = matrixTop + (Math.min(...active) + 0.5) * rowH;
      const y2 = matrixTop + (Math.max(...active) + 0.5) * rowH;
      s += `<line x1="${cx}" y1="${y1}" x2="${cx}" y2="${y2}" stroke="${t.colors[0]}" stroke-width="3"/>`;
    }
    for (let r = 0; r < nrows; r++) {
      const cy = matrixTop + (r + 0.5) * rowH;
      const rr = Math.min(9, rowH * 0.3);
      if (c.comb.includes(r)) s += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${t.colors[0]}"/>`;
      else s += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${t.axis}" stroke-width="1.5" stroke-opacity="0.45"/>`;
    }
  });
  // 左侧：集合名 + 集合总大小水平条
  const x0 = LW - 16;
  s += `<text x="${x0}" y="${matrixTop - 12}" fill="${t.text}" fill-opacity="0.7" font-size="${(t.tickFont * 0.9).toFixed(1)}" text-anchor="end">${esc("集合大小")}</text>`;
  m.names.forEach((nm, r) => {
    const cy = matrixTop + (r + 0.5) * rowH;
    const bw = (sizes[r] / maxSize) * sizeBarW;
    s += `<rect x="${x0 - bw}" y="${cy - rowH * 0.3}" width="${Math.max(0, bw)}" height="${rowH * 0.6}" fill="${t.colors[r % t.colors.length]}" fill-opacity="0.7"/>`;
    s += `<text x="${x0 - sizeBarW - 12}" y="${cy}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(nm)}</text>`;
  });
  return { inner: s, w: W, h: H };
}

// ---------- Circle Packing：front-chain 打包 + 最小外接圆 ----------
interface PackCircle { x: number; y: number; r: number }
interface ChainNode { c: PackCircle; next: ChainNode; prev: ChainNode }

function tangentPlace(a: PackCircle, b: PackCircle, c: PackCircle): void {
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
  if (d2 > 0) {
    const ar = a.r + c.r, br = b.r + c.r;
    const a2 = ar * ar, b2 = br * br;
    let x: number, y: number;
    if (a2 > b2) {
      x = (d2 + b2 - a2) / (2 * d2);
      y = Math.sqrt(Math.max(0, b2 / d2 - x * x));
      c.x = b.x - x * dx - y * dy;
      c.y = b.y - x * dy + y * dx;
    } else {
      x = (d2 + a2 - b2) / (2 * d2);
      y = Math.sqrt(Math.max(0, a2 / d2 - x * x));
      c.x = a.x + x * dx - y * dy;
      c.y = a.y + x * dy + y * dx;
    }
  } else { c.x = a.x + c.r; c.y = a.y; }
}

function hits(a: PackCircle, b: PackCircle): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, dr = a.r + b.r;
  return dr * dr - dx * dx - dy * dy > 1e-6;
}

function chainScore(node: ChainNode): number {
  const a = node.c, b = node.next.c, ab = a.r + b.r || 1;
  const dx = (a.x * b.r + b.x * a.r) / ab, dy = (a.y * b.r + b.y * a.r) / ab;
  return dx * dx + dy * dy;
}

function frontChainPack(radii: number[]): PackCircle[] {
  const cs: PackCircle[] = radii.map((r) => ({ x: 0, y: 0, r }));
  const n = cs.length;
  if (n < 2) return cs;
  cs[0].x = -cs[1].r; cs[1].x = cs[0].r;
  if (n === 2) return cs;
  tangentPlace(cs[0], cs[1], cs[2]);
  const mk = (c: PackCircle): ChainNode => ({ c, next: null as unknown as ChainNode, prev: null as unknown as ChainNode });
  const A = mk(cs[0]), B = mk(cs[1]), C = mk(cs[2]);
  A.next = B; B.prev = A; B.next = C; C.prev = B; C.next = A; A.prev = C;
  let a = A, b = B;
  outer: for (let i = 3; i < n; i++) {
    const c = cs[i];
    tangentPlace(b.c, a.c, c);
    let j = b.next, k = a.prev;
    let sj = b.c.r, sk = a.c.r;
    do {
      if (sj <= sk) {
        if (hits(j.c, c)) { b = j; a.next = b; b.prev = a; i--; continue outer; }
        sj += j.c.r; j = j.next;
      } else {
        if (hits(k.c, c)) { a = k; a.next = b; b.prev = a; i--; continue outer; }
        sk += k.c.r; k = k.prev;
      }
    } while (j !== k.next);
    const node: ChainNode = { c, next: b, prev: a };
    a.next = node; b.prev = node;
    let best = node, bestScore = chainScore(node);
    let cur = node.next;
    while (cur !== b) {
      const sc = chainScore(cur);
      if (sc < bestScore) { best = cur; bestScore = sc; }
      cur = cur.next;
    }
    a = best; b = a.next;
  }
  return cs;
}

function covers(e: PackCircle, c: PackCircle): boolean {
  const dr = e.r - c.r, dx = c.x - e.x, dy = c.y - e.y;
  return dr >= -1e-9 && dr * dr >= dx * dx + dy * dy - 1e-6;
}

function enclose2(a: PackCircle, b: PackCircle): PackCircle {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const r = (d + a.r + b.r) / 2;
  const u = d > 0 ? (r - a.r) / d : 0;
  return { x: a.x + dx * u, y: a.y + dy * u, r };
}

function enclose3(a: PackCircle, b: PackCircle, c: PackCircle): PackCircle {
  const x1 = a.x, y1 = a.y, r1 = a.r;
  const a2 = x1 - b.x, a3 = x1 - c.x;
  const b2 = y1 - b.y, b3 = y1 - c.y;
  const c2 = b.r - r1, c3 = c.r - r1;
  const d1 = x1 * x1 + y1 * y1 - r1 * r1;
  const d2 = d1 - b.x * b.x - b.y * b.y + b.r * b.r;
  const d3 = d1 - c.x * c.x - c.y * c.y + c.r * c.r;
  const ab = a3 * b2 - a2 * b3;
  if (Math.abs(ab) < 1e-12) return enclose2(a, b);
  const xa = (b2 * d3 - b3 * d2) / (ab * 2) - x1;
  const xb = (b3 * c2 - b2 * c3) / ab;
  const ya = (a3 * d2 - a2 * d3) / (ab * 2) - y1;
  const yb = (a2 * c3 - a3 * c2) / ab;
  const A = xb * xb + yb * yb - 1;
  const B = 2 * (r1 + xa * xb + ya * yb);
  const C = xa * xa + ya * ya - r1 * r1;
  const disc = Math.max(0, B * B - 4 * A * C);
  const r = Math.abs(A) > 1e-12 ? -(B + Math.sqrt(disc)) / (2 * A) : -C / (B || 1);
  return { x: x1 + xa + xb * r, y: y1 + ya + yb * r, r: Math.abs(r) };
}

function encloseAll(cs: PackCircle[]): PackCircle {
  let e: PackCircle = { ...cs[0] };
  for (let i = 1; i < cs.length; i++) {
    if (covers(e, cs[i])) continue;
    e = { ...cs[i] };
    for (let j = 0; j < i; j++) {
      if (covers(e, cs[j])) continue;
      e = enclose2(cs[i], cs[j]);
      for (let k = 0; k < j; k++) {
        if (!covers(e, cs[k])) e = enclose3(cs[i], cs[j], cs[k]);
      }
    }
  }
  return e;
}

export function circlePack(m: PackModel, t: Theme, o: PlotOpts): Rendered {
  const items = [...m.items].filter((it) => isFinite(it.value) && it.value > 0).sort((a, b) => b.value - a.value);
  let s = titleSvg(t, o.title);
  const cx = 500, cy = 390, R = 275;
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${t.axis}" stroke-width="2.5"/>`;
  if (items.length > 0) {
    const cs = frontChainPack(items.map((it) => Math.sqrt(it.value)));
    const e = encloseAll(cs);
    const scale = R / Math.max(1e-9, e.r);
    cs.forEach((c, i) => {
      const x = cx + (c.x - e.x) * scale, y = cy + (c.y - e.y) * scale, r = c.r * scale;
      const col = t.colors[items[i].g % t.colors.length];
      s += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${col}" fill-opacity="0.7" stroke="${col}" stroke-width="2"/>`;
      if (textWidth(items[i].label, t.tickFont) < 2 * r * 0.8) {
        s += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${esc(items[i].label)}</text>`;
      }
    });
  }
  if (o.showLegend) {
    const gs = [...new Set(m.items.map((it) => it.g))].sort((a, b) => a - b);
    s += legendRight(gs.map((g) => ({ name: m.groups[g] ?? `G${g + 1}`, color: t.colors[g % t.colors.length] })), 40, t);
  }
  return { inner: s, w: W, h: H };
}

export function radar(m: LabelSeriesModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.labels.length, ns = m.series.length;
  const vmax = Math.max(1e-9, ...m.values.flat());
  const cx = 500, cy = 385, R = 255;
  let s = titleSvg(t, o.title);
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
  const pt = (i: number, r: number): [number, number] => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  // 4 层同心多边形网格（刻度标在首扇区角平分线上，避免与外置标签碰撞）
  const bis = -Math.PI / 2 + Math.PI / Math.max(1, n);
  for (let k = 1; k <= 4; k++) {
    const r = (R * k) / 4;
    const d = m.labels.map((_, i) => `${i === 0 ? "M" : "L"} ${pt(i, r)[0].toFixed(2)} ${pt(i, r)[1].toFixed(2)}`).join(" ") + " Z";
    s += `<path d="${d}" fill="none" stroke="${t.axis}" stroke-width="${k === 4 ? 2 : 1.2}" stroke-opacity="${k === 4 ? 0.7 : 0.3}"/>`;
    const tx = cx + r * Math.cos(bis), ty = cy + r * Math.sin(bis);
    s += `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" fill="${t.text}" fill-opacity="0.7" font-size="${(t.tickFont * 0.85).toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${esc(tickLabel((vmax * k) / 4))}</text>`;
  }
  // spokes + 外置标签
  m.labels.forEach((lb, i) => {
    const [x, y] = pt(i, R);
    s += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${t.axis}" stroke-width="1.2" stroke-opacity="0.4"/>`;
    const [lx, ly] = pt(i, R + 28);
    const c = Math.cos(ang(i));
    const anchor = c > 0.25 ? "start" : c < -0.25 ? "end" : "middle";
    s += `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle">${esc(lb)}</text>`;
  });
  // 系列多边形
  for (let j = 0; j < ns; j++) {
    const col = t.colors[j % t.colors.length];
    const verts = m.labels.map((_, i) => pt(i, (Math.max(0, m.values[i]?.[j] ?? 0) / vmax) * R));
    const d = verts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";
    s += `<path d="${d}" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-width="2.5"/>`;
    for (const [x, y] of verts) s += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.5" fill="${col}"/>`;
  }
  if (ns > 1 && o.showLegend) s += legendRight(m.series.map((nm, j) => ({ name: nm, color: t.colors[j % t.colors.length] })), 40, t);
  return { inner: s, w: W, h: H };
}

export function wordCloud(m: WordsModel, t: Theme, o: PlotOpts): Rendered {
  const items = [...m.items].sort((a, b) => b.w - a.w).slice(0, 60);
  let s = titleSvg(t, o.title);
  if (items.length === 0) return { inner: s, w: W, h: H };
  const wmin = items[items.length - 1].w, wmax = items[0].w;
  const fsLo = t.tickFont * 0.8, fsHi = t.titleFont * 2.2;
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const cx = 500, cy = 375;
  items.forEach((it, i) => {
    const fs = fsLo + ((it.w - wmin) / (wmax - wmin || 1)) * (fsHi - fsLo);
    const bw = textWidth(it.word, fs) + 8, bh = fs * 1.2;
    let theta = i * 0.9;
    for (let step = 0; step < 4000; step++) {
      const r = 2.2 * theta;
      const x = cx + r * Math.cos(theta) * 1.45;
      const y = cy + r * Math.sin(theta);
      theta += 0.22;
      const x0 = x - bw / 2, y0 = y - bh / 2, x1 = x + bw / 2, y1 = y + bh / 2;
      if (x0 < 16 || x1 > W - 16 || y0 < 70 || y1 > H - 16) { if (r > 700) break; continue; }
      if (placed.some((p) => x0 < p.x1 && x1 > p.x0 && y0 < p.y1 && y1 > p.y0)) continue;
      placed.push({ x0, y0, x1, y1 });
      s += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" fill="${t.colors[i % t.colors.length]}" font-size="${fs.toFixed(1)}" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${esc(it.word)}</text>`;
      break;
    }
  });
  return { inner: s, w: W, h: H };
}