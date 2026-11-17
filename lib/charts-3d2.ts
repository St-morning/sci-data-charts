import { Theme, esc, cmapColor, CMAPS, mix, tickLabel, legend, textWidth } from "@/lib/chartcore";
import { XYZModel, MatrixModel, PlotOpts, Rendered } from "@/lib/chartmodel";
import { fmt } from "@/lib/stats";

const W = 1000, H = 700;

// Isometric projection math (copied from charts-3d.ts conventions; internals there are not exported).
interface Proj {
  P: (x: number, y: number, z: number) => [number, number, number];
}

function projector(az: number, el: number, cx: number, cy: number, s: number): Proj {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
  return {
    P: (x, y, z) => {
      const x1 = x * ca + y * sa;
      const y1 = -x * sa + y * ca;
      const sx = cx + x1 * s;
      const sy = cy - (z * ce - y1 * se) * s;
      const depth = y1 * ce + z * se;
      return [sx, sy, depth];
    },
  };
}

function norm3(pts: { x: number; y: number; z: number }[]): (p: { x: number; y: number; z: number }) => [number, number, number] {
  const rng = (k: "x" | "y" | "z") => {
    const vs = pts.map((p) => p[k]);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    return (v: number) => (hi === lo ? 0 : ((v - lo) / (hi - lo)) * 2 - 1);
  };
  const fx = rng("x"), fy = rng("y"), fz = rng("z");
  return (p) => [fx(p.x), fy(p.y), fz(p.z)];
}

function boxEdges(pr: Proj, t: Theme): string {
  const c: [number, number, number][] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) c.push(pr.P(x, y, z));
  const edges: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  let s = "";
  for (const [i, j] of edges) s += `<line x1="${c[i][0].toFixed(1)}" y1="${c[i][1].toFixed(1)}" x2="${c[j][0].toFixed(1)}" y2="${c[j][1].toFixed(1)}" stroke="${t.axis}" stroke-width="1.4" stroke-opacity="0.5"/>`;
  return s;
}

const line2 = (a: [number, number, number], b: [number, number, number], stroke: string, wdt: number, op: number, dash?: string) =>
  `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${stroke}" stroke-width="${wdt}" stroke-opacity="${op}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;

// ---------- 6. 3D trajectory / path plot ----------

export function traj3d(m: XYZModel, t: Theme, o: PlotOpts): Rendered {
  let s = "";
  if (o.title) s += `<text x="500" y="46" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  if (!m.pts.length) return { inner: s, w: W, h: H };
  const nf = norm3(m.pts);
  const pr = projector(o.az, o.el, 500, 370, 235);

  // ground grid + box frame
  for (let k = 0; k <= 4; k++) {
    const v = -1 + k * 0.5;
    s += line2(pr.P(v, -1, -1), pr.P(v, 1, -1), t.axis, 1, 0.15);
    s += line2(pr.P(-1, v, -1), pr.P(1, v, -1), t.axis, 1, 0.15);
  }
  s += boxEdges(pr, t);

  // axis names（投影可能越界，按文字宽度收进画布）
  const lx = pr.P(1.6, -1, -1), ly = pr.P(-1, 1.6, -1), lz = pr.P(-1, -1, 1.45);
  const clampName = (p: [number, number, number], name: string) => {
    const fs = t.labelFont;
    const tw = textWidth(name, fs);
    const x = Math.max(tw / 2 + 4, Math.min(W - tw / 2 - 4, p[0]));
    const y = Math.max(fs * 0.8 + 2, Math.min(H - fs * 0.2 - 2, p[1]));
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${t.text}" font-size="${fs.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(name)}</text>`;
  };
  s += clampName(lx, m.names[0]) + clampName(ly, m.names[1]) + clampName(lz, m.names[2]);

  // min/max ticks per axis
  const rng = (k: "x" | "y" | "z"): [number, number] => {
    const vs = m.pts.map((p) => p[k]);
    return [Math.min(...vs), Math.max(...vs)];
  };
  const [xlo, xhi] = rng("x"), [ylo, yhi] = rng("y"), [zlo, zhi] = rng("z");
  const tick = (p: [number, number, number], label: string, dx: number, dy: number, anchor: string) => {
    const fs = t.tickFont;
    const tw = textWidth(label, fs);
    let x = p[0] + dx;
    if (anchor === "start") x = Math.min(x, W - tw - 4);
    else if (anchor === "end") x = Math.max(x, tw + 4);
    else x = Math.max(tw / 2 + 4, Math.min(W - tw / 2 - 4, x));
    const y = Math.max(fs + 2, Math.min(H - fs * 0.3 - 2, p[1] + dy));
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${t.text}" font-size="${fs.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" fill-opacity="0.8">${esc(label)}</text>`;
  };
  s += tick(pr.P(-0.7, -1, -1), fmt(xlo), 0, 18, "middle");
  s += tick(pr.P(1, -1, -1), fmt(xhi), 0, 20, "middle");
  s += tick(pr.P(1, -0.6, -1), fmt(ylo), 16, 0, "start");
  s += tick(pr.P(1, 1, -1), fmt(yhi), 16, -10, "start");
  s += tick(pr.P(-1, -1, -1), fmt(zlo), -10, 0, "end");
  s += tick(pr.P(-1, -1, 1), fmt(zhi), -10, 0, "end");

  // trajectories per group, in original point order; far groups drawn first
  const groups = m.groups.map((name, g) => {
    const pts = m.pts.filter((p) => p.g === g).map((p) => {
      const [x, y, z] = nf(p);
      return { top: pr.P(x, y, z), base: pr.P(x, y, -1) };
    });
    const d = pts.length ? pts.reduce((a, p) => a + p.top[2], 0) / pts.length : 0;
    return { name, g, pts, d };
  }).filter((gr) => gr.pts.length > 0).sort((a, b) => a.d - b.d);

  for (const gr of groups) {
    const col = t.colors[gr.g % t.colors.length];
    if (o.stems) {
      for (const p of gr.pts) s += line2(p.base, p.top, col, 1.2, 0.4, "4 4");
      const gd = gr.pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.base[0].toFixed(1)} ${p.base[1].toFixed(1)}`).join(" ");
      s += `<path d="${gd}" fill="none" stroke="${col}" stroke-width="2" stroke-opacity="0.25"/>`;
    }
    const d = gr.pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.top[0].toFixed(1)} ${p.top[1].toFixed(1)}`).join(" ");
    s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const p of gr.pts) s += `<circle cx="${p.top[0].toFixed(1)}" cy="${p.top[1].toFixed(1)}" r="4.5" fill="${col}" stroke="${mix(col, "#000000", 0.25)}" stroke-width="1"/>`;
  }
  if (m.groups.length > 1 && o.showLegend) {
    s += legend(m.groups.map((name, i) => ({ name, color: t.colors[i % t.colors.length], shape: "dot" as const })), 70, 660, t);
  }
  return { inner: s, w: W, h: H };
}

