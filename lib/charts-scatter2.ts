import { Theme, esc, frame, legend, niceTicks, sigLegendSvg, textWidth } from "@/lib/chartcore";
import { XYModel, PlotOpts, Rendered } from "@/lib/chartmodel";
import { mean, quantile, linreg, pearson, fmt, fmtP } from "@/lib/stats";

const W = 1000, H = 700;

function extent(vals: number[]): [number, number] {
  if (!vals.length) return [0, 1];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
}

function groupNames(m: XYModel): string[] {
  return m.groups.length ? m.groups : ["全部"];
}

// 95% 协方差置信椭圆：2x2 对称矩阵特征分解（chi2(2) 0.95 分位数 = 5.991）
export function ellipseScatter(m: XYModel, t: Theme, o: PlotOpts): Rendered {
  const xs = m.pts.map((p) => p.x), ys = m.pts.map((p) => p.y);
  const [x0, x1] = extent(xs), [y0, y1] = extent(ys);
  const padX = (x1 - x0) * 0.12, padY = (y1 - y0) * 0.14;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: x0 - padX, xhi: x1 + padX, ylo: y0 - padY, yhi: y1 + padY, xlabel: o.xLabel || m.xName, ylabel: o.yLabel || m.yName, title: o.title, theme: t });
  let s = f.svg;
  const groups = groupNames(m);
  const centroids: { x: number; y: number }[] = [];
  groups.forEach((_, gi) => {
    const pts = m.pts.filter((p) => p.g === gi);
    if (!pts.length) return;
    const col = t.colors[gi % t.colors.length];
    const gx = pts.map((p) => p.x), gy = pts.map((p) => p.y);
    const mx = mean(gx), my = mean(gy);
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < pts.length; i++) {
      const dx = gx[i] - mx, dy = gy[i] - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    const denom = Math.max(1, pts.length - 1);
    sxx /= denom; syy /= denom; sxy /= denom;
    const half = (sxx + syy) / 2;
    const disc = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    const l1 = Math.max(0, half + disc), l2 = Math.max(0, half - disc);
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ra = Math.sqrt(5.991 * l1), rb = Math.sqrt(5.991 * l2);
    if (pts.length >= 3 && ra > 0) {
      let d = "";
      for (let k = 0; k <= 72; k++) {
        const ang = (k / 72) * 2 * Math.PI;
        const ex = ra * Math.cos(ang), ey = rb * Math.sin(ang);
        const dx = ex * Math.cos(theta) - ey * Math.sin(theta);
        const dy = ex * Math.sin(theta) + ey * Math.cos(theta);
        d += `${k === 0 ? "M" : "L"} ${f.X(mx + dx)} ${f.Y(my + dy)} `;
      }
      s += `<path d="${d}Z" fill="${col}" fill-opacity="0.08" stroke="${col}" stroke-width="2.5" stroke-opacity="0.9"/>`;
    }
    for (const p of pts) s += `<circle cx="${f.X(p.x)}" cy="${f.Y(p.y)}" r="6" fill="${col}" fill-opacity="0.75"/>`;
    const cx = f.X(mx), cy = f.Y(my);
    s += `<line x1="${cx - 11}" y1="${cy}" x2="${cx + 11}" y2="${cy}" stroke="${col}" stroke-width="3.5"/>`;
    s += `<line x1="${cx}" y1="${cy - 11}" x2="${cx}" y2="${cy + 11}" stroke="${col}" stroke-width="3.5"/>`;
    centroids.push({ x: mx, y: my });
  });
  for (let i = 1; i < centroids.length; i++) {
    s += `<line x1="${f.X(centroids[i - 1].x)}" y1="${f.Y(centroids[i - 1].y)}" x2="${f.X(centroids[i].x)}" y2="${f.Y(centroids[i].y)}" stroke="${t.text}" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="7 5"/>`;
  }
  if (groups.length > 1 && o.showLegend) {
    s += legend(groups.map((n, i) => ({ name: `${n} (n=${m.pts.filter((p) => p.g === i).length})`, color: t.colors[i % t.colors.length], shape: "dot" as const })), f.px + 8, f.py - 26, t);
  }
  return { inner: s, w: W, h: H };
}

