import { RawTable, parseNumber } from "@/lib/data";
import { Theme } from "@/lib/chartcore";
import {
  ChartModel, GroupModel, PairModel, SeqModel, SingleModel, LabelSeriesModel,
  XYModel, XLongModel, MatrixModel, VolcanoModel, EnrichModel, XYZModel, Bar3DModel,
  SetsModel, FlowModel, RocModel, SurvivalModel, ForestModel, WordsModel, PackModel,
  PlotOpts, Rendered, gstat, ERR_LABEL,
} from "@/lib/chartmodel";
import { mean, oneWayAnova, welchT, pearson, linreg, poly2, skewness, fmt, fmtP, stars } from "@/lib/stats";
import * as B from "@/lib/charts-basic";
import * as R from "@/lib/charts-rel";
import * as O from "@/lib/charts-omics";
import * as D from "@/lib/charts-3d";
import * as B2 from "@/lib/charts-bars2";
import * as ST from "@/lib/charts-sets";
import * as SC2 from "@/lib/charts-scatter2";
import * as CL from "@/lib/charts-clinical";
import * as M2 from "@/lib/charts-matrix2";
import * as F2 from "@/lib/charts-flow";
import * as D2 from "@/lib/charts-3d2";
import {
  lsConclude, divergeConclude, pairConclude2, setsConclude, flowConclude,
  rocConclude, survivalConclude, forestConclude, wordsConclude, packConclude,
  xyConclude2, matrixConclude2, trajConclude,
} from "@/lib/chartconclude2";

export type ShapeId =
  | "long3" | "long2" | "pair" | "seq" | "single" | "labelseries"
  | "xy" | "xlong" | "matrix" | "volcano" | "enrich" | "xyz" | "bar3d"
  | "sets" | "flow" | "roc" | "survival" | "forest" | "words" | "pack";

export interface FieldDef { key: string; label: string; kind: "cat" | "num"; optional?: boolean }

export const SHAPE_FIELDS: Record<ShapeId, FieldDef[]> = {
  long3: [{ key: "group", label: "分组列（X 轴类别）", kind: "cat" }, { key: "series", label: "系列列（图例，可选）", kind: "cat", optional: true }, { key: "value", label: "数值列（重复测量）", kind: "num" }],
  long2: [{ key: "group", label: "分组列", kind: "cat" }, { key: "value", label: "数值列（重复测量）", kind: "num" }],
  pair: [{ key: "label", label: "类别列（共 Y 轴）", kind: "cat" }, { key: "a", label: "左侧数值列", kind: "num" }, { key: "b", label: "右侧数值列", kind: "num" }],
  seq: [{ key: "label", label: "步骤列", kind: "cat" }, { key: "delta", label: "变化量列（可负）", kind: "num" }],
  single: [{ key: "value", label: "数值列", kind: "num" }],
  labelseries: [{ key: "label", label: "类别列", kind: "cat" }],
  xy: [{ key: "x", label: "X 数值列", kind: "num" }, { key: "y", label: "Y 数值列", kind: "num" }, { key: "group", label: "分组列（可选）", kind: "cat", optional: true }, { key: "s", label: "气泡大小列（可选）", kind: "num", optional: true }, { key: "plabel", label: "点标签列（可选）", kind: "cat", optional: true }],
  xlong: [{ key: "x", label: "X 数值列（时间点等）", kind: "num" }, { key: "series", label: "系列列", kind: "cat" }, { key: "value", label: "数值列（重复测量）", kind: "num" }],
  matrix: [{ key: "row", label: "行标签列", kind: "cat" }],
  volcano: [{ key: "label", label: "基因/特征名列", kind: "cat" }, { key: "fc", label: "log2FC 列", kind: "num" }, { key: "p", label: "P 值列", kind: "num" }],
  enrich: [{ key: "term", label: "通路/条目名列", kind: "cat" }, { key: "score", label: "富集分数列", kind: "num" }, { key: "dir", label: "方向列（up/down，可选）", kind: "cat", optional: true }, { key: "genes", label: "基因 ID 列（可选）", kind: "cat", optional: true }],
  xyz: [{ key: "x", label: "X 数值列", kind: "num" }, { key: "y", label: "Y 数值列", kind: "num" }, { key: "z", label: "Z 数值列", kind: "num" }, { key: "group", label: "分组列（可选）", kind: "cat", optional: true }],
  bar3d: [{ key: "label", label: "类别列", kind: "cat" }, { key: "bar", label: "柱数值列", kind: "num" }, { key: "line", label: "折线数值列", kind: "num" }],
  sets: [{ key: "comb", label: "集合组合列（如 A,B）", kind: "cat" }, { key: "n", label: "区域计数列", kind: "num" }],
  flow: [{ key: "source", label: "来源节点列", kind: "cat" }, { key: "target", label: "目标节点列", kind: "cat" }, { key: "value", label: "流量列", kind: "num" }],
  roc: [{ key: "score", label: "预测分数列", kind: "num" }, { key: "label", label: "真实标签列（0/1）", kind: "num" }, { key: "group", label: "模型/分组列（可选）", kind: "cat", optional: true }],
  survival: [{ key: "time", label: "随访时间列", kind: "num" }, { key: "status", label: "事件状态列（1=事件,0=删失）", kind: "num" }, { key: "group", label: "分组列（可选）", kind: "cat", optional: true }],
  forest: [{ key: "label", label: "研究名列", kind: "cat" }, { key: "est", label: "效应量列", kind: "num" }, { key: "lo", label: "CI 下限列", kind: "num" }, { key: "hi", label: "CI 上限列", kind: "num" }, { key: "w", label: "权重列（可选）", kind: "num", optional: true }],
  words: [{ key: "word", label: "词项列", kind: "cat" }, { key: "w", label: "权重列（词频等）", kind: "num" }],
  pack: [{ key: "label", label: "元素名列", kind: "cat" }, { key: "value", label: "数值列", kind: "num" }, { key: "group", label: "分组列（可选）", kind: "cat", optional: true }],
};

export const SHAPE_HINT: Record<ShapeId, string> = {
  long3: "长表：每行一个观测。示例表头：Group, Series, Value。Group 为 X 轴类别，Series 为组内子系列（图例），Value 为独立重复测量值（同一 Group×Series 多行）。",
  long2: "长表：每行一个观测。示例表头：Group, Value。同一 Group 的多行视为独立重复。",
  pair: "宽表：每行一个类别。示例表头：Label, Left, Right。左右两列围绕中心标签对称对比（蝴蝶图）或内外嵌套（嵌套柱状图）。",
  seq: "宽表：每行一个步骤。示例表头：Step, Delta。Delta 为相对上一步的增减量，首行从 0 起算，末列自动合计。",
  single: "单列数值：示例表头：Value。每行一个观测，用于分布类图形。",
  labelseries: "宽表：首列为类别标签，其余数值列各为一个系列。示例表头：Term, Score（环形柱状/玫瑰图）或 Term, CompA, CompB（环形堆叠）。",
  xy: "长表：每行一个点。示例表头：X, Y, Group（Group 可选）。用于散点与拟合。",
  xlong: "长表：每行一个观测。示例表头：Time, Series, Value。同一 Time×Series 多行重复用于均值±误差带。",
  matrix: "矩阵宽表：首列为行标签，其余数值列为列变量。示例表头：Gene, S1, S2, S3… 相关性热图请预先计算相关系数（-1…1）。",
  volcano: "宽表：每行一个基因/特征。示例表头：Gene, log2FC, P。阈值固定 |log2FC|≥1 且 P<0.05。",
  enrich: "宽表：每行一个通路。示例表头：Term, Score, Direction, Genes。Direction 取 up/down/上调/下调；Genes 可选用于条末标注。",
  xyz: "长表：每行一个三维点。示例表头：X, Y, Z, Group（Group 可选）。",
  bar3d: "宽表：每行一个类别。示例表头：Month, Sales, Rate。柱与折线各自独立刻度。",
  sets: "区域计数表：每行一个交集区域。示例表头：Region, Count。Region 用逗号列出集合名（如 A,B 表示 A∩B；单独 A 表示 A 独有）。",
  flow: "边表：每行一条流。示例表头：Source, Target, Value。节点自动去重，Value 为流量（>0）。",
  roc: "长表：每行一个样本。示例表头：Score, Label, Model。Label 取 0/1；Model 可选用于多条 ROC。",
  survival: "长表：每行一个受试者。示例表头：Time, Status, Group。Status=1 发生事件，0 删失；Group 可选。",
  forest: "宽表：每行一项研究。示例表头：Study, Est, Lo, Hi, Weight。Lo/Hi 为 95% CI 上下限，Weight 可选。",
  words: "宽表：每行一个词。示例表头：Word, Weight。Weight 为词频或重要度（>0）。",
  pack: "宽表：每行一个元素。示例表头：Item, Value, Group。圆面积编码 Value，Group 可选用于着色。",
};

function cell(row: string[], i: number | undefined): string {
  return i === undefined ? "" : (row[i] ?? "").trim();
}

