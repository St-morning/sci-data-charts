import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileImage, Palette, ClipboardCopy, Type, SlidersHorizontal, BookOpenCheck, Languages, LayoutGrid, ShieldCheck } from "lucide-react";
import { ModuleHeader, Panel, DropZone, Field, Note } from "@/components/shared";
import { parseFile, parseCSVText, type RawTable } from "@/lib/data";
import { PALETTES, CMAPS, svgDocument, downloadSvg, downloadBlob, svgToPngBlob, scaleChartGeometry, sigLegendSvg, SIG_LEGEND, esc, type Theme } from "@/lib/chartcore";
import { DEFAULT_OPTS, type PlotOpts, type ChartModel } from "@/lib/chartmodel";
import { CHARTS, SHAPE_FIELDS, SHAPE_HINT, autoMap, prepare, type ChartSpec } from "@/lib/chartregistry";
import { generateInsights, type AnalysisMode } from "@/lib/chartinsights";
import { auditSvg } from "@/lib/chartqa";
import { addPanel, uid } from "@/lib/store";

const BOOL_LABEL: Record<string, string> = {
  points: "显示数据点", bars: "显示柱体", percent: "百分比堆积", lollipop: "棒棒糖样式",
  band: "置信/误差带", margBar: "边际条形面板", genes: "基因 ID 标注", gaps: "分类空行分隔",
  stems: "底面投影茎", contour: "底面等高投影", showLegend: "显示图例",
  sigLegend: "显著性图例（ns / * 含义）",
};

const FONT_OPTIONS: Record<string, string> = {
  Arial: "Arial, Helvetica, sans-serif",
  Helvetica: "Helvetica, Arial, sans-serif",
  "Times New Roman": "'Times New Roman', Times, serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  微软雅黑: "'Microsoft YaHei', 'PingFang SC', sans-serif",
  宋体: "SimSun, 'Songti SC', serif",
};

interface ReportPreset {
  widthCm: number; fontKey: string; tickPt: number; labelPt: number; titlePt: number; legendPt: number;
  lineScale: number; pointScale: number; grid: boolean;
}

const REPORT_PRESETS: Record<string, ReportPreset> = {
  "Nature 科研图": { widthCm: 8.5, fontKey: "Arial", tickPt: 7, labelPt: 8, titlePt: 9, legendPt: 7, lineScale: 1, pointScale: 1, grid: false },
  "标准实验报告": { widthCm: 12, fontKey: "Times New Roman", tickPt: 9, labelPt: 10, titlePt: 12, legendPt: 9, lineScale: 1.15, pointScale: 1, grid: false },
  "BI 展示看板": { widthCm: 17, fontKey: "微软雅黑", tickPt: 10, labelPt: 11, titlePt: 14, legendPt: 10, lineScale: 1.25, pointScale: 1.1, grid: true },
};

function colorCount(m: ChartModel | null): number {
  if (!m) return 0;
  switch (m.kind) {
    case "groups": return m.series.length;
    case "labelseries": return m.series.length;
    case "pair": case "bar3d": case "enrich": return 2;
    case "seq": case "volcano": return 3;
    case "xy": case "xyz": case "roc": case "survival": case "pack": return m.groups.length;
    case "sets": return m.names.length;
    case "flow": return m.nodes.length;
    case "single": case "forest": case "words": return 1;
    default: return 0;
  }
}

function colorLabels(m: ChartModel | null): string[] {
  if (!m) return [];
  if (m.kind === "volcano") return ["上调", "下调", "不显著"];
  if (m.kind === "enrich") return ["上调条目", "下调条目"];
  if (m.kind === "pair") return [m.aName, m.bName];
  if (m.kind === "bar3d") return [m.barName, m.lineName];
  if (m.kind === "groups" || m.kind === "labelseries") return m.series;
  if (m.kind === "xy" || m.kind === "xyz" || m.kind === "roc" || m.kind === "survival" || m.kind === "pack") return m.groups;
  if (m.kind === "sets") return m.names;
  if (m.kind === "flow") return m.nodes;
  return Array.from({ length: colorCount(m) }, (_, i) => `颜色 ${i + 1}`);
}

