import { Theme, esc, frame, legend, sigLegendSvg, textWidth } from "@/lib/chartcore";
import { RocModel, PairModel, ForestModel, SurvivalModel, PlotOpts, Rendered } from "@/lib/chartmodel";
import { mean, sd, tTestP, fmt, fmtP } from "@/lib/stats";

const W = 1000, H = 700;

// ---------- ROC / AUC ----------

function rocPoints(items: { score: number; label: number }[]): { fpr: number; tpr: number }[] {
  const P = items.filter((i) => i.label === 1).length;
  const N = items.length - P;
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const pts = [{ fpr: 0, tpr: 0 }];
  let tp = 0, fp = 0, i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
    for (let k = i; k < j; k++) {
      if (sorted[k].label === 1) tp++;
      else fp++;
    }
    pts.push({ fpr: N > 0 ? fp / N : 0, tpr: P > 0 ? tp / P : 0 });
    i = j;
  }
  return pts;
}

function trapAuc(pts: { fpr: number; tpr: number }[]): number {
  let a = 0;
  for (let i = 1; i < pts.length; i++) a += (pts[i].fpr - pts[i - 1].fpr) * (pts[i].tpr + pts[i - 1].tpr) / 2;
  return a;
}

export function rocCurve(m: RocModel, t: Theme, o: PlotOpts): Rendered {
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: 0, xhi: 1, ylo: 0, yhi: 1, xticks: ticks, yticks: ticks, xlabel: o.xLabel || "False positive rate", ylabel: o.yLabel || "True positive rate", title: o.title, theme: t });
  let s = f.svg;
  s += `<line x1="${f.X(0)}" y1="${f.Y(0)}" x2="${f.X(1)}" y2="${f.Y(1)}" stroke="${t.text}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="8 6"/>`;
  const groups = m.groups.length ? m.groups : ["全部"];
  const aucs: number[] = [];
  groups.forEach((_, gi) => {
    const items = m.items.filter((it) => it.g === gi);
    const pts = rocPoints(items);
    aucs.push(trapAuc(pts));
    const col = t.colors[gi % t.colors.length];
    let d = `M ${f.X(0)} ${f.Y(0)} `;
    for (let i = 1; i < pts.length; i++) {
      d += `L ${f.X(pts[i].fpr)} ${f.Y(pts[i - 1].tpr)} L ${f.X(pts[i].fpr)} ${f.Y(pts[i].tpr)} `;
    }
    s += `<path d="${d}L ${f.X(1)} ${f.Y(0)} Z" fill="${col}" fill-opacity="0.06" stroke="none"/>`;
    s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="3"/>`;
  });
  if (o.showLegend) s += legend(groups.map((n, i) => ({ name: `${n} (AUC=${fmt(aucs[i], 3)})`, color: t.colors[i % t.colors.length], shape: "line" as const })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

// ---------- 配对坡度图 ----------

export function slopeChart(m: PairModel, t: Theme, o: PlotOpts): Rendered {
  const n = Math.min(m.a.length, m.b.length, m.labels.length);
  const a = m.a.slice(0, n), b = m.b.slice(0, n);
  const all = [...a, ...b];
  const lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1;
  const pad = (hi - lo || 1) * 0.1;
  const sigOn = o.sig !== "none" && o.sigLegend;
  const f = frame({ w: W, h: H, ml: 260, mr: 200, mt: sigOn ? 76 : 60, mb: 130, xlo: 0, xhi: 1, ylo: lo - pad, yhi: hi + pad, xcat: [{ at: 0, label: m.aName }, { at: 1, label: m.bName }], ylabel: o.yLabel || "Value", title: o.title, theme: t });
  let s = f.svg;
  if (sigOn) s += sigLegendSvg(t, 16, 26);
  const upCol = t.colors[2 % t.colors.length], downCol = t.colors[0 % t.colors.length], flatCol = "#9E9E9E";
  const leftLb: { y: number; s: string }[] = [], rightLb: { y: number; s: string }[] = [];
  for (let i = 0; i < n; i++) {
    const col = b[i] > a[i] ? upCol : b[i] < a[i] ? downCol : flatCol;
    const x1 = f.X(0), x2 = f.X(1), y1 = f.Y(a[i]), y2 = f.Y(b[i]);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2.5" stroke-opacity="0.85"/>`;
    s += `<circle cx="${x1}" cy="${y1}" r="5.5" fill="${col}"/>`;
    s += `<circle cx="${x2}" cy="${y2}" r="5.5" fill="${col}"/>`;
    leftLb.push({ y: y1, s: m.labels[i] ?? "" });
    rightLb.push({ y: y2, s: m.labels[i] ?? "" });
  }
  const stagger = (arr: { y: number; s: string }[]) => {
    arr.sort((p, q) => p.y - q.y);
    const gap = t.tickFont * 1.12;
    const top = f.py + 53;
    if (arr.length) arr[0].y = Math.max(arr[0].y, top);
    for (let i = 1; i < arr.length; i++) arr[i].y = Math.max(arr[i].y, arr[i - 1].y + gap);
    const over = arr.length ? arr[arr.length - 1].y - (f.py + f.ph - 10) : 0;
    if (over > 0) for (const p of arr) p.y -= over;
    for (let i = arr.length - 2; i >= 0; i--) arr[i].y = Math.min(arr[i].y, arr[i + 1].y - gap);
    if (arr.length && arr[0].y < top) { const d = top - arr[0].y; for (const p of arr) p.y += d; }
  };
  stagger(leftLb); stagger(rightLb);
  for (const p of leftLb) s += `<text x="${f.px - 70}" y="${p.y.toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(p.s)}</text>`;
  for (const p of rightLb) s += `<text x="${W - 16}" y="${p.y.toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(p.s)}</text>`;
  // 配对 t 检验：d = a - b，df = n - 1（复用 stats.tTestP）
  const d = a.map((v, i) => v - b[i]);
  const md = d.length ? mean(d) : NaN;
  const sdd = sd(d);
  const tStat = n > 1 && sdd > 0 ? md / (sdd / Math.sqrt(n)) : NaN;
  const p = tTestP(tStat, n - 1);
  const meanChange = d.length ? -md : NaN;
  s += `<text x="${f.px + f.pw / 2}" y="${f.py + f.ph + 66}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" font-weight="bold" text-anchor="middle">Mean change = ${fmt(meanChange)} · paired t P = ${esc(fmtP(p))}</text>`;
  if (o.showLegend) s += legend([{ name: "Increase", color: upCol, shape: "line" as const }, { name: "Decrease", color: downCol, shape: "line" as const }, { name: "No change", color: flatCol, shape: "line" as const }], f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

// ---------- 森林图 ----------

export function forestPlot(m: ForestModel, t: Theme, o: PlotOpts): Rendered {
  const items = m.items;
  const n = items.length;
  const allPositive = n > 0 && items.every((it) => it.lo > 0);
  const ref = allPositive ? 1 : 0;
  const wMax = Math.max(...items.map((it) => it.w), 1e-9);
  const wSum = items.reduce((acc, it) => acc + it.w, 0);
  const pest = wSum > 0 ? items.reduce((acc, it) => acc + it.w * it.est, 0) / wSum : 0;
  // 加权 SE 近似：SE_i = (hi-lo)/3.92，pooled SE = sqrt(Σ(w_i·SE_i)²)/Σw_i
  const pse = wSum > 0 ? Math.sqrt(items.reduce((acc, it) => acc + (it.w * (it.hi - it.lo) / 3.92) ** 2, 0)) / wSum : 0;
  const plo = pest - 1.96 * pse, phi = pest + 1.96 * pse;
  const lows = [...items.map((it) => it.lo), plo, ref];
  const highs = [...items.map((it) => it.hi), phi, ref];
  const x0 = Math.min(...lows), x1 = Math.max(...highs);
  const pad = (x1 - x0 || 1) * 0.08;
  const lMaxU = Math.max(...items.map((it) => textWidth(it.label, 1)), textWidth("Pooled (weighted)", 1), 1);
  const lFsMin = t.tickFont * 0.8;
  const ml = Math.min(420, Math.max(220, lMaxU * lFsMin + 26));
  const f = frame({ w: W, h: H, ml, mr: 300, mt: 60, mb: 85, xlo: x0 - pad, xhi: x1 + pad, ylo: 0, yhi: n + 1, yticks: [], xlabel: (o.xLabel || "Effect size") + (allPositive ? " (reference = 1)" : ""), title: o.title, theme: t });
  let s = f.svg;
  s += `<line x1="${f.X(ref)}" y1="${f.py}" x2="${f.X(ref)}" y2="${f.py + f.ph}" stroke="${t.text}" stroke-opacity="0.6" stroke-width="2" stroke-dasharray="7 5"/>`;
  const rx = f.px + f.pw + 18;
  const rStrings = items.map((it) => `${fmt(it.est, 2)} [${fmt(it.lo, 2)}, ${fmt(it.hi, 2)}]`);
  rStrings.push(`${fmt(pest, 2)} [${fmt(plo, 2)}, ${fmt(phi, 2)}]`);
  const rFs = Math.min(t.tickFont, (W - 14 - rx) / Math.max(...rStrings.map((str) => textWidth(str, 1)), 1));
  const hFs = Math.min(t.legendFont, (W - 14 - rx) / textWidth("Estimate [95% CI]", 1));
  const lStrings = [...items.map((it) => it.label), "Pooled (weighted)"];
  const lFs = Math.max(lFsMin, Math.min(t.tickFont, (f.px - 26) / Math.max(...lStrings.map((str) => textWidth(str, 1)), 1)));
  const fitLabel = (str: string) => {
    const maxU = (f.px - 26) / lFs;
    if (textWidth(str, 1) <= maxU) return str;
    let out = str;
    while (out.length > 1 && textWidth(out + "…", 1) > maxU) out = out.slice(0, -1);
    return out + "…";
  };
  s += `<text x="${f.px - 14}" y="${f.py - 10}" fill="${t.text}" font-size="${Math.min(t.legendFont, (f.px - 26) / textWidth("Study", 1)).toFixed(1)}" font-weight="bold" text-anchor="end">Study</text>`;
  s += `<text x="${rx}" y="${f.py - 10}" fill="${t.text}" font-size="${hFs.toFixed(1)}" font-weight="bold">Estimate [95% CI]</text>`;
  const rowH = f.ph / (n + 1);
  items.forEach((it, i) => {
    const y = f.Y(n - i);
    const col = t.colors[i % t.colors.length];
    s += `<line x1="${f.X(it.lo)}" y1="${y}" x2="${f.X(it.hi)}" y2="${y}" stroke="${col}" stroke-width="2.5"/>`;
    s += `<line x1="${f.X(it.lo)}" y1="${y - 7}" x2="${f.X(it.lo)}" y2="${y + 7}" stroke="${col}" stroke-width="2.5"/>`;
    s += `<line x1="${f.X(it.hi)}" y1="${y - 7}" x2="${f.X(it.hi)}" y2="${y + 7}" stroke="${col}" stroke-width="2.5"/>`;
    const side = Math.max(7, 24 * Math.sqrt(Math.max(0, it.w) / wMax));
    s += `<rect x="${f.X(it.est) - side / 2}" y="${y - side / 2}" width="${side}" height="${side}" fill="${col}"/>`;
    s += `<text x="${f.px - 14}" y="${y}" fill="${t.text}" font-size="${lFs.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(fitLabel(it.label))}</text>`;
    s += `<text x="${rx}" y="${y}" fill="${t.text}" font-size="${rFs.toFixed(1)}" dominant-baseline="middle">${fmt(it.est, 2)} [${fmt(it.lo, 2)}, ${fmt(it.hi, 2)}]</text>`;
  });
  // 底部合并菱形
  const yp = f.Y(0);
  const dh = Math.min(14, rowH * 0.3);
  const pcol = t.colors[3 % t.colors.length];
  s += `<line x1="${f.px}" y1="${f.Y(0.5)}" x2="${f.px + f.pw}" y2="${f.Y(0.5)}" stroke="${t.axis}" stroke-opacity="0.4" stroke-width="1.5" stroke-dasharray="4 4"/>`;
  s += `<path d="M ${f.X(plo)} ${yp} L ${f.X(pest)} ${yp - dh} L ${f.X(phi)} ${yp} L ${f.X(pest)} ${yp + dh} Z" fill="${pcol}"/>`;
  s += `<text x="${f.px - 14}" y="${yp}" fill="${t.text}" font-size="${lFs.toFixed(1)}" font-weight="bold" text-anchor="end" dominant-baseline="middle">Pooled (weighted)</text>`;
  s += `<text x="${rx}" y="${yp}" fill="${t.text}" font-size="${rFs.toFixed(1)}" dominant-baseline="middle">${fmt(pest, 2)} [${fmt(plo, 2)}, ${fmt(phi, 2)}]</text>`;
  return { inner: s, w: W, h: H };
}

// ---------- Kaplan-Meier / log-rank ----------

function kmSteps(items: { time: number; status: number }[]): { steps: { t: number; s: number }[]; cens: { t: number; s: number }[] } {
  const sorted = [...items].sort((a, b) => a.time - b.time);
  let s = 1, atRisk = sorted.length;
  const steps = [{ t: 0, s: 1 }];
  const cens: { t: number; s: number }[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].time === sorted[i].time) j++;
    let d = 0, c = 0;
    for (let k = i; k < j; k++) {
      if (sorted[k].status === 1) d++;
      else c++;
    }
    const time = sorted[i].time;
    if (d > 0 && atRisk > 0) {
      s *= 1 - d / atRisk;
      steps.push({ t: time, s });
    }
    if (c > 0) cens.push({ t: time, s });
    atRisk -= j - i;
    i = j;
  }
  return { steps, cens };
}

function lnGamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// 正则化上不完全伽马 Q(a,x)，用于卡方分布 P 值
function gammaQ(a: number, x: number): number {
  if (a <= 0 || x < 0) return NaN;
  if (x === 0) return 1;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let k = 1; k < 300; k++) {
      ap++;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 300; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

function invertMatrix(mat: number[][]): number[][] | null {
  const k = mat.length;
  const A = mat.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    const pv = A[c][c];
    for (let j = 0; j < 2 * k; j++) A[c][j] /= pv;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const fct = A[r][c];
      for (let j = 0; j < 2 * k; j++) A[r][j] -= fct * A[c][j];
    }
  }
  return A.map((row) => row.slice(k));
}

// log-rank（O-E 方差法，k-1 维协方差矩阵求逆）
function logRankP(groups: { time: number; status: number }[][]): number {
  const k = groups.length;
  if (k < 2) return NaN;
  const dim = k - 1;
  const eventTimes = [...new Set(groups.flat().filter((it) => it.status === 1).map((it) => it.time))].sort((a, b) => a - b);
  const oe = new Array<number>(dim).fill(0);
  const V = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  for (const t of eventTimes) {
    const nI = groups.map((g) => g.filter((it) => it.time >= t).length);
    const dI = groups.map((g) => g.filter((it) => it.time === t && it.status === 1).length);
    const nTot = nI.reduce((acc, v) => acc + v, 0);
    const dTot = dI.reduce((acc, v) => acc + v, 0);
    if (nTot === 0 || dTot === 0) continue;
    for (let i = 0; i < dim; i++) oe[i] += dI[i] - (dTot * nI[i]) / nTot;
    if (nTot > 1) {
      const fct = (dTot * (nTot - dTot)) / (nTot - 1);
      for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) {
        V[i][j] += fct * (nI[i] / nTot) * ((i === j ? 1 : 0) - nI[j] / nTot);
      }
    }
  }
  const inv = invertMatrix(V);
  if (!inv) return NaN;
  let chi = 0;
  for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) chi += oe[i] * inv[i][j] * oe[j];
  if (!isFinite(chi) || chi < 0) return NaN;
  return gammaQ(dim / 2, chi / 2);
}