export function prepare(shape: ShapeId, table: RawTable, map: Record<string, number>): ChartModel | { error: string } {
  const rows = table.rows;
  const num = (r: string[], k: string) => parseNumber(cell(r, map[k]));
  if (shape === "long3" || shape === "long2") {
    const groups: string[] = [];
    const series: string[] = [];
    const bucket = new Map<string, number[]>();
    for (const r of rows) {
      const g = cell(r, map.group);
      const s = shape === "long3" && map.series !== undefined ? cell(r, map.series) || "值" : "值";
      const v = num(r, "value");
      if (!g || v === null) continue;
      if (!groups.includes(g)) groups.push(g);
      if (!series.includes(s)) series.push(s);
      const key = `${g}||${s}`;
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key)!.push(v);
    }
    if (groups.length < 1) return { error: "未解析到有效分组数据，请检查列映射与数值格式。" };
    const values = groups.map((g) => series.map((s) => bucket.get(`${g}||${s}`) ?? []));
    if (values.every((gs) => gs.every((xs) => xs.length === 0))) return { error: "数值列为空或无法解析为数字。" };
    return { kind: "groups", groups, series, values, valueName: table.headers[map.value] ?? "Value" };
  }
  if (shape === "pair" || shape === "bar3d") {
    const labels: string[] = []; const a: number[] = []; const b: number[] = [];
    for (const r of rows) {
      const l = cell(r, map.label);
      const va = num(r, shape === "pair" ? "a" : "bar");
      const vb = num(r, shape === "pair" ? "b" : "line");
      if (!l || va === null || vb === null) continue;
      labels.push(l); a.push(va); b.push(vb);
    }
    if (labels.length < 2) return { error: "至少需要 2 行完整的类别 + 两列数值。" };
    if (shape === "pair") return { kind: "pair", labels, a, b, aName: table.headers[map.a] ?? "Left", bName: table.headers[map.b] ?? "Right" };
    return { kind: "bar3d", labels, bar: a, line: b, barName: table.headers[map.bar] ?? "Bar", lineName: table.headers[map.line] ?? "Line" };
  }
  if (shape === "seq") {
    const labels: string[] = []; const deltas: number[] = [];
    for (const r of rows) {
      const l = cell(r, map.label); const v = num(r, "delta");
      if (!l || v === null) continue;
      labels.push(l); deltas.push(v);
    }
    if (labels.length < 2) return { error: "至少需要 2 个步骤。" };
    return { kind: "seq", labels, deltas, valueName: table.headers[map.delta] ?? "Delta" };
  }
  if (shape === "single") {
    const values: number[] = [];
    for (const r of rows) { const v = num(r, "value"); if (v !== null) values.push(v); }
    if (values.length < 4) return { error: "至少需要 4 个数值观测。" };
    return { kind: "single", values, valueName: table.headers[map.value] ?? "Value" };
  }
  if (shape === "labelseries" || shape === "matrix") {
    const numIdx = table.headers.map((_, i) => i).filter((i) => i !== map.row && rows.some((r) => parseNumber(cell(r, i)) !== null));
    if (numIdx.length < 1) return { error: "除标签列外至少需要 1 个数值列。" };
    const labels: string[] = []; const v: number[][] = [];
    for (const r of rows) {
      const l = cell(r, map.row);
      if (!l) continue;
      const vs = numIdx.map((i) => parseNumber(cell(r, i)));
      if (vs.some((x) => x === null)) continue;
      labels.push(l); v.push(vs as number[]);
    }
    if (labels.length < 2) return { error: "至少需要 2 行完整数据。" };
    const cols = numIdx.map((i) => table.headers[i]);
    if (shape === "matrix") return { kind: "matrix", rows: labels, cols, v };
    return { kind: "labelseries", labels, series: cols, values: v };
  }
  if (shape === "xy" || shape === "xyz") {
    const groups: string[] = [];
    const pts: { x: number; y: number; z: number; g: number; s?: number; label?: string }[] = [];
    for (const r of rows) {
      const x = num(r, "x"), y = num(r, "y");
      const z = shape === "xyz" ? num(r, "z") : 0;
      if (x === null || y === null || (shape === "xyz" && z === null)) continue;
      const g = map.group !== undefined ? cell(r, map.group) || "全部" : "全部";
      if (!groups.includes(g)) groups.push(g);
      const s = shape === "xy" && map.s !== undefined ? num(r, "s") : null;
      const label = shape === "xy" && map.plabel !== undefined ? cell(r, map.plabel) : "";
      pts.push({ x, y, z: z ?? 0, g: groups.indexOf(g), s: s ?? undefined, label: label || undefined });
    }
    if (pts.length < 4) return { error: "至少需要 4 个完整坐标点。" };
    if (shape === "xy") return { kind: "xy", pts: pts.map((p) => ({ x: p.x, y: p.y, g: p.g, s: p.s, label: p.label })), groups, xName: table.headers[map.x] ?? "X", yName: table.headers[map.y] ?? "Y" };
    return { kind: "xyz", pts, groups, names: [table.headers[map.x] ?? "X", table.headers[map.y] ?? "Y", table.headers[map.z] ?? "Z"] };
  }
  if (shape === "xlong") {
    const xset: number[] = []; const series: string[] = [];
    const bucket = new Map<string, number[]>();
    for (const r of rows) {
      const x = num(r, "x"); const s = cell(r, map.series) || "值"; const v = num(r, "value");
      if (x === null || v === null) continue;
      if (!xset.includes(x)) xset.push(x);
      if (!series.includes(s)) series.push(s);
      const key = `${x}||${s}`;
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key)!.push(v);
    }
    xset.sort((a, b) => a - b);
    if (xset.length < 2 || series.length < 1) return { error: "至少需要 2 个 X 取值与 1 个系列。" };
    return { kind: "xlong", xs: xset, series, values: xset.map((x) => series.map((s) => bucket.get(`${x}||${s}`) ?? [])), xName: table.headers[map.x] ?? "X", valueName: table.headers[map.value] ?? "Value" };
  }
  if (shape === "volcano") {
    const items: { label: string; fc: number; p: number }[] = [];
    for (const r of rows) {
      const l = cell(r, map.label); const fc = num(r, "fc"); const p = num(r, "p");
      if (!l || fc === null || p === null || p <= 0) continue;
      items.push({ label: l, fc, p: Math.min(1, p) });
    }
    if (items.length < 5) return { error: "至少需要 5 行有效的 log2FC 与 P 值（P>0）。" };
    return { kind: "volcano", items };
  }
  if (shape === "enrich") {
    const terms: EnrichModel["terms"] = [];
    for (const r of rows) {
      const term = cell(r, map.term); const score = num(r, "score");
      if (!term || score === null) continue;
      const d = cell(r, map.dir).toLowerCase();
      const dir: "up" | "down" | "other" = /up|上调/.test(d) ? "up" : /down|下调/.test(d) ? "down" : "other";
      terms.push({ term, score, dir, genes: cell(r, map.genes) });
    }
    if (terms.length < 2) return { error: "至少需要 2 个通路条目。" };
    return { kind: "enrich", terms };
  }
  if (shape === "sets") {
    const names: string[] = [];
    const regions: { comb: number[]; n: number }[] = [];
    for (const r of rows) {
      const c = cell(r, map.comb); const n = num(r, "n");
      if (!c || n === null || n < 0) continue;
      const tokens = c.split(/[,，&∩+|]/).map((s) => s.trim()).filter(Boolean);
      if (!tokens.length) continue;
      const comb = [...new Set(tokens.map((tok) => { if (!names.includes(tok)) names.push(tok); return names.indexOf(tok); }))].sort((a, b) => a - b);
      regions.push({ comb, n });
    }
    if (names.length < 2 || regions.length < 1) return { error: "至少需要 2 个集合与 1 行区域计数（组合列如 A,B）。" };
    return { kind: "sets", names, regions };
  }
  if (shape === "flow") {
    const nodes: string[] = [];
    const links: { s: number; t: number; v: number }[] = [];
    const idx = (name: string) => { if (!nodes.includes(name)) nodes.push(name); return nodes.indexOf(name); };
    for (const r of rows) {
      const s = cell(r, map.source), t = cell(r, map.target), v = num(r, "value");
      if (!s || !t || v === null || v <= 0 || s === t) continue;
      links.push({ s: idx(s), t: idx(t), v });
    }
    if (nodes.length < 2 || links.length < 1) return { error: "至少需要 2 个节点与 1 条正流量（来源≠目标）。" };
    return { kind: "flow", nodes, links };
  }
  if (shape === "roc") {
    const groups: string[] = [];
    const items: { score: number; label: number; g: number }[] = [];
    for (const r of rows) {
      const score = num(r, "score"), label = num(r, "label");
      if (score === null || label === null) continue;
      const g = map.group !== undefined ? cell(r, map.group) || "模型" : "模型";
      if (!groups.includes(g)) groups.push(g);
      items.push({ score, label: label > 0 ? 1 : 0, g: groups.indexOf(g) });
    }
    if (items.length < 6) return { error: "至少需要 6 行分数 + 0/1 标签。" };
    return { kind: "roc", groups, items };
  }
  if (shape === "survival") {
    const groups: string[] = [];
    const items: { time: number; status: number; g: number }[] = [];
    for (const r of rows) {
      const time = num(r, "time"), status = num(r, "status");
      if (time === null || status === null || time < 0) continue;
      const g = map.group !== undefined ? cell(r, map.group) || "全部" : "全部";
      if (!groups.includes(g)) groups.push(g);
      items.push({ time, status: status > 0 ? 1 : 0, g: groups.indexOf(g) });
    }
    if (items.length < 6) return { error: "至少需要 6 行时间 + 事件状态（1=事件，0=删失）。" };
    return { kind: "survival", groups, items };
  }
  if (shape === "forest") {
    const items: { label: string; est: number; lo: number; hi: number; w: number }[] = [];
    for (const r of rows) {
      const label = cell(r, map.label), est = num(r, "est"), lo = num(r, "lo"), hi = num(r, "hi");
      if (!label || est === null || lo === null || hi === null || hi < lo) continue;
      const w = map.w !== undefined ? num(r, "w") : null;
      items.push({ label, est, lo, hi, w: w !== null && w > 0 ? w : 1 });
    }
    if (items.length < 2) return { error: "至少需要 2 行研究（效应量 + CI 上下限）。" };
    return { kind: "forest", items };
  }
  if (shape === "words") {
    const items: { word: string; w: number }[] = [];
    for (const r of rows) {
      const word = cell(r, map.word), w = num(r, "w");
      if (!word || w === null || w <= 0) continue;
      items.push({ word, w });
    }
    if (items.length < 3) return { error: "至少需要 3 个词项（权重 > 0）。" };
    return { kind: "words", items };
  }
  if (shape === "pack") {
    const groups: string[] = [];
    const items: { label: string; value: number; g: number }[] = [];
    for (const r of rows) {
      const label = cell(r, map.label), value = num(r, "value");
      if (!label || value === null || value <= 0) continue;
      const g = map.group !== undefined ? cell(r, map.group) || "全部" : "全部";
      if (!groups.includes(g)) groups.push(g);
      items.push({ label, value, g: groups.indexOf(g) });
    }
    if (items.length < 3) return { error: "至少需要 3 个元素（数值 > 0）。" };
    return { kind: "pack", groups, items };
  }
  return { error: "未知数据形状" };
}

