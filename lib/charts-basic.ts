import { Theme, esc, frame, legend, bracket, niceTicks, tickLabel, mulberry32, textWidth } from "@/lib/chartcore";
import { GroupModel, PairModel, SeqModel, SingleModel, LabelSeriesModel, PlotOpts, Rendered, gstat, errVal, GStat } from "@/lib/chartmodel";
import { mean, welchT, stars, fmt } from "@/lib/stats";

const W = 1000, H = 700;

function groupStats(m: GroupModel): GStat[][] {
  return m.values.map((gs) => gs.map((xs) => gstat(xs)));
}

function sigPairs(m: GroupModel, st: GStat[][], o: PlotOpts): { g: number; i: number; j: number; p: number }[] {
  const out: { g: number; i: number; j: number; p: number }[] = [];
  if (o.sig === "none") return out;
  if (m.series.length > 1) {
    for (let g = 0; g < m.groups.length; g++) {
      if (o.sig === "vsFirst") {
        for (let j = 1; j < m.series.length; j++) out.push({ g, i: 0, j, p: welchT(m.values[g][0], m.values[g][j]).p });
      } else {
        for (let j = 1; j < m.series.length; j++) out.push({ g, i: j - 1, j, p: welchT(m.values[g][j - 1], m.values[g][j]).p });
      }
    }
  } else {
    const pairs = o.sig === "vsFirst"
      ? m.groups.map((_, j) => [0, j]).filter(([i, j]) => i !== j)
      : m.groups.map((_, j) => [j - 1, j]).filter(([i]) => i >= 0);
    for (const [i, j] of pairs) out.push({ g: -1, i, j, p: welchT(m.values[i][0], m.values[j][0]).p });
  }
  return out;
}

