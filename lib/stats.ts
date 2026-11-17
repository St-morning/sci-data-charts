export interface Descriptives {
  n: number;
  mean: number;
  sd: number;
  sem: number;
  median: number;
  min: number;
  max: number;
  ci95: [number, number];
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

export function sd(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function describe(xs: number[]): Descriptives {
  const sorted = [...xs].sort((a, b) => a - b);
  const m = mean(xs);
  const s = sd(xs);
  const n = xs.length;
  const tCrit = n > 1 ? tQuantile975(n - 1) : NaN;
  const half = n > 1 ? (tCrit * s) / Math.sqrt(n) : NaN;
  return {
    n,
    mean: m,
    sd: s,
    sem: n > 0 ? s / Math.sqrt(n) : NaN,
    median: quantile(sorted, 0.5),
    min: sorted[0] ?? NaN,
    max: sorted[n - 1] ?? NaN,
    ci95: [m - half, m + half],
  };
}

// 正则化不完全贝塔函数（Lentz 连分式），用于 t / F 分布 p 值
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
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

export function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function tTestP(t: number, df: number): number {
  if (!isFinite(t) || df <= 0) return NaN;
  return ibeta(df / 2, 0.5, df / (df + t * t));
}

export function fTestP(F: number, df1: number, df2: number): number {
  if (!isFinite(F) || F < 0 || df1 <= 0 || df2 <= 0) return NaN;
  if (F === 0) return 1;
  return ibeta(df2 / 2, df1 / 2, df2 / (df2 + df1 * F));
}

// t 分布 0.975 分位数近似（用于 95% CI），df 小时查表，大时用渐近展开
const T_TABLE: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
  8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145,
  15: 2.131, 16: 2.12, 17: 2.11, 18: 2.101, 19: 2.093, 20: 2.086, 25: 2.06,
  30: 2.042, 40: 2.021, 60: 2.0, 120: 1.98,
};
export function tQuantile975(df: number): number {
  if (T_TABLE[df]) return T_TABLE[df];
  const keys = Object.keys(T_TABLE).map(Number).sort((a, b) => a - b);
  if (df < keys[0]) return T_TABLE[1];
  if (df > 120) return 1.96 + 2.4 / df;
  let lo = keys[0];
  let hi = keys[keys.length - 1];
  for (const k of keys) {
    if (k <= df) lo = k;
    if (k >= df) { hi = k; break; }
  }
  if (lo === hi) return T_TABLE[lo];
  const f = (df - lo) / (hi - lo);
  return T_TABLE[lo] + (T_TABLE[hi] - T_TABLE[lo]) * f;
}

export interface TTestResult {
  kind: "welch";
  t: number;
  df: number;
  p: number;
  meanDiff: number;
  ci95: [number, number];
  cohensD: number;
}

export function welchT(a: number[], b: number[]): TTestResult {
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a);
  const vb = variance(b);
  const na = a.length;
  const nb = b.length;
  const se = Math.sqrt(va / na + vb / nb);
  const t = se > 0 ? (ma - mb) / se : NaN;
  const df =
    se > 0
      ? (va / na + vb / nb) ** 2 /
        ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1))
      : NaN;
  const pooled = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2));
  const tc = tQuantile975(Math.max(1, Math.round(df)));
  return {
    kind: "welch",
    t,
    df,
    p: tTestP(t, df),
    meanDiff: ma - mb,
    ci95: [ma - mb - tc * se, ma - mb + tc * se],
    cohensD: pooled > 0 ? (ma - mb) / pooled : NaN,
  };
}

export interface AnovaResult {
  kind: "anova";
  F: number;
  df1: number;
  df2: number;
  p: number;
  etaSq: number;
}

export function oneWayAnova(groups: number[][]): AnovaResult {
  const all = groups.flat();
  const gm = mean(all);
  const k = groups.length;
  const N = all.length;
  let ssBetween = 0;
  let ssWithin = 0;
  for (const g of groups) {
    const m = mean(g);
    ssBetween += g.length * (m - gm) ** 2;
    for (const x of g) ssWithin += (x - m) ** 2;
  }
  const df1 = k - 1;
  const df2 = N - k;
  const F = df2 > 0 && ssWithin > 0 ? (ssBetween / df1) / (ssWithin / df2) : NaN;
  return {
    kind: "anova",
    F,
    df1,
    df2,
    p: fTestP(F, df1, df2),
    etaSq: ssBetween + ssWithin > 0 ? ssBetween / (ssBetween + ssWithin) : NaN,
  };
}

export function outlierIndicesIQR(xs: number[]): number[] {
  if (xs.length < 4) return [];
  const sorted = [...xs].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return xs.map((x, i) => (x < lo || x > hi ? i : -1)).filter((i) => i >= 0);
}

export function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const idx = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}

export interface BatchDecomposition {
  nSamples: number;
  nBatches: number;
  msSample: number;
  msBatch: number;
  msError: number;
  fSample: number;
  pSample: number;
  fBatch: number;
  pBatch: number;
  varSample: number;
  varBatch: number;
  varError: number;
  shareSample: number;
  shareBatch: number;
  shareError: number;
  icc: number;
}