export interface Conclusion { facts: string[]; inference: string[]; en: string }

export interface ChartSpec {
  id: string;
  name: string;
  family: string;
  shape: ShapeId;
  shape2?: ShapeId;
  docRef: string;
  opts: (keyof PlotOpts)[];
  render: (m: ChartModel, m2: ChartModel | null, t: Theme, o: PlotOpts) => Rendered;
  conclude: (m: ChartModel, m2: ChartModel | null, o: PlotOpts) => Conclusion;
  sample: () => RawTable;
  sample2?: () => RawTable;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tbl(headers: string[], rows: string[][]): RawTable {
  return { sourceName: "示例数据", headers, rows };
}

function groupConclusion(m: GroupModel, o: PlotOpts, distMode: boolean): Conclusion {
  const cells: { name: string; xs: number[] }[] = [];
  m.groups.forEach((g, i) => m.series.forEach((s, j) => {
    if (m.values[i][j].length) cells.push({ name: m.series.length > 1 ? `${g} · ${s}` : g, xs: m.values[i][j] });
  }));
  const facts: string[] = [];
  const inference: string[] = [];
  const total = cells.reduce((a, c) => a + c.xs.length, 0);
  facts.push(`共纳入 ${cells.length} 个比较单元、${total} 个独立观测；误差棒表示 ${ERR_LABEL[o.error]}。`);
  for (const c of cells) {
    const g = gstat(c.xs);
    facts.push(distMode
      ? `${c.name}：n = ${g.n}，中位数 ${fmt(g.median)}（IQR ${fmt(g.q1)}–${fmt(g.q3)}），离群点 ${g.outliers.length} 个。`
      : `${c.name}：n = ${g.n}，均值 ± SD = ${fmt(g.mean)} ± ${fmt(g.sd)}。`);
  }
  let enStats = "";
  if (cells.length >= 2) {
    const an = oneWayAnova(cells.map((c) => c.xs));
    if (isFinite(an.p)) {
      facts.push(`单因素 ANOVA：F(${an.df1}, ${an.df2}) = ${fmt(an.F)}，P ${fmtP(an.p)}，η² = ${fmt(an.etaSq)}。`);
      enStats = ` One-way ANOVA: F(${an.df1}, ${an.df2}) = ${fmt(an.F)}, P ${fmtP(an.p)}.`;
    }
    const sorted = [...cells].sort((a, b) => mean(b.xs) - mean(a.xs));
    const hi = sorted[0], lo = sorted[sorted.length - 1];
    const wt = welchT(hi.xs, lo.xs);
    facts.push(`均值最高单元（${hi.name}）与最低单元（${lo.name}）的 Welch t 检验：t(${fmt(wt.df, 1)}) = ${fmt(wt.t)}，P ${fmtP(wt.p)}（${stars(wt.p)}），Cohen's d = ${fmt(wt.cohensD)}。`);
    inference.push(`【推断】${hi.name} 的响应水平最高、${lo.name} 最低；${wt.p < 0.05 ? "二者差异具有统计学意义，支持处理/分组因素对观测指标存在真实影响" : "二者差异未达统计学显著，当前样本量下不能排除抽样误差"}。效应量 d = ${fmt(wt.cohensD)} 提示差异的实际幅度${Math.abs(wt.cohensD) >= 0.8 ? "较大" : "有限"}。`);
  }
  inference.push("【局限】星号仅反映 P 值大小（统计证据强度），不代表效应量大小；无重复设计下误差棒无法分离测量误差与交互效应。投稿前请确认误差棒定义（SD/SEM/95% CI）与期刊要求一致。");
  const en = `Figure. ${o.title || "Group comparison"}. ${distMode ? "Boxes show median and IQR; whiskers extend to 1.5×IQR and dots mark outliers." : `Bars/points show ${ERR_LABEL[o.error]} (n as indicated per group).`}${enStats} ns, not significant; *P < 0.05, **P < 0.01, ***P < 0.001, ****P < 0.0001.`;
  return { facts, inference, en };
}

const S = {
  long3(): RawTable {
    const r = rng(42);
    const groups = ["hCD45", "CD4", "CD8"];
    const series = ["G1", "G2", "G3", "G4"];
    const base = [[120, 95, 70, 45], [80, 62, 48, 30], [40, 33, 26, 18]];
    const rows: string[][] = [];
    groups.forEach((g, i) => series.forEach((s, j) => {
      for (let k = 0; k < 6; k++) rows.push([g, s, (base[i][j] * (0.85 + r() * 0.3)).toFixed(2)]);
    }));
    return tbl(["Group", "Series", "Value"], rows);
  },
  long2(): RawTable {
    const r = rng(7);
    const rows: string[][] = [];
    [["Control", 96, 5], ["Treatment", 77, 6], ["Rescue", 88, 5]].forEach(([g, m, s]) => {
      for (let k = 0; k < 12; k++) rows.push([g as string, ((m as number) + (r() - 0.5) * 2 * (s as number)).toFixed(2)]);
    });
    return tbl(["Group", "Value"], rows);
  },
  pair(): RawTable {
    const labels = ["0-14", "15-24", "25-34", "35-44", "45-54", "55-64", "65+"];
    const a = [42, 55, 78, 70, 58, 40, 22];
    const b = [40, 52, 82, 74, 61, 45, 30];
    return tbl(["Age", "Male", "Female"], labels.map((l, i) => [l, String(a[i]), String(b[i])]));
  },
  seq(): RawTable {
    return tbl(["Step", "Delta"], [["基线", "120"], ["Q1", "35"], ["Q2", "-18"], ["Q3", "42"], ["Q4", "-25"], ["Q5", "30"]]);
  },
  single(): RawTable {
    const r = rng(99);
    const rows: string[][] = [];
    for (let k = 0; k < 80; k++) {
      const u = r() || 1e-9, v = r();
      rows.push([(72 + 8 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)).toFixed(2)]);
    }
    return tbl(["Value"], rows);
  },
  labelseries(nSeries: number): RawTable {
    const terms = ["Cell cycle", "Apoptosis", "DNA repair", "Glycolysis", "OXPHOS", "Immune response", "Angiogenesis", "EMT"];
    const r = rng(5);
    return tbl(["Term", "Score", "CompB"], terms.map((t) => [t, (20 + r() * 80).toFixed(1), (10 + r() * 50).toFixed(1)]).map((row) => nSeries === 1 ? row.slice(0, 2) : row));
  },
  xy(): RawTable {
    const r = rng(21);
    const rows: string[][] = [];
    for (let k = 0; k < 30; k++) {
      const x = 1 + r() * 9;
      rows.push([x.toFixed(2), (2.1 * x + 4 + (r() - 0.5) * 6).toFixed(2), "Group A"]);
      rows.push([x.toFixed(2), (0.9 * x + 12 + (r() - 0.5) * 5).toFixed(2), "Group B"]);
    }
    return tbl(["X", "Y", "Group"], rows);
  },
  xlong(): RawTable {
    const r = rng(33);
    const rows: string[][] = [];
    [0, 2, 4, 8, 24].forEach((x) => ["Control", "Treatment"].forEach((s) => {
      const m = s === "Control" ? 50 + x * 0.4 : 50 + x * 1.6;
      for (let k = 0; k < 3; k++) rows.push([String(x), s, (m + (r() - 0.5) * 8).toFixed(2)]);
    }));
    return tbl(["Time", "Series", "Value"], rows);
  },
  matrix(): RawTable {
    const names = ["GeneA", "GeneB", "GeneC", "GeneD", "GeneE", "GeneF"];
    const r = rng(17);
    const latent = names.map(() => [r(), r()]);
    const v = names.map((_, i) => names.map((_, j) => {
      if (i === j) return 1;
      const a = latent[i], b = latent[j];
      const dot = a[0] * b[0] + a[1] * b[1];
      const na = Math.hypot(...a), nb = Math.hypot(...b);
      return Number((dot / (na * nb) * 0.9 + (r() - 0.5) * 0.15).toFixed(3));
    }));
    return tbl(["Gene", ...names], names.map((n, i) => [n, ...v[i].map(String)]));
  },
  volcano(): RawTable {
    const r = rng(55);
    const rows: string[][] = [];
    for (let k = 0; k < 140; k++) {
      const fc = (r() - 0.5) * 6;
      const p = Math.max(1e-12, Math.min(1, 10 ** (-(Math.abs(fc) * 1.6 + r() * 2.2))));
      rows.push([`Gene${k + 1}`, fc.toFixed(3), p.toExponential(3)]);
    }
    return tbl(["Gene", "log2FC", "P"], rows);
  },
  enrich(): RawTable {
    const up = ["Cell cycle", "DNA replication", "Mitotic spindle", "p53 signaling", "G2/M checkpoint", "Chromosome segregation"];
    const dn = ["Oxidative phosphorylation", "TCA cycle", "Fatty acid oxidation", "Ribosome", "Proteasome"];
    const r = rng(77);
    const rows: string[][] = [];
    up.forEach((t, i) => rows.push([t, (8 - i * 0.9 + r()).toFixed(2), "up", `GENE${i + 1}/GENE${i + 10}`]));
    dn.forEach((t, i) => rows.push([t, (7 - i * 0.8 + r()).toFixed(2), "down", `GENE${i + 20}/GENE${i + 30}`]));
    return tbl(["Term", "Score", "Direction", "Genes"], rows);
  },
  xyz(): RawTable {
    const r = rng(88);
    const rows: string[][] = [];
    [[2, 2, 2], [6, 5, 3], [4, 8, 7]].forEach((c, gi) => {
      for (let k = 0; k < 22; k++) rows.push([(c[0] + (r() - 0.5) * 2.4).toFixed(2), (c[1] + (r() - 0.5) * 2.4).toFixed(2), (c[2] + (r() - 0.5) * 2.4).toFixed(2), `Cluster ${gi + 1}`]);
    });
    return tbl(["X", "Y", "Z", "Group"], rows);
  },
  bar3d(): RawTable {
    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const bar = [120, 150, 170, 160, 200, 230];
    const line = [3.2, 3.8, 4.1, 3.9, 4.6, 5.0];
    return tbl(["Month", "Sales", "Rate"], labels.map((l, i) => [l, String(bar[i]), String(line[i])]));
  },
  surface(): RawTable {
    const n = 12;
    const rows: string[][] = [];
    for (let i = 0; i < n; i++) {
      const row = [`R${i + 1}`];
      for (let j = 0; j < n; j++) {
        const x = (j - n / 2) / 3, y = (i - n / 2) / 3;
        row.push((Math.exp(-(x * x + y * y) / 4) * 10 + Math.sin(x) * Math.cos(y) * 1.5).toFixed(3));
      }
      rows.push(row);
    }
    return tbl(["Row", ...Array.from({ length: n }, (_, j) => `C${j + 1}`)], rows);
  },
  sets(): RawTable {
    return tbl(["Region", "Count"], [
      ["A", "120"], ["B", "95"], ["C", "70"],
      ["A,B", "45"], ["A,C", "30"], ["B,C", "25"], ["A,B,C", "18"],
    ]);
  },
  flow(): RawTable {
    return tbl(["Source", "Target", "Value"], [
      ["原料", "工艺A", "62"], ["原料", "工艺B", "38"],
      ["工艺A", "合格品", "50"], ["工艺A", "返工", "12"],
      ["工艺B", "合格品", "28"], ["工艺B", "报废", "10"],
      ["返工", "合格品", "9"], ["返工", "报废", "3"],
    ]);
  },
  roc(): RawTable {
    const r = rng(123);
    const rows: string[][] = [];
    ["Model A", "Model B"].forEach((g, gi) => {
      for (let k = 0; k < 60; k++) {
        const pos = k < 30;
        const mu = pos ? (gi === 0 ? 0.72 : 0.62) : (gi === 0 ? 0.32 : 0.42);
        const score = Math.max(0.01, Math.min(0.99, mu + (r() - 0.5) * 0.36));
        rows.push([score.toFixed(3), pos ? "1" : "0", g]);
      }
    });
    return tbl(["Score", "Label", "Model"], rows);
  },
  survival(): RawTable {
    const r = rng(234);
    const rows: string[][] = [];
    ["Control", "Treatment"].forEach((g, gi) => {
      for (let k = 0; k < 40; k++) {
        const t = -Math.log(r() || 1e-9) * (gi === 0 ? 12 : 22);
        const status = r() < 0.8 ? 1 : 0;
        rows.push([Math.min(60, t).toFixed(1), String(status), g]);
      }
    });
    return tbl(["Time", "Status", "Group"], rows);
  },
  forest(): RawTable {
    return tbl(["Study", "Est", "Lo", "Hi", "Weight"], [
      ["Study 1", "0.32", "0.10", "0.54", "18"],
      ["Study 2", "0.25", "-0.02", "0.52", "14"],
      ["Study 3", "0.41", "0.22", "0.60", "22"],
      ["Study 4", "0.18", "-0.10", "0.46", "12"],
      ["Study 5", "0.36", "0.18", "0.54", "20"],
      ["Study 6", "0.29", "0.05", "0.53", "14"],
    ]);
  },
  words(): RawTable {
    const ws: [string, number][] = [
      ["机器学习", 96], ["深度学习", 82], ["神经网络", 74], [" transformer", 68],
      ["注意力机制", 61], ["卷积", 55], ["强化学习", 48], ["迁移学习", 44],
      ["特征工程", 39], ["过拟合", 35], ["正则化", 31], ["交叉验证", 28],
      ["梯度下降", 25], ["贝叶斯", 22], ["聚类", 19], ["降维", 16],
    ];
    return tbl(["Word", "Weight"], ws.map(([w, v]) => [w.trim(), String(v)]));
  },
  pack(): RawTable {
    return tbl(["Item", "Value", "Group"], [
      ["CPU", "320", "计算"], ["GPU", "480", "计算"], ["NPU", "150", "计算"],
      ["内存", "260", "存储"], ["SSD", "340", "存储"], ["HDD", "120", "存储"],
      ["网卡", "90", "网络"], ["交换机", "160", "网络"], ["光模块", "70", "网络"],
    ]);
  },
  xyBubble(): RawTable {
    const r = rng(321);
    const rows: string[][] = [];
    for (let k = 0; k < 24; k++) {
      const x = 1 + r() * 9;
      const g = k % 2 === 0 ? "Group A" : "Group B";
      const y = (g === "Group A" ? 2.1 : 0.9) * x + (g === "Group A" ? 4 : 12) + (r() - 0.5) * 5;
      rows.push([x.toFixed(2), y.toFixed(2), g, (10 + r() * 90).toFixed(1)]);
    }
    return tbl(["X", "Y", "Group", "Size"], rows);
  },
  composition(): RawTable {
    const cats = ["Batch 1", "Batch 2", "Batch 3", "Batch 4", "Batch 5", "Batch 6"];
    const r = rng(432);
    return tbl(["Batch", "相A", "相B", "相C"], cats.map((c) => {
      const a = 30 + r() * 30, b = 20 + r() * 30, cc = 100 - a - b;
      return [c, a.toFixed(1), b.toFixed(1), cc.toFixed(1)];
    }));
  },
};

