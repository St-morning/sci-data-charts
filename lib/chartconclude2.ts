import {
  LabelSeriesModel, PairModel, SeqModel, XYModel, MatrixModel, XYZModel,
  SetsModel, FlowModel, RocModel, SurvivalModel, ForestModel, WordsModel, PackModel,
  PlotOpts,
} from "@/lib/chartmodel";
import { mean, sd, pearson, linreg, fmt, fmtP, tTestP } from "@/lib/stats";

export interface Conclusion2 { facts: string[]; inference: string[]; en: string }

function lnGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let sum = 1 / a, term = sum, ap = a;
    for (let n = 1; n < 200; n++) { ap++; term *= x / ap; sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-10) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a, c = 1e30, d = 1 / b, h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

const chi2P = (x: number, df: number) => gammaQ(df / 2, x / 2);

export function aucOf(items: { score: number; label: number }[]): number {
  const pos = items.filter((i) => i.label === 1);
  const neg = items.filter((i) => i.label === 0);
  if (!pos.length || !neg.length) return NaN;
  const sorted = [...items].sort((a, b) => a.score - b.score);
  let rankSum = 0, i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].score === sorted[i].score) j++;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) if (sorted[k].label === 1) rankSum += avgRank;
    i = j + 1;
  }
  return (rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

function logRank2(a: { time: number; status: number }[], b: { time: number; status: number }[]): number {
  const times = [...new Set([...a, ...b].filter((x) => x.status === 1).map((x) => x.time))].sort((x, y) => x - y);
  let oe = 0, v = 0;
  for (const t of times) {
    const n1 = a.filter((x) => x.time >= t).length;
    const n2 = b.filter((x) => x.time >= t).length;
    const d1 = a.filter((x) => x.time === t && x.status === 1).length;
    const d2 = b.filter((x) => x.time === t && x.status === 1).length;
    const n = n1 + n2, d = d1 + d2;
    if (n < 2 || d === 0) continue;
    oe += d1 - (d * n1) / n;
    v += (d * (n - d) * n1 * n2) / (n * n * (n - 1));
  }
  if (v <= 0) return 1;
  return chi2P((oe * oe) / v, 1);
}

function medianSurvival(items: { time: number; status: number }[]): number {
  const ts = [...new Set(items.map((x) => x.time))].sort((a, b) => a - b);
  let s = 1;
  for (const t of ts) {
    const d = items.filter((x) => x.time === t && x.status === 1).length;
    const atRisk = items.filter((x) => x.time >= t).length;
    if (atRisk > 0) s *= 1 - d / atRisk;
    if (s <= 0.5) return t;
  }
  return NaN;
}

export function lsConclude(m: LabelSeriesModel, o: PlotOpts, variant: string): Conclusion2 {
  const totals = m.series.map((_, j) => m.values.reduce((a, row) => a + (row[j] ?? 0), 0));
  const grand = totals.reduce((a, b) => a + b, 0);
  const rowTotals = m.values.map((row) => row.reduce((a, b) => a + b, 0));
  const top = rowTotals.indexOf(Math.max(...rowTotals));
  const facts = [
    `${m.labels.length} 个类别 × ${m.series.length} 个系列（${m.series.join("、")}）；合计 ${fmt(grand)}。`,
    `系列合计：${m.series.map((s, j) => `${s} = ${fmt(totals[j])}${grand > 0 ? `（${fmt((totals[j] / grand) * 100)}%）` : ""}`).join("、")}。`,
    `总量最高类别：${m.labels[top]}（${fmt(rowTotals[top])}）；最低：${m.labels[rowTotals.indexOf(Math.min(...rowTotals))]}（${fmt(Math.min(...rowTotals))}）。`,
  ];
  const inference = [
    variant === "radar"
      ? "【推断】雷达轮廓面积与形状反映多维综合表现；面积相近但形状不同提示优势维度不同，比较时应固定各轴量纲与上限。"
      : variant === "tree"
        ? "【推断】聚类树把组成相似的类别归为同一分支，提示潜在的共同来源或机制；分支距离为欧氏距离下的平均连接结果。"
        : "【推断】构成占比最高的系列主导总量；堆积/百分比视图强调结构，绝对值比较请回到非堆积视图。",
    "【局限】类别顺序影响阅读趋势；构成数据受总量归一化影响，组分间存在此消彼长的约束，独立检验需换算回绝对量。",
  ];
  const en = `Figure. ${o.title || `${variant} chart of ${m.labels.length} categories across ${m.series.length} series`}. Series totals: ${m.series.map((s, j) => `${s} = ${fmt(totals[j])}`).join("; ")}; grand total ${fmt(grand)}.`;
  return { facts, inference, en };
}

export function divergeConclude(m: SeqModel): Conclusion2 {
  const pos = m.deltas.filter((d) => d > 0), neg = m.deltas.filter((d) => d < 0);
  const net = m.deltas.reduce((a, b) => a + b, 0);
  const iMax = m.deltas.indexOf(Math.max(...m.deltas));
  const iMin = m.deltas.indexOf(Math.min(...m.deltas));
  return {
    facts: [
      `${m.labels.length} 个步骤；正向 ${pos.length} 项合计 +${fmt(pos.reduce((a, b) => a + b, 0))}，负向 ${neg.length} 项合计 ${fmt(neg.reduce((a, b) => a + b, 0))}，净变化 ${net >= 0 ? "+" : ""}${fmt(net)}。`,
      `最大增益：${m.labels[iMax]}（+${fmt(m.deltas[iMax])}）；最大损失：${m.labels[iMin]}（${fmt(m.deltas[iMin])}）。`,
    ],
    inference: ["【推断】正负分离柱直观呈现对立方向的贡献；净变化接近零时提示增减相互抵消，应分别报告两侧幅度而非仅看净值。", "【局限】步骤顺序为展示顺序，不代表因果链；各步骤量纲须一致才能直接相加。"],
    en: `Figure. Diverging bar chart of ${m.labels.length} steps: ${pos.length} positive (sum +${fmt(pos.reduce((a, b) => a + b, 0))}) and ${neg.length} negative (sum ${fmt(neg.reduce((a, b) => a + b, 0))}); net change ${fmt(net)}.`,
  };
}

export function pairConclude2(m: PairModel, variant: "pyramid" | "range" | "slope"): Conclusion2 {
  const n = m.labels.length;
  if (variant === "slope") {
    const d = m.a.map((a, i) => m.b[i] - a);
    const md = mean(d), sdd = sd(d);
    const t = sdd > 0 ? md / (sdd / Math.sqrt(n)) : 0;
    const p = n > 1 && sdd > 0 ? tTestP(Math.abs(t), n - 1) : 1;
    const up = d.filter((x) => x > 0).length;
    return {
      facts: [
        `${n} 对配对观测（${m.aName} → ${m.bName}）；平均变化 ${md >= 0 ? "+" : ""}${fmt(md)} ± ${fmt(sdd)}（SD of differences）。`,
        `配对 t 检验：t(${n - 1}) = ${fmt(t)}，P ${fmtP(p)}；${up}/${n} 对上升。`,
      ],
      inference: [`【推断】${p < 0.05 ? "前后差异显著，处理/时间因素与指标变化相关" : "前后差异未达显著，尚不能排除随机波动"}；配对设计控制了个体基线差异，检验效能高于独立样本。`, "【局限】坡度图假设每对观测来自同一主体；缺失配对会破坏连线含义，需注明剔除规则。"],
      en: `Figure. Paired slope chart (${m.aName} → ${m.bName}, n = ${n} pairs). Mean change ${fmt(md)} ± ${fmt(sdd)}; paired t(${n - 1}) = ${fmt(t)}, P ${fmtP(p)}.`,
    };
  }
  if (variant === "range") {
    const widths = m.a.map((a, i) => Math.abs(m.b[i] - a));
    const widest = widths.indexOf(Math.max(...widths));
    return {
      facts: [`${n} 个区间；宽度均值 ${fmt(mean(widths))}，范围 ${fmt(Math.min(...widths))}–${fmt(Math.max(...widths))}；最宽区间：${m.labels[widest]}（${fmt(Math.min(m.a[widest], m.b[widest]))}–${fmt(Math.max(m.a[widest], m.b[widest]))}）。`],
      inference: ["【推断】区间宽度编码不确定性或波动范围；宽度差异大提示各条件下精密度不一致，比较中心值时应同时报告区间。", "【局限】浮动条仅展示两端点，区间内分布形态未知；若为置信区间请注明置信水平与计算方法。"],
      en: `Figure. Floating range bars for ${n} categories; mean width ${fmt(mean(widths))} (range ${fmt(Math.min(...widths))}–${fmt(Math.max(...widths))}).`,
    };
  }
  const ta = m.a.reduce((x, y) => x + y, 0), tb = m.b.reduce((x, y) => x + y, 0);
  const topA = m.a.indexOf(Math.max(...m.a)), topB = m.b.indexOf(Math.max(...m.b));
  return {
    facts: [`${n} 个类别；${m.aName} 合计 ${fmt(ta)}（峰值 ${m.labels[topA]} = ${fmt(m.a[topA])}），${m.bName} 合计 ${fmt(tb)}（峰值 ${m.labels[topB]} = ${fmt(m.b[topB])}）；两侧比 ${fmt(ta / (tb || 1))}。`],
    inference: ["【推断】背对背条形便于逐类别比较两侧结构；峰值类别错位提示两组的构成重心不同。", "【局限】人口金字塔式布局假设类别有序（如年龄段）；无序类别请按一侧数值排序后再比较。"],
    en: `Figure. Back-to-back (pyramid) bars across ${n} categories: ${m.aName} total ${fmt(ta)}, ${m.bName} total ${fmt(tb)}.`,
  };
}

export function setsConclude(m: SetsModel): Conclusion2 {
  const total = m.regions.reduce((a, r) => a + r.n, 0);
  const biggest = [...m.regions].sort((a, b) => b.n - a.n)[0];
  const nameOf = (comb: number[]) => comb.map((i) => m.names[i]).join(" ∩ ");
  const uniq = m.names.map((_, i) => m.regions.filter((r) => r.comb.length === 1 && r.comb[0] === i).reduce((a, r) => a + r.n, 0));
  const facts = [
    `${m.names.length} 个集合（${m.names.join("、")}），${m.regions.length} 个非空区域，元素总计 ${fmt(total)}。`,
    `最大区域：${nameOf(biggest.comb)} = ${fmt(biggest.n)}（${fmt((biggest.n / (total || 1)) * 100)}%）。`,
    `各集合独有元素：${m.names.map((s, i) => `${s} ${fmt(uniq[i])}`).join("、")}。`,
  ];
  if (m.names.length === 2) {
    const inter = m.regions.filter((r) => r.comb.length === 2).reduce((a, r) => a + r.n, 0);
    const union = total;
    facts.push(`Jaccard 相似度 = ${fmt(inter / (union || 1))}（交集 ${fmt(inter)} / 并集 ${fmt(union)}）。`);
  }
  return {
    facts,
    inference: ["【推断】交集规模反映集合间共享程度；独有元素多的集合提示特异性信号。UpSet 视图在集合数 > 3 时比 Venn 更可读。", "【局限】区域计数依赖上游筛选阈值；集合定义（如差异基因 cutoff）改变会显著改变交集结论。"],
    en: `Figure. Set intersections among ${m.names.length} sets (${m.names.join(", ")}); ${fmt(total)} elements across ${m.regions.length} non-empty regions; largest region ${nameOf(biggest.comb)} = ${fmt(biggest.n)}.`,
  };
}

export function flowConclude(m: FlowModel): Conclusion2 {
  const total = m.links.reduce((a, l) => a + l.v, 0);
  const top = [...m.links].sort((a, b) => b.v - a.v)[0];
  const through = m.nodes.map((_, i) => m.links.filter((l) => l.s === i || l.t === i).reduce((a, l) => a + l.v, 0));
  const hub = through.indexOf(Math.max(...through));
  return {
    facts: [
      `${m.nodes.length} 个节点、${m.links.length} 条流；总流量 ${fmt(total)}。`,
      `最大流：${m.nodes[top.s]} → ${m.nodes[top.t]} = ${fmt(top.v)}（${fmt((top.v / (total || 1)) * 100)}%）；吞吐量最高节点：${m.nodes[hub]}（${fmt(through[hub])}）。`,
    ],
    inference: ["【推断】带宽编码流量，主干路径揭示主要转化/迁移方向；枢纽节点是流程的关键控制点。", "【局限】桑基图要求流量守恒（节点流入≈流出）；若数据不守恒，带宽仅表示相对规模而非真实转化。"],
    en: `Figure. Sankey flow diagram with ${m.nodes.length} nodes and ${m.links.length} links; total flow ${fmt(total)}; dominant link ${m.nodes[top.s]} → ${m.nodes[top.t]} (${fmt(top.v)}).`,
  };
}

export function rocConclude(m: RocModel): Conclusion2 {
  const facts: string[] = [];
  const aucs: number[] = [];
  m.groups.forEach((g, gi) => {
    const items = m.items.filter((i) => i.g === gi);
    const pos = items.filter((i) => i.label === 1).length;
    const auc = aucOf(items);
    aucs.push(auc);
    facts.push(`${g}：n = ${items.length}（阳性 ${pos}，阴性 ${items.length - pos}），AUC = ${isNaN(auc) ? "无法计算（单一类别）" : fmt(auc)}。`);
  });
  const best = aucs.indexOf(Math.max(...aucs.filter((a) => !isNaN(a))));
  return {
    facts,
    inference: [`【推断】AUC 越接近 1 判别能力越强（0.9+ 优秀，0.8–0.9 良好，0.7–0.8 一般，0.5 随机）；${m.groups[best] ?? "当前模型"} 表现最佳。AUC 对阈值不敏感，但类别不平衡时建议同时报告 PR-AUC。`, "【局限】ROC 基于当前样本估计，外推需独立验证集；比较两条 ROC 应使用 DeLong 检验而非目测。"],
    en: `Figure. ROC curves for ${m.groups.length} group(s): ${m.groups.map((g, i) => `${g} AUC = ${isNaN(aucs[i]) ? "NA" : fmt(aucs[i])}`).join("; ")}. Diagonal marks chance-level discrimination.`,
  };
}

export function survivalConclude(m: SurvivalModel): Conclusion2 {
  const facts: string[] = [];
  const byGroup = m.groups.map((_, gi) => m.items.filter((i) => i.g === gi));
  byGroup.forEach((items, gi) => {
    const ev = items.filter((i) => i.status === 1).length;
    const med = medianSurvival(items);
    facts.push(`${m.groups[gi]}：n = ${items.length}，事件 ${ev}（${fmt((ev / (items.length || 1)) * 100)}%），中位生存时间 ${isNaN(med) ? "未达到" : fmt(med)}。`);
  });
  if (byGroup.length === 2) {
    const p = logRank2(byGroup[0], byGroup[1]);
    facts.push(`Log-rank 检验：χ² 近似 P ${fmtP(p)}。`);
  } else if (byGroup.length > 2) {
    let minP = 1;
    for (let i = 0; i < byGroup.length; i++) for (let j = i + 1; j < byGroup.length; j++) minP = Math.min(minP, logRank2(byGroup[i], byGroup[j]));
    facts.push(`两两 log-rank 最小 P ${fmtP(minP)}（Bonferroni 校正阈值 ${fmt(0.05 / ((byGroup.length * (byGroup.length - 1)) / 2))}）。`);
  }
  return {
    facts,
    inference: ["【推断】曲线分离越早、越宽提示组间生存差异越大；删失标记（竖线）表示随访截止而非事件，删失比例高时尾部估计不稳定。", "【局限】Log-rank 假设风险比例恒定；曲线交叉时改用加权检验或限制平均生存时间（RMST）。"],
    en: `Figure. Kaplan–Meier survival curves for ${m.groups.length} group(s) with censoring marks; ${m.groups.map((g, i) => `${g}: n = ${byGroup[i].length}, events ${byGroup[i].filter((x) => x.status === 1).length}`).join("; ")}.`,
  };
}

export function forestConclude(m: ForestModel): Conclusion2 {
  const ses = m.items.map((it) => Math.max(1e-9, (it.hi - it.lo) / (2 * 1.96)));
  const ws = ses.map((se) => 1 / (se * se));
  const wSum = ws.reduce((a, b) => a + b, 0);
  const pooled = m.items.reduce((a, it, i) => a + it.est * ws[i], 0) / wSum;
  const pSe = Math.sqrt(1 / wSum);
  const Q = m.items.reduce((a, it, i) => a + ws[i] * (it.est - pooled) ** 2, 0);
  const df = m.items.length - 1;
  const I2 = Q > df ? ((Q - df) / Q) * 100 : 0;
  const sig = m.items.filter((it) => it.lo > 0 || it.hi < 0).length;
  return {
    facts: [
      `${m.items.length} 项研究；逆方差加权合并效应 ${fmt(pooled)}（95% CI ${fmt(pooled - 1.96 * pSe)}–${fmt(pooled + 1.96 * pSe)}）。`,
      `单项区间不跨 0 的有 ${sig}/${m.items.length} 项；异质性 Q(${df}) = ${fmt(Q)}，P ${fmtP(chi2P(Q, df))}，I² = ${fmt(I2)}%。`,
    ],
    inference: [`【推断】${I2 > 50 ? "异质性较高（I² > 50%），合并效应解释需谨慎，建议随机效应模型并做亚组/敏感性分析" : "异质性可接受，固定效应合并结果具有代表性"}；菱形宽度反映合并精度。`, "【局限】本合并基于输入的效应量与区间，未纳入发表偏倚检验（Egger/funnel）；区间跨 0 的单项不能单独宣称有效。"],
    en: `Figure. Forest plot of ${m.items.length} studies; inverse-variance pooled estimate ${fmt(pooled)} (95% CI ${fmt(pooled - 1.96 * pSe)}–${fmt(pooled + 1.96 * pSe)}); heterogeneity I² = ${fmt(I2)}%.`,
  };
}

export function wordsConclude(m: WordsModel): Conclusion2 {
  const total = m.items.reduce((a, x) => a + x.w, 0);
  const top = [...m.items].sort((a, b) => b.w - a.w).slice(0, 5);
  const share = top.reduce((a, x) => a + x.w, 0) / (total || 1);
  return {
    facts: [`${m.items.length} 个词项，总权重 ${fmt(total)}；Top5：${top.map((x) => `${x.word}（${fmt(x.w)}）`).join("、")}。`, `Top5 权重占比 ${fmt(share * 100)}%。`],
    inference: ["【推断】字号编码权重（词频/重要度），高频词勾勒主题轮廓；占比集中提示主题单一，分散提示多主题并存。", "【局限】词云不保留词序与语法，无法表达否定或关系；权重口径（原始频数 vs TF-IDF）需在图注注明。"],
    en: `Figure. Word cloud of ${m.items.length} terms sized by weight; top terms: ${top.map((x) => x.word).join(", ")} (top-5 share ${fmt(share * 100)}%).`,
  };
}

export function packConclude(m: PackModel): Conclusion2 {
  const total = m.items.reduce((a, x) => a + x.value, 0);
  const gTotals = m.groups.map((_, gi) => m.items.filter((x) => x.g === gi).reduce((a, x) => a + x.value, 0));
  const top = [...m.items].sort((a, b) => b.value - a.value)[0];
  return {
    facts: [
      `${m.items.length} 个元素、${m.groups.length} 个分组；总量 ${fmt(total)}。分组占比：${m.groups.map((g, i) => `${g} ${fmt((gTotals[i] / (total || 1)) * 100)}%`).join("、")}。`,
      `最大元素：${top.label}（${fmt(top.value)}，占 ${fmt((top.value / (total || 1)) * 100)}%）。`,
    ],
    inference: ["【推断】圆面积编码数值，嵌套/相邻布局展示层级构成；面积比较不如条形精确，适合展示整体结构而非精确读数。", "【局限】小元素在打包布局中可能被压缩或省略标签；精确数值请配合表格输出。"],
    en: `Figure. Circle packing of ${m.items.length} items in ${m.groups.length} groups; area encodes value (total ${fmt(total)}); largest item ${top.label} = ${fmt(top.value)}.`,
  };
}

export function xyConclude2(m: XYModel, o: PlotOpts, variant: string): Conclusion2 {
  const facts: string[] = [`${m.pts.length} 个点、${m.groups.length} 个分组（${m.groups.join("、")}）。`];
  const rs: number[] = [];
  m.groups.forEach((g, gi) => {
    const pts = m.pts.filter((p) => p.g === gi);
    if (pts.length < 3) return;
    const pr = pearson(pts.map((p) => p.x), pts.map((p) => p.y));
    rs.push(pr.r);
    facts.push(`${g}：n = ${pts.length}，Pearson r = ${fmt(pr.r)}（P ${fmtP(pr.p)}），质心 (${fmt(mean(pts.map((p) => p.x)))}, ${fmt(mean(pts.map((p) => p.y)))})。`);
  });
  if (variant === "bubble") {
    const ss = m.pts.map((p) => p.s ?? 0).filter((s) => s > 0);
    if (ss.length) facts.push(`气泡大小范围 ${fmt(Math.min(...ss))}–${fmt(Math.max(...ss))}（面积编码第三变量）。`);
  }
  const all = linreg(m.pts.map((p) => p.x), m.pts.map((p) => p.y));
  facts.push(`全体线性拟合：y = ${fmt(all.slope)}x + ${fmt(all.intercept)}，R² = ${fmt(all.r2)}。`);
  const inference = [
    variant === "ellipse"
      ? "【推断】置信椭圆覆盖各组约 95% 的样本分布区域；椭圆重叠度低提示组间可分，质心连线方向标示组间差异主轴。"
      : variant === "facet"
        ? "【推断】分面把各组置于独立面板，避免颜色混叠；跨面板比较需确认坐标范围一致。"
        : variant === "marg"
          ? "【推断】边际分布展示单变量形态，联合散点展示相关结构；二者结合可识别边缘正态但联合非线性的情形。"
          : "【推断】区域/辅助线划分象限或阈值区间，落点分布反映类别结构；拟合线仅为描述，因果解释需实验设计支持。",
    "【局限】相关不等于因果；置信椭圆假设近似二元正态，偏态或离群点会扭曲椭圆，必要时改用稳健估计。",
  ];
  const en = `Figure. ${o.title || `${variant} scatter of ${m.pts.length} points in ${m.groups.length} groups`}. Overall linear fit R² = ${fmt(all.r2)}; group correlations: ${m.groups.map((g, i) => `${g} r = ${rs[i] !== undefined ? fmt(rs[i]) : "NA"}`).join("; ")}.`;
  return { facts, inference, en };
}

export function matrixConclude2(m: MatrixModel, variant: string): Conclusion2 {
  const off: number[] = [];
  m.v.forEach((row, i) => row.forEach((v, j) => { if (i !== j) off.push(v); }));
  const mx = Math.max(...off), mn = Math.min(...off);
  let bi = 0, bj = 1, bv = -Infinity;
  m.v.forEach((row, i) => row.forEach((v, j) => { if (i !== j && v > bv) { bv = v; bi = i; bj = j; } }));
  const facts = [
    `${m.rows.length} × ${m.cols.length} 矩阵；非对角均值 ${fmt(mean(off))}，范围 ${fmt(mn)}–${fmt(mx)}。`,
    `最强非对角关联：${m.rows[bi]} × ${m.cols[bj]} = ${fmt(bv)}。`,
  ];
  if (variant === "mantel" && m.p) {
    const ps: number[] = [];
    m.p.forEach((row, i) => row.forEach((v, j) => { if (i !== j) ps.push(v); }));
    const sigPairs = ps.filter((p) => p < 0.05).length;
    facts.push(`Mantel 检验：${sigPairs}/${ps.length} 对矩阵关联显著（P < 0.05）。`);
  }
  const inference = [
    variant === "tri"
      ? "【推断】下三角热图配合聚类树揭示变量分组结构；同簇变量高相关提示共调控或共同来源。"
      : variant === "chord"
        ? "【推断】弦的宽度编码矩阵值，环形布局强调节点间双向关系；自环与对称值需在图注说明口径。"
        : variant === "heat3d"
          ? "【推断】3D 热力柱把矩阵值抬升为高度，峰柱定位极值区域；精确读数请配合色标与 2D 热图。"
          : "【推断】矩阵关联模式提示变量间的耦合结构；显著性需置换检验支持，目测颜色深浅不能替代统计。",
    "【局限】相关系数对离群点敏感；聚类结果依赖距离与连接方式，更换方法可能改变分支顺序。",
  ];
  const en = `Figure. ${variant === "tri" ? "Lower-triangle clustered heatmap" : variant === "chord" ? "Chord diagram" : variant === "heat3d" ? "3D heatmap columns" : "Mantel-test heatmap"} of a ${m.rows.length} × ${m.cols.length} matrix; strongest off-diagonal value ${fmt(bv)} (${m.rows[bi]} × ${m.cols[bj]}).`;
  return { facts, inference, en };
}

export function trajConclude(m: XYZModel): Conclusion2 {
  const facts: string[] = [`${m.pts.length} 个三维轨迹点、${m.groups.length} 条轨迹。`];
  m.groups.forEach((g, gi) => {
    const pts = m.pts.filter((p) => p.g === gi);
    if (pts.length < 2) return;
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    const disp = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y, pts[pts.length - 1].z - pts[0].z);
    const zs = pts.map((p) => p.z);
    facts.push(`${g}：${pts.length} 点，路径长 ${fmt(len)}，首末位移 ${fmt(disp)}，Z 范围 ${fmt(Math.min(...zs))}–${fmt(Math.max(...zs))}。`);
  });
  return {
    facts,
    inference: ["【推断】路径长度与位移之比反映轨迹曲折度（≈1 为定向运动，≫1 为往复/探索）；底面投影辅助判断水平面内的运动模式。", "【局限】点序即时间序的假设需数据保证；3D 透视存在深度歧义，关键结论请用投影视角复核。"],
    en: `Figure. 3D trajectories of ${m.groups.length} groups (${m.pts.length} points) with floor projections; path length and endpoint displacement summarized per group.`,
  };
}