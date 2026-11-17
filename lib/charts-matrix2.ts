import { Theme, esc, frame, legend, cmapColor, CMAPS, tickLabel, textWidth } from "@/lib/chartcore";
import { MatrixModel, LabelSeriesModel, PlotOpts, Rendered } from "@/lib/chartmodel";
import { mean } from "@/lib/stats";

const W = 1000, H = 700;

// ---------- average-linkage hierarchical clustering (Euclidean, row vectors) ----------

interface Merge { id: number; a: number; b: number; h: number }

function clusterRows(v: number[][]): { order: number[]; merges: Merge[] } {
  const n = v.length;
  if (n === 0) return { order: [], merges: [] };
  if (n === 1) return { order: [0], merges: [] };
  const D: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let s = 0;
      const len = Math.max(v[i].length, v[j].length);
      for (let k = 0; k < len; k++) {
        const d = (v[i][k] ?? 0) - (v[j][k] ?? 0);
        s += d * d;
      }
      D[i][j] = D[j][i] = Math.sqrt(s);
    }
  }
  interface Cl { id: number; leaves: number[] }
  let cls: Cl[] = v.map((_, i) => ({ id: i, leaves: [i] }));
  const merges: Merge[] = [];
  let next = n;
  const dist = (a: Cl, b: Cl): number => {
    let s = 0;
    for (const x of a.leaves) for (const y of b.leaves) s += D[x][y];
    return s / (a.leaves.length * b.leaves.length);
  };
  while (cls.length > 1) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < cls.length; i++) {
      for (let j = i + 1; j < cls.length; j++) {
        const d = dist(cls[i], cls[j]);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    const merged: Cl = { id: next++, leaves: [...cls[bi].leaves, ...cls[bj].leaves] };
    merges.push({ id: merged.id, a: cls[bi].id, b: cls[bj].id, h: bd });
    cls = cls.filter((_, k) => k !== bi && k !== bj);
    cls.push(merged);
  }
  return { order: cls[0].leaves, merges };
}

/** Left-side dendrogram: leaves at x1 (aligned to rowY by display order), root depth maps to x0. */
function dendroSvg(merges: Merge[], order: number[], rowY: number[], x0: number, x1: number, t: Theme): string {
  if (!merges.length) return "";
  const hmax = Math.max(...merges.map((mg) => mg.h), 1e-9);
  const pos = new Map<number, { x: number; y: number }>();
  order.forEach((leaf, r) => pos.set(leaf, { x: x1, y: rowY[r] }));
  let s = "";
  for (const mg of merges) {
    const a = pos.get(mg.a), b = pos.get(mg.b);
    if (!a || !b) continue;
    const xm = x1 - (mg.h / hmax) * (x1 - x0);
    const ym = (a.y + b.y) / 2;
    s += `<path d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${xm.toFixed(1)} ${a.y.toFixed(1)} L ${xm.toFixed(1)} ${b.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}" fill="none" stroke="${t.axis}" stroke-width="1.6"/>`;
    pos.set(mg.id, { x: xm, y: ym });
  }
  return s;
}

// ---------- 1. lower-triangle heatmap + clustering + bar annotation ----------

