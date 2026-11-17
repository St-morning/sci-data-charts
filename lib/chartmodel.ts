export interface PlotOpts {
  title: string;
  xLabel: string;
  yLabel: string;
  showAxisLabels: boolean;
  showError: boolean;
  points: boolean;
  bars: boolean;
  error: "sd" | "sem" | "ci95" | "none";
  sig: "none" | "adjacent" | "vsFirst";
  percent: boolean;
  lollipop: boolean;
  fit: "linear" | "poly2";
  band: boolean;
  margBar: boolean;
  genes: boolean;
  gaps: boolean;
  az: number;
  el: number;
  stems: boolean;
  contour: boolean;
  bins: number;
  showLegend: boolean;
  cmap: string;
  sigLegend: boolean;
  labelPos: "above" | "inside" | "none";
}

export const DEFAULT_OPTS: PlotOpts = {
  title: "",
  xLabel: "",
  yLabel: "",
  showAxisLabels: true,
  showError: true,
  points: true,
  bars: true,
  error: "sd",
  sig: "vsFirst",
  percent: false,
  lollipop: false,
  fit: "linear",
  band: true,
  margBar: false,
  genes: false,
  gaps: true,
  az: 35,
  el: 22,
  stems: true,
  contour: false,
  bins: 12,
  showLegend: true,
  cmap: "蓝-红（相关）",
  sigLegend: true,
  labelPos: "above",
};

export interface GroupModel {
  kind: "groups";
  groups: string[];
  series: string[];
  values: number[][][];
  valueName: string;
}

export interface PairModel {
  kind: "pair";
  labels: string[];
  a: number[];
  b: number[];
  aName: string;
  bName: string;
}

export interface SeqModel {
  kind: "seq";
  labels: string[];
  deltas: number[];
  valueName: string;
}

export interface SingleModel {
  kind: "single";
  values: number[];
  valueName: string;
}

export interface LabelSeriesModel {
  kind: "labelseries";
  labels: string[];
  series: string[];
  values: number[][];
}

export interface XYModel {
  kind: "xy";
  pts: { x: number; y: number; g: number; s?: number; label?: string }[];
  groups: string[];
  xName: string;
  yName: string;
}

export interface XLongModel {
  kind: "xlong";
  xs: number[];
  series: string[];
  values: number[][][];
  xName: string;
  valueName: string;
}

export interface MatrixModel {
  kind: "matrix";
  rows: string[];
  cols: string[];
  v: number[][];
  p?: number[][];
}

export interface SetsModel {
  kind: "sets";
  names: string[];
  regions: { comb: number[]; n: number }[];
}

export interface FlowModel {
  kind: "flow";
  nodes: string[];
  links: { s: number; t: number; v: number }[];
}

export interface RocModel {
  kind: "roc";
  groups: string[];
  items: { score: number; label: number; g: number }[];
}

export interface SurvivalModel {
  kind: "survival";
  groups: string[];
  items: { time: number; status: number; g: number }[];
}

export interface ForestModel {
  kind: "forest";
  items: { label: string; est: number; lo: number; hi: number; w: number }[];
}

export interface WordsModel {
  kind: "words";
  items: { word: string; w: number }[];
}

export interface PackModel {
  kind: "pack";
  groups: string[];
  items: { label: string; value: number; g: number }[];
}

export interface VolcanoModel {
  kind: "volcano";
  items: { label: string; fc: number; p: number }[];
}

export interface EnrichModel {
  kind: "enrich";
  terms: { term: string; score: number; dir: "up" | "down" | "other"; genes: string }[];
}

export interface XYZModel {
  kind: "xyz";
  pts: { x: number; y: number; z: number; g: number }[];
  groups: string[];
  names: [string, string, string];
}

export interface Bar3DModel {
  kind: "bar3d";
  labels: string[];
  bar: number[];
  line: number[];
  barName: string;
  lineName: string;
}

export type ChartModel =
  | GroupModel | PairModel | SeqModel | SingleModel | LabelSeriesModel
  | XYModel | XLongModel | MatrixModel | VolcanoModel | EnrichModel
  | XYZModel | Bar3DModel | SetsModel | FlowModel | RocModel
  | SurvivalModel | ForestModel | WordsModel | PackModel;

export interface Rendered {
  inner: string;
  w: number;
  h: number;
}

export interface GStat {
  n: number; mean: number; sd: number; sem: number; ci: number;
  median: number; q1: number; q3: number; lo: number; hi: number;
  outliers: number[];
}

import { mean, sd, quantile, tQuantile975 } from "@/lib/stats";

export function gstat(xs: number[]): GStat {
  const sorted = [...xs].sort((a, b) => a - b);
  const n = xs.length;
  const m = mean(xs);
  const s = sd(xs);
  const sem = n > 0 ? s / Math.sqrt(n) : 0;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const inLo = q1 - 1.5 * iqr, inHi = q3 + 1.5 * iqr;
  const inliers = sorted.filter((v) => v >= inLo && v <= inHi);
  return {
    n, mean: m, sd: s, sem,
    ci: sem * tQuantile975(Math.max(1, n - 1)),
    median: quantile(sorted, 0.5), q1, q3,
    lo: inliers.length ? inliers[0] : sorted[0] ?? 0,
    hi: inliers.length ? inliers[inliers.length - 1] : sorted[n - 1] ?? 0,
    outliers: sorted.filter((v) => v < inLo || v > inHi),
  };
}

export function errVal(g: GStat, kind: PlotOpts["error"]): number {
  if (kind === "sd") return g.sd;
  if (kind === "sem") return g.sem;
  if (kind === "ci95") return g.ci;
  return 0;
}

export const ERR_LABEL: Record<PlotOpts["error"], string> = {
  sd: "Mean ± SD", sem: "Mean ± SEM", ci95: "Mean ± 95% CI", none: "Mean",
};