export function groupedBar(m: GroupModel, t: Theme, o: PlotOpts): Rendered {
  const st = groupStats(m);
  const ng = m.groups.length, ns = m.series.length;
  const pairs = sigPairs(m, st, o);
  const levels = new Map<number, number>();
  const levelOf: number[] = [];
  for (const p of pairs) {
    const key = p.g;
    const lv = levels.get(key) ?? 0;
    levelOf.push(lv);
    levels.set(key, lv + 1);
  }
  const maxLv = Math.max(0, ...levels.values());
  let dMax = 0, dMin = 0;
  for (let g = 0; g < ng; g++) for (let s = 0; s < ns; s++) {
    const e = errVal(st[g][s], o.error);
    dMax = Math.max(dMax, st[g][s].mean + e);
    dMin = Math.min(dMin, st[g][s].mean - e);
    if (o.points) for (const v of m.values[g][s]) { dMax = Math.max(dMax, v); dMin = Math.min(dMin, v); }
  }
  const span = Math.max(1e-9, dMax - Math.min(0, dMin));
  const yHi = dMax + span * (0.1 + maxLv * 0.09);
  const yLo = Math.min(0, dMin);
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: 0, xhi: ng, ylo: yLo, yhi: yHi, xcat: m.groups.map((g, i) => ({ at: i + 0.5, label: g })), xlabel: o.xLabel, ylabel: o.yLabel || m.valueName, title: o.title, theme: t });
  let s = f.svg;
  const gw = f.pw / ng;
  const bw = (gw * 0.66) / ns;
  const rng = mulberry32(7);
  const centers: number[][] = [];
  for (let g = 0; g < ng; g++) {
    centers.push([]);
    for (let i = 0; i < ns; i++) {
      const cx = f.X(g + 0.5) - (gw * 0.66) / 2 + bw * (i + 0.5);
      centers[g].push(cx);
      const col = t.colors[i % t.colors.length];
      const top = f.Y(st[g][i].mean);
      if (o.bars) s += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(0, f.Y(yLo < 0 ? 0 : yLo) - top)}" fill="${col}" fill-opacity="0.5" stroke="${col}" stroke-width="2"/>`;
      if (o.points) for (const v of m.values[g][i]) {
        const jx = cx + (rng() - 0.5) * bw * 0.72;
        s += `<circle cx="${jx}" cy="${f.Y(v)}" r="5.5" fill="${col}" fill-opacity="0.65"/>`;
      }
      const e = errVal(st[g][i], o.error);
      if (e > 0) {
        const y1 = f.Y(st[g][i].mean + e), y2 = f.Y(st[g][i].mean - e);
        s += `<line x1="${cx}" y1="${y1}" x2="${cx}" y2="${y2}" stroke="${t.text}" stroke-width="2.4"/>`;
        s += `<line x1="${cx - bw * 0.22}" y1="${y1}" x2="${cx + bw * 0.22}" y2="${y1}" stroke="${t.text}" stroke-width="2.4"/>`;
        s += `<line x1="${cx - bw * 0.22}" y1="${y2}" x2="${cx + bw * 0.22}" y2="${y2}" stroke="${t.text}" stroke-width="2.4"/>`;
      }
    }
  }
  pairs.forEach((p, k) => {
    const y = f.Y(dMax + span * (0.05 + levelOf[k] * 0.09));
    const x1 = p.g >= 0 ? centers[p.g][p.i] : centers[p.i][0];
    const x2 = p.g >= 0 ? centers[p.g][p.j] : centers[p.j][0];
    s += bracket(x1, x2, y, stars(p.p), t);
  });
  if (ns > 1 && o.showLegend) s += legend(m.series.map((n, i) => ({ name: n, color: t.colors[i % t.colors.length] })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

export function dotError(m: GroupModel, t: Theme, o: PlotOpts): Rendered {
  return groupedBar(m, t, { ...o, bars: false, points: false, sig: "none" });
}

function kde(xs: number[], grid: number[]): number[] {
  const n = xs.length;
  const s = Math.sqrt(xs.reduce((a, v) => a + (v - mean(xs)) ** 2, 0) / Math.max(1, n - 1));
  const bw = Math.max(1e-9, 1.06 * s * n ** -0.2);
  return grid.map((x) => xs.reduce((a, v) => a + Math.exp(-0.5 * ((x - v) / bw) ** 2), 0) / (n * bw * Math.sqrt(2 * Math.PI)));
}

function distFrame(m: GroupModel, t: Theme, o: PlotOpts, extraTop = 0) {
  const all = m.values.map((gs) => gs[0]);
  const stats = all.map((xs) => gstat(xs));
  let lo = Infinity, hi = -Infinity;
  for (const xs of all) for (const v of xs) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = (hi - lo || 1) * 0.08;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60 + extraTop, mb: 85, xlo: 0, xhi: m.groups.length, ylo: lo - pad, yhi: hi + pad, xcat: m.groups.map((g, i) => ({ at: i + 0.5, label: g })), xlabel: o.xLabel, ylabel: o.yLabel || m.valueName, title: o.title, theme: t });
  return { f, stats, gw: f.pw / m.groups.length };
}

export function boxPlot(m: GroupModel, t: Theme, o: PlotOpts): Rendered {
  const { f, stats, gw } = distFrame(m, t, o);
  let s = f.svg;
  const rng = mulberry32(11);
  stats.forEach((g, i) => {
    const cx = f.X(i + 0.5);
    const col = t.colors[i % t.colors.length];
    const bw = gw * 0.42;
    s += `<line x1="${cx}" y1="${f.Y(g.lo)}" x2="${cx}" y2="${f.Y(g.q1)}" stroke="${t.text}" stroke-width="2.2"/>`;
    s += `<line x1="${cx}" y1="${f.Y(g.q3)}" x2="${cx}" y2="${f.Y(g.hi)}" stroke="${t.text}" stroke-width="2.2"/>`;
    s += `<line x1="${cx - bw * 0.3}" y1="${f.Y(g.lo)}" x2="${cx + bw * 0.3}" y2="${f.Y(g.lo)}" stroke="${t.text}" stroke-width="2.2"/>`;
    s += `<line x1="${cx - bw * 0.3}" y1="${f.Y(g.hi)}" x2="${cx + bw * 0.3}" y2="${f.Y(g.hi)}" stroke="${t.text}" stroke-width="2.2"/>`;
    s += `<rect x="${cx - bw / 2}" y="${f.Y(g.q3)}" width="${bw}" height="${Math.max(1, f.Y(g.q1) - f.Y(g.q3))}" fill="${col}" fill-opacity="0.55" stroke="${col}" stroke-width="2.2"/>`;
    s += `<line x1="${cx - bw / 2}" y1="${f.Y(g.median)}" x2="${cx + bw / 2}" y2="${f.Y(g.median)}" stroke="${t.text}" stroke-width="3"/>`;
    for (const v of g.outliers) s += `<circle cx="${cx}" cy="${f.Y(v)}" r="5" fill="none" stroke="${col}" stroke-width="2"/>`;
    if (o.points) for (const v of m.values[i][0]) s += `<circle cx="${cx + (rng() - 0.5) * bw * 0.8}" cy="${f.Y(v)}" r="4.5" fill="${t.text}" fill-opacity="0.35"/>`;
  });
  return { inner: s, w: W, h: H };
}

