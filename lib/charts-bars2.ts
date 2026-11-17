import { Theme, Frame, esc, frame, legend, niceTicks, tickLabel, textWidth } from "@/lib/chartcore";
import { LabelSeriesModel, SeqModel, PairModel, PlotOpts, Rendered } from "@/lib/chartmodel";
import { fmt } from "@/lib/stats";

const W = 1000, H = 700;

// 类别轴标签：超过槽宽时旋转 -35 度（frame 的 xcat 传空串只画刻度线）
function catLabels(f: Frame, t: Theme, labels: string[], slotW: number): string {
  let s = "";
  labels.forEach((lb, i) => {
    const x = f.X(i + 0.5);
    const ang = rotAngle(textWidth(lb, t.tickFont), slotW, t.tickFont);
    const y = f.py + f.ph + 12 + (ang > 0 ? t.tickFont * 0.55 : 0);
    const fs = t.tickFont.toFixed(1);
    if (ang > 0) {
      s += `<text x="${x}" y="${y}" fill="${t.text}" font-size="${fs}" text-anchor="end" dominant-baseline="hanging" transform="rotate(${-ang} ${x} ${y})">${esc(lb)}</text>`;
    } else {
      s += `<text x="${x}" y="${y}" fill="${t.text}" font-size="${fs}" text-anchor="middle" dominant-baseline="hanging">${esc(lb)}</text>`;
    }
  });
  return s;
}

function emptyCats(labels: string[]): { at: number; label: string }[] {
  return labels.map((_, i) => ({ at: i + 0.5, label: "" }));
}

function rotAngle(tw: number, slot: number, fs: number): number {
  if (tw <= slot * 0.92) return 0;
  const need = (Math.acos(Math.min(1, (slot * 0.82 - fs * 0.4) / tw)) * 180) / Math.PI + 8;
  return Math.max(35, Math.min(80, need));
}

// 旋转类别标签会向下/向左延伸，预先扩大边距避免越界
function catMargins(t: Theme, labels: string[], n: number, baseMl: number, baseMb: number, hasXLabel: boolean): { ml: number; mb: number } {
  const slot = (W - baseMl - 40) / Math.max(1, n);
  let depth = 0, left = 0;
  for (const lb of labels) {
    const tw = textWidth(lb, t.tickFont);
    const a = (rotAngle(tw, slot, t.tickFont) * Math.PI) / 180;
    if (a > 0) {
      depth = Math.max(depth, tw * Math.sin(a) + t.tickFont * 1.25);
      left = Math.max(left, tw * Math.cos(a) + t.tickFont * Math.sin(a) - slot / 2 + 4);
    }
  }
  return {
    ml: Math.max(baseMl, left),
    mb: depth > 0 ? Math.max(baseMb, 12 + t.tickFont * 0.55 + depth + (hasXLabel ? t.labelFont + 24 : 8)) : baseMb,
  };
}

export function labelBar(m: LabelSeriesModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.labels.length;
  const vals = m.values.map((r) => r[0] ?? 0);
  const vmax = Math.max(0, ...vals), vmin = Math.min(0, ...vals);
  const span = Math.max(1e-9, vmax - vmin);
  const yHi = vmax + span * (o.labelPos === "above" ? 0.14 : 0.06);
  const yLo = vmin < 0 ? vmin - span * 0.12 : 0;
  const cm = catMargins(t, m.labels, n, 95, 95, !!o.xLabel);
  const f = frame({ w: W, h: H, ml: cm.ml, mr: 40, mt: 60, mb: cm.mb, xlo: 0, xhi: n, ylo: yLo, yhi: yHi, xcat: emptyCats(m.labels), xlabel: o.xLabel, ylabel: o.yLabel, title: o.title, theme: t });
  let s = f.svg + catLabels(f, t, m.labels, f.pw / Math.max(1, n));
  const gw = f.pw / Math.max(1, n), bw = gw * 0.6;
  vals.forEach((v, i) => {
    const cx = f.X(i + 0.5);
    const col = t.colors[i % t.colors.length];
    const yv = f.Y(v), y0 = f.Y(0);
    if (o.bars) s += `<rect x="${cx - bw / 2}" y="${Math.min(yv, y0)}" width="${bw}" height="${Math.max(0, Math.abs(yv - y0))}" fill="${col}" fill-opacity="0.55" stroke="${col}" stroke-width="2"/>`;
    if (o.points) s += `<circle cx="${cx}" cy="${yv}" r="5.5" fill="${col}" fill-opacity="0.8"/>`;
    if (o.labelPos === "above") {
      const y = v >= 0 ? yv - 8 : yv + 8;
      const db = v >= 0 ? "" : ` dominant-baseline="hanging"`;
      s += `<text x="${cx}" y="${y}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle"${db}>${esc(fmt(v))}</text>`;
    } else if (o.labelPos === "inside" && Math.abs(yv - y0) > t.tickFont + 12) {
      const y = v >= 0 ? yv + t.tickFont + 4 : yv - 6;
      const fill = t.bg === "transparent" ? "#ffffff" : t.bg;
      s += `<text x="${cx}" y="${y}" fill="${fill}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle">${esc(fmt(v))}</text>`;
    }
  });
  return { inner: s, w: W, h: H };
}

