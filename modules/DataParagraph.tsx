import { useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckItem, DropZone, Field, ModuleHeader, Note, Panel } from "@/components/shared";
import {
  columnInfos,
  groupsFromLong,
  groupsFromWide,
  parseCSVText,
  parseFile,
  sampleTable,
  type CleanReport,
  type RawTable,
} from "@/lib/data";
import {
  describe,
  fmt,
  fmtP,
  oneWayAnova,
  welchT,
  type AnovaResult,
  type Descriptives,
  type TTestResult,
} from "@/lib/stats";
import { generateParagraphs } from "@/lib/textgen";
import { saveFinding, uid } from "@/lib/store";
import { Copy, FlaskConical, Play, Save } from "lucide-react";

interface Analysis {
  report: CleanReport;
  descs: { name: string; desc: Descriptives }[];
  test: TTestResult | AnovaResult | null;
  paragraphs: ReturnType<typeof generateParagraphs>;
  metricName: string;
  unit: string;
  errorBar: "SD" | "SEM";
}

const selectCls =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

function splitUnit(header: string): { name: string; unit: string } {
  const m = header.match(/^(.*?)[（(]([^)）]+)[)）]\s*$/);
  if (m) return { name: m[1].trim(), unit: m[2].trim() };
  return { name: header.trim(), unit: "" };
}