function modelStrings(m: ChartModel | null): string[] {
  if (!m) return [];
  const out = new Set<string>();
  const add = (s: string | undefined) => { if (s && s.trim()) out.add(s); };
  const addAll = (xs: string[]) => xs.forEach(add);
  switch (m.kind) {
    case "groups": addAll(m.groups); addAll(m.series); add(m.valueName); break;
    case "labelseries": addAll(m.labels); addAll(m.series); break;
    case "pair": addAll(m.labels); add(m.aName); add(m.bName); break;
    case "seq": addAll(m.labels); add(m.valueName); break;
    case "single": add(m.valueName); break;
    case "xy": addAll(m.groups); add(m.xName); add(m.yName); m.pts.forEach((p) => add(p.label)); break;
    case "xlong": addAll(m.series); add(m.xName); add(m.valueName); break;
    case "matrix": addAll(m.rows); addAll(m.cols); break;
    case "volcano": m.items.slice(0, 30).forEach((it) => add(it.label)); break;
    case "enrich": m.terms.forEach((t) => add(t.term)); break;
    case "xyz": addAll(m.groups); m.names.forEach(add); break;
    case "bar3d": addAll(m.labels); add(m.barName); add(m.lineName); break;
    case "sets": addAll(m.names); break;
    case "flow": addAll(m.nodes); break;
    case "roc": case "survival": addAll(m.groups); break;
    case "forest": m.items.forEach((it) => add(it.label)); break;
    case "words": m.items.slice(0, 40).forEach((it) => add(it.word)); break;
    case "pack": addAll(m.groups); m.items.forEach((it) => add(it.label)); break;
  }
  return [...out];
}

function applyRenames(inner: string, renames: Record<string, string>): string {
  const entries = Object.entries(renames)
    .filter(([k, v]) => k !== v && v.trim())
    .map(([k, v]) => [esc(k), esc(v)] as const);
  if (!entries.length) return inner;
  return inner.replace(/>([^<>]+)</g, (whole, content: string) => {
    let c = content;
    for (const [from, to] of entries) c = c.split(from).join(to);
    return c === content ? whole : `>${c}<`;
  });
}