export function violinPlot(m: GroupModel, t: Theme, o: PlotOpts, half = false): Rendered {
  const { f, stats, gw } = distFrame(m, t, o);
  let s = f.svg;
  const rng = mulberry32(13);
  stats.forEach((g, i) => {
    const cx = f.X(i + 0.5);
    const col = t.colors[i % t.colors.length];
    const xs = m.values[i][0];
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const grid = Array.from({ length: 48 }, (_, k) => lo + ((hi - lo) * k) / 47);
    const den = kde(xs, grid);
    const dmax = Math.max(...den, 1e-12);
    const vw = gw * (half ? 0.34 : 0.4);
    const base = half ? cx + gw * 0.06 : cx;
    let path = "";
    grid.forEach((x, k) => {
      const w = (den[k] / dmax) * vw;
      path += `${k === 0 ? "M" : "L"} ${base + w} ${f.Y(x)} `;
    });
    for (let k = grid.length - 1; k >= 0; k--) {
      const w = (den[k] / dmax) * vw;
      path += `L ${base - (half ? 0 : w)} ${f.Y(grid[k])} `;
    }
    s += `<path d="${path}Z" fill="${col}" fill-opacity="0.45" stroke="${col}" stroke-width="2"/>`;
    const bw = gw * 0.1;
    const bx = half ? cx - gw * 0.12 : cx;
    s += `<line x1="${bx}" y1="${f.Y(g.lo)}" x2="${bx}" y2="${f.Y(g.hi)}" stroke="${t.text}" stroke-width="2"/>`;
    s += `<rect x="${bx - bw / 2}" y="${f.Y(g.q3)}" width="${bw}" height="${Math.max(1, f.Y(g.q1) - f.Y(g.q3))}" fill="${t.text}" fill-opacity="0.75"/>`;
    s += `<circle cx="${bx}" cy="${f.Y(g.median)}" r="4.5" fill="#ffffff"/>`;
    if (half && o.points) for (const v of xs) s += `<circle cx="${cx - gw * 0.3 + (rng() - 0.5) * gw * 0.16}" cy="${f.Y(v)}" r="4.5" fill="${col}" fill-opacity="0.6"/>`;
    if (!half && o.points) for (const v of xs) s += `<circle cx="${cx + (rng() - 0.5) * gw * 0.12}" cy="${f.Y(v)}" r="4" fill="${t.text}" fill-opacity="0.3"/>`;
  });
  return { inner: s, w: W, h: H };
}

export function rainCloud(m: GroupModel, t: Theme, o: PlotOpts): Rendered {
  return violinPlot(m, t, o, true);
}

function hFrame(m: GroupModel, t: Theme, o: PlotOpts, xhi: number) {
  const f = frame({ w: W, h: H, ml: 230, mr: 50, mt: 60, mb: 85, xlo: 0, xhi, ylo: 0, yhi: m.groups.length, yticks: [], xlabel: o.xLabel || m.valueName, ylabel: o.yLabel, title: o.title, theme: t });
  let s = f.svg;
  m.groups.forEach((g, i) => {
    const y = f.Y(i + 0.5);
    s += `<line x1="${f.px - 6}" y1="${y}" x2="${f.px}" y2="${y}" stroke="${t.axis}" stroke-width="2"/>`;
    s += `<text x="${f.px - 12}" y="${y}" fill="${t.text}" font-size="${(22 * t.fontScale).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(g)}</text>`;
  });
  return { f, s };
}