export function hStackBar(m: LabelSeriesModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.labels.length, ns = m.series.length;
  const totals = m.values.map((r) => r.reduce((a, v) => a + Math.max(0, v), 0));
  const xhi = o.percent ? 100 : Math.max(1e-9, ...totals) * 1.06;
  const nameW = Math.max(0, ...m.labels.map((l) => textWidth(l, t.tickFont)));
  const ml = Math.min(320, Math.max(110, nameW + 30));
  const xcat = o.percent ? [0, 25, 50, 75, 100].map((v) => ({ at: v, label: `${v}%` })) : undefined;
  const f = frame({ w: W, h: H, ml, mr: 50, mt: 60, mb: 85, xlo: 0, xhi, ylo: 0, yhi: n, yticks: [], xcat, xlabel: o.percent ? "构成比 (%)" : o.xLabel, ylabel: o.yLabel, title: o.title, theme: t });
  let s = f.svg;
  const gh = f.ph / Math.max(1, n), bh = gh * 0.6;
  m.labels.forEach((lb, i) => {
    const cy = f.Y(i + 0.5);
    s += `<line x1="${f.px - 6}" y1="${cy}" x2="${f.px}" y2="${cy}" stroke="${t.axis}" stroke-width="2"/>`;
    s += `<text x="${f.px - 12}" y="${cy}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(lb)}</text>`;
    let acc = 0;
    for (let j = 0; j < ns; j++) {
      const raw = Math.max(0, m.values[i]?.[j] ?? 0);
      const v = o.percent ? (raw / (totals[i] || 1)) * 100 : raw;
      const col = t.colors[j % t.colors.length];
      s += `<rect x="${f.X(acc)}" y="${cy - bh / 2}" width="${Math.max(0, f.X(acc + v) - f.X(acc))}" height="${bh}" fill="${col}" fill-opacity="0.8" stroke="${t.bg === "transparent" ? "#ffffff" : t.bg}" stroke-width="1.5"/>`;
      acc += v;
    }
  });
  if (ns > 1 && o.showLegend) s += legend(m.series.map((nm, j) => ({ name: nm, color: t.colors[j % t.colors.length] })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

export function divergeBar(m: SeqModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.labels.length;
  const vmax = Math.max(0, ...m.deltas), vmin = Math.min(0, ...m.deltas);
  const span = Math.max(1e-9, vmax - vmin);
  const cm = catMargins(t, m.labels, n, 95, 95, !!o.xLabel);
  const f = frame({ w: W, h: H, ml: cm.ml, mr: 40, mt: 60, mb: cm.mb, xlo: 0, xhi: n, ylo: vmin - span * 0.12, yhi: vmax + span * 0.12, xcat: emptyCats(m.labels), xlabel: o.xLabel, ylabel: o.yLabel || m.valueName, title: o.title, theme: t });
  let s = f.svg + catLabels(f, t, m.labels, f.pw / Math.max(1, n));
  const gw = f.pw / Math.max(1, n), bw = gw * 0.58;
  const y0 = f.Y(0);
  s += `<line x1="${f.px}" y1="${y0}" x2="${f.px + f.pw}" y2="${y0}" stroke="${t.axis}" stroke-width="3.5"/>`;
  m.deltas.forEach((d, i) => {
    const cx = f.X(i + 0.5);
    const col = d >= 0 ? t.colors[0] : t.colors[1 % t.colors.length];
    const yv = f.Y(d);
    s += `<rect x="${cx - bw / 2}" y="${Math.min(yv, y0)}" width="${bw}" height="${Math.max(0, Math.abs(yv - y0))}" fill="${col}" fill-opacity="0.7" stroke="${col}" stroke-width="2"/>`;
    if (o.labelPos !== "none") {
      const y = d >= 0 ? yv - 8 : yv + 8;
      const db = d >= 0 ? "" : ` dominant-baseline="hanging"`;
      s += `<text x="${cx}" y="${y}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle"${db}>${esc(fmt(d))}</text>`;
    }
  });
  return { inner: s, w: W, h: H };
}

export function pyramid(m: PairModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.labels.length;
  const sumA = m.a.reduce((a, v) => a + Math.max(0, v), 0) || 1;
  const sumB = m.b.reduce((a, v) => a + Math.max(0, v), 0) || 1;
  const A = m.a.map((v) => (o.percent ? (Math.max(0, v) / sumA) * 100 : Math.max(0, v)));
  const B = m.b.map((v) => (o.percent ? (Math.max(0, v) / sumB) * 100 : Math.max(0, v)));
  const xmax = Math.max(1e-9, ...A, ...B) * 1.12;
  const nameW = Math.max(0, ...m.labels.map((l) => textWidth(l, t.tickFont)));
  const gapPx = Math.min(240, nameW + 28);
  const pw = W - 120;
  const gapVal = xmax * (gapPx / Math.max(1, pw - gapPx));
  const f = frame({ w: W, h: H, ml: 60, mr: 60, mt: 60, mb: 85, xlo: -(xmax + gapVal), xhi: xmax + gapVal, ylo: 0, yhi: n, yticks: [], xticks: [], xlabel: o.xLabel, ylabel: o.yLabel, title: o.title, theme: t });
  let s = f.svg;
  const cx = f.X(0);
  const ticks = niceTicks(0, xmax, 4).ticks;
  for (const v of ticks) {
    if (v === 0) continue;
    for (const sign of [-1, 1]) {
      const x = f.X(sign * (v + gapVal));
      s += `<line x1="${x}" y1="${f.py + f.ph}" x2="${x}" y2="${f.py + f.ph + 6}" stroke="${t.axis}" stroke-width="2"/>`;
      s += `<text x="${x}" y="${f.py + f.ph + 12}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle" dominant-baseline="hanging">${tickLabel(v)}${o.percent ? "%" : ""}</text>`;
    }
  }
  const gh = f.ph / Math.max(1, n), bh = gh * 0.55;
  m.labels.forEach((lb, i) => {
    const cy = f.Y(i + 0.5);
    s += `<text x="${cx}" y="${cy}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${esc(lb)}</text>`;
    const xa = f.X(-(A[i] + gapVal)), xb = f.X(B[i] + gapVal);
    s += `<rect x="${xa}" y="${cy - bh / 2}" width="${Math.max(0, cx - gapPx / 2 - xa)}" height="${bh}" fill="${t.colors[0]}" fill-opacity="0.7"/>`;
    s += `<rect x="${cx + gapPx / 2}" y="${cy - bh / 2}" width="${Math.max(0, xb - cx - gapPx / 2)}" height="${bh}" fill="${t.colors[1 % t.colors.length]}" fill-opacity="0.7"/>`;
  });
  if (o.showLegend) s += legend([{ name: m.aName, color: t.colors[0] }, { name: m.bName, color: t.colors[1 % t.colors.length] }], f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

export function rangeBar(m: PairModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.labels.length;
  const los = m.labels.map((_, i) => Math.min(m.a[i] ?? 0, m.b[i] ?? 0));
  const his = m.labels.map((_, i) => Math.max(m.a[i] ?? 0, m.b[i] ?? 0));
  const glo = Math.min(...los), ghi = Math.max(...his);
  const pad = (ghi - glo || 1) * 0.1;
  const cm = catMargins(t, m.labels, n, 95, 95, !!o.xLabel);
  const f = frame({ w: W, h: H, ml: cm.ml, mr: 40, mt: 60, mb: cm.mb, xlo: 0, xhi: n, ylo: glo - pad, yhi: ghi + pad, xcat: emptyCats(m.labels), xlabel: o.xLabel, ylabel: o.yLabel, title: o.title, theme: t });
  let s = f.svg + catLabels(f, t, m.labels, f.pw / Math.max(1, n));
  const gw = f.pw / Math.max(1, n), bw = gw * 0.4;
  los.forEach((lo, i) => {
    const hi = his[i];
    const cx = f.X(i + 0.5);
    const col = t.colors[i % t.colors.length];
    const y1 = f.Y(hi), y2 = f.Y(lo);
    s += `<rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(1, y2 - y1)}" fill="${col}" fill-opacity="0.5" stroke="${col}" stroke-width="2"/>`;
    s += `<line x1="${cx - bw * 0.65}" y1="${y1}" x2="${cx + bw * 0.65}" y2="${y1}" stroke="${col}" stroke-width="3"/>`;
    s += `<line x1="${cx - bw * 0.65}" y1="${y2}" x2="${cx + bw * 0.65}" y2="${y2}" stroke="${col}" stroke-width="3"/>`;
    s += `<circle cx="${cx}" cy="${f.Y((lo + hi) / 2)}" r="5.5" fill="${t.bg === "transparent" ? "#ffffff" : t.bg}" stroke="${col}" stroke-width="2.5"/>`;
  });
  if (o.showLegend) s += legend([{ name: m.aName, color: t.colors[0] }, { name: m.bName, color: t.colors[1 % t.colors.length] }], f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

export function overlapBar(m: LabelSeriesModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.labels.length, ns = m.series.length;
  const v0 = m.values.map((r) => r[0] ?? 0);
  const v1 = m.values.map((r) => r[1] ?? 0);
  const all = ns > 1 ? [...v0, ...v1] : v0;
  const vmax = Math.max(0, ...all), vmin = Math.min(0, ...all);
  const span = Math.max(1e-9, vmax - vmin);
  const cm = catMargins(t, m.labels, n, 95, 95, !!o.xLabel);
  const f = frame({ w: W, h: H, ml: cm.ml, mr: 40, mt: 60, mb: cm.mb, xlo: 0, xhi: n, ylo: vmin < 0 ? vmin - span * 0.08 : 0, yhi: vmax + span * 0.08, xcat: emptyCats(m.labels), xlabel: o.xLabel, ylabel: o.yLabel, title: o.title, theme: t });
  let s = f.svg + catLabels(f, t, m.labels, f.pw / Math.max(1, n));
  const gw = f.pw / Math.max(1, n);
  const y0 = f.Y(0);
  v0.forEach((v, i) => {
    const cx = f.X(i + 0.5);
    const col = t.colors[0];
    const yv = f.Y(v);
    if (o.bars) s += `<rect x="${cx - gw * 0.31}" y="${Math.min(yv, y0)}" width="${gw * 0.62}" height="${Math.max(0, Math.abs(yv - y0))}" fill="${col}" fill-opacity="0.35" stroke="${col}" stroke-width="2"/>`;
    if (o.points) s += `<circle cx="${cx}" cy="${yv}" r="4.5" fill="${col}" fill-opacity="0.7"/>`;
  });
  if (ns > 1) v1.forEach((v, i) => {
    const cx = f.X(i + 0.5);
    const col = t.colors[1 % t.colors.length];
    const yv = f.Y(v);
    if (o.bars) s += `<rect x="${cx - gw * 0.15}" y="${Math.min(yv, y0)}" width="${gw * 0.3}" height="${Math.max(0, Math.abs(yv - y0))}" fill="${col}" fill-opacity="0.6"/>`;
    if (o.points) s += `<circle cx="${cx}" cy="${yv}" r="4.5" fill="${col}" fill-opacity="0.85"/>`;
  });
  if (ns > 1 && o.showLegend) s += legend(m.series.slice(0, 2).map((nm, j) => ({ name: nm, color: t.colors[j % t.colors.length] })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

export function dotPlot(m: LabelSeriesModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.labels.length, ns = m.series.length;
  const all = m.values.flat();
  const vmin = Math.min(...all, 0 === all.length ? 0 : Infinity);
  const vmax = Math.max(...all, all.length ? -Infinity : 1);
  const pad = (vmax - vmin || 1) * 0.08;
  const nameW = Math.max(0, ...m.labels.map((l) => textWidth(l, t.tickFont)));
  const ml = Math.min(320, Math.max(110, nameW + 30));
  const f = frame({ w: W, h: H, ml, mr: 50, mt: 60, mb: 85, xlo: vmin - pad, xhi: vmax + pad, ylo: 0, yhi: n, yticks: [], xlabel: o.xLabel, ylabel: o.yLabel, title: o.title, theme: t });
  let s = f.svg;
  const gh = f.ph / Math.max(1, n);
  const off = ns > 1 ? Math.min(14, (gh * 0.5) / ns) : 0;
  m.labels.forEach((lb, i) => {
    const cy = f.Y(i + 0.5);
    s += `<line x1="${f.px}" y1="${cy}" x2="${f.px + f.pw}" y2="${cy}" stroke="${t.axis}" stroke-width="1.2" stroke-opacity="0.22"/>`;
    s += `<line x1="${f.px - 6}" y1="${cy}" x2="${f.px}" y2="${cy}" stroke="${t.axis}" stroke-width="2"/>`;
    s += `<text x="${f.px - 12}" y="${cy}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(lb)}</text>`;
    for (let j = 0; j < ns; j++) {
      const v = m.values[i]?.[j];
      if (v === undefined || !isFinite(v)) continue;
      const dy = cy + (j - (ns - 1) / 2) * off;
      s += `<circle cx="${f.X(v)}" cy="${dy}" r="8" fill="${t.colors[j % t.colors.length]}" fill-opacity="0.85"/>`;
    }
  });
  if (ns > 1 && o.showLegend) s += legend(m.series.map((nm, j) => ({ name: nm, color: t.colors[j % t.colors.length], shape: "dot" })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}