function singleConclude(m: SingleModel, o: PlotOpts, ecdf: boolean): Conclusion {
  const g = gstat(m.values);
  const sk = skewness(m.values);
  const facts = [
    `n = ${g.n}；均值 ± SD = ${fmt(g.mean)} ± ${fmt(g.sd)}；中位数 ${fmt(g.median)}（IQR ${fmt(g.q1)}–${fmt(g.q3)}）；范围 ${fmt(Math.min(...m.values))}–${fmt(Math.max(...m.values))}。`,
    `偏度 = ${fmt(sk)}（|偏度| < 0.5 近似对称，0.5–1 中度偏态，> 1 高度偏态）；1.5×IQR 规则识别离群点 ${g.outliers.length} 个。`,
  ];
  if (ecdf) facts.push(`ECDF 中位数对应取值 ${fmt(g.median)}；25% 与 75% 分位分别为 ${fmt(g.q1)} 与 ${fmt(g.q3)}。`);
  const inference = [
    `【推断】分布${Math.abs(sk) < 0.5 ? "近似对称，满足参数检验（t 检验/ANOVA）的分布前提" : Math.abs(sk) < 1 ? "存在中度偏态，建议报告非参数检验或先做对数变换" : "高度偏态，优先使用非参数检验（Mann-Whitney/Kruskal-Wallis）或变换后分析"}。`,
    "【局限】直方图形态依赖分箱数；ECDF 不受分箱影响，二者结合可更稳健地描述分布。离群点应结合实验记录判断是否剔除。",
  ];
  const en = `Figure. ${o.title || "Distribution of " + m.valueName}. ${ecdf ? "Empirical cumulative distribution function" : `Histogram (${o.bins} bins)`} of ${g.n} observations (mean ± SD = ${fmt(g.mean)} ± ${fmt(g.sd)}; median ${fmt(g.median)}, IQR ${fmt(g.q1)}–${fmt(g.q3)}; skewness ${fmt(sk)}).`;
  return { facts, inference, en };
}