export function hBar(m: GroupModel, t: Theme, o: PlotOpts): Rendered {
  const st = groupStats(m);
  const ns = m.series.length;
  let xhi = 0;
  for (let g = 0; g < m.groups.length; g++) for (let i = 0; i < ns; i++) xhi = Math.max(xhi, st[g][i].mean + errVal(st[g][i], o.error));
  xhi *= 1.12;
  const { f, s: base } = hFrame(m, t, o, xhi);
  let s = base;
  const gh = f.ph / m.groups.length;
  const bh = (gh * 0.66) / ns;
  for (let g = 0; g < m.groups.length; g++) for (let i = 0; i < ns; i++) {
    const cy = f.Y(g + 0.5) - (gh * 0.66) / 2 + bh * (i + 0.5);
    const col = t.colors[i % t.colors.length];
    const x1 = f.X(st[g][i].mean);
    if (o.lollipop) {
      s += `<line x1="${f.X(0)}" y1="${cy}" x2="${x1}" y2="${cy}" stroke="${col}" stroke-width="3"/>`;
      s += `<circle cx="${x1}" cy="${cy}" r="9" fill="${col}"/>`;
    } else {
      s += `<rect x="${f.X(0)}" y="${cy - bh / 2}" width="${Math.max(0, x1 - f.X(0))}" height="${bh}" fill="${col}" fill-opacity="0.6" stroke="${col}" stroke-width="2"/>`;
    }
    const e = errVal(st[g][i], o.error);
    if (e > 0 && !o.lollipop) {
      s += `<line x1="${f.X(st[g][i].mean - e)}" y1="${cy}" x2="${f.X(st[g][i].mean + e)}" y2="${cy}" stroke="${t.text}" stroke-width="2.2"/>`;
    }
  }
  if (ns > 1 && o.showLegend) s += legend(m.series.map((n, i) => ({ name: n, color: t.colors[i % t.colors.length] })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

export function stackedBar(m: GroupModel, t: Theme, o: PlotOpts): Rendered {
  const st = groupStats(m);
  const ng = m.groups.length, ns = m.series.length;
  const totals = st.map((gs) => gs.reduce((a, g) => a + Math.max(0, g.mean), 0));
  const yHi = o.percent ? 100 : Math.max(...totals) * 1.1;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: 0, xhi: ng, ylo: 0, yhi: yHi, xcat: m.groups.map((g, i) => ({ at: i + 0.5, label: g })), xlabel: o.xLabel, ylabel: o.percent ? "构成比 (%)" : (o.yLabel || m.valueName), title: o.title, theme: t });
  let s = f.svg;
  const gw = f.pw / ng, bw = gw * 0.6;
  for (let g = 0; g < ng; g++) {
    let acc = 0;
    const cx = f.X(g + 0.5);
    for (let i = 0; i < ns; i++) {
      const v = o.percent ? (Math.max(0, st[g][i].mean) / (totals[g] || 1)) * 100 : Math.max(0, st[g][i].mean);
      const y1 = f.Y(acc + v), y2 = f.Y(acc);
      s += `<rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(0, y2 - y1)}" fill="${t.colors[i % t.colors.length]}" fill-opacity="0.8" stroke="${t.bg === "transparent" ? "#ffffff" : t.bg}" stroke-width="1.5"/>`;
      acc += v;
    }
  }
  if (o.showLegend) s += legend(m.series.map((n, i) => ({ name: n, color: t.colors[i % t.colors.length] })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

export function butterfly(m: PairModel, t: Theme, o: PlotOpts): Rendered {
  const xmax = Math.max(...m.a, ...m.b, 1e-9) * 1.15;
  const f = frame({ w: W, h: H, ml: 60, mr: 60, mt: 60, mb: 85, xlo: -xmax, xhi: xmax, ylo: 0, yhi: m.labels.length, yticks: [], xticks: [], xlabel: o.xLabel, ylabel: o.yLabel, title: o.title, theme: t });
  let s = f.svg;
  const ticks = niceTicks(0, xmax, 4).ticks;
  for (const v of ticks) for (const sign of [-1, 1]) {
    if (v === 0 && sign === -1) continue;
    const x = f.X(sign * v);
    s += `<line x1="${x}" y1="${f.py + f.ph}" x2="${x}" y2="${f.py + f.ph + 6}" stroke="${t.axis}" stroke-width="2"/>`;
    s += `<text x="${x}" y="${f.py + f.ph + 12}" fill="${t.text}" font-size="${(22 * t.fontScale).toFixed(1)}" text-anchor="middle" dominant-baseline="hanging">${tickLabel(v)}</text>`;
  }
  const gh = f.ph / m.labels.length;
  const cx = f.X(0);
  m.labels.forEach((lb, i) => {
    const cy = f.Y(i + 0.5);
    s += `<text x="${cx}" y="${cy}" fill="${t.text}" font-size="${(21 * t.fontScale).toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${esc(lb)}</text>`;
    const bh = gh * 0.52;
    const xa = f.X(-m.a[i]), xb = f.X(m.b[i]);
    if (o.lollipop) {
      s += `<line x1="${cx - 60}" y1="${cy}" x2="${xa}" y2="${cy}" stroke="${t.colors[0]}" stroke-width="3"/>`;
      s += `<circle cx="${xa}" cy="${cy}" r="9" fill="${t.colors[0]}"/>`;
      s += `<line x1="${cx + 60}" y1="${cy}" x2="${xb}" y2="${cy}" stroke="${t.colors[1]}" stroke-width="3"/>`;
      s += `<circle cx="${xb}" cy="${cy}" r="9" fill="${t.colors[1]}"/>`;
    } else {
      s += `<rect x="${xa}" y="${cy - bh / 2}" width="${Math.max(0, cx - 60 - xa)}" height="${bh}" fill="${t.colors[0]}" fill-opacity="0.7"/>`;
      s += `<rect x="${cx + 60}" y="${cy - bh / 2}" width="${Math.max(0, xb - cx - 60)}" height="${bh}" fill="${t.colors[1]}" fill-opacity="0.7"/>`;
    }
  });
  s += legend([{ name: m.aName, color: t.colors[0] }, { name: m.bName, color: t.colors[1] }], f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

export function nestedBar(m: PairModel, t: Theme, o: PlotOpts): Rendered {
  const ymax = Math.max(...m.a, ...m.b, 1e-9) * 1.15;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: 0, xhi: m.labels.length, ylo: 0, yhi: ymax, xcat: m.labels.map((l, i) => ({ at: i + 0.5, label: l })), xlabel: o.xLabel, ylabel: o.yLabel, title: o.title, theme: t });
  let s = f.svg;
  const gw = f.pw / m.labels.length;
  m.labels.forEach((_, i) => {
    const cx = f.X(i + 0.5);
    s += `<rect x="${cx - gw * 0.32}" y="${f.Y(m.a[i])}" width="${gw * 0.64}" height="${f.Y(0) - f.Y(m.a[i])}" fill="${t.colors[0]}" fill-opacity="0.3" stroke="${t.colors[0]}" stroke-width="2"/>`;
    s += `<rect x="${cx - gw * 0.15}" y="${f.Y(m.b[i])}" width="${gw * 0.3}" height="${f.Y(0) - f.Y(m.b[i])}" fill="${t.colors[1]}" fill-opacity="0.85"/>`;
  });
  s += legend([{ name: m.aName, color: t.colors[0] }, { name: m.bName, color: t.colors[1] }], f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

export function waterfall(m: SeqModel, t: Theme, o: PlotOpts): Rendered {
  let cum = 0;
  const segs = m.deltas.map((d) => { const from = cum; cum += d; return { from, to: cum, d }; });
  const lo = Math.min(0, ...segs.map((s) => Math.min(s.from, s.to)));
  const hi = Math.max(...segs.map((s) => Math.max(s.from, s.to)), cum) * 1.12;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 95, xlo: 0, xhi: m.labels.length + 1, ylo: lo, yhi: hi, xcat: [...m.labels.map((l, i) => ({ at: i + 0.5, label: l })), { at: m.labels.length + 0.5, label: "合计" }], xlabel: o.xLabel, ylabel: o.yLabel || m.valueName, title: o.title, theme: t });
  let s = f.svg;
  const gw = f.pw / (m.labels.length + 1);
  segs.forEach((sg, i) => {
    const cx = f.X(i + 0.5);
    const col = sg.d >= 0 ? t.colors[2 % t.colors.length] : t.colors[0];
    const y1 = f.Y(Math.max(sg.from, sg.to)), y2 = f.Y(Math.min(sg.from, sg.to));
    s += `<rect x="${cx - gw * 0.3}" y="${y1}" width="${gw * 0.6}" height="${Math.max(1, y2 - y1)}" fill="${col}" fill-opacity="0.8"/>`;
    if (i < segs.length - 1) s += `<line x1="${cx + gw * 0.3}" y1="${f.Y(sg.to)}" x2="${f.X(i + 1.5) - gw * 0.3}" y2="${f.Y(sg.to)}" stroke="${t.axis}" stroke-width="1.6" stroke-dasharray="5 4"/>`;
    else s += `<line x1="${cx + gw * 0.3}" y1="${f.Y(sg.to)}" x2="${f.X(i + 1.5) - gw * 0.3}" y2="${f.Y(sg.to)}" stroke="${t.axis}" stroke-width="1.6" stroke-dasharray="5 4"/>`;
  });
  const cx = f.X(m.labels.length + 0.5);
  s += `<rect x="${cx - gw * 0.3}" y="${f.Y(cum)}" width="${gw * 0.6}" height="${Math.max(1, f.Y(0) - f.Y(cum))}" fill="${t.colors[4 % t.colors.length]}" fill-opacity="0.8"/>`;
  return { inner: s, w: W, h: H };
}

export function histogram(m: SingleModel, t: Theme, o: PlotOpts): Rendered {
  const xs = m.values;
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const bins = Math.max(3, o.bins);
  const bw = (hi - lo || 1) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of xs) counts[Math.min(bins - 1, Math.floor((v - lo) / bw))]++;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: lo, xhi: hi, ylo: 0, yhi: Math.max(...counts) * 1.12, xlabel: o.xLabel || m.valueName, ylabel: o.yLabel || "频数", title: o.title, theme: t });
  let s = f.svg;
  counts.forEach((c, i) => {
    const x1 = f.X(lo + i * bw), x2 = f.X(lo + (i + 1) * bw);
    s += `<rect x="${x1 + 1}" y="${f.Y(c)}" width="${Math.max(1, x2 - x1 - 2)}" height="${f.Y(0) - f.Y(c)}" fill="${t.colors[0]}" fill-opacity="0.65" stroke="${t.colors[0]}" stroke-width="2"/>`;
  });
  return { inner: s, w: W, h: H };
}

export function ecdf(m: SingleModel, t: Theme, o: PlotOpts): Rendered {
  const xs = [...m.values].sort((a, b) => a - b);
  const pad = (xs[xs.length - 1] - xs[0] || 1) * 0.05;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: xs[0] - pad, xhi: xs[xs.length - 1] + pad, ylo: 0, yhi: 1, xlabel: o.xLabel || m.valueName, ylabel: o.yLabel || "累积概率", title: o.title, theme: t });
  let s = f.svg;
  let d = `M ${f.X(xs[0] - pad)} ${f.Y(0)} `;
  xs.forEach((v, i) => { d += `L ${f.X(v)} ${f.Y(i / xs.length)} L ${f.X(v)} ${f.Y((i + 1) / xs.length)} `; });
  d += `L ${f.X(xs[xs.length - 1] + pad)} ${f.Y(1)}`;
  s += `<path d="${d}" fill="none" stroke="${t.colors[0]}" stroke-width="3"/>`;
  return { inner: s, w: W, h: H };
}

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(r0, a0)} L ${p(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

export function radialBar(m: LabelSeriesModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.labels.length;
  const stacked = m.series.length > 1;
  const totals = m.values.map((row) => row.reduce((a, v) => a + Math.max(0, v), 0));
  const vmax = stacked ? Math.max(...totals) : Math.max(...m.values.map((r) => Math.max(...r)));
  const cx = 500, cy = 520, r0 = 130;
  const labelFs = 21 * t.fontScale;
  const maxTw = Math.max(...m.labels.map((lb) => textWidth(lb, labelFs)), 0);
  const rmax = Math.min(400, 460 - maxTw);
  let s = "";
  const ticks = niceTicks(0, vmax, 4).ticks;
  const tStep = ticks.length > 1 ? ticks[1] - ticks[0] : vmax;
  const dr = (tStep / vmax) * (rmax - r0);
  const tickFs = 18 * t.fontScale;
  const stride = Math.max(1, Math.ceil((tickFs * 1.2) / Math.max(1, dr)));
  ticks.forEach((v, ti) => {
    if (v === 0 || ti % stride !== 0) return;
    const r = r0 + (v / vmax) * (rmax - r0);
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.axis}" stroke-width="1" stroke-opacity="0.35" stroke-dasharray="4 5"/>`;
    s += `<text x="${cx + 4}" y="${cy - r - 4}" fill="${t.text}" font-size="${tickFs.toFixed(1)}" fill-opacity="0.7">${tickLabel(v)}</text>`;
  });
  const step = (2 * Math.PI) / n, pad = step * 0.12;
  m.labels.forEach((lb, i) => {
    const a0 = -Math.PI / 2 + i * step + pad / 2, a1 = -Math.PI / 2 + (i + 1) * step - pad / 2;
    if (stacked) {
      let acc = 0;
      m.series.forEach((_, j) => {
        const v = Math.max(0, m.values[i][j]);
        const ra = r0 + (acc / vmax) * (rmax - r0), rb = r0 + ((acc + v) / vmax) * (rmax - r0);
        s += `<path d="${arc(cx, cy, ra, rb, a0, a1)}" fill="${t.colors[j % t.colors.length]}" fill-opacity="0.85"/>`;
        acc += v;
      });
    } else {
      const r1 = r0 + (Math.max(0, m.values[i][0]) / vmax) * (rmax - r0);
      s += `<path d="${arc(cx, cy, r0, r1, a0, a1)}" fill="${t.colors[i % t.colors.length]}" fill-opacity="0.85"/>`;
    }
    const am = (a0 + a1) / 2;
    const lx = cx + (rmax + 26) * Math.cos(am), ly = cy + (rmax + 26) * Math.sin(am);
    const anchor = Math.cos(am) > 0.25 ? "start" : Math.cos(am) < -0.25 ? "end" : "middle";
    s += `<text x="${lx}" y="${ly}" fill="${t.text}" font-size="${(21 * t.fontScale).toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle">${esc(lb)}</text>`;
  });
  s += `<circle cx="${cx}" cy="${cy}" r="${r0}" fill="none" stroke="${t.axis}" stroke-width="2"/>`;
  if (o.title) s += `<text x="${cx}" y="${60}" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  if (stacked && o.showLegend) s += legend(m.series.map((nm, j) => ({ name: nm, color: t.colors[j % t.colors.length] })), 60, 90, t);
  return { inner: s, w: 1000, h: 1000 };
}

export function roseChart(m: LabelSeriesModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.labels.length;
  const vmax = Math.max(...m.values.map((r) => Math.max(...r)), 1e-9);
  const cx = 500, cy = 520, r0 = 60;
  const labelFs = 21 * t.fontScale;
  const maxTw = Math.max(...m.labels.map((lb) => textWidth(lb, labelFs)), 0);
  const rmax = Math.min(400, 460 - maxTw);
  let s = "";
  const step = (2 * Math.PI) / n;
  m.labels.forEach((lb, i) => {
    const a0 = -Math.PI / 2 + i * step + 0.02, a1 = -Math.PI / 2 + (i + 1) * step - 0.02;
    const r1 = r0 + Math.sqrt(Math.max(0, m.values[i][0]) / vmax) * (rmax - r0);
    s += `<path d="${arc(cx, cy, r0, r1, a0, a1)}" fill="${t.colors[i % t.colors.length]}" fill-opacity="0.8" stroke="${t.bg === "transparent" ? "#ffffff" : t.bg}" stroke-width="2"/>`;
    const am = (a0 + a1) / 2;
    const lx = cx + (rmax + 26) * Math.cos(am), ly = cy + (rmax + 26) * Math.sin(am);
    const anchor = Math.cos(am) > 0.25 ? "start" : Math.cos(am) < -0.25 ? "end" : "middle";
    s += `<text x="${lx}" y="${ly}" fill="${t.text}" font-size="${(21 * t.fontScale).toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle">${esc(lb)}</text>`;
  });
  if (o.title) s += `<text x="${cx}" y="${60}" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  return { inner: s, w: 1000, h: 1000 };
}

export function barValueLabels(m: GroupModel): string {
  return m.groups.map((g, i) => `${g}: ${fmt(mean(m.values[i][0]))}`).join("; ");
}