function MappingSelects({ shape, table, map, onChange }: {
  shape: ChartSpec["shape"]; table: RawTable; map: Record<string, number>;
  onChange: (m: Record<string, number>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {SHAPE_FIELDS[shape].map((f) => (
        <Field key={f.key} label={f.label}>
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={map[f.key] ?? -1}
            onChange={(e) => onChange({ ...map, [f.key]: Number(e.target.value) })}
          >
            {f.optional && <option value={-1}>（不使用）</option>}
            {table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
          </select>
        </Field>
      ))}
    </div>
  );
}

function TablePeek({ table }: { table: RawTable }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead><tr className="bg-secondary/60">{table.headers.slice(0, 7).map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>{table.rows.slice(0, 4).map((r, i) => <tr key={i} className="border-t border-border">{r.slice(0, 7).map((c, j) => <td key={j} className="num px-2 py-1 text-muted-foreground">{c}</td>)}</tr>)}</tbody>
      </table>
      <p className="border-t border-border px-2 py-1 text-[11px] text-muted-foreground">共 {table.rows.length} 行 × {table.headers.length} 列 · 来源：{table.sourceName}</p>
    </div>
  );
}

export default function PlotStudio() {
  const [specId, setSpecId] = useState(CHARTS[0].id);
  const spec = CHARTS.find((c) => c.id === specId)!;
  const [table, setTable] = useState<RawTable>(() => CHARTS[0].sample());
  const [table2, setTable2] = useState<RawTable | null>(null);
  const [map, setMap] = useState<Record<string, number>>(() => autoMap(CHARTS[0].shape, CHARTS[0].sample()));
  const [map2, setMap2] = useState<Record<string, number>>({});
  const [paletteName, setPaletteName] = useState("Nature");
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [textColor, setTextColor] = useState("#1a1a1a");
  const [axisColor, setAxisColor] = useState("#444444");
  const [bgMode, setBgMode] = useState<"white" | "transparent" | "custom">("white");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [preset, setPreset] = useState("Nature 科研图");
  const [fontKey, setFontKey] = useState("Arial");
  const [tickPt, setTickPt] = useState(7);
  const [labelPt, setLabelPt] = useState(8);
  const [titlePt, setTitlePt] = useState(9);
  const [legendPt, setLegendPt] = useState(7);
  const [lineScale, setLineScale] = useState(1);
  const [pointScale, setPointScale] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [widthCm, setWidthCm] = useState(8.5);
  const [opts, setOpts] = useState<PlotOpts>({ ...DEFAULT_OPTS });
  const [styleTab, setStyleTab] = useState<"report" | "color" | "options" | "text">("report");
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("experiment");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pngBusy, setPngBusy] = useState(false);

  const families = useMemo(() => {
    const byFamily = new Map<string, ChartSpec[]>();
    for (const c of CHARTS) {
      if (!byFamily.has(c.family)) byFamily.set(c.family, []);
      byFamily.get(c.family)!.push(c);
    }
    return [...byFamily.entries()].map(([name, specs]) => ({ name, specs }));
  }, []);

  function selectSpec(id: string) {
    const sp = CHARTS.find((c) => c.id === id)!;
    const t = sp.sample();
    setSpecId(id);
    setTable(t);
    setMap(autoMap(sp.shape, t));
    if (sp.shape2 && sp.sample2) {
      const t2 = sp.sample2();
      setTable2(t2);
      setMap2(autoMap(sp.shape2, t2));
    } else {
      setTable2(null);
      setMap2({});
    }
  }

  async function onFiles(files: File[], second: boolean) {
    try {
      const t = await parseFile(files[0]);
      if (t.rows.length === 0) { toast.error("文件为空或无法解析"); return; }
      const shape = second ? spec.shape2! : spec.shape;
      if (second) { setTable2(t); setMap2(autoMap(shape, t)); }
      else { setTable(t); setMap(autoMap(shape, t)); }
      toast.success(`已载入 ${t.sourceName}（${t.rows.length} 行）`);
    } catch (e) {
      toast.error(`解析失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function applyPaste(second: boolean) {
    const t = parseCSVText(pasteText, "粘贴数据");
    if (t.rows.length === 0) { toast.error("未解析到数据行，请检查分隔符与表头"); return; }
    const shape = second ? spec.shape2! : spec.shape;
    if (second) { setTable2(t); setMap2(autoMap(shape, t)); }
    else { setTable(t); setMap(autoMap(shape, t)); }
    setPasteOpen(false);
    toast.success(`已解析粘贴数据（${t.rows.length} 行）`);
  }

  function applyPreset(name: string) {
    const p = REPORT_PRESETS[name];
    if (!p) return;
    setPreset(name);
    setWidthCm(p.widthCm);
    setFontKey(p.fontKey);
    setTickPt(p.tickPt);
    setLabelPt(p.labelPt);
    setTitlePt(p.titlePt);
    setLegendPt(p.legendPt);
    setLineScale(p.lineScale);
    setPointScale(p.pointScale);
    setShowGrid(p.grid);
    if (name === "BI 展示看板") setAnalysisMode("bi");
  }

  const theme: Theme = useMemo(() => {
    const units = (pt: number) => pt * 1000 / ((widthCm / 2.54) * 72);
    const tickFont = units(tickPt);
    return {
      colors: PALETTES[paletteName].map((c, i) => overrides[i] ?? c),
      text: textColor,
      axis: axisColor,
      bg: bgMode === "transparent" ? "transparent" : bgMode === "custom" ? bgColor : "#ffffff",
      fontScale: tickFont / 22,
      fontFamily: FONT_OPTIONS[fontKey],
      tickFont,
      labelFont: units(labelPt),
      titleFont: units(titlePt),
      legendFont: units(legendPt),
      grid: showGrid,
      showAxisLabels: opts.showAxisLabels,
    };
  }, [paletteName, overrides, textColor, axisColor, bgMode, bgColor, fontKey, tickPt, labelPt, titlePt, legendPt, widthCm, showGrid, opts.showAxisLabels]);

  const effectiveOpts = useMemo<PlotOpts>(() => ({
    ...opts,
    error: opts.showError ? opts.error : "none",
    xLabel: opts.showAxisLabels ? opts.xLabel : "",
    yLabel: opts.showAxisLabels ? opts.yLabel : "",
  }), [opts]);

  const prepared = useMemo(() => prepare(spec.shape, table, map), [spec, table, map]);
  const prepared2 = useMemo(() => (spec.shape2 && table2 ? prepare(spec.shape2, table2, map2) : null), [spec, table2, map2]);
  const model = "error" in prepared ? null : prepared;
  const model2 = prepared2 && !("error" in prepared2) ? prepared2 : null;
  const prepError = "error" in prepared ? prepared.error : prepared2 && "error" in prepared2 ? prepared2.error : null;

  const rendered = useMemo(() => {
    if (!model) return null;
    try {
      const r = spec.render(model, model2, theme, effectiveOpts);
      let inner = scaleChartGeometry(r.inner, lineScale, pointScale);
      inner = applyRenames(inner, renames);
      let h = r.h;
      const hasSig = effectiveOpts.sig !== "none" && spec.opts.includes("sig");
      if (effectiveOpts.sigLegend && hasSig && !inner.includes("ns P≥0.05")) {
        inner += sigLegendSvg(theme, 14, h + 20);
        h += 34;
      }
      return { inner, w: r.w, h };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [spec, model, model2, theme, effectiveOpts, lineScale, pointScale, renames]);
  const renderError = rendered && "error" in rendered ? rendered.error : null;
  const svg = useMemo(() => {
    if (!rendered || "error" in rendered) return "";
    return svgDocument(rendered.inner, rendered.w, rendered.h, widthCm, theme);
  }, [rendered, widthCm, theme]);

  useEffect(() => { setRenames({}); }, [specId, table]);

  const qa = useMemo(() => {
    if (!svg || !rendered || "error" in rendered) return null;
    try { return auditSvg(svg, rendered.w, rendered.h, widthCm); } catch { return null; }
  }, [svg, rendered, widthCm]);

  const renameCandidates = useMemo(() => modelStrings(model), [model]);

  function addToCompose() {
    if (!svg || !rendered || "error" in rendered) return;
    addPanel({ id: uid(), name: opts.title || spec.name, kind: "svg", svg, w: rendered.w, h: rendered.h, createdAt: Date.now() });
    toast.success("已加入排版工作台", { action: { label: "去排版", onClick: () => { window.location.hash = "#/compose"; } } });
  }

  const conclusion = useMemo(() => {
    if (!model) return null;
    try { return spec.conclude(model, model2, effectiveOpts); } catch { return null; }
  }, [spec, model, model2, effectiveOpts]);
  const insights = useMemo(() => model ? generateInsights(model, model2, analysisMode) : null, [model, model2, analysisMode]);

  const nColors = colorCount(model);
  const labels = colorLabels(model);

  function setOpt<K extends keyof PlotOpts>(k: K, v: PlotOpts[K]) {
    setOpts((o) => ({ ...o, [k]: v }));
  }

  async function exportPng() {
    if (!svg || !rendered || "error" in rendered) return;
    setPngBusy(true);
    try {
      const heightCm = (widthCm * rendered.h) / rendered.w;
      const blob = await svgToPngBlob(svg, widthCm, heightCm, 600);
      downloadBlob(`${spec.id}-600dpi.png`, blob);
      toast.success("已导出 600 dpi PNG（含物理分辨率元数据）");
    } catch (e) {
      toast.error(`PNG 导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPngBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); toast.success(`${label}已复制`); }
    catch { toast.error("复制失败，请手动选择文本"); }
  }

  const optControl = (k: keyof PlotOpts) => {
    if (k in BOOL_LABEL) return (
      <label key={k} className="flex min-h-9 items-center gap-2 rounded-md border border-border px-2.5 text-sm">
        <input type="checkbox" checked={Boolean(opts[k])} onChange={(e) => setOpt(k, e.target.checked as never)} className="size-4 accent-[var(--site-accent)]" />
        {BOOL_LABEL[k]}
      </label>
    );
    if (k === "sig") return (
      <Field key={k} label="显著性标注">
        <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={opts.sig} onChange={(e) => setOpt("sig", e.target.value as PlotOpts["sig"])}>
          <option value="vsFirst">各组 vs 第一组</option><option value="adjacent">相邻组比较</option><option value="none">不标注</option>
        </select>
      </Field>
    );
    if (k === "fit") return (
      <Field key={k} label="拟合模型">
        <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={opts.fit} onChange={(e) => setOpt("fit", e.target.value as PlotOpts["fit"])}>
          <option value="linear">线性回归</option><option value="poly2">二次多项式</option>
        </select>
      </Field>
    );
    if (k === "bins") return (
      <Field key={k} label={`分箱数：${opts.bins}`}>
        <input type="range" min={4} max={40} value={opts.bins} onChange={(e) => setOpt("bins", Number(e.target.value))} className="w-full accent-[var(--site-accent)]" />
      </Field>
    );
    if (k === "az" || k === "el") return (
      <Field key={k} label={`${k === "az" ? "方位角" : "仰角"}：${opts[k]}°`}>
        <input type="range" min={k === "az" ? -180 : 5} max={k === "az" ? 180 : 80} value={opts[k]} onChange={(e) => setOpt(k, Number(e.target.value))} className="w-full accent-[var(--site-accent)]" />
      </Field>
    );
    if (k === "cmap") return (
      <Field key={k} label="热图色标">
        <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={opts.cmap} onChange={(e) => setOpt("cmap", e.target.value)}>
          {Object.keys(CMAPS).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
    );
    if (k === "labelPos") return (
      <Field key={k} label="数值标签位置">
        <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={opts.labelPos} onChange={(e) => setOpt("labelPos", e.target.value as PlotOpts["labelPos"])}>
          <option value="above">柱顶上方</option><option value="inside">柱内顶端</option><option value="none">不标注</option>
        </select>
      </Field>
    );
    return null;
  };

  const ptInput = (label: string, value: number, set: (v: number) => void) => (
    <Field key={label} label={label}>
      <div className="flex items-center gap-2">
        <input type="number" min={5} max={28} step={0.5} value={value} onChange={(e) => { set(Number(e.target.value)); setPreset("自定义"); }} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" />
        <span className="text-xs text-muted-foreground">pt</span>
      </div>
    </Field>
  );

  const chineseReport = conclusion && insights ? [
    ...conclusion.facts, ...conclusion.inference,
    "【详细统计】", ...insights.details,
    "【报告建议】", ...insights.recommendations,
  ].join("\n") : "";

  return (
    <div>
      <ModuleHeader
        code="MOD-06"
        title="科研与 BI 绘图工作台"
        desc={`${CHARTS.length} 种图形统一支持数据映射、期刊配色、报告级字体字号与线宽控制、坐标轴和误差线开关、显著性星号含义图例与图内中英文文字改写；导出前自动检查文字碰撞、越界与遮挡，可一键加入多图排版。`}
      />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {[`${CHARTS.length} 种图形`, "字体 / 字号 / 线宽", "文字遮挡质量门", "图内文字中英改写", "SVG + 600 dpi PNG"].map((x) => <span key={x} className="rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">{x}</span>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Panel title={`图形库 · ${CHARTS.length}`} className="self-start lg:sticky lg:top-4">
          <div className="max-h-[72vh] space-y-3 overflow-y-auto pr-1">
            {families.map((f) => (
              <div key={f.name}>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground">{f.name}</p>
                <div className="space-y-0.5">
                  {f.specs.map((c) => (
                    <button key={c.id} type="button" onClick={() => selectSpec(c.id)} className={`block w-full rounded-md px-2 py-1.5 text-left text-xs leading-snug transition-colors ${c.id === specId ? "bg-primary/10 font-medium text-primary" : "hover:bg-secondary"}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel title={`01 · 数据与映射`} aside={<span className="text-xs text-muted-foreground">{spec.docRef}</span>}>
            <Note>{SHAPE_HINT[spec.shape]}{spec.shape2 ? ` 组合图第二面板：${SHAPE_HINT[spec.shape2]}` : ""}</Note>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => selectSpec(specId)} className="rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80">载入示例数据</button>
              <button type="button" onClick={() => setPasteOpen((v) => !v)} className="rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80">粘贴 CSV / TSV</button>
            </div>
            {pasteOpen && (
              <div className="mt-3 space-y-2">
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} placeholder={"Group,Value\nControl,96.2\nControl,94.8\n…"} className="num w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
                <button type="button" onClick={() => applyPaste(false)} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">解析为主数据</button>
                {spec.shape2 && <button type="button" onClick={() => applyPaste(true)} className="ml-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">解析为第二面板</button>}
              </div>
            )}
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              <div className="space-y-3">
                <DropZone compact accept=".csv,.tsv,.txt,.xlsx,.xls" hint="主数据：CSV / TSV / Excel" onFiles={(f) => onFiles(f, false)} />
                <MappingSelects shape={spec.shape} table={table} map={map} onChange={setMap} />
                {(spec.shape === "matrix" || spec.shape === "labelseries") && <p className="text-xs text-muted-foreground">除行标签列外，其余数值列自动作为列变量 / 系列参与绘图。</p>}
                <TablePeek table={table} />
              </div>
              {spec.shape2 && table2 && (
                <div className="space-y-3">
                  <DropZone compact accept=".csv,.tsv,.txt,.xlsx,.xls" hint="第二面板：富集条目表" onFiles={(f) => onFiles(f, true)} />
                  <MappingSelects shape={spec.shape2} table={table2} map={map2} onChange={setMap2} />
                  <TablePeek table={table2} />
                </div>
              )}
            </div>
            {prepError && <div className="mt-3"><Note tone="warn">{prepError}</Note></div>}
          </Panel>

          <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_370px]">
            <Panel
              title="02 · 预览与导出"
              aside={
                <div className="flex gap-2">
                  <button type="button" disabled={!svg} onClick={() => { downloadSvg(`${spec.id}.svg`, svg); toast.success("已导出可编辑 SVG"); }} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"><Download className="size-3.5" aria-hidden />SVG</button>
                  <button type="button" disabled={!svg || pngBusy} onClick={exportPng} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"><FileImage className="size-3.5" aria-hidden />{pngBusy ? "渲染中…" : "PNG 600 dpi"}</button>
                </div>
              }
            >
              <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="rounded bg-secondary px-2 py-1">{spec.name}</span><span className="rounded bg-secondary px-2 py-1">{widthCm} cm</span><span className="rounded bg-secondary px-2 py-1">{fontKey}</span><span className="rounded bg-secondary px-2 py-1">轴线 {lineScale.toFixed(2)}×</span>
              </div>
              {renderError && <Note tone="warn">渲染失败：{renderError}</Note>}
              {!model && !prepError && <Note>等待数据…</Note>}
              {svg && <div className="overflow-x-auto rounded-lg border border-border bg-white p-3 shadow-inner"><div className="mx-auto" style={{ maxWidth: 860 }} dangerouslySetInnerHTML={{ __html: svg }} /></div>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={!svg} onClick={addToCompose} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-40"><LayoutGrid className="size-3.5" aria-hidden />加入多图排版</button>
                <span className="text-[11px] text-muted-foreground">在「多图排版」中组合成期刊 Figure（A/B/C 面板）。</span>
              </div>
              {qa && (
                <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-semibold"><ShieldCheck className="size-4 text-primary" aria-hidden />输出质量门 · 文字遮挡与覆盖检查</p>
                    <span className={`num rounded-full px-2 py-0.5 text-[11px] font-semibold ${qa.pass ? "bg-emerald-600/12 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>{qa.pass ? "PASS" : "需处理"}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-md bg-card px-1 py-1.5"><span className="num block text-sm font-semibold">{qa.overlap + qa.stroke}</span><span className="text-[10px] text-muted-foreground">文字碰撞</span></div>
                    <div className="rounded-md bg-card px-1 py-1.5"><span className="num block text-sm font-semibold">{qa.clip}</span><span className="text-[10px] text-muted-foreground">越界元素</span></div>
                    <div className="rounded-md bg-card px-1 py-1.5"><span className="num block text-sm font-semibold">{qa.occlusion}</span><span className="text-[10px] text-muted-foreground">遮挡风险</span></div>
                    <div className="rounded-md bg-card px-1 py-1.5"><span className="num block text-sm font-semibold">{qa.minPt ? qa.minPt.toFixed(1) : "—"}</span><span className="text-[10px] text-muted-foreground">最小字号 pt</span></div>
                  </div>
                  {qa.issues.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-[11px] leading-relaxed">
                      {qa.issues.slice(0, 4).map((it, i) => <li key={i} className={it.level === "FAIL" ? "text-destructive" : "text-muted-foreground"}>{it.level === "FAIL" ? "✕" : "!"} {it.msg}</li>)}
                      {qa.issues.length > 4 && <li className="text-muted-foreground">…共 {qa.issues.length} 条，缩小字号冲突可调大出版宽度或减小字号。</li>}
                    </ul>
                  ) : <p className="mt-2 text-[11px] text-muted-foreground">未检测到文字碰撞、越界或低对比度遮挡；最小字号 ≥ 5 pt，符合期刊可读性下限。</p>}
                </div>
              )}
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">字号按导出物理尺寸换算为 pt；线宽和数据点半径同步作用于全部图元。SVG 可在 Illustrator / Inkscape 中编辑，PNG 写入 600 dpi pHYs 元数据。</p>
            </Panel>

            <Panel title="03 · 图形规范" className="self-start">
              <div className="mb-4 grid grid-cols-4 rounded-lg bg-secondary p-1" role="tablist" aria-label="图形设置">
                {([{ id: "report", label: "出版样式", icon: Type }, { id: "color", label: "配色", icon: Palette }, { id: "options", label: "图形选项", icon: SlidersHorizontal }, { id: "text", label: "图内文字", icon: Languages }] as const).map((tab) => (
                  <button key={tab.id} type="button" role="tab" aria-selected={styleTab === tab.id} onClick={() => setStyleTab(tab.id)} className={`flex items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs ${styleTab === tab.id ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}><tab.icon className="size-3.5" aria-hidden />{tab.label}</button>
                ))}
              </div>

              {styleTab === "report" && (
                <div className="space-y-4">
                  <Field label="报告规范预设" hint="预设后仍可逐项微调，字号以最终导出尺寸为准">
                    <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={preset} onChange={(e) => e.target.value === "自定义" ? setPreset("自定义") : applyPreset(e.target.value)}>
                      {Object.keys(REPORT_PRESETS).map((p) => <option key={p} value={p}>{p}</option>)}<option value="自定义">自定义</option>
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="出版宽度">
                      <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={widthCm} onChange={(e) => { setWidthCm(Number(e.target.value)); setPreset("自定义"); }}><option value={8.5}>8.5 cm 单栏</option><option value={12}>12 cm 1.5 栏</option><option value={17}>17 cm 双栏</option></select>
                    </Field>
                    <Field label="全图字体">
                      <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={fontKey} onChange={(e) => { setFontKey(e.target.value); setPreset("自定义"); }}>{Object.keys(FONT_OPTIONS).map((f) => <option key={f} value={f}>{f}</option>)}</select>
                    </Field>
                    {ptInput("刻度字号", tickPt, setTickPt)}
                    {ptInput("轴标题字号", labelPt, setLabelPt)}
                    {ptInput("图标题字号", titlePt, setTitlePt)}
                    {ptInput("图例字号", legendPt, setLegendPt)}
                    <Field label={`线条粗细 ${lineScale.toFixed(2)}×`}>
                      <input type="range" min={0.4} max={2.5} step={0.05} value={lineScale} onChange={(e) => { setLineScale(Number(e.target.value)); setPreset("自定义"); }} className="w-full accent-[var(--site-accent)]" />
                    </Field>
                    <Field label={`数据点半径 ${pointScale.toFixed(2)}×`}>
                      <input type="range" min={0.5} max={2} step={0.05} value={pointScale} onChange={(e) => { setPointScale(Number(e.target.value)); setPreset("自定义"); }} className="w-full accent-[var(--site-accent)]" />
                    </Field>
                  </div>
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold">坐标轴标签</p>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={opts.showAxisLabels} onChange={(e) => setOpt("showAxisLabels", e.target.checked)} className="size-4 accent-[var(--site-accent)]" />显示 X / Y 轴标题</label>
                    <input aria-label="X 轴标签" disabled={!opts.showAxisLabels} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm disabled:opacity-40" value={opts.xLabel} onChange={(e) => setOpt("xLabel", e.target.value)} placeholder="X 轴标签（留空自动）" />
                    <input aria-label="Y 轴标签" disabled={!opts.showAxisLabels} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm disabled:opacity-40" value={opts.yLabel} onChange={(e) => setOpt("yLabel", e.target.value)} placeholder="Y 轴标签（留空自动）" />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showGrid} onChange={(e) => { setShowGrid(e.target.checked); setPreset("自定义"); }} className="size-4 accent-[var(--site-accent)]" />水平网格线（BI 展示）</label>
                  </div>
                  {spec.opts.includes("error") && (
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={opts.showError} onChange={(e) => setOpt("showError", e.target.checked)} className="size-4 accent-[var(--site-accent)]" />显示误差线</label>
                      <select aria-label="误差线定义" disabled={!opts.showError} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm disabled:opacity-40" value={opts.error} onChange={(e) => setOpt("error", e.target.value as PlotOpts["error"])}>
                        <option value="sd">SD（标准差）</option><option value="sem">SEM（标准误）</option><option value="ci95">95% CI</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {styleTab === "color" && (
                <div className="space-y-4">
                  <Field label="配色预设" hint="默认 Nature（npg），可逐色覆盖">
                    <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={paletteName} onChange={(e) => { setPaletteName(e.target.value); setOverrides({}); }}>{Object.keys(PALETTES).map((p) => <option key={p} value={p}>{p}</option>)}</select>
                  </Field>
                  {nColors > 0 && <div className="grid grid-cols-2 gap-2">{Array.from({ length: Math.min(nColors, 10) }, (_, i) => <label key={i} className="flex items-center gap-1.5 text-xs"><input type="color" className="size-8 cursor-pointer rounded border border-border bg-background" value={overrides[i] ?? PALETTES[paletteName][i % PALETTES[paletteName].length]} onChange={(e) => setOverrides((o) => ({ ...o, [i]: e.target.value }))} />{labels[i] ?? `颜色 ${i + 1}`}</label>)}</div>}
                  {Object.keys(overrides).length > 0 && <button type="button" onClick={() => setOverrides({})} className="text-xs text-primary underline">恢复预设色</button>}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="文字颜色"><input type="color" className="h-9 w-full rounded-md border border-border bg-background" value={textColor} onChange={(e) => setTextColor(e.target.value)} /></Field>
                    <Field label="坐标轴颜色"><input type="color" className="h-9 w-full rounded-md border border-border bg-background" value={axisColor} onChange={(e) => setAxisColor(e.target.value)} /></Field>
                  </div>
                  <Field label="背景"><div className="flex gap-2"><select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={bgMode} onChange={(e) => setBgMode(e.target.value as typeof bgMode)}><option value="white">白色</option><option value="transparent">透明</option><option value="custom">自定义</option></select>{bgMode === "custom" && <input type="color" className="h-9 w-12 shrink-0 rounded-md border border-border bg-background" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />}</div></Field>
                </div>
              )}

              {styleTab === "options" && (
                <div className="space-y-3">
                  <Field label="图标题"><input className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={opts.title} onChange={(e) => setOpt("title", e.target.value)} placeholder="可选" /></Field>
                  <div className="grid gap-2 sm:grid-cols-2">{spec.opts.filter((k) => k !== "error").map(optControl)}</div>
                  {spec.opts.includes("sig") && !spec.opts.includes("sigLegend") && (
                    <label className="flex min-h-9 items-center gap-2 rounded-md border border-border px-2.5 text-sm">
                      <input type="checkbox" checked={opts.sigLegend} onChange={(e) => setOpt("sigLegend", e.target.checked)} className="size-4 accent-[var(--site-accent)]" />
                      显著性图例（ns / * 含义）
                    </label>
                  )}
                  {spec.opts.includes("sig") && (
                    <p className="rounded-md bg-secondary/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">星号含义：{SIG_LEGEND}。星号表示证据强度（P 值阈值），不代表效应大小；图注中仍需注明检验方法与 n。</p>
                  )}
                </div>
              )}

              {styleTab === "text" && (
                <div className="space-y-3">
                  <Note>把图中任意文字（组名、系列名、轴名、条目名）改写为中文或英文，全图同步替换；留空表示不改。切换图形或数据后重置。</Note>
                  {renameCandidates.length === 0 ? <p className="text-xs text-muted-foreground">当前数据无可改写的文字标签。</p> : (
                    <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                      {renameCandidates.map((s) => (
                        <div key={s} className="flex items-center gap-2">
                          <span className="w-2/5 shrink-0 truncate text-xs text-muted-foreground" title={s}>{s}</span>
                          <input
                            aria-label={`改写 ${s}`}
                            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                            value={renames[s] ?? ""}
                            placeholder="改为…（中 / 英文）"
                            onChange={(e) => setRenames((r) => ({ ...r, [s]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {Object.keys(renames).length > 0 && <button type="button" onClick={() => setRenames({})} className="text-xs text-primary underline">清除全部改写</button>}
                </div>
              )}
            </Panel>
          </div>

          <Panel
            title="04 · 数据解释与报告文本"
            aside={
              <div className="flex rounded-md bg-secondary p-0.5" role="tablist" aria-label="分析场景">
                <button type="button" role="tab" aria-selected={analysisMode === "experiment"} onClick={() => setAnalysisMode("experiment")} className={`rounded px-2.5 py-1 text-xs ${analysisMode === "experiment" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>实验科研</button>
                <button type="button" role="tab" aria-selected={analysisMode === "bi"} onClick={() => setAnalysisMode("bi")} className={`rounded px-2.5 py-1 text-xs ${analysisMode === "bi" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>BI 分析</button>
              </div>
            }
          >
            {conclusion && insights ? (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {insights.metrics.map((metric, mi) => <div key={`${metric.label}-${mi}`} className="rounded-lg border border-border bg-secondary/45 px-3 py-2.5"><p className="text-[11px] text-muted-foreground">{metric.label}</p><p className="num mt-1 truncate text-sm font-semibold" title={metric.value}>{metric.value}</p></div>)}
                </div>
                <ul className="space-y-1.5">
                  {conclusion.facts.map((f, i) => <li key={i} className="flex gap-2 text-sm leading-relaxed"><span className="mt-0.5 shrink-0 rounded bg-emerald-600/12 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">数据事实</span><span className="num">{f}</span></li>)}
                  {conclusion.inference.map((f, i) => <li key={i} className="flex gap-2 text-sm leading-relaxed"><span className="mt-0.5 shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">模型推断</span><span>{f}</span></li>)}
                </ul>
                <details className="rounded-lg border border-border bg-secondary/25">
                  <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">完整统计明细（{insights.details.length} 条）</summary>
                  <ul className="max-h-80 space-y-2 overflow-y-auto border-t border-border px-3 py-3">
                    {insights.details.map((d, i) => <li key={i} className="num text-xs leading-relaxed text-muted-foreground">{d}</li>)}
                  </ul>
                </details>
                <div className="rounded-lg border border-border px-3 py-3">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><BookOpenCheck className="size-4 text-primary" aria-hidden />{analysisMode === "experiment" ? "实验报告规范与复核建议" : "BI 指标口径与复核建议"}</p>
                  <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">{insights.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
                <div className="rounded-md border border-border bg-secondary/40 px-3 py-2">
                  <p className="mb-1 text-[11px] font-semibold text-muted-foreground">English figure legend / results sentence</p>
                  <p className="text-sm leading-relaxed">{conclusion.en}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => copy(chineseReport, "完整中文报告")} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1.5 text-xs hover:bg-secondary/80"><ClipboardCopy className="size-3" aria-hidden />复制完整中文报告</button>
                  <button type="button" onClick={() => copy(conclusion.en, "英文图注")} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1.5 text-xs hover:bg-secondary/80"><ClipboardCopy className="size-3" aria-hidden />复制英文图注</button>
                </div>
                <Note>事实、详细指标与推断已分层呈现；统计结果基于当前上传数据自动计算，投稿或经营决策前请结合实验设计、数据口径与原始记录复核。</Note>
              </div>
            ) : <Note>载入有效数据后自动生成结论。</Note>}
          </Panel>
        </div>
      </div>
    </div>
  );
}