export function triHeatmap(m: MatrixModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.rows.length;
  let s = "";
  if (o.title) s += `<text x="500" y="40" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  if (n === 0) return { inner: s, w: W, h: H };
  const vecs = m.rows.map((_, i) => m.cols.map((_, j) => m.v[i]?.[j] ?? 0));
  const { order, merges } = clusterRows(vecs);
  const hx0 = 140, hy0 = 120, annoW = 150;
  const cell = Math.max(8, Math.min((W - hx0 - 260) / n, (H - hy0 - 70) / n));
  const gw = n * cell;
  const stops = CMAPS[o.cmap] ?? CMAPS["蓝-红（相关）"];

  // collect lower-triangle (off-diagonal) values in clustered order
  const tri: number[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < r; c++) tri.push(vecs[order[r]][order[c]]);
  const hasNeg = tri.some((v) => v < 0);
  const absMax = Math.max(...tri.map((v) => Math.abs(v)), 1e-9);
  const lo = tri.length ? Math.min(...tri) : 0;
  const hi = tri.length ? Math.max(...tri) : 1;
  const t01 = (v: number) => hasNeg ? (v / absMax + 1) / 2 : (v - lo) / (hi - lo || 1);

  const rowY: number[] = [];
  const rowMeans: number[] = [];
  for (let r = 0; r < n; r++) {
    const cy = hy0 + (r + 0.5) * cell;
    rowY.push(cy);
    const i = order[r];
    const off = vecs[i].filter((_, j) => j !== i);
    rowMeans.push(off.length ? mean(off) : 0);
    for (let c = 0; c <= r; c++) {
      const x = hx0 + c * cell;
      if (c === r) {
        s += `<text x="${(x + 4).toFixed(1)}" y="${cy.toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" dominant-baseline="middle">${esc(m.rows[i])}</text>`;
      } else {
        const v = vecs[i][order[c]];
        s += `<rect x="${x.toFixed(1)}" y="${(hy0 + r * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${cmapColor(stops, t01(v))}"${o.gaps ? ` stroke="${t.bg}" stroke-width="1"` : ""}/>`;
      }
    }
  }

  // dendrogram on the left
  s += dendroSvg(merges, order, rowY, 36, 126, t);

  // top column labels, rotated -45
  for (let c = 0; c < n; c++) {
    const x = hx0 + (c + 0.5) * cell, y = hy0 - 10;
    s += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="start" transform="rotate(-45 ${x.toFixed(1)} ${y.toFixed(1)})">${esc(m.rows[order[c]])}</text>`;
  }

  // right annotation: per-row mean horizontal bars (single color)
  const annoX = hx0 + gw + 34;
  const mlo = Math.min(...rowMeans), mhi = Math.max(...rowMeans);
  const barH = Math.min(cell * 0.6, 22);
  s += `<text x="${annoX.toFixed(1)}" y="${(hy0 - 14).toFixed(1)}" fill="${t.text}" font-size="${t.legendFont.toFixed(1)}" font-weight="bold">Row mean</text>`;
  for (let r = 0; r < n; r++) {
    const frac = (rowMeans[r] - mlo) / (mhi - mlo || 1);
    const bw = Math.max(2, frac * annoW);
    s += `<rect x="${annoX.toFixed(1)}" y="${(rowY[r] - barH / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${barH.toFixed(1)}" fill="${t.colors[0]}" fill-opacity="0.85"/>`;
  }
  s += `<line x1="${annoX.toFixed(1)}" y1="${(hy0 + gw).toFixed(1)}" x2="${(annoX + annoW).toFixed(1)}" y2="${(hy0 + gw).toFixed(1)}" stroke="${t.axis}" stroke-width="2"/>`;
  s += `<text x="${annoX.toFixed(1)}" y="${(hy0 + gw + 26).toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle" dominant-baseline="hanging">${tickLabel(mlo)}</text>`;
  s += `<text x="${(annoX + annoW).toFixed(1)}" y="${(hy0 + gw + 26).toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle" dominant-baseline="hanging">${tickLabel(mhi)}</text>`;
  return { inner: s, w: W, h: H };
}

// ---------- 2. Mantel test combination plot ----------