// 均值阈值四象限散点
export function regionScatter(m: XYModel, t: Theme, o: PlotOpts): Rendered {
  const xs = m.pts.map((p) => p.x), ys = m.pts.map((p) => p.y);
  const [x0, x1] = extent(xs), [y0, y1] = extent(ys);
  const padX = (x1 - x0) * 0.08, padY = (y1 - y0) * 0.1;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: x0 - padX, xhi: x1 + padX, ylo: y0 - padY, yhi: y1 + padY, xlabel: o.xLabel || m.xName, ylabel: o.yLabel || m.yName, title: o.title, theme: t });
  let s = f.svg;
  const mx = xs.length ? mean(xs) : (x0 + x1) / 2;
  const my = ys.length ? mean(ys) : (y0 + y1) / 2;
  const xM = f.X(mx), yM = f.Y(my);
  const right = f.px + f.pw, bottom = f.py + f.ph;
  const quads = [
    { x: f.px, y: f.py, w: xM - f.px, h: yM - f.py, ci: 0, n: m.pts.filter((p) => p.x < mx && p.y >= my).length, tx: f.px + 12, ty: f.py + 22, anchor: "start" },
    { x: xM, y: f.py, w: right - xM, h: yM - f.py, ci: 1, n: m.pts.filter((p) => p.x >= mx && p.y >= my).length, tx: right - 12, ty: f.py + 22, anchor: "end" },
    { x: f.px, y: yM, w: xM - f.px, h: bottom - yM, ci: 2, n: m.pts.filter((p) => p.x < mx && p.y < my).length, tx: f.px + 12, ty: bottom - 12, anchor: "start" },
    { x: xM, y: yM, w: right - xM, h: bottom - yM, ci: 3, n: m.pts.filter((p) => p.x >= mx && p.y < my).length, tx: right - 12, ty: bottom - 12, anchor: "end" },
  ];
  for (const q of quads) {
    if (q.w > 0 && q.h > 0) s += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${t.colors[q.ci % t.colors.length]}" fill-opacity="0.09"/>`;
    s += `<text x="${q.tx}" y="${q.ty}" fill="${t.text}" fill-opacity="0.8" font-size="${t.tickFont.toFixed(1)}" text-anchor="${q.anchor}">n=${q.n}</text>`;
  }
  s += `<line x1="${xM}" y1="${f.py}" x2="${xM}" y2="${bottom}" stroke="${t.text}" stroke-opacity="0.6" stroke-width="2" stroke-dasharray="8 6"/>`;
  s += `<line x1="${f.px}" y1="${yM}" x2="${right}" y2="${yM}" stroke="${t.text}" stroke-opacity="0.6" stroke-width="2" stroke-dasharray="8 6"/>`;
  s += `<text x="${xM + 6}" y="${f.py + 16}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}">${fmt(mx)}</text>`;
  s += `<text x="${right - 8}" y="${yM - 8}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="end">${fmt(my)}</text>`;
  const groups = groupNames(m);
  groups.forEach((_, gi) => {
    const col = t.colors[gi % t.colors.length];
    for (const p of m.pts.filter((p) => p.g === gi)) s += `<circle cx="${f.X(p.x)}" cy="${f.Y(p.y)}" r="6" fill="${col}" fill-opacity="0.75"/>`;
  });
  if (groups.length > 1 && o.showLegend) s += legend(groups.map((n, i) => ({ name: n, color: t.colors[i % t.colors.length], shape: "dot" as const })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

// 主散点 + 密集象限内嵌放大轴
export function insetScatter(m: XYModel, t: Theme, o: PlotOpts): Rendered {
  const xs = m.pts.map((p) => p.x), ys = m.pts.map((p) => p.y);
  const [x0, x1] = extent(xs), [y0, y1] = extent(ys);
  const padX = (x1 - x0) * 0.06, padY = (y1 - y0) * 0.08;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: x0 - padX, xhi: x1 + padX, ylo: y0 - padY, yhi: y1 + padY, xlabel: o.xLabel || m.xName, ylabel: o.yLabel || m.yName, title: o.title, theme: t });
  let s = f.svg;
  const groups = groupNames(m);
  groups.forEach((_, gi) => {
    const col = t.colors[gi % t.colors.length];
    for (const p of m.pts.filter((p) => p.g === gi)) s += `<circle cx="${f.X(p.x)}" cy="${f.Y(p.y)}" r="6" fill="${col}" fill-opacity="0.75"/>`;
  });
  if (m.pts.length >= 2) {
    const r = linreg(xs, ys);
    const fitCol = t.colors[3 % t.colors.length];
    s += `<line x1="${f.X(x0)}" y1="${f.Y(r.intercept + r.slope * x0)}" x2="${f.X(x1)}" y2="${f.Y(r.intercept + r.slope * x1)}" stroke="${fitCol}" stroke-width="3"/>`;
  }
  // 以中位数为中心、IQR 为半宽的四个候选窗口，取点数最多者
  const sx = [...xs].sort((a, b) => a - b), sy = [...ys].sort((a, b) => a - b);
  const medX = xs.length ? quantile(sx, 0.5) : 0, medY = ys.length ? quantile(sy, 0.5) : 0;
  const iqrX = Math.max(quantile(sx, 0.75) - quantile(sx, 0.25), (x1 - x0) * 0.15);
  const iqrY = Math.max(quantile(sy, 0.75) - quantile(sy, 0.25), (y1 - y0) * 0.15);
  let best = { count: -1, xlo: medX, xhi: medX + iqrX, ylo: medY, yhi: medY + iqrY };
  for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
    const bxlo = dx < 0 ? medX - iqrX : medX, bxhi = dx < 0 ? medX : medX + iqrX;
    const bylo = dy < 0 ? medY - iqrY : medY, byhi = dy < 0 ? medY : medY + iqrY;
    const count = m.pts.filter((p) => p.x >= bxlo && p.x <= bxhi && p.y >= bylo && p.y <= byhi).length;
    if (count > best.count) best = { count, xlo: bxlo, xhi: bxhi, ylo: bylo, yhi: byhi };
  }
  best.xlo = Math.max(best.xlo, x0); best.xhi = Math.min(best.xhi, x1);
  best.ylo = Math.max(best.ylo, y0); best.yhi = Math.min(best.yhi, y1);
  if (best.xhi <= best.xlo) { best.xlo = x0; best.xhi = x1; }
  if (best.yhi <= best.ylo) { best.ylo = y0; best.yhi = y1; }
  const rx = f.X(best.xlo), ry = f.Y(best.yhi), rw = f.X(best.xhi) - rx, rh = f.Y(best.ylo) - ry;
  s += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="none" stroke="${t.text}" stroke-width="1.8" stroke-dasharray="5 4"/>`;
  const iw = f.pw * 0.38, ih = f.ph * 0.38;
  const ix = f.px + f.pw - iw - 14, iy = f.py + 14;
  const fromRight = rx + rw / 2 < ix + iw / 2;
  const sx1 = fromRight ? rx + rw : rx, sx2 = fromRight ? rx + rw : rx;
  const tx1 = fromRight ? ix : ix + iw, tx2 = fromRight ? ix : ix + iw;
  s += `<line x1="${sx1}" y1="${ry}" x2="${tx1}" y2="${iy}" stroke="${t.axis}" stroke-opacity="0.55" stroke-width="1.2"/>`;
  s += `<line x1="${sx2}" y1="${ry + rh}" x2="${tx2}" y2="${iy + ih}" stroke="${t.axis}" stroke-opacity="0.55" stroke-width="1.2"/>`;
  const bg = t.bg === "transparent" ? "#ffffff" : t.bg;
  s += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="${bg}" stroke="${t.axis}" stroke-width="1.5"/>`;
  const it: Theme = { ...t, tickFont: t.tickFont * 0.85 };
  const fi = frame({ w: W, h: H, ml: ix + 46, mr: W - (ix + iw - 10), mt: iy + 12, mb: H - (iy + ih - 30), xlo: best.xlo, xhi: best.xhi, ylo: best.ylo, yhi: best.yhi, theme: it, grid: false });
  s += fi.svg;
  groups.forEach((_, gi) => {
    const col = t.colors[gi % t.colors.length];
    for (const p of m.pts.filter((p) => p.g === gi && p.x >= best.xlo && p.x <= best.xhi && p.y >= best.ylo && p.y <= best.yhi)) {
      s += `<circle cx="${fi.X(p.x)}" cy="${fi.Y(p.y)}" r="4.5" fill="${col}" fill-opacity="0.8"/>`;
    }
  });
  if (groups.length > 1 && o.showLegend) s += legend(groups.map((n, i) => ({ name: n, color: t.colors[i % t.colors.length], shape: "dot" as const })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

// 按组分面 small multiples（最多 6 面）
export function facetScatter(m: XYModel, t: Theme, o: PlotOpts): Rendered {
  const groups = groupNames(m).slice(0, 6);
  const n = groups.length;
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const sigOn = o.sig !== "none" && o.sigLegend;
  const top = sigOn ? 76 : 60;
  const L = 80, R = 30, B = 70, gapX = 46, gapY = 54;
  const cellW = (W - L - R - gapX * (cols - 1)) / cols;
  const cellH = (H - top - B - gapY * (rows - 1)) / rows;
  let s = "";
  if (o.title) s += `<text x="${W / 2}" y="${sigOn ? 54 : 34}" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  if (sigOn) s += sigLegendSvg(t, L, 26);
  for (let k = 0; k < n; k++) {
    const pts = m.pts.filter((p) => p.g === k);
    const gx = pts.map((p) => p.x), gy = pts.map((p) => p.y);
    const [fx0, fx1] = extent(gx), [fy0, fy1] = extent(gy);
    const px = (fx1 - fx0) * 0.08, py = (fy1 - fy0) * 0.1;
    const cx = L + (k % cols) * (cellW + gapX), cy = top + Math.floor(k / cols) * (cellH + gapY);
    const f = frame({
      w: W, h: H, ml: cx + 52, mr: W - (cx + cellW - 8), mt: cy + 30, mb: H - (cy + cellH - 34),
      xlo: fx0 - px, xhi: fx1 + px, ylo: fy0 - py, yhi: fy1 + py,
      xticks: niceTicks(fx0 - px, fx1 + px, 3).ticks, yticks: niceTicks(fy0 - py, fy1 + py, 4).ticks,
      theme: t,
    });
    s += f.svg;
    s += `<text x="${cx + 52}" y="${cy + 16}" fill="${t.text}" font-size="${t.labelFont.toFixed(1)}" font-weight="bold">${esc(groups[k])}</text>`;
    const col = t.colors[k % t.colors.length];
    if (pts.length >= 2) {
      const r = linreg(gx, gy);
      s += `<line x1="${f.X(fx0)}" y1="${f.Y(r.intercept + r.slope * fx0)}" x2="${f.X(fx1)}" y2="${f.Y(r.intercept + r.slope * fx1)}" stroke="${col}" stroke-width="2.5"/>`;
    }
    for (const p of pts) s += `<circle cx="${f.X(p.x)}" cy="${f.Y(p.y)}" r="5" fill="${col}" fill-opacity="0.75"/>`;
    const pr = pearson(gx, gy);
    s += `<text x="${f.px + 6}" y="${f.py + 16}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}">r=${fmt(pr.r, 2)}, P=${esc(fmtP(pr.p))}</text>`;
  }
  if (t.showAxisLabels) {
    s += `<text x="${L + (W - L - R) / 2}" y="${H - 16}" fill="${t.text}" font-size="${t.labelFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.xLabel || m.xName)}</text>`;
    const ylx = Math.max(20, t.labelFont * 0.8 + 2);
    s += `<text x="${ylx}" y="${top + (H - top - B) / 2}" fill="${t.text}" font-size="${t.labelFont.toFixed(1)}" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${ylx} ${top + (H - top - B) / 2})">${esc(o.yLabel || m.yName)}</text>`;
  }
  return { inner: s, w: W, h: H };
}

function histCounts(vals: number[], lo: number, hi: number, bins: number): number[] {
  const c = new Array<number>(bins).fill(0);
  const span = hi - lo || 1;
  for (const v of vals) {
    let k = Math.floor(((v - lo) / span) * bins);
    if (k < 0) k = 0;
    if (k >= bins) k = bins - 1;
    c[k]++;
  }
  return c;
}

// 主散点 + 顶部/右侧边际直方图
export function margScatter(m: XYModel, t: Theme, o: PlotOpts): Rendered {
  const xs = m.pts.map((p) => p.x), ys = m.pts.map((p) => p.y);
  const [x0, x1] = extent(xs), [y0, y1] = extent(ys);
  const padX = (x1 - x0) * 0.06, padY = (y1 - y0) * 0.08;
  const xlo = x0 - padX, xhi = x1 + padX, ylo = y0 - padY, yhi = y1 + padY;
  const f = frame({ w: W, h: H, ml: 95, mr: 180, mt: 180, mb: 85, xlo, xhi, ylo, yhi, xlabel: o.xLabel || m.xName, ylabel: o.yLabel || m.yName, theme: t });
  let s = f.svg;
  if (o.title) s += `<text x="${f.px + f.pw / 2}" y="36" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  const groups = groupNames(m);
  groups.forEach((_, gi) => {
    const col = t.colors[gi % t.colors.length];
    for (const p of m.pts.filter((p) => p.g === gi)) s += `<circle cx="${f.X(p.x)}" cy="${f.Y(p.y)}" r="6" fill="${col}" fill-opacity="0.75"/>`;
  });
  if (m.pts.length >= 2) {
    const r = linreg(xs, ys);
    const fitCol = t.colors[3 % t.colors.length];
    s += `<line x1="${f.X(x0)}" y1="${f.Y(r.intercept + r.slope * x0)}" x2="${f.X(x1)}" y2="${f.Y(r.intercept + r.slope * x1)}" stroke="${fitCol}" stroke-width="3"/>`;
  }
  const bins = 12;
  const histH = f.ph * 0.18, histW = f.pw * 0.18;
  const histCol = t.colors[0 % t.colors.length];
  // 顶部 X 分布
  const cx = histCounts(xs, xlo, xhi, bins);
  const cxMax = Math.max(...cx, 1);
  const baseY = f.py - 12, bw = f.pw / bins;
  s += `<line x1="${f.px}" y1="${baseY}" x2="${f.px + f.pw}" y2="${baseY}" stroke="${t.axis}" stroke-width="2"/>`;
  cx.forEach((c, i) => {
    const h = (c / cxMax) * histH;
    if (h > 0) s += `<rect x="${f.px + i * bw + 1}" y="${baseY - h}" width="${bw - 2}" height="${h}" fill="${histCol}" fill-opacity="0.5" stroke="${histCol}" stroke-width="1"/>`;
  });
  // 右侧 Y 分布
  const cy = histCounts(ys, ylo, yhi, bins);
  const cyMax = Math.max(...cy, 1);
  const baseX = f.px + f.pw + 12, bh = f.ph / bins;
  s += `<line x1="${baseX}" y1="${f.py}" x2="${baseX}" y2="${f.py + f.ph}" stroke="${t.axis}" stroke-width="2"/>`;
  cy.forEach((c, i) => {
    const w = (c / cyMax) * histW;
    if (w > 0) s += `<rect x="${baseX}" y="${f.py + f.ph - (i + 1) * bh + 1}" width="${w}" height="${bh - 2}" fill="${histCol}" fill-opacity="0.5" stroke="${histCol}" stroke-width="1"/>`;
  });
  if (groups.length > 1 && o.showLegend) s += legend(groups.map((n, i) => ({ name: n, color: t.colors[i % t.colors.length], shape: "dot" as const })), f.px, 62, t);
  return { inner: s, w: W, h: H };
}

// 气泡图：半径 ∝ sqrt(s)，最大半径 ≈ 26
export function bubble(m: XYModel, t: Theme, o: PlotOpts): Rendered {
  const xs = m.pts.map((p) => p.x), ys = m.pts.map((p) => p.y);
  const [x0, x1] = extent(xs), [y0, y1] = extent(ys);
  const padX = (x1 - x0) * 0.1, padY = (y1 - y0) * 0.12;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: x0 - padX, xhi: x1 + padX, ylo: y0 - padY, yhi: y1 + padY, xlabel: o.xLabel || m.xName, ylabel: o.yLabel || m.yName, title: o.title, theme: t });
  let s = f.svg;
  const sMax = Math.max(...m.pts.map((p) => Math.max(0, p.s ?? 1)), 1e-9);
  const radius = (v: number) => Math.max(2.5, 26 * Math.sqrt(Math.max(0, v) / sMax));
  const groups = groupNames(m);
  const halo = t.bg === "transparent" ? "#ffffff" : t.bg;
  groups.forEach((_, gi) => {
    const col = t.colors[gi % t.colors.length];
    for (const p of m.pts.filter((p) => p.g === gi)) {
      const r = radius(p.s ?? 1);
      const cx = f.X(p.x), cy = f.Y(p.y);
      s += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="${col}" fill-opacity="0.5" stroke="${col}" stroke-width="2"/>`;
      if (p.label && r > 14) {
        const inside = textWidth(p.label, t.tickFont) <= 2 * r - 6;
        if (inside) {
          s += `<text x="${cx}" y="${cy}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="${halo}" stroke-width="3">${esc(p.label)}</text>`;
        } else {
          s += `<text x="${cx + r + 5}" y="${cy}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" dominant-baseline="middle">${esc(p.label)}</text>`;
        }
      }
    }
  });
  // 右上尺寸图例：3 个示例气泡
  const boxW = 140, boxH = 196, bx = f.px + f.pw - boxW - 12, by = f.py + 12;
  s += `<rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}" fill="${halo}" fill-opacity="0.92" stroke="${t.axis}" stroke-opacity="0.5" stroke-width="1"/>`;
  s += `<text x="${bx + 12}" y="${by + 22}" fill="${t.text}" font-size="${t.legendFont.toFixed(1)}" font-weight="bold">Size</text>`;
  const legendCol = t.colors[0 % t.colors.length];
  [sMax, sMax / 2, sMax / 4].forEach((v, i) => {
    const r = radius(v);
    const cy = by + 52 + i * 50;
    s += `<circle cx="${bx + 38}" cy="${cy}" r="${r.toFixed(2)}" fill="${legendCol}" fill-opacity="0.5" stroke="${legendCol}" stroke-width="2"/>`;
    s += `<text x="${bx + 74}" y="${cy}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" dominant-baseline="middle">${fmt(v, 2)}</text>`;
  });
  if (groups.length > 1 && o.showLegend) s += legend(groups.map((n, i) => ({ name: n, color: t.colors[i % t.colors.length], shape: "dot" as const })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}