// 无重复双因素方差分解：样品 × 批次。要求完整矩阵（缺失值需先剔除该样品）
export function decomposeBatches(matrix: number[][]): BatchDecomposition | null {
  const s = matrix.length;
  const b = matrix[0]?.length ?? 0;
  if (s < 2 || b < 2) return null;
  const gm = mean(matrix.flat());
  const rowMeans = matrix.map((r) => mean(r));
  const colMeans = Array.from({ length: b }, (_, j) => mean(matrix.map((r) => r[j])));
  let ssTotal = 0;
  let ssRow = 0;
  let ssCol = 0;
  for (let j = 0; j < b; j++) ssCol += s * (colMeans[j] - gm) ** 2;
  for (let i = 0; i < s; i++) {
    ssRow += b * (rowMeans[i] - gm) ** 2;
    for (let j = 0; j < b; j++) {
      ssTotal += (matrix[i][j] - gm) ** 2;
    }
  }
  const ssErr = Math.max(0, ssTotal - ssRow - ssCol);
  const dfRow = s - 1;
  const dfCol = b - 1;
  const dfErr = (s - 1) * (b - 1);
  const msRow = ssRow / dfRow;
  const msCol = ssCol / dfCol;
  const msErr = dfErr > 0 ? ssErr / dfErr : 0;
  const fSample = msErr > 0 ? msRow / msErr : NaN;
  const fBatch = msErr > 0 ? msCol / msErr : NaN;
  const varSample = Math.max(0, (msRow - msErr) / b);
  const varBatch = Math.max(0, (msCol - msErr) / s);
  const varError = msErr;
  const totalVar = varSample + varBatch + varError;
  const icc = msRow + (b - 1) * msErr > 0 ? (msRow - msErr) / (msRow + (b - 1) * msErr) : NaN;
  return {
    nSamples: s,
    nBatches: b,
    msSample: msRow,
    msBatch: msCol,
    msError: msErr,
    fSample,
    pSample: fTestP(fSample, dfRow, dfErr),
    fBatch,
    pBatch: fTestP(fBatch, dfCol, dfErr),
    varSample,
    varBatch,
    varError,
    shareSample: totalVar > 0 ? varSample / totalVar : NaN,
    shareBatch: totalVar > 0 ? varBatch / totalVar : NaN,
    shareError: totalVar > 0 ? varError / totalVar : NaN,
    icc,
  };
}

export function fmt(x: number, sig = 3): string {
  if (!isFinite(x)) return "—";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs >= 1e6 || abs < 1e-4) return x.toExponential(Math.max(0, sig - 1));
  const digits = Math.max(0, sig - 1 - Math.floor(Math.log10(abs)));
  return x.toFixed(Math.min(digits, 6));
}

export function fmtP(p: number): string {
  if (!isFinite(p)) return "—";
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

export function sigFigs(s: string): number {
  const m = s.replace(/[+\-]/g, "").match(/^0*(\d[\d,]*)(?:\.(\d*))?(?:[eE].*)?$/);
  if (!m) return 0;
  const int = m[1].replace(/,/g, "").replace(/^0+/, "");
  const dec = m[2] ?? "";
  if (int.length > 0) return int.length + dec.length;
  const lead = dec.match(/^0*/)?.[0].length ?? 0;
  return dec.length - lead;
}
export function pearson(a: number[], b: number[]): { r: number; p: number; n: number } {
  const n = Math.min(a.length, b.length);
  if (n < 3) return { r: NaN, p: NaN, n };
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let sab = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; sa += da * da; sb += db * db;
  }
  if (sa === 0 || sb === 0) return { r: NaN, p: NaN, n };
  const r = sab / Math.sqrt(sa * sb);
  const t = Math.abs(r) * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
  return { r, p: tTestP(t, n - 2), n };
}

export interface LinReg { slope: number; intercept: number; r2: number; n: number }

export function linreg(xs: number[], ys: number[]): LinReg {
  const n = Math.min(xs.length, ys.length);
  const mx = mean(xs.slice(0, n)), my = mean(ys.slice(0, n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, intercept, r2, n };
}

export interface Poly2 { a0: number; a1: number; a2: number; r2: number }

export function poly2(xs: number[], ys: number[]): Poly2 {
  const n = xs.length;
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i], x2 = x * x;
    s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2;
    t0 += y; t1 += x * y; t2 += x2 * y;
  }
  const M = [[n, s1, s2, t0], [s1, s2, s3, t1], [s2, s3, s4, t2]];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return { a0: mean(ys), a1: 0, a2: 0, r2: 0 };
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  const a0 = M[0][3] / M[0][0], a1 = M[1][3] / M[1][1], a2 = M[2][3] / M[2][2];
  const my = mean(ys);
  let ssr = 0, sst = 0;
  for (let i = 0; i < n; i++) {
    const pred = a0 + a1 * xs[i] + a2 * xs[i] * xs[i];
    ssr += (ys[i] - pred) ** 2;
    sst += (ys[i] - my) ** 2;
  }
  return { a0, a1, a2, r2: sst > 0 ? 1 - ssr / sst : 0 };
}

export function skewness(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const m = mean(xs), s = sd(xs);
  if (s === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += ((x - m) / s) ** 3;
  return (n / ((n - 1) * (n - 2))) * sum;
}

export function stars(p: number): string {
  if (!isFinite(p)) return "—";
  if (p < 0.0001) return "****";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
}