function volcConclude(m: VolcanoModel): { facts: string[]; inference: string[]; en: string } {
  const up = m.items.filter((i) => O.volcanoClass(i.fc, i.p) === "up");
  const dn = m.items.filter((i) => O.volcanoClass(i.fc, i.p) === "down");
  const topUp = [...up].sort((a, b) => a.p - b.p).slice(0, 3);
  const topDn = [...dn].sort((a, b) => a.p - b.p).slice(0, 3);
  const facts = [
    `共 ${m.items.length} 个特征；按 |log2FC| ≥ 1 且 P < 0.05 筛选：上调 ${up.length} 个、下调 ${dn.length} 个、不显著 ${m.items.length - up.length - dn.length} 个。`,
    `最显著上调：${topUp.map((i) => `${i.label}（log2FC = ${fmt(i.fc)}，P ${fmtP(i.p)}）`).join("、") || "无"}。`,
    `最显著下调：${topDn.map((i) => `${i.label}（log2FC = ${fmt(i.fc)}，P ${fmtP(i.p)}）`).join("、") || "无"}。`,
  ];
  const inference = [
    `【推断】${up.length > dn.length ? "上调特征占优，提示处理倾向于激活相关程序" : dn.length > up.length ? "下调特征占优，提示处理倾向于抑制相关程序" : "上下调数量接近，提示双向重塑"}；差异筛选阈值（|log2FC| ≥ 1、P < 0.05）为惯例设定，敏感性分析可验证结论稳健性。`,
    "【局限】火山图展示的是统计显著性与变化幅度的联合分布，P 值未做多重检验校正时假阳性风险升高；建议报告 FDR（Benjamini-Hochberg）校正后的 q 值。",
  ];
  const en = `Figure. Volcano plot of differential features. Dashed lines mark |log2FC| = 1 and P = 0.05; ${up.length} up-regulated and ${dn.length} down-regulated features were identified among ${m.items.length} tested.`;
  return { facts, inference, en };
}

function enrichConclude(m: EnrichModel): { facts: string[]; inference: string[]; en: string } {
  const up = m.terms.filter((x) => x.dir === "up");
  const dn = m.terms.filter((x) => x.dir === "down");
  const facts = [
    `共 ${m.terms.length} 个条目（上调 ${up.length}、下调 ${dn.length}、其他 ${m.terms.length - up.length - dn.length}）；分数范围 ${fmt(Math.min(...m.terms.map((x) => x.score)))}–${fmt(Math.max(...m.terms.map((x) => x.score)))}。`,
    `上调前列：${O.enrichTop(m, "up") || "无"}；下调前列：${O.enrichTop(m, "down") || "无"}。`,
  ];
  const inference = [
    "【推断】排名靠前的通路代表差异特征最集中的功能模块，可作为机制假设的起点；条形长度/颜色深度编码富集分数，方向由上下调分区表示。",
    "【局限】富集结果依赖背景基因集与数据库版本；条目间存在基因重叠，显著条目不彼此独立，解释时应合并冗余通路。",
  ];
  const en = `Figure. Enrichment analysis of regulated features. Bars are ranked by enrichment score within up- and down-regulated categories; color intensity scales with score.`;
  return { facts, inference, en };
}

