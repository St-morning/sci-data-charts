import { Theme, esc, cmapColor, CMAPS, mix, textWidth } from "@/lib/chartcore";
import { XYZModel, Bar3DModel, MatrixModel, PlotOpts, Rendered } from "@/lib/chartmodel";
import { tickLabel } from "@/lib/chartcore";

const W = 1000, H = 760;

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

function cube(pr: Proj, t: Theme, names: [string, string, string]): string {
  const c: [number, number, number][] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) c.push(pr.P(x, y, z));
  const edges: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  let s = "";
  for (const [i, j] of edges) s += `<line x1="${c[i][0]}" y1="${c[i][1]}" x2="${c[j][0]}" y2="${c[j][1]}" stroke="${t.axis}" stroke-width="1.4" stroke-opacity="0.5"/>`;
  const lx = pr.P(1.25, -1, -1), ly = pr.P(-1, 1.25, -1), lz = pr.P(-1, -1, 1.2);
  const fs = 22 * t.fontScale;
  const name = (p: [number, number, number], nm: string) => {
    const tw = textWidth(nm, fs);
    const x = Math.max(tw / 2 + 4, Math.min(1000 - tw / 2 - 4, p[0]));
    const y = Math.max(fs * 0.8 + 2, Math.min(700 - fs * 0.2 - 2, p[1]));
    return `<text x="${x}" y="${y}" fill="${t.text}" font-size="${fs.toFixed(1)}" text-anchor="middle">${esc(nm)}</text>`;
  };
  s += name(lx, names[0]) + name(ly, names[1]) + name(lz, names[2]);
  return s;
}