async function svgToPng(container: HTMLElement): Promise<string | undefined> {
  const svg = container.querySelector("svg");
  if (!svg) return undefined;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const w = svg.clientWidth || 640;
  const h = svg.clientHeight || 320;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.style.fontFamily = "Arial, sans-serif";
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function DataParagraph() {
  const [table, setTable] = useState<RawTable | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [mode, setMode] = useState<"long" | "wide">("long");
  const [groupIdx, setGroupIdx] = useState(0);
  const [valueIdx, setValueIdx] = useState(1);
  const [wideIdxs, setWideIdxs] = useState<number[]>([]);
  const [removeOutliers, setRemoveOutliers] = useState(false);
  const [errorBar, setErrorBar] = useState<"SD" | "SEM">("SD");
  const [metricName, setMetricName] = useState("");
  const [unit, setUnit] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const chartRef = useRef<HTMLDivElement>(null);

  const cols = useMemo(() => (table ? columnInfos(table) : []), [table]);

  function applyTable(t: RawTable) {
    setTable(t);
    setAnalysis(null);
    setError("");
    const infos = columnInfos(t);
    const firstGroup = infos.find((c) => !c.numeric);
    const numeric = infos.filter((c) => c.numeric);
    if (firstGroup && numeric.length > 0) {
      setMode("long");
      setGroupIdx(firstGroup.index);
      setValueIdx(numeric[0].index);
      const { name, unit: u } = splitUnit(numeric[0].name);
      setMetricName(name);
      setUnit(u);
    } else if (numeric.length >= 2) {
      setMode("wide");
      setWideIdxs(numeric.map((c) => c.index));
      const { name, unit: u } = splitUnit(numeric[0].name);
      setMetricName(name);
      setUnit(u);
    } else {
      setError("未识别到可用的数值列：长格式需要「分组列 + 数值列」，宽格式需要至少 2 个数值列。");
    }
  }

  async function onFiles(files: File[]) {
    try {
      applyTable(await parseFile(files[0]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "文件解析失败");
    }
  }

  function runAnalysis() {
    if (!table) return;
    try {
      const report =
        mode === "long"
          ? groupsFromLong(table, groupIdx, valueIdx, removeOutliers)
          : groupsFromWide(table, wideIdxs, removeOutliers);
      const valid = report.groups.filter((g) => g.values.length >= 2);
      if (valid.length < 2) {
        setError("有效分组不足：至少需要 2 组、每组 2 个及以上有效数值才能进行统计检验。");
        return;
      }
      const descs = valid.map((g) => ({ name: g.name, desc: describe(g.values) }));
      const test =
        valid.length === 2
          ? welchT(valid[0].values, valid[1].values)
          : oneWayAnova(valid.map((g) => g.values));
      const name = metricName.trim() || "指标";
      const paragraphs = generateParagraphs({
        metricName: name,
        unit: unit.trim(),
        groups: descs,
        test,
        errorBar,
        removedMissing: report.removedMissing,
        outliers: report.outliers,
        removedOutliers: removeOutliers,
      });
      setAnalysis({ report, descs, test, paragraphs, metricName: name, unit: unit.trim(), errorBar });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败");
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动选择文本复制");
    }
  }

  async function saveToStoryboard() {
    if (!analysis) return;
    const chartDataUrl = chartRef.current ? await svgToPng(chartRef.current) : undefined;
    const result=await saveFinding({
      id: uid(),
      createdAt: Date.now(),
      metricName: analysis.metricName,
      unit: analysis.unit,
      summary: analysis.paragraphs.testSummary || "描述统计",
      results: analysis.paragraphs.results,
      chartDataUrl,
      groups: analysis.descs.map((g) => ({
        name: g.name,
        n: g.desc.n,
        mean: g.desc.mean,
        sd: g.desc.sd,
      })),
    });
    if(result.ok)toast.success("已保存为「关键发现」，可在数据故事板中导入");
    else toast.error(result.message);
  }

  const chartData =
    analysis?.descs.map((g) => ({
      name: g.name,
      mean: g.desc.mean,
      err: analysis.errorBar === "SD" ? g.desc.sd : g.desc.sem,
      n: g.desc.n,
    })) ?? [];

  return (
    <div>
      <ModuleHeader
        code="MOD-03"
        title="数据 → 论文段落生成器"
        desc="上传 Excel / CSV 后自动完成清洗、统计检验与制图，并生成「结果」和「讨论」初稿。数据事实与模型推断分开标注，推断内容必须经研究者核实后才能使用。"
      />

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <Panel title="1 · 数据输入">
            <div className="mb-3 flex gap-2">
              <Button
                variant={pasteMode ? "outline" : "secondary"}
                size="sm"
                onClick={() => setPasteMode(false)}
              >
                上传文件
              </Button>
              <Button
                variant={pasteMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => setPasteMode(true)}
              >
                粘贴文本
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyTable(sampleTable())}
              >
                <FlaskConical className="size-3.5" aria-hidden />
                示例数据
              </Button>
            </div>
            {pasteMode ? (
              <div className="space-y-2">
                <Textarea
                  rows={7}
                  placeholder={"分组,细胞存活率 (%)\n对照组,96.2\n对照组,94.8\n处理组,78.1\n…"}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="num text-xs"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    try {
                      applyTable(parseCSVText(pasteText, "粘贴数据"));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "解析失败");
                    }
                  }}
                >
                  解析粘贴内容
                </Button>
              </div>
            ) : (
              <DropZone
                onFiles={onFiles}
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                hint="支持 .csv / .tsv / .xlsx / .xls，取第一个工作表"
                compact
              />
            )}
            {table && (
              <p className="mt-3 text-xs text-muted-foreground">
                已加载：<span className="font-medium text-foreground">{table.sourceName}</span>
                （{table.rows.length} 行 × {table.headers.length} 列）
              </p>
            )}
            {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          </Panel>

          {table && cols.length > 0 && (
            <Panel title="2 · 列映射与选项">
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={mode === "long" ? "secondary" : "outline"}
                    onClick={() => setMode("long")}
                  >
                    长格式（分组列 + 数值列）
                  </Button>
                  <Button
                    size="sm"
                    variant={mode === "wide" ? "secondary" : "outline"}
                    onClick={() => {
                      setMode("wide");
                      setWideIdxs(cols.filter((c) => c.numeric).map((c) => c.index));
                    }}
                  >
                    宽格式（每列一组）
                  </Button>
                </div>
                {mode === "long" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="分组列">
                      <select
                        className={selectCls}
                        value={groupIdx}
                        onChange={(e) => setGroupIdx(Number(e.target.value))}
                      >
                        {cols.map((c) => (
                          <option key={c.index} value={c.index}>{c.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="数值列">
                      <select
                        className={selectCls}
                        value={valueIdx}
                        onChange={(e) => {
                          const idx = Number(e.target.value);
                          setValueIdx(idx);
                          const { name, unit: u } = splitUnit(cols[idx].name);
                          setMetricName(name);
                          setUnit(u);
                        }}
                      >
                        {cols.filter((c) => c.numeric).map((c) => (
                          <option key={c.index} value={c.index}>{c.name}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                ) : (
                  <Field label="参与比较的数值列">
                    <div className="space-y-1.5">
                      {cols.filter((c) => c.numeric).map((c) => (
                        <label key={c.index} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={wideIdxs.includes(c.index)}
                            onChange={(e) =>
                              setWideIdxs((prev) =>
                                e.target.checked
                                  ? [...prev, c.index]
                                  : prev.filter((i) => i !== c.index),
                              )
                            }
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="指标名称">
                    <Input value={metricName} onChange={(e) => setMetricName(e.target.value)} />
                  </Field>
                  <Field label="单位">
                    <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="如 %、ng/mL" />
                  </Field>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">剔除离群值（1.5×IQR）</span>
                  <Switch checked={removeOutliers} onCheckedChange={setRemoveOutliers} />
                </div>
                <Field label="误差棒含义">
                  <div className="flex gap-2">
                    {(["SD", "SEM"] as const).map((v) => (
                      <Button
                        key={v}
                        size="sm"
                        variant={errorBar === v ? "secondary" : "outline"}
                        onClick={() => setErrorBar(v)}
                      >
                        {v === "SD" ? "标准差 SD" : "标准误 SEM"}
                      </Button>
                    ))}
                  </div>
                </Field>
                <Button className="w-full" onClick={runAnalysis}>
                  <Play className="size-4" aria-hidden />
                  开始分析并生成段落
                </Button>
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          {!analysis ? (
            <Panel>
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <BarChartIcon />
                <p className="text-sm font-medium">分析结果将显示在这里</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  左侧上传数据或点击「示例数据」体验完整流程：清洗报告 → 描述统计 → 检验 → 误差棒图 → 结果 / 讨论初稿。
                </p>
              </div>
            </Panel>
          ) : (
            <>
              <Panel title="清洗报告">
                <ul>
                  <CheckItem
                    status={analysis.report.removedMissing > 0 ? "warn" : "pass"}
                    title={`缺失值：${analysis.report.removedMissing} 项`}
                    detail={
                      analysis.report.removedMissing > 0
                        ? "空值与 NA / NaN 等标记已从统计中剔除。"
                        : "未发现缺失值。"
                    }
                  />
                  <CheckItem
                    status={analysis.report.outliers > 0 ? "warn" : "pass"}
                    title={`离群值：${analysis.report.outliers} 项（1.5×IQR 规则）`}
                    detail={
                      analysis.report.outliers > 0
                        ? removeOutliers
                          ? "已剔除。请在论文中说明剔除规则，并做保留离群值的敏感性分析。"
                          : "已保留。离群值可能显著影响均值与 p 值，建议核对原始记录。"
                        : "未检测到离群值。"
                    }
                  />
                  <CheckItem
                    status="info"
                    title={`有效观测：${analysis.report.usedRows} / ${analysis.report.totalRows} 行`}
                    detail={`共 ${analysis.descs.length} 个分组进入统计：${analysis.descs.map((g) => `${g.name}（n=${g.desc.n}）`).join("、")}。`}
                  />
                </ul>
              </Panel>

              <Panel title="描述统计与假设检验">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">分组</th>
                        <th className="num py-2 pr-3 font-medium">n</th>
                        <th className="num py-2 pr-3 font-medium">均值</th>
                        <th className="num py-2 pr-3 font-medium">SD</th>
                        <th className="num py-2 pr-3 font-medium">SEM</th>
                        <th className="num py-2 pr-3 font-medium">中位数</th>
                        <th className="num py-2 font-medium">95% CI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.descs.map((g) => (
                        <tr key={g.name} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pr-3 font-medium">{g.name}</td>
                          <td className="num py-2 pr-3">{g.desc.n}</td>
                          <td className="num py-2 pr-3">{fmt(g.desc.mean)}</td>
                          <td className="num py-2 pr-3">{fmt(g.desc.sd)}</td>
                          <td className="num py-2 pr-3">{fmt(g.desc.sem)}</td>
                          <td className="num py-2 pr-3">{fmt(g.desc.median)}</td>
                          <td className="num py-2 text-xs">
                            [{fmt(g.desc.ci95[0])}, {fmt(g.desc.ci95[1])}]
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {analysis.test && (
                  <div className="mt-3 rounded-md bg-primary/8 px-3 py-2.5">
                    <p className="num text-sm font-medium">{analysis.paragraphs.testSummary}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {analysis.test.kind === "welch"
                        ? "Welch t 检验不假设方差齐性；p 值为双侧。"
                        : "单因素 ANOVA 为整体检验，显著后需事后两两比较。"}
                      {isFinite(analysis.test.p) && analysis.test.p < 0.05
                        ? " 结果在 α = 0.05 水平显著。"
                        : " 结果在 α = 0.05 水平不显著。"}
                    </p>
                  </div>
                )}
              </Panel>

              <Panel
                title={`误差棒图（${analysis.errorBar === "SD" ? "均值 ± SD" : "均值 ± SEM"}）`}
                aside={
                  <Badge variant="outline" className="text-xs">
                    {analysis.metricName}{analysis.unit ? ` / ${analysis.unit}` : ""}
                  </Badge>
                }
              >
                <div ref={chartRef} className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--site-border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        label={
                          analysis.unit
                            ? { value: analysis.unit, angle: -90, position: "insideLeft", fontSize: 12 }
                            : undefined
                        }
                      />
                      <Tooltip
                        formatter={(value, name) =>
                          String(name) === "mean"
                            ? [fmt(Number(value)), `均值 (${analysis.errorBar} = ${fmt(chartData.find((d) => d.mean === Number(value))?.err ?? NaN)})`]
                            : [String(value), String(name)]
                        }
                      />
                      <Bar dataKey="mean" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={90}>
                        <ErrorBar dataKey="err" width={10} strokeWidth={2} stroke="var(--site-fg)" />
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <Note>
                  图中误差棒含义已在图注中写明（{analysis.errorBar}）。发表时请同时报告 n 与误差棒定义；SD 描述数据离散度，SEM 描述均值估计精度，二者不可混用。
                </Note>
              </Panel>

              <Panel
                title="「结果」初稿 · 数据事实"
                aside={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(analysis.paragraphs.results.join("\n\n"))}
                  >
                    <Copy className="size-3.5" aria-hidden />
                    复制
                  </Button>
                }
              >
                <div className="space-y-3">
                  {analysis.paragraphs.results.map((p, i) => (
                    <p key={i} className="text-sm leading-7">
                      <Badge variant="secondary" className="mr-2 bg-emerald-600/12 text-emerald-700 dark:text-emerald-400">
                        事实
                      </Badge>
                      {p}
                    </p>
                  ))}
                </div>
              </Panel>

              <Panel
                title="「讨论」初稿 · 推断与建议"
                aside={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(analysis.paragraphs.discussion.join("\n\n"))}
                  >
                    <Copy className="size-3.5" aria-hidden />
                    复制
                  </Button>
                }
              >
                <Note tone="warn">
                  以下内容由规则模板基于统计结果生成，属于<b>推断性文字</b>，不是数据本身。机制解释、文献引用与领域意义必须由研究者补充核实，请勿直接作为论文结论使用。
                </Note>
                <div className="mt-3 space-y-3">
                  {analysis.paragraphs.discussion.map((p, i) => (
                    <p key={i} className="text-sm leading-7">
                      <Badge variant="secondary" className="mr-2 bg-amber-500/15 text-amber-700 dark:text-amber-400">
                        推断
                      </Badge>
                      {p.replace(/^【(推断|局限|建议下一步)】/, "")}
                      {p.startsWith("【局限】") && (
                        <Badge variant="outline" className="ml-2 text-[10px]">局限</Badge>
                      )}
                      {p.startsWith("【建议下一步】") && (
                        <Badge variant="outline" className="ml-2 text-[10px]">下一步</Badge>
                      )}
                    </p>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  <Button onClick={saveToStoryboard}>
                    <Save className="size-4" aria-hidden />
                    保存发现并导出图表到故事板
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      copyText(
                        `结果\n\n${analysis.paragraphs.results.join("\n\n")}\n\n讨论（推断，需核实）\n\n${analysis.paragraphs.discussion.join("\n\n")}`,
                      )
                    }
                  >
                    复制全部段落
                  </Button>
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BarChartIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-12 text-muted-foreground/50" aria-hidden>
      <rect x="8" y="26" width="8" height="14" rx="1.5" fill="currentColor" />
      <rect x="20" y="16" width="8" height="24" rx="1.5" fill="currentColor" />
      <rect x="32" y="22" width="8" height="18" rx="1.5" fill="currentColor" />
      <path d="M12 20v6M24 10v6M36 16v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
