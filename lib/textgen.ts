import type { AnovaResult, Descriptives, TTestResult } from "./stats";
import { fmt, fmtP } from "./stats";

export interface GeneratedParagraphs {
  results: string[];
  discussion: string[];
  testSummary: string;
}

export interface GenInput {
  metricName: string;
  unit: string;
  groups: { name: string; desc: Descriptives }[];
  test: TTestResult | AnovaResult | null;
  errorBar: "SD" | "SEM";
  removedMissing: number;
  outliers: number;
  removedOutliers: boolean;
}

function pm(d: Descriptives, bar: "SD" | "SEM"): string {
  const spread = bar === "SD" ? d.sd : d.sem;
  return `${fmt(d.mean)} ± ${fmt(spread)}`;
}
const groupLabel=(name:string)=>name.trim().endsWith("组")?name.trim():`${name.trim()}组`;

export function generateParagraphs(input: GenInput): GeneratedParagraphs {
  const { metricName, unit, groups, test, errorBar } = input;
  const unitSuffix = unit ? `（${unit}）` : "";
  const results: string[] = [];

  const cleanNotes: string[] = [];
  if (input.removedMissing > 0) cleanNotes.push(`剔除缺失值 ${input.removedMissing} 项`);
  if (input.outliers > 0) {
    cleanNotes.push(
      input.removedOutliers
        ? `按 1.5×IQR 规则识别并剔除离群值 ${input.outliers} 项`
        : `按 1.5×IQR 规则识别出离群值 ${input.outliers} 项（已保留，未剔除）`,
    );
  }
  if (cleanNotes.length > 0) {
    results.push(`数据预处理：${cleanNotes.join("；")}。以下统计基于清洗后的数据。`);
  }

  const descParts = groups.map(
    (g) => `${groupLabel(g.name)}（n = ${g.desc.n}）为 ${pm(g.desc, errorBar)}`,
  );
  results.push(
    `各组${metricName}${unitSuffix}如下：${descParts.join("；")}。误差棒表示${errorBar === "SD" ? "标准差（SD）" : "标准误（SEM）"}。`,
  );

  let testSummary = "";
  if (test && test.kind === "welch") {
    const [a, b] = groups;
    const dir = test.meanDiff > 0 ? "高于" : "低于";
    const sig = isFinite(test.p) && test.p < 0.05;
    testSummary = `Welch t 检验：t(${fmt(test.df, 3)}) = ${fmt(test.t, 3)}，p ${fmtP(test.p)}`;
    results.push(
      `采用 Welch 双样本 t 检验比较两组差异。${groupLabel(a.name)}${metricName}${sig ? `显著${dir}` : `与`} ${groupLabel(b.name)}${sig ? "" : "差异未达统计显著水平"}（均值差 = ${fmt(test.meanDiff)}${unit ? " " + unit : ""}，95% CI [${fmt(test.ci95[0])}, ${fmt(test.ci95[1])}]；${testSummary}；Cohen's d = ${fmt(test.cohensD, 2)}）。`,
    );
  } else if (test && test.kind === "anova") {
    const sig = isFinite(test.p) && test.p < 0.05;
    testSummary = `单因素 ANOVA：F(${test.df1}, ${test.df2}) = ${fmt(test.F, 3)}，p ${fmtP(test.p)}`;
    results.push(
      `采用单因素方差分析（ANOVA）比较 ${groups.length} 组间差异，结果显示组间差异${sig ? "具有统计学意义" : "未达统计显著水平"}（${testSummary}；η² = ${fmt(test.etaSq, 2)}）。${sig ? "各组间的两两比较需进一步事后检验（如 Tukey HSD）确认，本工具未执行事后检验。" : ""}`,
    );
  } else {
    results.push("当前分组数量不满足自动检验条件（需至少 2 组、每组至少 2 个有效观测），未执行推断统计。");
  }

  const discussion: string[] = [];
  if (test && test.kind === "welch") {
    const [a, b] = groups;
    const higher = test.meanDiff > 0 ? a.name : b.name;
    const lower = test.meanDiff > 0 ? b.name : a.name;
    const sig = isFinite(test.p) && test.p < 0.05;
    if (sig) {
      discussion.push(
        `【推断】本实验条件下，${groupLabel(higher)}的${metricName}高于${groupLabel(lower)}，且差异不太可能仅由抽样误差解释（p ${fmtP(test.p)}）。这一模式与「处理因素对${metricName}存在影响」的假设一致，但本数据本身不能证明因果关系。`,
      );
      discussion.push(
        `【推断】效应量 Cohen's d = ${fmt(test.cohensD, 2)}，按常用标准属于${Math.abs(test.cohensD) >= 0.8 ? "大" : Math.abs(test.cohensD) >= 0.5 ? "中等" : "小"}效应。实际生物学/工程学意义需结合领域背景判断，统计显著不等于实际重要。`,
      );
    } else {
      discussion.push(
        `【推断】未检测到显著差异并不等于两组等效：当前样本量（n = ${a.desc.n} / ${b.desc.n}）下，检验可能缺乏足够功效发现较小效应。若研究目标是证明「无差异」，应改用等效性检验并预设等效界值。`,
      );
    }
  } else if (test && test.kind === "anova") {
    const sig = isFinite(test.p) && test.p < 0.05;
    discussion.push(
      sig
        ? `【推断】ANOVA 结果提示至少有一组与其他组不同，但整体检验不能定位具体差异来源。在完成事后多重比较校正前，不宜对任意两组下「显著不同」的结论。`
        : `【推断】当前数据未显示组间差异的证据。各组均值差异相对组内变异较小，可能反映处理效应微弱，也可能受样本量或测量噪声限制。`,
    );
  }
  discussion.push(
    `【局限】本分析基于单次上传的数据集：未验证正态性与方差齐性假设（Welch t 检验对方差齐性较稳健，但小样本偏态数据仍可能影响 p 值准确性）；未校正多重比较；缺失值与离群值的处理策略可能影响结果，建议做敏感性分析。`,
  );
  discussion.push(
    `【建议下一步】补充独立重复实验以验证可重复性；报告精确 p 值与置信区间而非仅「显著/不显著」；若涉及多批次测量，先用批次对比模块评估批次效应与残差（交互作用＋测量误差）；讨论部分的具体机制解释需由研究者结合文献补充，本工具不生成机制性论断。`,
  );

  return { results, discussion, testSummary };
}