export function scatter3D(m: XYZModel, t: Theme, o: PlotOpts): Rendered {
  const nf = norm3(m.pts);
  const pr = projector(o.az, o.el, 500, 400, 250);
  let s = cube(pr, t, m.names);
  const items = m.pts.map((p) => {
    const [x, y, z] = nf(p);
    const [sx, sy, d] = pr.P(x, y, z);
    const [bx, by] = pr.P(x, y, -1);
    return { sx, sy, d, bx, by, g: p.g, z };
  }).sort((a, b) => a.d - b.d);
  for (const it of items) {
    if (o.stems) s += `<line x1="${it.bx}" y1="${it.by}" x2="${it.sx}" y2="${it.sy}" stroke="${t.axis}" stroke-width="1" stroke-opacity="0.35"/>`;
    const col = t.colors[it.g % t.colors.length];
    const r = 6 + 3 * ((it.z + 1) / 2);
    s += `<circle cx="${it.sx}" cy="${it.sy}" r="${r.toFixed(1)}" fill="${col}" fill-opacity="0.85" stroke="${mix(col, "#000000", 0.25)}" stroke-width="1"/>`;
  }
  if (o.title) s += `<text x="500" y="46" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  if (m.groups.length > 1 && o.showLegend) {
    let cx = 70;
    m.groups.forEach((g, i) => {
      s += `<circle cx="${cx}" cy="700" r="8" fill="${t.colors[i % t.colors.length]}"/>`;
      s += `<text x="${cx + 14}" y="700" fill="${t.text}" font-size="${(21 * t.fontScale).toFixed(1)}" dominant-baseline="middle">${esc(g)}</text>`;
      cx += 14 + g.length * 21 * t.fontScale * 0.62 + 34;
    });
  }
  return { inner: s, w: W, h: H };
}

export function bar3DLine(m: Bar3DModel, t: Theme, o: PlotOpts): Rendered {
  const pr = projector(o.az, Math.max(12, o.el), 480, 430, 230);
  const bmax = Math.max(...m.bar, 1e-9);
  const lmax = Math.max(...m.line, 1e-9);
  const n = m.labels.length;
  let s = "";
  const floor: [number, number, number][] = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]];
  s += `<path d="M ${floor.map((p) => pr.P(...p).slice(0, 2).join(" ")).join(" L ")} Z" fill="${t.axis}" fill-opacity="0.08" stroke="${t.axis}" stroke-width="1.4"/>`;
  const xs = m.labels.map((_, i) => -1 + (2 * (i + 0.5)) / n);
  const order = xs.map((x, i) => ({ x, i, d: pr.P(x, 0, 0)[2] })).sort((a, b) => a.d - b.d);
  for (const { x, i } of order) {
    const h = (m.bar[i] / bmax) * 1.8 - 1;
    const col = t.colors[0];
    const w = 0.7 / n;
    const p = (dx: number, dy: number, z: number) => pr.P(x + dx, dy, z).slice(0, 2);
    const z0 = -1;
    const front = [p(-w, -w, z0), p(w, -w, z0), p(w, -w, h), p(-w, -w, h)];
    const side = [p(w, -w, z0), p(w, w, z0), p(w, w, h), p(w, -w, h)];
    const top = [p(-w, -w, h), p(w, -w, h), p(w, w, h), p(-w, w, h)];
    const poly = (pts: number[][], fill: string) => `<path d="M ${pts.map((q) => q.join(" ")).join(" L ")} Z" fill="${fill}" stroke="${mix(col, "#000000", 0.3)}" stroke-width="1"/>`;
    s += poly(side, mix(col, "#000000", 0.25));
    s += poly(front, col);
    s += poly(top, mix(col, "#ffffff", 0.35));
    const lp = pr.P(x, -1.15, -1);
    s += `<text x="${lp[0]}" y="${lp[1] + 26}" fill="${t.text}" font-size="${(19 * t.fontScale).toFixed(1)}" text-anchor="middle">${esc(m.labels[i])}</text>`;
  }
  let d = "";
  xs.forEach((x, i) => {
    const z = (m.line[i] / lmax) * 1.8 - 1;
    const [sx, sy] = pr.P(x, -1.15, z);
    d += `${i === 0 ? "M" : "L"} ${sx} ${sy} `;
    s += `<circle cx="${sx}" cy="${sy}" r="6" fill="${t.colors[1 % t.colors.length]}"/>`;
  });
  s += `<path d="${d}" fill="none" stroke="${t.colors[1 % t.colors.length]}" stroke-width="3"/>`;
  for (const v of [0, bmax / 2, bmax]) {
    const z = (v / bmax) * 1.8 - 1;
    const [sx, sy] = pr.P(-1.15, -1, z);
    s += `<text x="${sx - 8}" y="${sy}" fill="${t.text}" font-size="${(18 * t.fontScale).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${tickLabel(v)}</text>`;
  }
  s += `<text x="120" y="120" fill="${t.text}" font-size="${(21 * t.fontScale).toFixed(1)}" font-weight="bold">${esc(m.barName)}</text>`;
  s += `<text x="820" y="120" fill="${t.colors[1 % t.colors.length]}" font-size="${(21 * t.fontScale).toFixed(1)}" font-weight="bold" text-anchor="end">${esc(m.lineName)}（独立刻度）</text>`;
  if (o.title) s += `<text x="500" y="46" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  return { inner: s, w: W, h: H };
}

export function surface3D(m: MatrixModel, t: Theme, o: PlotOpts): Rendered {
  const nr = m.rows.length, nc = m.cols.length;
  const flat = m.v.flat();
  const lo = Math.min(...flat), hi = Math.max(...flat);
  const stops = CMAPS[o.cmap] ?? CMAPS.Viridis;
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) pts.push({ x: j, y: i, z: m.v[i][j] });
  const nf = norm3(pts);
  const pr = projector(o.az, o.el, 500, 380, 240);
  let s = "";
  if (o.contour) {
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
      const [x0, y0] = nf({ x: j - 0.5, y: i - 0.5, z: lo });
      const [x1, y1] = nf({ x: j + 0.5, y: i + 0.5, z: lo });
      const q = [pr.P(x0, y0, -1.02), pr.P(x1, y0, -1.02), pr.P(x1, y1, -1.02), pr.P(x0, y1, -1.02)];
      s += `<path d="M ${q.map((p) => p.slice(0, 2).join(" ")).join(" L ")} Z" fill="${cmapColor(stops, (m.v[i][j] - lo) / (hi - lo || 1))}" fill-opacity="0.9"/>`;
    }
  }
  const quads: { d: number; path: string; fill: string }[] = [];
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
    const corners = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]].map(([a, b]) => {
      const [x, y, z] = nf({ x: b, y: a, z: m.v[a][b] });
      return pr.P(x, y, z);
    });
    const d = corners.reduce((a, p) => a + p[2], 0) / 4;
    const zm = (m.v[i][j] + m.v[i][j + 1] + m.v[i + 1][j + 1] + m.v[i + 1][j]) / 4;
    quads.push({ d, path: `M ${corners.map((p) => p.slice(0, 2).join(" ")).join(" L ")} Z`, fill: cmapColor(stops, (zm - lo) / (hi - lo || 1)) });
  }
  quads.sort((a, b) => a.d - b.d);
  for (const q of quads) s += `<path d="${q.path}" fill="${q.fill}" fill-opacity="0.95" stroke="${q.fill}" stroke-width="0.8"/>`;
  s += cube(pr, t, [m.cols[0] + " →", m.rows[0] + " →", "值"]);
  const cbx = 880;
  for (let k = 0; k < 50; k++) s += `<rect x="${cbx}" y="${140 + (49 - k) * 8}" width="20" height="8.5" fill="${cmapColor(stops, k / 49)}"/>`;
  s += `<text x="${cbx + 26}" y="146" fill="${t.text}" font-size="${(17 * t.fontScale).toFixed(1)}">${tickLabel(hi)}</text>`;
  s += `<text x="${cbx + 26}" y="540" fill="${t.text}" font-size="${(17 * t.fontScale).toFixed(1)}">${tickLabel(lo)}</text>`;
  if (o.title) s += `<text x="500" y="46" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  return { inner: s, w: W, h: H };
}