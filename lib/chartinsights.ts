import { ChartModel, gstat } from "@/lib/chartmodel";
import { mean, sd, quantile, linreg, fmt } from "@/lib/stats";
import { aucOf } from "@/lib/chartconclude2";

export type AnalysisMode = "experiment" | "bi";
export interface InsightMetric { label: string; value: string }
export interface ExtraInsights {
  metrics: InsightMetric[];
  details: string[];
  recommendations: string[];
}

const EMPTY: ExtraInsights = { metrics: [], details: [], recommendations: [] };
const cv = (xs: number[]) => {
  const m = mean(xs);
  return m === 0 ? "—" : `${fmt((sd(xs) / Math.abs(m)) * 100, 1)}%`;
};
const share = (v: number, total: number) => total === 0 ? "—" : `${fmt((v / total) * 100, 1)}%`;
const signed = (v: number) => `${v > 0 ? "+" : ""}${fmt(v)}`;
const rangeOf = (xs: number[]) => `${fmt(Math.min(...xs))}–${fmt(Math.max(...xs))}`;

function groupInsights(m: Extract<ChartModel, { kind: "groups" }>, mode: AnalysisMode): ExtraInsights {
  const cells = m.groups.flatMap((g, i) => m.series.map((s, j) => ({ name: m.series.length > 1 ? `${g} · ${s}` : g, xs: m.values[i][j] }))).filter((c) => c.xs.length > 0);
  const all = cells.flatMap((c) => c.xs);
  const means = cells.map((c) => mean(c.xs));
  const ranked = [...cells].sort((a, b) => mean(b.xs) - mean(a.xs));
  const sumMeans = means.reduce((a, b) => a + b, 0);
  const ns = cells.map((c) => c.xs.length);
  const metrics: InsightMetric[] = mode === "experiment" ? [
    { label: "总样本量", value: String(all.length) },
    { label: "比较单元", value: String(cells.length) },
    { label: "总体均值 ± SD", value: `${fmt(mean(all))} ± ${fmt(sd(all))}` },
    { label: "组均值变异系数", value: cv(means) },
  ] : [
    { label: "组均值合计", value: fmt(sumMeans) },
    { label: "最高单元", value: ranked[0]?.name ?? "—" },
    { label: "头部值 / 合计", value: ranked.length ? share(mean(ranked[0].xs), sumMeans) : "—" },
    { label: "组均值变异系数", value: cv(means) },
  ];
  const details = cells.map((c) => {
    const g = gstat(c.xs);
    return `${c.name}：n = ${g.n}；均值 95% CI [${fmt(g.mean - g.ci)}, ${fmt(g.mean + g.ci)}]；中位数 ${fmt(g.median)}；SD ${fmt(g.sd)}；SEM ${fmt(g.sem)}；CV ${cv(c.xs)}；范围 ${rangeOf(c.xs)}；离群点 ${g.outliers.length} 个（${share(g.outliers.length, g.n)}）。`;
  });
  details.push(`样本量均衡性：各单元 n 为 ${Math.min(...ns)}–${Math.max(...ns)}；组均值排名为 ${ranked.map((c) => `${c.name}（${fmt(mean(c.xs))}）`).join(" > ")}。`);
  const recommendations = mode === "experiment" ? [
    "报告中注明 n 是生物学重复、技术重复还是独立测量；技术重复不能直接当作独立样本扩大 n。",
    "同时报告效应量与 95% CI；多组两两比较应说明多重检验校正方法，不能仅凭误差棒是否重叠判断显著性。",
    "CV 可辅助比较组内离散程度，但均值接近 0 或含正负值时不适合使用 CV。",
  ] : [
    "BI 报表注明指标口径、单位、时间范围和筛选条件；组均值的合计仅在业务上可加时才有意义。",
    "头部占比与组间 CV 用于识别集中度和不均衡，排序变化应结合样本量与数据完整性检查。",
    "若用于经营监控，建议固定分组顺序并补充目标值、环比或同比基线。",
  ];
  return { metrics, details, recommendations };
}