export function mantelTest(m: MatrixModel, t: Theme, o: PlotOpts): Rendered {
  const nr = m.rows.length, nc = m.cols.length;
  let s = "";
  if (o.title) s += `<text x="440" y="40" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  const xl = 280, xr = 720, y0 = 150, y1 = 640;
  const ly = (i: number) => nr === 1 ? (y0 + y1) / 2 : y0 + (i / (nr - 1)) * (y1 - y0);
  const ry = (j: number) => nc === 1 ? (y0 + y1) / 2 : y0 + (j / (nc - 1)) * (y1 - y0);
  const stops = CMAPS["蓝-红（相关）"];
  const flat = m.v.flat().filter((v) => isFinite(v));
  const absMax = Math.max(...flat.map((v) => Math.abs(v)), 1e-9);

  // bezier links first (under nodes)
  for (let i = 0; i < nr; i++) {
    for (let j = 0; j < nc; j++) {
      const v = m.v[i]?.[j];
      if (v === undefined || !isFinite(v)) continue;
      const a = Math.abs(v) / absMax;
      const wdt = 1 + 7 * a;
      const col = cmapColor(stops, (v / absMax + 1) / 2);
      const p = m.p?.[i]?.[j];
      const op = m.p ? (p !== undefined && p < 0.05 ? 0.9 : 0.25) : 0.85;
      const ya = ly(i), yb = ry(j), dx = (xr - xl) * 0.45;
      s += `<path d="M ${xl} ${ya.toFixed(1)} C ${(xl + dx).toFixed(1)} ${ya.toFixed(1)}, ${(xr - dx).toFixed(1)} ${yb.toFixed(1)}, ${xr} ${yb.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${wdt.toFixed(1)}" stroke-opacity="${op}" stroke-linecap="round"/>`;
    }
  }
  // nodes + labels
  for (let i = 0; i < nr; i++) {
    const y = ly(i);
    s += `<circle cx="${xl}" cy="${y.toFixed(1)}" r="8" fill="${t.colors[i % t.colors.length]}"/>`;
    s += `<text x="${xl - 16}" y="${y.toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(m.rows[i])}</text>`;
  }
  for (let j = 0; j < nc; j++) {
    const y = ry(j);
    s += `<circle cx="${xr}" cy="${y.toFixed(1)}" r="8" fill="${t.colors[j % t.colors.length]}"/>`;
    s += `<text x="${xr + 16}" y="${y.toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" dominant-baseline="middle">${esc(m.cols[j])}</text>`;
  }
  // top-right legend
  if (o.showLegend) {
    s += legend([
      { name: "负相关", color: cmapColor(stops, 0), shape: "line" },
      { name: "正相关", color: cmapColor(stops, 1), shape: "line" },
    ], 640, 66, t);
    s += `<text x="640" y="104" fill="${t.text}" font-size="${t.legendFont.toFixed(1)}" fill-opacity="0.85">线宽 ∝ |r|</text>`;
    if (m.p) s += `<text x="640" y="128" fill="${t.text}" font-size="${t.legendFont.toFixed(1)}" fill-opacity="0.85">淡色 = P≥0.05</text>`;
  }
  return { inner: s, w: W, h: H };
}

// ---------- 3. clustering tree + stacked percentage bars ----------

export function treeStack(m: LabelSeriesModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.labels.length;
  const vecs = m.labels.map((_, i) => m.values[i] ?? []);
  const { order, merges } = clusterRows(vecs);
  const labelW = Math.min(200, Math.max(60, ...m.labels.map((l) => textWidth(l, t.tickFont))));
  const dendroW = 90;
  const ml = Math.round(30 + dendroW + 20 + labelW + 18);
  const f = frame({
    w: W, h: H, ml, mr: 50, mt: 90, mb: 70,
    xlo: 0, xhi: 100, ylo: 0, yhi: Math.max(1, n),
    xticks: [0, 25, 50, 75, 100], yticks: [],
    xlabel: o.xLabel || "Percent (%)", title: o.title, theme: t, grid: false,
  });
  let s = f.svg;
  const rh = f.ph / Math.max(1, n);
  const barH = rh * 0.62;
  const rowY: number[] = [];
  for (let r = 0; r < n; r++) {
    const i = order[r];
    const cy = f.py + (r + 0.5) * rh;
    rowY.push(cy);
    const vals = vecs[i].map((v) => Math.max(0, isFinite(v) ? v : 0));
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    let x = f.X(0);
    vals.forEach((v, si) => {
      const wpx = (v / total) * f.pw;
      if (wpx > 0.2) s += `<rect x="${x.toFixed(1)}" y="${(cy - barH / 2).toFixed(1)}" width="${wpx.toFixed(1)}" height="${barH.toFixed(1)}" fill="${t.colors[si % t.colors.length]}" fill-opacity="0.9" stroke="${t.bg}" stroke-width="0.6"/>`;
      x += wpx;
    });
    s += `<text x="${(f.px - 12).toFixed(1)}" y="${cy.toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(m.labels[i])}</text>`;
  }
  const x1 = f.px - labelW - 26;
  s += dendroSvg(merges, order, rowY, Math.max(20, x1 - dendroW), x1, t);
  if (o.showLegend) s += legend(m.series.map((name, i) => ({ name, color: t.colors[i % t.colors.length] })), 60, 40, t);
  return { inner: s, w: W, h: H };
}