// ---------- 7. 3D heatmap bar grid ----------

export function heat3d(m: MatrixModel, t: Theme, o: PlotOpts): Rendered {
  const nr = m.rows.length, nc = m.cols.length;
  let s = "";
  if (o.title) s += `<text x="500" y="46" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  if (nr === 0 || nc === 0) return { inner: s, w: W, h: H };
  const flat = m.v.flat().filter((v) => isFinite(v));
  const lo = flat.length ? Math.min(...flat) : 0;
  const hi = flat.length ? Math.max(...flat) : 1;
  const stops = CMAPS[o.cmap] ?? CMAPS.Viridis;
  const pr = projector(o.az, Math.max(12, o.el), 470, 400, 230);
  const zName = o.yLabel || "Value";

  // floor + cell grid
  const floor: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  s += `<path d="M ${floor.map((p) => pr.P(p[0], p[1], -1).slice(0, 2).map((v) => v.toFixed(1)).join(" ")).join(" L ")} Z" fill="${t.axis}" fill-opacity="0.08" stroke="${t.axis}" stroke-width="1.4"/>`;
  for (let i = 1; i < nr; i++) {
    const y = -1 + (2 * i) / nr;
    s += line2(pr.P(-1, y, -1), pr.P(1, y, -1), t.axis, 1, 0.12);
  }
  for (let j = 1; j < nc; j++) {
    const x = -1 + (2 * j) / nc;
    s += line2(pr.P(x, -1, -1), pr.P(x, 1, -1), t.axis, 1, 0.12);
  }

  // bars, painter's algorithm (far first)
  const wx = 0.8 / nc, wy = 0.8 / nr;
  const bars: { i: number; j: number; x: number; y: number; h01: number; d: number }[] = [];
  for (let i = 0; i < nr; i++) {
    for (let j = 0; j < nc; j++) {
      const v = m.v[i]?.[j];
      if (v === undefined || !isFinite(v)) continue;
      const x = -1 + (2 * (j + 0.5)) / nc, y = -1 + (2 * (i + 0.5)) / nr;
      bars.push({ i, j, x, y, h01: (v - lo) / (hi - lo || 1), d: pr.P(x, y, -1)[2] });
    }
  }
  bars.sort((a, b) => a.d - b.d);
  for (const b of bars) {
    const col = cmapColor(stops, b.h01);
    const zTop = -1 + Math.max(0.02, b.h01 * 1.8);
    const p = (dx: number, dy: number, z: number) => pr.P(b.x + dx, b.y + dy, z).slice(0, 2).map((v) => v.toFixed(1));
    const poly = (pts: string[][], fill: string) => `<path d="M ${pts.map((q) => q.join(" ")).join(" L ")} Z" fill="${fill}" stroke="${mix(col, "#000000", 0.3)}" stroke-width="0.8"/>`;
    const front = [p(-wx, -wy, -1), p(wx, -wy, -1), p(wx, -wy, zTop), p(-wx, -wy, zTop)];
    const side = [p(wx, -wy, -1), p(wx, wy, -1), p(wx, wy, zTop), p(wx, -wy, zTop)];
    const top = [p(-wx, -wy, zTop), p(wx, -wy, zTop), p(wx, wy, zTop), p(-wx, wy, zTop)];
    s += poly(side, mix(col, "#000000", 0.25));
    s += poly(front, col);
    s += poly(top, mix(col, "#ffffff", 0.35));
  }

  // ground row / column labels (rotated to follow the projected axes; 稀疏化避免重叠)
  const colAnchors = m.cols.map((_, j) => pr.P(-1 + (2 * (j + 0.5)) / nc, -1.2, -1));
  const colStep = colAnchors.length > 1 ? Math.abs(colAnchors[1][0] - colAnchors[0][0]) : 100;
  const colMaxW = Math.max(...m.cols.map((c) => textWidth(c, t.tickFont)), 0);
  const colStride = Math.max(1, Math.ceil((colMaxW * 0.906 + t.tickFont * 0.423 + 6) / Math.max(1, colStep)));
  for (let j = 0; j < nc; j++) {
    if (j % colStride !== 0) continue;
    const [sx, sy] = colAnchors[j];
    s += `<text x="${sx.toFixed(1)}" y="${(sy + 14).toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle" transform="rotate(-25 ${sx.toFixed(1)} ${(sy + 14).toFixed(1)})">${esc(m.cols[j])}</text>`;
  }
  const rowAnchors = m.rows.map((_, i) => pr.P(1.2, -1 + (2 * (i + 0.5)) / nr, -1));
  const rowStep = rowAnchors.length > 1 ? Math.abs(rowAnchors[1][1] - rowAnchors[0][1]) : 100;
  const rowMaxW = Math.max(...m.rows.map((r) => textWidth(r, t.tickFont)), 0);
  const rowStride = Math.max(1, Math.ceil((t.tickFont * 0.906 + rowMaxW * 0.423 + 6) / Math.max(1, rowStep)));
  for (let i = 0; i < nr; i++) {
    if (i % rowStride !== 0) continue;
    const [sx, sy] = rowAnchors[i];
    s += `<text x="${(sx + 8).toFixed(1)}" y="${(sy + 8).toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="start" transform="rotate(25 ${(sx + 8).toFixed(1)} ${(sy + 8).toFixed(1)})">${esc(m.rows[i])}</text>`;
  }

  // z axis ticks + meaning
  for (const frac of [0, 0.5, 1]) {
    const [sx, sy] = pr.P(-1.16, -1, -1 + 1.8 * frac);
    s += `<text x="${(sx - 8).toFixed(1)}" y="${sy.toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${tickLabel(lo + (hi - lo) * frac)}</text>`;
  }
  const [zx, zy] = pr.P(-1.16, -1, 1.18);
  s += `<text x="${(zx - 8).toFixed(1)}" y="${(zy - 6).toFixed(1)}" fill="${t.text}" font-size="${t.labelFont.toFixed(1)}" font-weight="bold" text-anchor="end">${esc(zName)}</text>`;

  // right colorbar (cmap gradient + min/max ticks)
  const cbx = 860, cbTop = 160, cbH = 360, seg = 45;
  for (let k = 0; k < seg; k++) {
    s += `<rect x="${cbx}" y="${(cbTop + ((seg - 1 - k) * cbH) / seg).toFixed(1)}" width="20" height="${(cbH / seg + 0.5).toFixed(1)}" fill="${cmapColor(stops, k / (seg - 1))}"/>`;
  }
  s += `<text x="${cbx}" y="${cbTop - 34}" fill="${t.text}" font-size="${t.legendFont.toFixed(1)}" font-weight="bold">${esc(zName)}</text>`;
  s += `<text x="${cbx + 26}" y="${cbTop + 12}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}">${tickLabel(hi)}</text>`;
  s += `<text x="${cbx + 26}" y="${cbTop + cbH / 2}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" dominant-baseline="middle">${tickLabel((lo + hi) / 2)}</text>`;
  s += `<text x="${cbx + 26}" y="${cbTop + cbH}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}">${tickLabel(lo)}</text>`;
  return { inner: s, w: W, h: H };
}