export function kmCurve(m: SurvivalModel, t: Theme, o: PlotOpts): Rendered {
  const groups = m.groups.length ? m.groups : ["全部"];
  const byGroup = groups.map((_, gi) => m.items.filter((it) => it.g === gi));
  const maxTime = Math.max(...m.items.map((it) => it.time), 1);
  const sigOn = o.sig !== "none" && o.sigLegend;
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: sigOn ? 76 : 60, mb: 85, xlo: 0, xhi: maxTime * 1.05, ylo: 0, yhi: 1, yticks: ticks, xlabel: o.xLabel || "Time", ylabel: o.yLabel || "Survival probability", title: o.title, theme: t });
  let s = f.svg;
  if (sigOn) s += sigLegendSvg(t, f.px, 26);
  const legendItems: { name: string; color: string; shape: "line" }[] = [];
  groups.forEach((gname, gi) => {
    const items = byGroup[gi];
    const { steps, cens } = kmSteps(items);
    const col = t.colors[gi % t.colors.length];
    let d = `M ${f.X(steps[0].t)} ${f.Y(steps[0].s)} `;
    for (let i = 1; i < steps.length; i++) {
      d += `L ${f.X(steps[i].t)} ${f.Y(steps[i - 1].s)} L ${f.X(steps[i].t)} ${f.Y(steps[i].s)} `;
    }
    d += `L ${f.X(maxTime * 1.05)} ${f.Y(steps[steps.length - 1].s)} `;
    s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="3"/>`;
    for (const c of cens) {
      s += `<line x1="${f.X(c.t)}" y1="${f.Y(c.s) - 6}" x2="${f.X(c.t)}" y2="${f.Y(c.s) + 6}" stroke="${col}" stroke-width="2"/>`;
    }
    const events = items.filter((it) => it.status === 1).length;
    legendItems.push({ name: `${gname} (n=${items.length}, events=${events})`, color: col, shape: "line" });
  });
  if (groups.length >= 2) {
    const p = logRankP(byGroup);
    s += `<text x="${f.px + f.pw - 10}" y="${f.py + 24}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="end">Log-rank P = ${esc(fmtP(p))}</text>`;
  }
  if (o.showLegend) {
    const lx = f.px + 8;
    const sumLen = legendItems.reduce((a, it) => a + it.name.length, 0);
    const lfs = Math.min(t.legendFont, (W - 14 - lx - 58 * legendItems.length) / Math.max(1, 0.62 * sumLen));
    s += legend(legendItems, lx, f.py - 26, { ...t, legendFont: lfs });
  }
  return { inner: s, w: W, h: H };
}