export const CHARTS: ChartSpec[] = [
  {
    id: "grouped-bar", name: "散点柱状图（分组+误差棒+显著性）", family: "柱状/条形", shape: "long3", docRef: "文档 §2 与例图 1",
    opts: ["bars", "points", "error", "sig", "showLegend"],
    render: (m, _m2, t, o) => B.groupedBar(m as GroupModel, t, o),
    conclude: (m, _m2, o) => groupConclusion(m as GroupModel, o, false),
    sample: S.long3,
  },
  {
    id: "dot-error", name: "误差棒点图", family: "柱状/条形", shape: "long3", docRef: "速查表 15/17",
    opts: ["error", "showLegend"],
    render: (m, _m2, t, o) => B.dotError(m as GroupModel, t, o),
    conclude: (m, _m2, o) => groupConclusion(m as GroupModel, o, false),
    sample: S.long3,
  },
  {
    id: "raincloud", name: "云雨图（半小提琴+箱线+散点）", family: "分布", shape: "long2", docRef: "例图 2",
    opts: ["points"],
    render: (m, _m2, t, o) => B.rainCloud(m as GroupModel, t, o),
    conclude: (m, _m2, o) => groupConclusion(m as GroupModel, o, true),
    sample: S.long2,
  },
  {
    id: "box", name: "箱线图（+数据点）", family: "分布", shape: "long2", docRef: "速查表与常见图形",
    opts: ["points"],
    render: (m, _m2, t, o) => B.boxPlot(m as GroupModel, t, o),
    conclude: (m, _m2, o) => groupConclusion(m as GroupModel, o, true),
    sample: S.long2,
  },
  {
    id: "violin", name: "小提琴图（+内嵌箱线）", family: "分布", shape: "long2", docRef: "常见图形·分布比较",
    opts: ["points"],
    render: (m, _m2, t, o) => B.violinPlot(m as GroupModel, t, o),
    conclude: (m, _m2, o) => groupConclusion(m as GroupModel, o, true),
    sample: S.long2,
  },
  {
    id: "hbar", name: "水平条形/棒棒糖图", family: "柱状/条形", shape: "long3", docRef: "速查表 6/7/16",
    opts: ["lollipop", "error", "showLegend"],
    render: (m, _m2, t, o) => B.hBar(m as GroupModel, t, o),
    conclude: (m, _m2, o) => groupConclusion(m as GroupModel, o, false),
    sample: S.long3,
  },
  {
    id: "stacked", name: "堆积/百分比堆积柱形图", family: "柱状/条形", shape: "long3", docRef: "速查表 3/4/8",
    opts: ["percent", "showLegend"],
    render: (m, _m2, t, o) => B.stackedBar(m as GroupModel, t, o),
    conclude: (m, _m2, o) => {
      const g = m as GroupModel;
      const totals = g.values.map((row) => row.reduce((a, xs) => a + mean(xs), 0));
      const facts = g.groups.map((gr, i) => `${gr}：合计 ${fmt(totals[i])}；构成 ${g.series.map((s, j) => `${s} ${fmt((mean(g.values[i][j]) / (totals[i] || 1)) * 100, 1)}%`).join("、")}。`);
      return {
        facts,
        inference: ["【推断】百分比模式强调构成而非总量；跨组比较构成差异时注意总量差异可能被掩盖。", "【局限】堆积图不适合精确比较中间系列的大小，必要时改用分组柱状图。"],
        en: `Figure. ${o.percent ? "Percentage-stacked" : "Stacked"} composition across ${g.groups.length} categories; segments represent ${g.series.join(", ")}.`,
      };
    },
    sample: S.long3,
  },
  {
    id: "butterfly", name: "蝴蝶图/龙卷风图（含棒棒糖变体）", family: "柱状/条形", shape: "pair", docRef: "例图 6/7、速查表 10/11",
    opts: ["lollipop"],
    render: (m, _m2, t, o) => B.butterfly(m as PairModel, t, o),
    conclude: (m) => {
      const p = m as PairModel;
      const sa = p.a.reduce((x, y) => x + y, 0), sb = p.b.reduce((x, y) => x + y, 0);
      const diffs = p.labels.map((l, i) => ({ l, d: p.b[i] - p.a[i] })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
      return {
        facts: [`${p.aName} 合计 ${fmt(sa)}，${p.bName} 合计 ${fmt(sb)}（比值 ${fmt(sb / (sa || 1))}）。`, `差异最大类别：${diffs[0].l}（${p.bName} − ${p.aName} = ${fmt(diffs[0].d)}）。`],
        inference: ["【推断】双侧对称布局突出两组在同一维度上的结构差异；差异最大的类别值得优先解释。", "【局限】蝴蝶图假设两侧量纲一致；若单位不同应改用双轴图。"],
        en: `Figure. Tornado (butterfly) chart comparing ${p.aName} (left) and ${p.bName} (right) across ${p.labels.length} categories; totals ${fmt(sa)} vs ${fmt(sb)}.`,
      };
    },
    sample: S.pair,
  },
  {
    id: "nested", name: "嵌套型柱状图", family: "柱状/条形", shape: "pair", docRef: "例图 8",
    opts: [],
    render: (m, _m2, t, o) => B.nestedBar(m as PairModel, t, o),
    conclude: (m) => {
      const p = m as PairModel;
      const ratios = p.labels.map((l, i) => ({ l, r: p.b[i] / (p.a[i] || 1) })).sort((a, b) => b.r - a.r);
      return {
        facts: [`外柱（${p.aName}）与内柱（${p.bName}）逐类别对比；内/外占比最高：${ratios[0].l}（${fmt(ratios[0].r * 100, 1)}%），最低：${ratios[ratios.length - 1].l}（${fmt(ratios[ratios.length - 1].r * 100, 1)}%）。`],
        inference: ["【推断】嵌套柱直接编码「部分占整体」的比例关系，占比差异即结构差异。", "【局限】内柱数值不应超过外柱，否则语义失效；请确认数据为子集关系。"],
        en: `Figure. Nested bars show ${p.bName} within ${p.aName} for each category, encoding part-to-whole ratios.`,
      };
    },
    sample: S.pair,
  },
  {
    id: "waterfall", name: "瀑布图", family: "柱状/条形", shape: "seq", docRef: "速查表 12",
    opts: [],
    render: (m, _m2, t, o) => B.waterfall(m as SeqModel, t, o),
    conclude: (m) => {
      const q = m as SeqModel;
      const end = q.deltas.reduce((a, b) => a + b, 0);
      const pos = q.deltas.filter((d) => d > 0).reduce((a, b) => a + b, 0);
      const neg = q.deltas.filter((d) => d < 0).reduce((a, b) => a + b, 0);
      const maxI = q.deltas.indexOf(Math.max(...q.deltas));
      return {
        facts: [`期初 0 → 期末 ${fmt(end)}；正向贡献合计 +${fmt(pos)}，负向贡献合计 ${fmt(neg)}；最大单步变化：${q.labels[maxI]}（${fmt(q.deltas[maxI])}）。`],
        inference: ["【推断】期末值由正负贡献相互抵消后形成；最大单步是解释净变化的关键抓手。", "【局限】瀑布图假设各步骤可加且顺序有意义；非加性指标不适用。"],
        en: `Figure. Waterfall decomposition from baseline to final value ${fmt(end)}; positive steps sum to +${fmt(pos)} and negative steps to ${fmt(neg)}.`,
      };
    },
    sample: S.seq,
  },
  {
    id: "hist", name: "直方图", family: "分布", shape: "single", docRef: "速查表 13",
    opts: ["bins"],
    render: (m, _m2, t, o) => B.histogram(m as SingleModel, t, o),
    conclude: (m, _m2, o) => singleConclude(m as SingleModel, o, false),
    sample: S.single,
  },
  {
    id: "ecdf", name: "ECDF 累积分布图", family: "分布", shape: "single", docRef: "常见图形·ECDF",
    opts: [],
    render: (m, _m2, t, o) => B.ecdf(m as SingleModel, t, o),
    conclude: (m, _m2, o) => singleConclude(m as SingleModel, o, true),
    sample: S.single,
  },
  {
    id: "radial", name: "环形柱状图", family: "环形/极坐标", shape: "labelseries", docRef: "例图 3",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => B.radialBar(m as LabelSeriesModel, t, o),
    conclude: (m) => {
      const ls = m as LabelSeriesModel;
      const vals = ls.values.map((r) => r[0]);
      const iMax = vals.indexOf(Math.max(...vals));
      const total = vals.reduce((a, b) => a + b, 0);
      return {
        facts: [`${ls.labels.length} 个类别；最高 ${ls.labels[iMax]}（${fmt(vals[iMax])}，占合计 ${fmt((vals[iMax] / (total || 1)) * 100, 1)}%），最低 ${ls.labels[vals.indexOf(Math.min(...vals))]}（${fmt(Math.min(...vals))}）。`],
        inference: ["【推断】极坐标半径编码数值，适合类别较多时的紧凑对比；数值相近时角度区分优于饼图。", "【局限】人眼对半径/面积差异的判读弱于长度，精确比较请辅以数值标签或条形图。"],
        en: `Figure. Circular bar chart of ${ls.labels.length} categories; radius encodes value (max: ${ls.labels[iMax]}, ${fmt(vals[iMax])}).`,
      };
    },
    sample: () => S.labelseries(1),
  },
  {
    id: "radial-stacked", name: "环形堆叠柱状图", family: "环形/极坐标", shape: "labelseries", docRef: "例图 4",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => B.radialBar(m as LabelSeriesModel, t, o),
    conclude: (m) => {
      const ls = m as LabelSeriesModel;
      const totals = ls.values.map((r) => r.reduce((a, b) => a + b, 0));
      const iMax = totals.indexOf(Math.max(...totals));
      return {
        facts: [`${ls.labels.length} 个类别 × ${ls.series.length} 个系列；总量最高 ${ls.labels[iMax]}（${fmt(totals[iMax])}）。`, ...ls.series.map((s, j) => `${s} 合计 ${fmt(ls.values.reduce((a, r) => a + r[j], 0))}。`)],
        inference: ["【推断】径向堆叠同时编码总量与构成；系列顺序影响读图，建议按贡献排序。", "【局限】内层系列的弧长被半径放大，跨系列精确比较需谨慎。"],
        en: `Figure. Radial stacked bars show total and composition per category across ${ls.series.length} components.`,
      };
    },
    sample: () => S.labelseries(2),
  },
  {
    id: "rose", name: "南丁格尔玫瑰图", family: "环形/极坐标", shape: "labelseries", docRef: "速查表 19",
    opts: [],
    render: (m, _m2, t, o) => B.roseChart(m as LabelSeriesModel, t, o),
    conclude: (m) => {
      const ls = m as LabelSeriesModel;
      const vals = ls.values.map((r) => r[0]);
      const iMax = vals.indexOf(Math.max(...vals));
      return {
        facts: [`半径 ∝ √数值（面积编码）；最大扇区 ${ls.labels[iMax]}（${fmt(vals[iMax])}）。`],
        inference: ["【推断】面积编码弱化极端值视觉冲击，适合周期性/分类数据的均衡展示。", "【局限】面积判读误差大于长度，关键结论请附数值。"],
        en: `Figure. Nightingale rose chart; sector area is proportional to value (largest: ${ls.labels[iMax]}).`,
      };
    },
    sample: () => S.labelseries(1),
  },
  {
    id: "scatter-fit", name: "散点+线性/多项式拟合（分组+置信带）", family: "关系/回归", shape: "xy", docRef: "常见图形·散点关系",
    opts: ["fit", "band", "showLegend"],
    render: (m, _m2, t, o) => R.scatterFit(m as XYModel, t, o),
    conclude: (m, _m2, o) => {
      const xy = m as XYModel;
      const facts: string[] = []; const inference: string[] = [];
      const gs = xy.groups.length ? xy.groups : ["全部"];
      let enParts: string[] = [];
      gs.forEach((gname, gi) => {
        const pts = xy.pts.filter((p) => p.g === gi);
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        const pr = pearson(xs, ys);
        const lr = linreg(xs, ys);
        facts.push(`${gname}：n = ${pr.n}，Pearson r = ${fmt(pr.r)}（P ${fmtP(pr.p)}）；线性拟合 y = ${fmt(lr.intercept)} + ${fmt(lr.slope)}·x，R² = ${fmt(lr.r2)}。`);
        if (o.fit === "poly2") {
          const p2 = poly2(xs, ys);
          facts.push(`${gname} 二次拟合 R² = ${fmt(p2.r2)}（相对线性提升 ${fmt(p2.r2 - lr.r2)}）。`);
        }
        inference.push(`【推断】${gname} 中 X 与 Y 呈${pr.r >= 0 ? "正" : "负"}相关（r = ${fmt(pr.r)}），${pr.p < 0.05 ? "相关具有统计学意义" : "相关未达显著"}；R² = ${fmt(lr.r2)} 表示 X 可解释 Y 变异的 ${fmt(lr.r2 * 100, 0)}%。`);
        enParts.push(`${gname}: r = ${fmt(pr.r)}, P ${fmtP(pr.p)}, slope = ${fmt(lr.slope)}, R² = ${fmt(lr.r2)}`);
      });
      inference.push("【局限】相关不等于因果；置信带仅反映均值预测的不确定性，不代表个体预测区间。多项式拟合提升 R² 时需警惕过拟合。");
      return { facts, inference, en: `Figure. Scatter plots with ${o.fit === "linear" ? "linear regression and 95% confidence bands" : "quadratic fits"} by group. ${enParts.join("; ")}.` };
    },
    sample: S.xy,
  },
  {
    id: "line-band", name: "折线趋势图（均值±误差带）", family: "关系/回归", shape: "xlong", docRef: "常见图形·趋势曲线",
    opts: ["error", "band", "showLegend"],
    render: (m, _m2, t, o) => R.lineBand(m as XLongModel, t, o),
    conclude: (m, _m2, o) => {
      const xl = m as XLongModel;
      const facts: string[] = []; const inference: string[] = [];
      xl.series.forEach((s, j) => {
        const first = mean(xl.values[0][j]), last = mean(xl.values[xl.xs.length - 1][j]);
        const peakI = xl.values.map((row) => mean(row[j])).reduce((bi, v, i, arr) => (v > arr[bi] ? i : bi), 0);
        facts.push(`${s}：${xl.xName} ${fmt(xl.xs[0])} → ${fmt(xl.xs[xl.xs.length - 1])} 时均值 ${fmt(first)} → ${fmt(last)}（变化 ${fmt(last - first)}）；峰值位于 ${xl.xName} = ${fmt(xl.xs[peakI])}。`);
        inference.push(`【推断】${s} 随 ${xl.xName} 呈${last > first ? "上升" : last < first ? "下降" : "平稳"}趋势；误差带（${ERR_LABEL[o.error]}）重叠程度提示相邻时间点差异的可靠性。`);
      });
      inference.push("【局限】趋势图假设 X 有序且间隔有意义；重复数较少时误差带估计不稳定。");
      return { facts, inference, en: `Figure. Time-course of ${xl.valueName} (mean ± ${o.error.toUpperCase()}) for ${xl.series.join(" and ")} across ${xl.xs.length} ${xl.xName} points.` };
    },
    sample: S.xlong,
  },
  {
    id: "heatmap", name: "热图/相关性热图（+边际条形组合）", family: "矩阵/热图", shape: "matrix", docRef: "例图 12/13",
    opts: ["margBar", "cmap"],
    render: (m, _m2, t, o) => R.heatMap(m as MatrixModel, t, o),
    conclude: (m) => {
      const mm = m as MatrixModel;
      let best = { i: 0, j: 1, v: -Infinity };
      for (let i = 0; i < mm.rows.length; i++) for (let j = 0; j < mm.cols.length; j++) {
        if (i === j) continue;
        if (Math.abs(mm.v[i][j]) > Math.abs(best.v)) best = { i, j, v: mm.v[i][j] };
      }
      const off: number[] = [];
      for (let i = 0; i < mm.rows.length; i++) for (let j = 0; j < mm.cols.length; j++) if (i !== j) off.push(mm.v[i][j]);
      const strong = off.filter((v) => Math.abs(v) >= 0.7).length;
      return {
        facts: [`${mm.rows.length} × ${mm.cols.length} 矩阵；最强非对角关联：${mm.rows[best.i]} × ${mm.cols[best.j]} = ${fmt(best.v)}；|r| ≥ 0.7 的单元 ${strong} 个；非对角均值 ${fmt(mean(off))}。`],
        inference: [`【推断】${mm.rows[best.i]} 与 ${mm.cols[best.j]} 的强关联提示共调控或功能耦合；色标以 0 为中心时红/蓝分别表示正/负关联。`, "【局限】相关系数受样本量与离群点影响；热图聚类顺序（如有）会改变视觉模块，解释需结合统计检验。"],
        en: `Figure. Heatmap of the ${mm.rows.length} × ${mm.cols.length} matrix; strongest off-diagonal association: ${mm.rows[best.i]} vs ${mm.cols[best.j]} (r = ${fmt(best.v)}).`,
      };
    },
    sample: S.matrix,
  },
  {
    id: "volcano", name: "差异火山图", family: "组学/富集", shape: "volcano", docRef: "例图 9–11",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => O.volcanoPlot(m as VolcanoModel, t, o),
    conclude: (m) => volcConclude(m as VolcanoModel),
    sample: S.volcano,
  },
  {
    id: "enrich", name: "富集条形图（渐变/分类空行/基因标注/棒棒糖）", family: "组学/富集", shape: "enrich", docRef: "例图 14–18",
    opts: ["lollipop", "genes", "gaps", "showLegend"],
    render: (m, _m2, t, o) => O.enrichBar(m as EnrichModel, t, o),
    conclude: (m) => enrichConclude(m as EnrichModel),
    sample: S.enrich,
  },
  {
    id: "volcano-enrich", name: "火山图+富集条形组合图", family: "组学/富集", shape: "volcano", shape2: "enrich", docRef: "例图 9–11",
    opts: ["lollipop", "genes", "gaps"],
    render: (m, m2, t, o) => O.volcanoEnrich(m as VolcanoModel, (m2 ?? { kind: "enrich", terms: [] }) as EnrichModel, t, o),
    conclude: (m, m2) => {
      const a = volcConclude(m as VolcanoModel);
      const b = m2 ? enrichConclude(m2 as EnrichModel) : { facts: [], inference: [], en: "" };
      return { facts: [...a.facts, ...b.facts], inference: [...a.inference, ...b.inference], en: `${a.en} Right panel: enrichment of regulated features. ${b.en}` };
    },
    sample: S.volcano,
    sample2: S.enrich,
  },
  {
    id: "scatter3d", name: "3D 散点/聚类图（透视+投影茎）", family: "3D 混合", shape: "xyz", docRef: "文档 §5",
    opts: ["az", "el", "stems", "showLegend"],
    render: (m, _m2, t, o) => D.scatter3D(m as XYZModel, t, o),
    conclude: (m) => {
      const xyz = m as XYZModel;
      const rngOf = (k: "x" | "y" | "z") => {
        const vs = xyz.pts.map((p) => p[k]);
        return `${fmt(Math.min(...vs))}–${fmt(Math.max(...vs))}`;
      };
      return {
        facts: [`${xyz.pts.length} 个三维点、${xyz.groups.length} 个分组；轴范围 X ${rngOf("x")}、Y ${rngOf("y")}、Z ${rngOf("z")}。`, ...xyz.groups.map((g, gi) => {
          const pts = xyz.pts.filter((p) => p.g === gi);
          return `${g}：n = ${pts.length}，质心 (${fmt(mean(pts.map((p) => p.x)))}, ${fmt(mean(pts.map((p) => p.y)))}, ${fmt(mean(pts.map((p) => p.z)))})。`;
        })],
        inference: ["【推断】空间上分离的点簇提示不同状态/类别；质心距离可作为簇间差异的直观度量。", "【局限】3D 透视存在遮挡与深度歧义，旋转视角或配合 2D 投影验证簇结构；聚类结论需统计验证（如 silhouette）。"],
        en: `Figure. Three-dimensional scatter of ${xyz.pts.length} points in ${xyz.groups.length} groups with perspective projection and floor stems; point size encodes depth.`,
      };
    },
    sample: S.xyz,
  },
  {
    id: "bar3d-line", name: "3D 柱状图+2D 折线（双刻度）", family: "3D 混合", shape: "bar3d", docRef: "文档 §5",
    opts: ["az", "el"],
    render: (m, _m2, t, o) => D.bar3DLine(m as Bar3DModel, t, o),
    conclude: (m) => {
      const b = m as Bar3DModel;
      const pr = pearson(b.bar, b.line);
      const iMax = b.bar.indexOf(Math.max(...b.bar));
      return {
        facts: [`${b.labels.length} 个类别；柱（${b.barName}）峰值 ${b.labels[iMax]} = ${fmt(b.bar[iMax])}；折线（${b.lineName}）${fmt(b.line[0])} → ${fmt(b.line[b.line.length - 1])}；两序列 Pearson r = ${fmt(pr.r)}（P ${fmtP(pr.p)}）。`],
        inference: [`【推断】柱与折线${pr.r > 0.5 ? "同步变化，提示二者受共同因素驱动" : pr.r < -0.5 ? "反向变化，提示权衡关系" : "走势不完全一致，提示各自独立的驱动因素"}；双刻度避免量纲差异造成的视觉误导。`, "【局限】3D 柱的透视会压缩后方柱高，精确读数请以轴刻度或 2D 版本为准。"],
        en: `Figure. 3D bars (${b.barName}, left scale) with an overlaid 2D line (${b.lineName}, independent scale); Pearson r between series = ${fmt(pr.r)}.`,
      };
    },
    sample: S.bar3d,
  },
  {
    id: "surface3d", name: "3D 曲面图（+底面投影）", family: "3D 混合", shape: "matrix", docRef: "文档 §5",
    opts: ["az", "el", "contour", "cmap"],
    render: (m, _m2, t, o) => D.surface3D(m as MatrixModel, t, o),
    conclude: (m) => {
      const mm = m as MatrixModel;
      let bi = 0, bj = 0, bv = -Infinity, wi = 0, wj = 0, wv = Infinity;
      mm.v.forEach((row, i) => row.forEach((v, j) => {
        if (v > bv) { bv = v; bi = i; bj = j; }
        if (v < wv) { wv = v; wi = i; wj = j; }
      }));
      return {
        facts: [`${mm.rows.length} × ${mm.cols.length} 网格曲面；峰值 ${fmt(bv)} 位于 (${mm.rows[bi]}, ${mm.cols[bj]})，谷值 ${fmt(wv)} 位于 (${mm.rows[wi]}, ${mm.cols[wj]})；全域均值 ${fmt(mean(mm.v.flat()))}。`],
        inference: ["【推断】峰/谷位置标识响应面极值区域，可用于参数优化或风险区识别；底面投影辅助定位水平坐标。", "【局限】曲面为网格插值视觉呈现，极值精度受网格分辨率限制；外推区域不可信。"],
        en: `Figure. Three-dimensional response surface over a ${mm.rows.length} × ${mm.cols.length} grid; maximum ${fmt(bv)} at (${mm.rows[bi]}, ${mm.cols[bj]}), minimum ${fmt(wv)} at (${mm.rows[wi]}, ${mm.cols[wj]}).`,
      };
    },
    sample: S.surface,
  },
  {
    id: "label-bar", name: "自定义标签柱形图", family: "柱状/条形", shape: "labelseries", docRef: "文档 §3",
    opts: ["labelPos", "showLegend"],
    render: (m, _m2, t, o) => B2.labelBar(m as LabelSeriesModel, t, o),
    conclude: (m, _m2, o) => lsConclude(m as LabelSeriesModel, o, "label"),
    sample: () => S.labelseries(1),
  },
  {
    id: "hstack-bar", name: "堆积水平条形图", family: "柱状/条形", shape: "labelseries", docRef: "文档 §3",
    opts: ["percent", "showLegend"],
    render: (m, _m2, t, o) => B2.hStackBar(m as LabelSeriesModel, t, o),
    conclude: (m, _m2, o) => lsConclude(m as LabelSeriesModel, o, "hstack"),
    sample: () => S.labelseries(2),
  },
  {
    id: "diverge-bar", name: "正负对比柱形图", family: "柱状/条形", shape: "seq", docRef: "文档 §3",
    opts: [],
    render: (m, _m2, t, o) => B2.divergeBar(m as SeqModel, t, o),
    conclude: (m) => divergeConclude(m as SeqModel),
    sample: S.seq,
  },
  {
    id: "pyramid", name: "蝴蝶图 / 人口金字塔", family: "柱状/条形", shape: "pair", docRef: "文档 §3",
    opts: [],
    render: (m, _m2, t, o) => B2.pyramid(m as PairModel, t, o),
    conclude: (m) => pairConclude2(m as PairModel, "pyramid"),
    sample: S.pair,
  },
  {
    id: "range-bar", name: "范围 / 浮动条形图", family: "柱状/条形", shape: "pair", docRef: "文档 §3",
    opts: [],
    render: (m, _m2, t, o) => B2.rangeBar(m as PairModel, t, o),
    conclude: (m) => pairConclude2(m as PairModel, "range"),
    sample: S.pair,
  },
  {
    id: "overlap-bar", name: "重叠柱形图", family: "柱状/条形", shape: "labelseries", docRef: "文档 §3",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => B2.overlapBar(m as LabelSeriesModel, t, o),
    conclude: (m, _m2, o) => lsConclude(m as LabelSeriesModel, o, "overlap"),
    sample: () => S.labelseries(2),
  },
  {
    id: "dot-plot", name: "轻量点图（Cleveland）", family: "柱状/条形", shape: "labelseries", docRef: "文档 §3",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => B2.dotPlot(m as LabelSeriesModel, t, o),
    conclude: (m, _m2, o) => lsConclude(m as LabelSeriesModel, o, "dot"),
    sample: () => S.labelseries(2),
  },
  {
    id: "venn", name: "韦恩图（Venn）", family: "集合/构成", shape: "sets", docRef: "文档 §4 · OmicShare",
    opts: [],
    render: (m, _m2, t, o) => ST.venn(m as SetsModel, t, o),
    conclude: (m) => setsConclude(m as SetsModel),
    sample: S.sets,
  },
  {
    id: "upset", name: "UpSet 集合交集图", family: "集合/构成", shape: "sets", docRef: "文档 §4 · OmicShare",
    opts: [],
    render: (m, _m2, t, o) => ST.upset(m as SetsModel, t, o),
    conclude: (m) => setsConclude(m as SetsModel),
    sample: S.sets,
  },
  {
    id: "circle-pack", name: "圆堆积图（Circle Packing）", family: "集合/构成", shape: "pack", docRef: "文档 §4",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => ST.circlePack(m as PackModel, t, o),
    conclude: (m) => packConclude(m as PackModel),
    sample: S.pack,
  },
  {
    id: "word-cloud", name: "词云图", family: "集合/构成", shape: "words", docRef: "OmicShare",
    opts: [],
    render: (m, _m2, t, o) => ST.wordCloud(m as WordsModel, t, o),
    conclude: (m) => wordsConclude(m as WordsModel),
    sample: S.words,
  },
  {
    id: "radar", name: "雷达对比图", family: "环形/极坐标", shape: "labelseries", docRef: "README PlotProof",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => ST.radar(m as LabelSeriesModel, t, o),
    conclude: (m, _m2, o) => lsConclude(m as LabelSeriesModel, o, "radar"),
    sample: () => S.labelseries(2),
  },
  {
    id: "ellipse-scatter", name: "散点 + 置信椭圆 + 质心连线", family: "散点扩展", shape: "xy", docRef: "文档 §4",
    opts: ["showLegend", "fit"],
    render: (m, _m2, t, o) => SC2.ellipseScatter(m as XYModel, t, o),
    conclude: (m, _m2, o) => xyConclude2(m as XYModel, o, "ellipse"),
    sample: S.xy,
  },
  {
    id: "region-scatter", name: "散点 + 辅助线 + 区域标记", family: "散点扩展", shape: "xy", docRef: "文档 §4",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => SC2.regionScatter(m as XYModel, t, o),
    conclude: (m, _m2, o) => xyConclude2(m as XYModel, o, "region"),
    sample: S.xy,
  },
  {
    id: "inset-scatter", name: "散点 + 局部放大", family: "散点扩展", shape: "xy", docRef: "文档 §4",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => SC2.insetScatter(m as XYModel, t, o),
    conclude: (m, _m2, o) => xyConclude2(m as XYModel, o, "inset"),
    sample: S.xy,
  },
  {
    id: "facet-scatter", name: "散点 + 拟合分面", family: "散点扩展", shape: "xy", docRef: "文档 §4",
    opts: ["fit"],
    render: (m, _m2, t, o) => SC2.facetScatter(m as XYModel, t, o),
    conclude: (m, _m2, o) => xyConclude2(m as XYModel, o, "facet"),
    sample: S.xy,
  },
  {
    id: "marg-scatter", name: "散点 + 边际分布组合", family: "散点扩展", shape: "xy", docRef: "文档 §4 · README",
    opts: ["showLegend", "margBar"],
    render: (m, _m2, t, o) => SC2.margScatter(m as XYModel, t, o),
    conclude: (m, _m2, o) => xyConclude2(m as XYModel, o, "marg"),
    sample: S.xy,
  },
  {
    id: "bubble", name: "气泡图（第三变量）", family: "散点扩展", shape: "xy", docRef: "README PlotProof",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => SC2.bubble(m as XYModel, t, o),
    conclude: (m, _m2, o) => xyConclude2(m as XYModel, o, "bubble"),
    sample: S.xyBubble,
  },
  {
    id: "tri-heatmap", name: "下三角热图 + 聚类树", family: "树/矩阵扩展", shape: "matrix", docRef: "文档 §4",
    opts: ["cmap", "gaps"],
    render: (m, _m2, t, o) => M2.triHeatmap(m as MatrixModel, t, o),
    conclude: (m) => matrixConclude2(m as MatrixModel, "tri"),
    sample: S.matrix,
  },
  {
    id: "mantel", name: "Mantel 检验热图", family: "树/矩阵扩展", shape: "matrix", docRef: "文档 §4 · OmicShare",
    opts: ["cmap"],
    render: (m, _m2, t, o) => M2.mantelTest(m as MatrixModel, t, o),
    conclude: (m) => matrixConclude2(m as MatrixModel, "mantel"),
    sample: S.matrix,
  },
  {
    id: "tree-stack", name: "聚类树 + 堆积组成", family: "树/矩阵扩展", shape: "labelseries", docRef: "文档 §4",
    opts: ["percent", "showLegend"],
    render: (m, _m2, t, o) => M2.treeStack(m as LabelSeriesModel, t, o),
    conclude: (m, _m2, o) => lsConclude(m as LabelSeriesModel, o, "tree"),
    sample: S.composition,
  },
  {
    id: "sankey", name: "桑基流量图", family: "流/网络", shape: "flow", docRef: "OmicShare",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => F2.sankey(m as FlowModel, t, o),
    conclude: (m) => flowConclude(m as FlowModel),
    sample: S.flow,
  },
  {
    id: "chord", name: "弦图（Chord）", family: "流/网络", shape: "matrix", docRef: "OmicShare",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => F2.chord(m as MatrixModel, t, o),
    conclude: (m) => matrixConclude2(m as MatrixModel, "chord"),
    sample: S.matrix,
  },
  {
    id: "roc", name: "ROC 曲线（AUC）", family: "临床/评价", shape: "roc", docRef: "README PlotProof",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => CL.rocCurve(m as RocModel, t, o),
    conclude: (m) => rocConclude(m as RocModel),
    sample: S.roc,
  },
  {
    id: "slope", name: "配对坡度图", family: "临床/评价", shape: "pair", docRef: "README PlotProof",
    opts: [],
    render: (m, _m2, t, o) => CL.slopeChart(m as PairModel, t, o),
    conclude: (m) => pairConclude2(m as PairModel, "slope"),
    sample: S.pair,
  },
  {
    id: "forest", name: "森林图（Meta 分析）", family: "临床/评价", shape: "forest", docRef: "OmicShare",
    opts: [],
    render: (m, _m2, t, o) => CL.forestPlot(m as ForestModel, t, o),
    conclude: (m) => forestConclude(m as ForestModel),
    sample: S.forest,
  },
  {
    id: "km", name: "Kaplan–Meier 生存曲线", family: "临床/评价", shape: "survival", docRef: "OmicShare",
    opts: ["showLegend"],
    render: (m, _m2, t, o) => CL.kmCurve(m as SurvivalModel, t, o),
    conclude: (m) => survivalConclude(m as SurvivalModel),
    sample: S.survival,
  },
  {
    id: "traj-3d", name: "3D 轨迹 + 底面投影", family: "3D 混合", shape: "xyz", docRef: "文档 §5",
    opts: ["az", "el", "stems"],
    render: (m, _m2, t, o) => D2.traj3d(m as XYZModel, t, o),
    conclude: (m) => trajConclude(m as XYZModel),
    sample: S.xyz,
  },
  {
    id: "heat-3d", name: "3D 热力柱 + 色标", family: "3D 混合", shape: "matrix", docRef: "文档 §5",
    opts: ["az", "el", "cmap"],
    render: (m, _m2, t, o) => D2.heat3d(m as MatrixModel, t, o),
    conclude: (m) => matrixConclude2(m as MatrixModel, "heat3d"),
    sample: S.surface,
  },
];

export function autoMap(shape: ShapeId, table: RawTable): Record<string, number> {
  const fields = SHAPE_FIELDS[shape];
  const numeric = table.headers.map((_, i) => i).filter((i) => table.rows.some((r) => parseNumber((r[i] ?? "").trim()) !== null));
  const cats = table.headers.map((_, i) => i).filter((i) => !numeric.includes(i));
  const map: Record<string, number> = {};
  let ni = 0, ci = 0;
  for (const f of fields) {
    if (f.kind === "num") {
      if (ni >= numeric.length && f.optional) continue;
      map[f.key] = numeric[ni] ?? numeric[numeric.length - 1] ?? 0;
      ni++;
    } else {
      if (ci >= cats.length && f.optional) continue;
      map[f.key] = cats[ci] ?? 0;
      ci++;
    }
  }
  if (shape === "matrix" || shape === "labelseries") map.row = cats[0] ?? 0;
  return map;
}