function buildInsights(m: ChartModel, mode: AnalysisMode): ExtraInsights {
  if (m.kind === "groups") return groupInsights(m, mode);
  if (m.kind === "pair" || m.kind === "bar3d") {
    const labels = m.labels;
    const a = m.kind === "pair" ? m.a : m.bar;
    const b = m.kind === "pair" ? m.b : m.line;
    const aName = m.kind === "pair" ? m.aName : m.barName;
    const bName = m.kind === "pair" ? m.bName : m.lineName;
    const sa = a.reduce((x, y) => x + y, 0), sb = b.reduce((x, y) => x + y, 0);
    const rows = labels.map((label, i) => ({ label, a: a[i], b: b[i], d: b[i] - a[i], i })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
    const maxA = a.indexOf(Math.max(...a));
    return {
      metrics: [
        { label: `${aName} 合计`, value: fmt(sa) },
        { label: `${bName} 合计`, value: fmt(sb) },
        { label: `${aName} 峰值类别`, value: labels[maxA] },
        { label: "B / A", value: sa === 0 ? "—" : fmt(sb / sa) },
      ],
      details: [
        ...rows.map((r) => `${r.label}：${aName} ${fmt(r.a)}（占 ${share(r.a, sa)}），${bName} ${fmt(r.b)}；B−A = ${signed(r.d)}；B/A = ${r.a === 0 ? "—" : fmt(r.b / r.a)}。`),
        `${aName}：均值 ${fmt(mean(a))}，中位数 ${fmt(quantile([...a].sort((x, y) => x - y), 0.5))}，CV ${cv(a)}；${bName}：均值 ${fmt(mean(b))}，CV ${cv(b)}。`,
      ],
      recommendations: mode === "experiment" ? [
        "每行只有单个数值时不能计算组内误差或检验 P 值；若这些行是匹配样本，应使用配对检验并报告配对差值 CI。",
        "图注说明两列指标的单位、来源和是否为子集关系，避免把构成关系误读为独立组比较。",
      ] : [
        "对两个指标分别明确业务定义与汇总方式；B/A 仅在二者量纲和业务口径匹配时解释为比率。",
        "差异排序用于定位重点类别，建议同时展示绝对差和相对差，避免小基数造成过大百分比。",
      ],
    };
  }
  if (m.kind === "seq") {
    const cumulative: number[] = [];
    m.deltas.forEach((d, i) => cumulative.push((cumulative[i - 1] ?? 0) + d));
    const totalAbs = m.deltas.reduce((a, d) => a + Math.abs(d), 0);
    const end = cumulative[cumulative.length - 1];
    const maxI = m.deltas.reduce((bi, d, i, arr) => Math.abs(d) > Math.abs(arr[bi]) ? i : bi, 0);
    return {
      metrics: [{ label: "期末值", value: fmt(end) }, { label: "净变化", value: signed(end) }, { label: "最大驱动步骤", value: m.labels[maxI] }, { label: "绝对贡献占比", value: share(Math.abs(m.deltas[maxI]), totalAbs) }],
      details: m.labels.map((l, i) => `${l}：变化 ${signed(m.deltas[i])}，累计 ${fmt(cumulative[i])}，绝对贡献 ${share(Math.abs(m.deltas[i]), totalAbs)}。`),
      recommendations: ["瀑布图要求步骤可加且顺序有业务或实验意义；非加性指标不应使用累计解释。", "报告净变化时同时列出主要正向和负向驱动，避免只强调期末值。"],
    };
  }
  if (m.kind === "single") {
    const g = gstat(m.values);
    const sorted = [...m.values].sort((a, b) => a - b);
    return {
      metrics: [{ label: "样本量", value: String(g.n) }, { label: "均值（95% CI）", value: `${fmt(g.mean)} [${fmt(g.mean - g.ci)}, ${fmt(g.mean + g.ci)}]` }, { label: "CV", value: cv(m.values) }, { label: "P5–P95", value: `${fmt(quantile(sorted, 0.05))}–${fmt(quantile(sorted, 0.95))}` }],
      details: [
        `位置指标：均值 ${fmt(g.mean)}，中位数 ${fmt(g.median)}，P25 ${fmt(g.q1)}，P75 ${fmt(g.q3)}，P5 ${fmt(quantile(sorted, 0.05))}，P95 ${fmt(quantile(sorted, 0.95))}。`,
        `离散指标：SD ${fmt(g.sd)}，SEM ${fmt(g.sem)}，IQR ${fmt(g.q3 - g.q1)}，范围 ${rangeOf(m.values)}，CV ${cv(m.values)}。`,
        `异常值：1.5×IQR 规则检出 ${g.outliers.length} 个，占 ${share(g.outliers.length, g.n)}；${g.outliers.length ? `取值为 ${g.outliers.map((v) => fmt(v)).join("、")}。` : "未检出离群点。"}`,
      ],
      recommendations: mode === "experiment" ? ["报告分布时同时给出 n、中心趋势、离散程度和异常值处理规则；偏态数据优先中位数与 IQR。", "异常值只能依据预先设定的规则和实验记录处理，不应为获得显著性而删除。"] : ["分布监控应固定分箱和指标口径；P5–P95 比极值更适合观察常态波动范围。", "异常值占比可用于数据质量监控，但需结合业务场景区分真实极端事件与录入错误。"],
    };
  }
  if (m.kind === "labelseries") {
    const totals = m.values.map((r) => r.reduce((a, b) => a + b, 0));
    const grand = totals.reduce((a, b) => a + b, 0);
    const ranked = m.labels.map((label, i) => ({ label, value: totals[i], i })).sort((a, b) => b.value - a.value);
    const top3 = ranked.slice(0, 3).reduce((a, r) => a + r.value, 0);
    const hhi = totals.reduce((a, v) => a + (grand === 0 ? 0 : (v / grand) ** 2), 0);
    return {
      metrics: [{ label: "合计", value: fmt(grand) }, { label: "最高类别", value: ranked[0].label }, { label: "Top 3 占比", value: share(top3, grand) }, { label: "集中度 HHI", value: fmt(hhi, 3) }],
      details: [
        ...ranked.map((r, rank) => `${rank + 1}. ${r.label}：合计 ${fmt(r.value)}，占 ${share(r.value, grand)}${m.series.length > 1 ? `；构成 ${m.series.map((s, j) => `${s} ${fmt(m.values[r.i][j])}`).join("、")}` : ""}。`),
        `类别均值 ${fmt(mean(totals))}，中位数 ${fmt(quantile([...totals].sort((a, b) => a - b), 0.5))}，类别间 CV ${cv(totals)}；HHI 越接近 1 表示越集中。`,
      ],
      recommendations: ["排名和占比需说明合计口径；存在负值时占比与 HHI 不具备常规解释，应改用绝对量或分方向汇总。", "类别较多时优先报告 Top N 与其余类别合计，避免只凭视觉面积比较。"],
    };
  }
  if (m.kind === "xy") {
    const details: string[] = [];
    m.groups.forEach((name, gi) => {
      const pts = m.pts.filter((p) => p.g === gi);
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const lr = linreg(xs, ys);
      const residualSd = Math.sqrt(pts.reduce((a, p) => a + (p.y - lr.intercept - lr.slope * p.x) ** 2, 0) / Math.max(1, pts.length - 2));
      details.push(`${name}：n = ${pts.length}；X 均值 ± SD ${fmt(mean(xs))} ± ${fmt(sd(xs))}，范围 ${rangeOf(xs)}；Y 均值 ± SD ${fmt(mean(ys))} ± ${fmt(sd(ys))}，范围 ${rangeOf(ys)}；残差 SD ${fmt(residualSd)}，每单位 X 对应 Y 变化 ${fmt(lr.slope)}。`);
    });
    return {
      metrics: [{ label: "观测点", value: String(m.pts.length) }, { label: "分组数", value: String(m.groups.length) }, { label: "X 总范围", value: rangeOf(m.pts.map((p) => p.x)) }, { label: "Y 总范围", value: rangeOf(m.pts.map((p) => p.y)) }],
      details,
      recommendations: mode === "experiment" ? ["回归报告应包含斜率、截距、R²、置信区间和样本量，并检查残差、离群点及非线性；相关或拟合均不证明因果。", "分组拟合时比较斜率需使用交互项或专门的斜率差异检验，不能仅凭两条线视觉不平行下结论。"] : ["BI 相关性分析注明时间窗口、筛选条件和异常点处理；R² 表示样本内拟合度，不代表预测效果。", "用于预测或 KPI 驱动分析时，应使用时间外样本验证并警惕共同趋势造成的伪相关。"],
    };
  }
  if (m.kind === "xlong") {
    const details: string[] = [];
    const metrics: InsightMetric[] = [];
    m.series.forEach((s, j) => {
      const ys = m.values.map((row) => mean(row[j]));
      const first = ys[0], last = ys[ys.length - 1];
      const changes = ys.slice(1).map((v, i) => v - ys[i]);
      const maxJump = changes.reduce((bi, v, i, arr) => Math.abs(v) > Math.abs(arr[bi]) ? i : bi, 0);
      const growth = first === 0 ? "—" : `${fmt(((last - first) / Math.abs(first)) * 100, 1)}%`;
      details.push(`${s}：各 ${m.xName} 均值依次为 ${ys.map((v, i) => `${fmt(m.xs[i])}:${fmt(v)}`).join("，")}；相邻变化为 ${changes.map((v) => signed(v)).join("，")}；最大相邻变化发生在 ${fmt(m.xs[maxJump])} → ${fmt(m.xs[maxJump + 1])}（${signed(changes[maxJump])}）。`);
      if (j === 0) metrics.push({ label: "首末期变化", value: signed(last - first) }, { label: "相对变化", value: growth }, { label: "系列均值 CV", value: cv(ys) }, { label: "峰值 X", value: fmt(m.xs[ys.indexOf(Math.max(...ys))]) });
    });
    return {
      metrics, details,
      recommendations: mode === "experiment" ? ["重复测量时间序列优先使用重复测量 ANOVA 或混合效应模型；对每个时间点分别做 t 检验会增加假阳性。", "报告趋势时给出各时间点 n、缺失值处理和误差带定义，不能仅根据均值连线判断趋势显著。"] : ["趋势报表注明时间粒度与缺失区间；相对变化受基期影响，基期接近 0 时应优先展示绝对变化。", "若用于监控，建议补充环比、同比和移动平均，并标记异常区间而非只报告首末期。"],
    };
  }
  if (m.kind === "matrix") {
    const flat = m.v.flat();
    const off = m.v.flatMap((row, i) => row.filter((_, j) => i !== j).map((v, j) => ({ r: m.rows[i], c: m.cols[j >= i ? j + 1 : j], v })));
    const top = [...off].sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 6);
    const rowMeans = m.rows.map((r, i) => ({ r, v: mean(m.v[i]) })).sort((a, b) => b.v - a.v);
    return {
      metrics: [{ label: "矩阵维度", value: `${m.rows.length}×${m.cols.length}` }, { label: "全域均值 ± SD", value: `${fmt(mean(flat))} ± ${fmt(sd(flat))}` }, { label: "最强关联", value: top[0] ? fmt(top[0].v) : "—" }, { label: "|值| ≥ 0.7", value: String(off.filter((x) => Math.abs(x.v) >= 0.7).length) }],
      details: [`最强非对角单元：${top.map((x) => `${x.r} × ${x.c} = ${fmt(x.v)}`).join("；")}。`, `行均值最高 ${rowMeans[0].r}（${fmt(rowMeans[0].v)}），最低 ${rowMeans[rowMeans.length - 1].r}（${fmt(rowMeans[rowMeans.length - 1].v)}）；全域范围 ${rangeOf(flat)}。`],
      recommendations: ["色标必须标明数值含义、范围和中心点；相关矩阵与表达矩阵不应共用未说明的发散色标。", "强关联需结合样本量、显著性和多重检验校正解释，热图本身不提供因果证据。"],
    };
  }
  if (m.kind === "volcano") {
    const sorted = [...m.items].sort((a, b) => a.p - b.p);
    const qs = new Array<number>(sorted.length);
    let running = 1;
    for (let i = sorted.length - 1; i >= 0; i--) {
      running = Math.min(running, sorted[i].p * sorted.length / (i + 1));
      qs[i] = Math.min(1, running);
    }
    const qMap = new Map(sorted.map((it, i) => [it, qs[i]]));
    const sigFdr = m.items.filter((it) => Math.abs(it.fc) >= 1 && (qMap.get(it) ?? 1) < 0.05);
    const sig = m.items.filter((it) => Math.abs(it.fc) >= 1 && it.p < 0.05);
    const up = sig.filter((it) => it.fc > 0).length;
    const down = sig.length - up;
    return {
      metrics: [{ label: "检验特征数", value: String(m.items.length) }, { label: "P<0.05 且 |FC|≥2", value: String(sig.length) }, { label: "BH-FDR<0.05 且 |FC|≥2", value: String(sigFdr.length) }, { label: "上调 / 下调", value: `${up} / ${down}` }],
      details: [`显著特征占全部特征的 ${share(sig.length, m.items.length)}；FDR 校正后保留 ${sigFdr.length} 个，占原始显著结果的 ${share(sigFdr.length, sig.length)}。`, `显著特征的 |log2FC| 中位数 ${sig.length ? fmt(quantile(sig.map((it) => Math.abs(it.fc)).sort((a, b) => a - b), 0.5)) : "—"}；按原始 P 值前 6 位：${sorted.slice(0, 6).map((it) => `${it.label}（log2FC ${fmt(it.fc)}，P ${fmt(it.p)}，q ${fmt(qMap.get(it) ?? 1)}）`).join("；")}。`],
      recommendations: ["正式差异分析建议报告 BH-FDR 而非仅报告原始 P 值；本页 q 值由输入 P 值统一估算，应与原始差异分析流程核对。", "确认 P 值来自合适的统计模型，并说明重复类型、批次校正和 log2FC 的比较方向；火山图不能替代原始表达分布检查。"],
    };
  }
  if (m.kind === "enrich") {
    const total = m.terms.reduce((a, t) => a + Math.abs(t.score), 0);
    const ranked = [...m.terms].sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    const up = m.terms.filter((t) => t.dir === "up").length;
    const down = m.terms.filter((t) => t.dir === "down").length;
    return {
      metrics: [{ label: "富集条目", value: String(m.terms.length) }, { label: "上调 / 下调", value: `${up} / ${down}` }, { label: "最高分条目", value: ranked[0].term }, { label: "Top 3 分数占比", value: share(ranked.slice(0, 3).reduce((a, t) => a + Math.abs(t.score), 0), total) }],
      details: ranked.map((t, i) => `${i + 1}. ${t.term}：分数 ${fmt(t.score)}，方向 ${t.dir === "up" ? "上调" : t.dir === "down" ? "下调" : "未标注"}，绝对分数占比 ${share(Math.abs(t.score), total)}${t.genes ? `；基因 ${t.genes}` : ""}。`),
      recommendations: ["报告富集分析的数据库及版本、输入基因集、背景基因集、统计方法和 FDR；分数口径不同则条目占比不代表生物学效应占比。", "通路间基因重叠会造成冗余，建议结合基因列表、富集方向和聚类去冗余后形成机制假设。"],
    };
  }
  if (m.kind === "xyz") {
    const details = (["x", "y", "z"] as const).map((k, i) => `${m.names[i]}：均值 ± SD ${fmt(mean(m.pts.map((p) => p[k])))} ± ${fmt(sd(m.pts.map((p) => p[k])))}，范围 ${rangeOf(m.pts.map((p) => p[k]))}。`);
    m.groups.forEach((name, gi) => {
      const pts = m.pts.filter((p) => p.g === gi);
      const cx = mean(pts.map((p) => p.x)), cy = mean(pts.map((p) => p.y)), cz = mean(pts.map((p) => p.z));
      const spread = mean(pts.map((p) => Math.hypot(p.x - cx, p.y - cy, p.z - cz)));
      details.push(`${name}：n = ${pts.length}，质心 (${fmt(cx)}, ${fmt(cy)}, ${fmt(cz)})，点到质心平均欧氏距离 ${fmt(spread)}。`);
    });
    return {
      metrics: [{ label: "三维点", value: String(m.pts.length) }, { label: "分组数", value: String(m.groups.length) }, { label: "X 范围", value: rangeOf(m.pts.map((p) => p.x)) }, { label: "Z 范围", value: rangeOf(m.pts.map((p) => p.z)) }],
      details,
      recommendations: ["三维图用于展示结构而非精确读数；聚类结论应结合标准化方法、距离定义、聚类参数和轮廓系数等验证。", "建议补充二维投影或多个视角，避免遮挡和透视造成簇分离的假象。"],
    };
  }
  if (m.kind === "sets") {
    const total = m.regions.reduce((a, r) => a + r.n, 0);
    const inter = m.regions.filter((r) => r.comb.length > 1).reduce((a, r) => a + r.n, 0);
    const details = m.regions.map((r) => `${r.comb.map((i) => m.names[i]).join(" ∩ ")}：${fmt(r.n)}（${share(r.n, total)}）。`);
    m.names.forEach((name, i) => {
      const own = m.regions.filter((r) => r.comb.length === 1 && r.comb[0] === i).reduce((a, r) => a + r.n, 0);
      const all = m.regions.filter((r) => r.comb.includes(i)).reduce((a, r) => a + r.n, 0);
      details.push(`${name}：总计 ${fmt(all)}，独有 ${fmt(own)}（特异性 ${share(own, all)}）。`);
    });
    return {
      metrics: [{ label: "元素总数", value: fmt(total) }, { label: "集合数", value: String(m.names.length) }, { label: "共享元素占比", value: share(inter, total) }, { label: "非空区域", value: String(m.regions.length) }],
      details,
      recommendations: ["注明集合的定义阈值（如差异筛选 cutoff）与背景全集；阈值变化会显著改变交集规模。", "集合数 > 3 时优先使用 UpSet 视图；Venn 面积并不严格成比例，精确数量以标注为准。"],
    };
  }
  if (m.kind === "flow") {
    const total = m.links.reduce((a, l) => a + l.v, 0);
    const ranked = [...m.links].sort((a, b) => b.v - a.v);
    const details = ranked.map((l) => `${m.nodes[l.s]} → ${m.nodes[l.t]}：${fmt(l.v)}（${share(l.v, total)}）。`);
    m.nodes.forEach((name, i) => {
      const inn = m.links.filter((l) => l.t === i).reduce((a, l) => a + l.v, 0);
      const out = m.links.filter((l) => l.s === i).reduce((a, l) => a + l.v, 0);
      details.push(`${name}：流入 ${fmt(inn)}，流出 ${fmt(out)}${inn > 0 && out > 0 ? `，守恒差 ${signed(out - inn)}` : ""}。`);
    });
    return {
      metrics: [{ label: "总流量", value: fmt(total) }, { label: "节点 / 边", value: `${m.nodes.length} / ${m.links.length}` }, { label: "最大流占比", value: share(ranked[0]?.v ?? 0, total) }, { label: "头部节点", value: m.nodes[ranked[0]?.s ?? 0] ?? "—" }],
      details,
      recommendations: ["桑基图要求节点流量守恒；不守恒时带宽只表示相对规模，需在图注说明口径。", "BI 场景注明流量的时间窗口与单位；实验场景注明转化/迁移的判定标准。"],
    };
  }
  if (m.kind === "roc") {
    const details: string[] = [];
    const metrics: InsightMetric[] = [];
    m.groups.forEach((g, gi) => {
      const items = m.items.filter((i) => i.g === gi);
      const pos = items.filter((i) => i.label === 1).length;
      const auc = aucOf(items);
      details.push(`${g}：n = ${items.length}，阳性率 ${share(pos, items.length)}，AUC = ${isNaN(auc) ? "NA" : fmt(auc)}。`);
      if (gi === 0) metrics.push({ label: "样本量", value: String(items.length) }, { label: "阳性率", value: share(pos, items.length) }, { label: "AUC", value: isNaN(auc) ? "NA" : fmt(auc) }, { label: "模型数", value: String(m.groups.length) });
    });
    return {
      metrics,
      details,
      recommendations: ["AUC 的置信区间可用 DeLong 或 bootstrap 估计；两条 ROC 比较用 DeLong 检验。", "类别不平衡时补充 PR 曲线与校准曲线；注明分数来源（训练集/验证集/外部队列）。"],
    };
  }
  if (m.kind === "survival") {
    const details: string[] = [];
    m.groups.forEach((g, gi) => {
      const items = m.items.filter((i) => i.g === gi);
      const ev = items.filter((i) => i.status === 1).length;
      const cens = items.length - ev;
      details.push(`${g}：n = ${items.length}，事件 ${ev}（${share(ev, items.length)}），删失 ${cens}（${share(cens, items.length)}），随访范围 ${rangeOf(items.map((i) => i.time))}。`);
    });
    const all = m.items;
    return {
      metrics: [{ label: "总样本", value: String(all.length) }, { label: "事件数", value: String(all.filter((i) => i.status === 1).length) }, { label: "删失比例", value: share(all.filter((i) => i.status === 0).length, all.length) }, { label: "分组数", value: String(m.groups.length) }],
      details,
      recommendations: ["报告随访截止时间、删失原因分布与中位随访时间；尾部风险集过小时生存率估计不稳定。", "风险比例假设可用 Schoenfeld 残差检验；曲线交叉时考虑 RMST 或加权 log-rank。"],
    };
  }
  if (m.kind === "forest") {
    const ses = m.items.map((it) => Math.max(1e-9, (it.hi - it.lo) / (2 * 1.96)));
    const ws = ses.map((se) => 1 / (se * se));
    const wSum = ws.reduce((a, b) => a + b, 0);
    const pooled = m.items.reduce((a, it, i) => a + it.est * ws[i], 0) / wSum;
    const details = m.items.map((it, i) => `${it.label}：效应 ${fmt(it.est)}（95% CI ${fmt(it.lo)}–${fmt(it.hi)}），SE ≈ ${fmt(ses[i])}，权重 ${share(ws[i], wSum)}${it.lo > 0 || it.hi < 0 ? "，区间不跨 0" : "，区间跨 0"}。`);
    return {
      metrics: [{ label: "研究数", value: String(m.items.length) }, { label: "合并效应", value: fmt(pooled) }, { label: "合并 SE", value: fmt(Math.sqrt(1 / wSum)) }, { label: "显著单项", value: `${m.items.filter((it) => it.lo > 0 || it.hi < 0).length}/${m.items.length}` }],
      details,
      recommendations: ["注明效应量类型（OR/RR/MD/SMD）与模型（固定/随机）；I² > 50% 时探索异质性来源。", "补充发表偏倚评估（漏斗图/Egger）与留一法敏感性分析；单项区间跨 0 不能单独宣称有效。"],
    };
  }
  if (m.kind === "words") {
    const total = m.items.reduce((a, x) => a + x.w, 0);
    const ranked = [...m.items].sort((a, b) => b.w - a.w);
    return {
      metrics: [{ label: "词项数", value: String(m.items.length) }, { label: "总权重", value: fmt(total) }, { label: "Top1 占比", value: share(ranked[0]?.w ?? 0, total) }, { label: "Top5 占比", value: share(ranked.slice(0, 5).reduce((a, x) => a + x.w, 0), total) }],
      details: ranked.map((x, i) => `${i + 1}. ${x.word}：权重 ${fmt(x.w)}（${share(x.w, total)}）。`),
      recommendations: ["注明权重口径（词频 / TF-IDF / 重要度）与停用词规则；词云不表达否定与语法关系。", "主题结论应回到原文语境验证，避免把高频等同于重要。"],
    };
  }
  if (m.kind === "pack") {
    const total = m.items.reduce((a, x) => a + x.value, 0);
    const ranked = [...m.items].sort((a, b) => b.value - a.value);
    const details = m.groups.map((g, gi) => {
      const items = m.items.filter((x) => x.g === gi);
      const gt = items.reduce((a, x) => a + x.value, 0);
      return `${g}：${items.length} 项，合计 ${fmt(gt)}（${share(gt, total)}），最大 ${ranked.find((x) => x.g === gi)?.label ?? "—"}。`;
    });
    ranked.forEach((x) => details.push(`${x.label}：${fmt(x.value)}（${share(x.value, total)}）。`));
    return {
      metrics: [{ label: "元素数", value: String(m.items.length) }, { label: "总量", value: fmt(total) }, { label: "头部占比", value: share(ranked[0]?.value ?? 0, total) }, { label: "分组数", value: String(m.groups.length) }],
      details,
      recommendations: ["圆面积编码数值，精确比较请配合条形图或表格；小元素标签可能被省略。", "BI 场景注明口径与时间范围；层级构成变化应结合绝对量与占比双视角。"],
    };
  }
  return EMPTY;
}

export function generateInsights(model: ChartModel, model2: ChartModel | null, mode: AnalysisMode): ExtraInsights {
  const main = buildInsights(model, mode);
  if (!model2) return main;
  const second = buildInsights(model2, mode);
  return {
    metrics: [...main.metrics.slice(0, 4), ...second.metrics.slice(0, 2)],
    details: [...main.details, ...second.details.map((d) => `第二面板｜${d}`)],
    recommendations: [...main.recommendations, ...second.recommendations.slice(0, 2)],
  };
}