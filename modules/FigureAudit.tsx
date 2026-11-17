import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckItem, DropZone, Field, ModuleHeader, Note, Panel, type CheckStatus } from "@/components/shared";
import {
  CVD_LABELS,
  contrastRatio,
  deltaE,
  detectScaleBar,
  dominantColors,
  loadImageFromFile,
  luminance,
  renderCvd,
  rgbCss,
  rgbHex,
  simulateCvdRgb,
  toCanvas,
  type CvdType,
  type DominantColor,
} from "@/lib/image";
import { sigFigs } from "@/lib/stats";
import { Play } from "lucide-react";

const selectCls =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

const UNIT_TOKENS = [
  "%", "‰", "°C", "℃", "K", "M", "mM", "µM", "uM", "μM", "nM", "pM",
  "mg", "g", "kg", "µg", "ug", "ng", "pg", "mL", "L", "µL", "uL", "dL",
  "s", "ms", "min", "h", "d", "Hz", "kHz", "MHz", "nm", "µm", "um", "mm", "cm",
  "V", "mV", "A", "mA", "W", "mW", "Pa", "kPa", "MPa", "rpm", "OD", "AU",
  "RFU", "cps", "Da", "kDa", "bp", "kb", "kDa", "mol", "mmol", "µmol",
  "U", "IU", "cells", "counts", "×g", "ng/mL", "mg/L", "g/L", "U/mL", "IU/mL",
  "mmol/L", "µmol/L", "mg/dL", "mM/min", "s⁻¹", "min⁻¹",
];

const DIMENSIONLESS = [
  "相对", "比值", "ratio", "fold", "归一化", "normalized", "a.u", "任意单位",
  "百分比", "分数", "score", "index", "指数", "表达量", "活性", "荧光强度比",
];

const CATEGORICAL = [
  "分组", "组别", "样品", "样本", "条件", "处理", "类别", "类型", "组名", "编号",
  "group", "sample", "condition", "treatment", "category", "type",
];

function detectUnit(label: string): { found: string | null; dimensionless: boolean } {
  const t = label.trim();
  if (!t) return { found: null, dimensionless: false };
  const lower = t.toLowerCase();
  if (CATEGORICAL.some((c) => lower === c.toLowerCase() || lower.startsWith(c.toLowerCase() + "（") || lower.startsWith(c.toLowerCase() + "("))) {
    return { found: null, dimensionless: true };
  }
  for (const d of DIMENSIONLESS) {
    if (lower.includes(d.toLowerCase())) return { found: null, dimensionless: true };
  }
  const paren = t.match(/[（(]([^)）]+)[)）]/);
  if (paren) {
    const inner = paren[1].trim();
    if (/[a-zA-Zµμ°%]/.test(inner)) return { found: inner, dimensionless: false };
  }
  const sorted = [...UNIT_TOKENS].sort((a, b) => b.length - a.length);
  for (const u of sorted) {
    const re = new RegExp(`(^|[\\s/·,，])${u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[\\s/·,，)）])`);
    if (re.test(t)) return { found: u, dimensionless: false };
  }
  if (/\/\s*[a-zA-Zµμ]/.test(t)) return { found: t.split("/").pop()?.trim() ?? null, dimensionless: false };
  return { found: null, dimensionless: false };
}

function hueOf([r, g, b]: [number, number, number]): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function isRedGreenPair(a: [number, number, number], b: [number, number, number]): boolean {
  const zone = (rgb: [number, number, number]) => {
    const h = hueOf(rgb);
    const sat = (Math.max(...rgb) - Math.min(...rgb)) / Math.max(...rgb);
    if (sat < 0.25) return null;
    if (h >= 330 || h <= 25) return "red";
    if (h >= 80 && h <= 170) return "green";
    return null;
  };
  const za = zone(a);
  const zb = zone(b);
  return (za === "red" && zb === "green") || (za === "green" && zb === "red");
}

function extractNumbers(text: string): { value: number; raw: string; decimals: number }[] {
  const out: { value: number; raw: string; decimals: number }[] = [];
  const re = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const value = Number(raw);
    if (!isFinite(value)) continue;
    const dec = raw.includes(".") ? raw.split(".")[1].length : 0;
    out.push({ value, raw, decimals: dec });
  }
  return out;
}

interface ColorPairIssue {
  a: DominantColor;
  b: DominantColor;
  de: number;
  cvd: { type: CvdType; de: number }[];
}

interface AuditResult {
  checks: { status: CheckStatus; title: string; detail: string }[];
  colors: DominantColor[];
  pairs: ColorPairIssue[];
  cvdPreviews: { type: CvdType; url: string }[];
  originalUrl: string;
  scaleBar: { found: boolean; note: string };
  luminanceSpread: number;
}

export default function FigureAudit() {
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [xLabel, setXLabel] = useState("");
  const [yLabel, setYLabel] = useState("");
  const [errorBar, setErrorBar] = useState("未说明");
  const [dataMeans, setDataMeans] = useState("");
  const [pValue, setPValue] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const previewUrl = useMemo(() => imgUrl, [imgUrl]);

  async function onFiles(files: File[]) {
    const f = files[0];
    if (!f.type.startsWith("image/")) {
      setError("请上传图片文件（PNG / JPG / WebP 等）");
      return;
    }
    setImgFile(f);
    setImgUrl(URL.createObjectURL(f));
    setResult(null);
    setError("");
  }

  async function runAudit() {
    if (!imgFile) {
      setError("请先上传需要复核的论文插图");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const img = await loadImageFromFile(imgFile);
      const canvas = toCanvas(img, 640);
      const colors = dominantColors(canvas, 5);
      const pairs: ColorPairIssue[] = [];
      for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
          const de = deltaE(colors[i].rgb, colors[j].rgb);
          const cvd = (Object.keys(CVD_LABELS) as CvdType[]).map((type) => ({
            type,
            de: deltaE(simulateCvdRgb(colors[i].rgb, type), simulateCvdRgb(colors[j].rgb, type)),
          }));
          pairs.push({ a: colors[i], b: colors[j], de, cvd });
        }
      }
      const cvdPreviews = (Object.keys(CVD_LABELS) as CvdType[]).map((type) => ({
        type,
        url: renderCvd(canvas, type),
      }));
      const bar = detectScaleBar(canvas);
      const checks: AuditResult["checks"] = [];

      // 1. 坐标轴单位
      const xu = detectUnit(xLabel);
      const yu = detectUnit(yLabel);
      if (!xLabel.trim() && !yLabel.trim()) {
        checks.push({ status: "info", title: "坐标轴单位", detail: "未填写坐标轴标签，跳过单位检查。填写后可自动检测单位缺失与标注方式。" });
      } else {
        const missing: string[] = [];
        if (xLabel.trim() && !xu.found && !xu.dimensionless) missing.push(`X 轴「${xLabel}」`);
        if (yLabel.trim() && !yu.found && !yu.dimensionless) missing.push(`Y 轴「${yLabel}」`);
        if (missing.length > 0) {
          checks.push({ status: "warn", title: "坐标轴单位缺失", detail: `${missing.join("、")}未检测到单位。物理量必须带单位（如 ng/mL、°C）；若为无量纲量，请显式标注「相对表达量」「a.u.」等。` });
        } else {
          const parts: string[] = [];
          if (xu.found) parts.push(`X 轴单位：${xu.found}`);
          if (yu.found) parts.push(`Y 轴单位：${yu.found}`);
          if (xu.dimensionless || yu.dimensionless) parts.push("含无量纲标注");
          checks.push({ status: "pass", title: "坐标轴单位", detail: `${parts.join("；")}。请确认单位与正文、图注一致，且使用期刊要求的符号（如 µ 而非 u）。` });
        }
      }

      // 2. 有效数字
      const captionNums = extractNumbers(caption);
      const overPrecise = captionNums.filter((n) => sigFigs(n.raw) > 4 && Math.abs(n.value) > 1e-3 && !/^[12]\d{3}$/.test(n.raw));
      const decSet = new Set(captionNums.filter((n) => n.decimals > 0).map((n) => n.decimals));
      const mixedPrecision = decSet.size >= 2 && Math.max(...decSet) - Math.min(...decSet) >= 2;
      if (!caption.trim()) {
        checks.push({ status: "info", title: "有效数字", detail: "未填写图注，跳过有效数字检查。" });
      } else if (overPrecise.length > 0 || mixedPrecision) {
        const msgs: string[] = [];
        if (overPrecise.length > 0) msgs.push(`疑似过度精确（>4 位有效数字）：${overPrecise.slice(0, 4).map((n) => n.raw).join("、")}`);
        if (mixedPrecision) msgs.push(`小数位数不一致（${[...decSet].sort().join(" / ")} 位混用），同一指标应统一精度`);
        checks.push({ status: "warn", title: "有效数字与精度", detail: `${msgs.join("；")}。测量值的末位应与仪器精度对齐，均值的小数位通常不超过 SD 的 1–2 位。` });
      } else {
        checks.push({ status: "pass", title: "有效数字与精度", detail: `图注中提取到 ${captionNums.length} 个数值，未发现过度精确或明显的小数位混用。` });
      }

      // 3. 误差棒声明
      if (errorBar === "未说明") {
        checks.push({ status: "fail", title: "误差棒含义未声明", detail: "含误差棒的图必须在图注中写明是 SD、SEM 还是 95% CI，并报告每组样本量 n。否则读者无法判断变异程度，审稿人通常会直接要求补充。" });
      } else {
        const kw: Record<string, RegExp> = {
          SD: /SD|标准差|standard deviation/i,
          SEM: /SEM|标准误|standard error/i,
          "95% CI": /CI|置信区间|confidence interval/i,
          "无误差棒": /无误差棒|不含误差棒/,
        };
        const declaredInCaption = kw[errorBar]?.test(caption) ?? false;
        const hasN = /\bn\s*[=＝]\s*\d|样本量|例数|重复/i.test(caption);
        if (errorBar === "无误差棒") {
          checks.push({ status: "warn", title: "无误差棒", detail: "描述组间比较的柱状图通常应展示离散度（SD/SEM/CI）或原始数据点。请确认期刊与审稿要求。" });
        } else if (!declaredInCaption || !hasN) {
          const miss: string[] = [];
          if (!declaredInCaption) miss.push(`图注中未找到「${errorBar}」的明确文字说明`);
          if (!hasN) miss.push("图注中未找到样本量 n 的说明");
          checks.push({ status: "warn", title: "误差棒声明不完整", detail: `${miss.join("；")}。建议图注包含：误差棒 = ${errorBar}，n = 每组生物学重复数。` });
        } else {
          checks.push({ status: "pass", title: "误差棒声明", detail: `已选择 ${errorBar}，且图注中检测到对应说明与样本量描述。请确认 n 指生物学重复而非技术重复。` });
        }
      }

      // 4. 颜色辨识度
      if (colors.length < 2) {
        checks.push({ status: "info", title: "颜色辨识度", detail: "图中可提取的显著颜色不足 2 种，跳过配色检查（可能为灰度图或线条图）。" });
      } else {
        const tooClose = pairs.filter((p) => p.de < 18);
        const cvdFail = pairs.filter((p) => p.cvd.some((c) => c.de < 12));
        const redGreen = pairs.filter(
          (p) => isRedGreenPair(p.a.rgb, p.b.rgb) && Math.abs(luminance(p.a.rgb) - luminance(p.b.rgb)) < 0.25,
        );
        const pale = colors.filter((c) => contrastRatio(c.rgb, [255, 255, 255]) < 1.6);
        const lums = colors.map((c) => luminance(c.rgb));
        const spread = Math.max(...lums) - Math.min(...lums);
        if (redGreen.length > 0) {
          checks.push({ status: "fail", title: "红绿组合 + 明度接近", detail: `${redGreen.length} 对主色为红/绿色相组合且明度差 < 0.25（如 ${rgbHex(redGreen[0].a.rgb)} 与 ${rgbHex(redGreen[0].b.rgb)}）。红绿色觉障碍者（约 8% 男性）几乎无法区分这类系列，即使模拟色差数值尚可。请改用 Okabe-Ito 色盲安全调色板（如蓝/橙），或叠加形状与线型区分。` });
        } else if (cvdFail.length > 0) {
          checks.push({ status: "fail", title: "色觉障碍下不可区分", detail: `${cvdFail.length} 对颜色在色盲模拟后色差 ΔE < 12（如 ${cvdFail[0].a ? rgbHex(cvdFail[0].a.rgb) : ""} 与 ${rgbHex(cvdFail[0].b.rgb)}）。约 8% 男性读者存在红绿色觉障碍，请改用色盲安全配色（如 Okabe-Ito 调色板）或增加形状/纹理区分。` });
        } else if (tooClose.length > 0 || pale.length > 0) {
          const msgs: string[] = [];
          if (tooClose.length > 0) msgs.push(`${tooClose.length} 对主色色差偏小（ΔE < 18）`);
          if (pale.length > 0) msgs.push(`${pale.length} 种颜色与白底对比度过低（< 1.6:1），细线条可能看不清`);
          checks.push({ status: "warn", title: "颜色辨识度偏弱", detail: `${msgs.join("；")}。下方提供三种色觉模拟预览，请逐一目视确认系列仍可区分。` });
        } else {
          checks.push({ status: "pass", title: "颜色辨识度", detail: `提取到 ${colors.length} 种主色，两两色差与色盲模拟后色差均在可接受范围。仍建议目视检查下方模拟图。` });
        }
        if (spread < 0.15) {
          checks.push({ status: "warn", title: "灰度打印风险", detail: "主色明度差异过小，黑白打印或灰度阅读时可能无法区分系列。建议同时使用不同标记形状或线型。" });
        }
      }

      // 5. 图文结论一致性
      const p = pValue.trim() === "" ? null : Number(pValue);
      const means = extractNumbers(dataMeans).map((n) => n.value);
      const consistency: string[] = [];
      let cStatus: CheckStatus = "info";
      if (caption.trim() && (means.length > 0 || p !== null)) {
        cStatus = "pass";
        if (p !== null && isFinite(p)) {
          const claimsSig = /显著|明显|显著性/.test(caption) && !/不显著|无显著|未见显著|没有显著/.test(caption);
          const claimsNull = /不显著|无显著|未见显著|没有显著|无统计学差异/.test(caption);
          if (claimsSig && p >= 0.05) {
            cStatus = "fail";
            consistency.push(`图注声称「显著」，但提供的 p = ${p} ≥ 0.05，图文结论矛盾。`);
          } else if (claimsNull && p < 0.05) {
            cStatus = "fail";
            consistency.push(`图注声称「不显著」，但提供的 p = ${p} < 0.05，图文结论矛盾。`);
          } else {
            consistency.push(`显著性表述与提供的 p = ${p} 一致。`);
          }
        }
        if (means.length >= 2) {
          const capNums = extractNumbers(caption).map((n) => n.value);
          const unmatched = means.filter(
            (m) => !capNums.some((c) => Math.abs(c - m) <= Math.max(0.05 * Math.abs(m), 0.01)),
          );
          const direction = caption.match(/(升高|增加|提高|上调|增大|降低|减少|下降|下调|减小)/);
          if (unmatched.length > 0 && capNums.length > 0) {
            if (cStatus !== "fail") cStatus = "warn";
            consistency.push(`提供的数据均值 ${unmatched.map((v) => v.toPrecision(4)).join("、")} 未在图注数值中找到对应（容差 5%）。请核对图注是否引用了旧版本数据。`);
          } else if (capNums.length > 0) {
            consistency.push("图注数值与提供的数据均值在 5% 容差内对应。");
          }
          if (direction && means.length === 2) {
            const up = /(升高|增加|提高|上调|增大)/.test(direction[1]);
            const actualUp = means[1] > means[0];
            if (up !== actualUp) {
              cStatus = "fail";
              consistency.push(`图注方向词「${direction[1]}」与数据方向相反（第 2 组均值 ${means[1]} ${actualUp ? ">" : "<"} 第 1 组 ${means[0]}，按输入顺序）。`);
            } else {
              consistency.push(`变化方向词「${direction[1]}」与数据方向一致。`);
            }
          }
        }
        checks.push({ status: cStatus, title: "图文结论一致性", detail: consistency.join(" ") + "（启发式比对：仅核对数值与方向词，语义层面的结论仍需人工判断。）" });
      } else {
        checks.push({ status: "info", title: "图文结论一致性", detail: "填写图注，并可选提供「实际数据均值」与「检验 p 值」后，可自动核对数值引用、显著性表述与变化方向是否矛盾。" });
      }

      // 比例尺（显微图）
      const scaleBar = bar
        ? { found: true, note: `检测到疑似比例尺横条（约 ${bar.w}px 宽，位于图片${bar.y > canvas.height / 2 ? "下" : "上"}部）。请确认图注标明了比例尺代表的实际长度；多张图比较时比例尺必须一致或逐一标注。` }
        : { found: false, note: "未检测到明显比例尺。若为显微/成像图片，请确认已添加比例尺并在图注中说明长度。" };

      setResult({
        checks,
        colors,
        pairs,
        cvdPreviews,
        originalUrl: canvas.toDataURL("image/png"),
        scaleBar,
        luminanceSpread: 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      setBusy(false);
    }
  }

  const failCount = result?.checks.filter((c) => c.status === "fail").length ?? 0;
  const warnCount = result?.checks.filter((c) => c.status === "warn").length ?? 0;

  return (
    <div>
      <ModuleHeader
        code="MOD-01"
        title="论文图表自动复核"
        desc="上传插图并填写图注与坐标轴标签，自动检查单位、有效数字、误差棒声明、颜色辨识度（含三种色觉模拟）与图文结论一致性。检查为启发式规则，最终判断以人工复核为准。"
      />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <Panel title="1 · 插图与图注">
            <DropZone onFiles={onFiles} accept="image/*" hint="PNG / JPG / WebP，本地分析不上传" compact />
            {previewUrl && (
              <img src={previewUrl} alt="待复核插图预览" className="mt-3 max-h-52 w-full rounded-md border border-border object-contain" />
            )}
            <div className="mt-3 space-y-3">
              <Field label="图注（Figure caption）">
                <Textarea
                  rows={4}
                  placeholder="图 2. 处理组细胞存活率显著降低（均值 78.1% vs 96.2%，n = 12，误差棒为 SD，p = 0.003）。"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="X 轴标签">
                  <Input value={xLabel} onChange={(e) => setXLabel(e.target.value)} placeholder="如 处理时间 (h)" />
                </Field>
                <Field label="Y 轴标签">
                  <Input value={yLabel} onChange={(e) => setYLabel(e.target.value)} placeholder="如 细胞存活率 (%)" />
                </Field>
              </div>
              <Field label="图中误差棒含义">
                <select className={selectCls} value={errorBar} onChange={(e) => setErrorBar(e.target.value)}>
                  {["未说明", "SD", "SEM", "95% CI", "无误差棒"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Panel>
          <Panel title="2 · 一致性核对（可选）">
            <div className="space-y-3">
              <Field label="实际数据均值" hint="按图注叙述顺序填写，如 96.2, 78.1；用于核对图注数值与变化方向">
                <Input value={dataMeans} onChange={(e) => setDataMeans(e.target.value)} placeholder="96.2, 78.1" className="num" />
              </Field>
              <Field label="统计检验 p 值" hint="用于核对「显著 / 不显著」表述">
                <Input value={pValue} onChange={(e) => setPValue(e.target.value)} placeholder="0.003" className="num" />
              </Field>
              <Button className="w-full" onClick={runAudit} disabled={busy}>
                <Play className="size-4" aria-hidden />
                {busy ? "分析中…" : "开始复核"}
              </Button>
              {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          {!result ? (
            <Panel>
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <p className="text-sm font-medium">复核报告将显示在这里</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  至少上传一张插图即可开始；填写图注、坐标轴标签与数据均值可解锁全部五类检查。
                </p>
              </div>
            </Panel>
          ) : (
            <>
              <Panel
                title="复核报告"
                aside={
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="bg-rose-600/12 text-rose-700 dark:text-rose-400">{failCount} 项问题</Badge>
                    <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">{warnCount} 项注意</Badge>
                  </div>
                }
              >
                <ul>
                  {result.checks.map((c, i) => (
                    <CheckItem key={i} status={c.status} title={c.title} detail={c.detail} />
                  ))}
                  <CheckItem
                    status={result.scaleBar.found ? "info" : "warn"}
                    title="比例尺（成像类图片）"
                    detail={result.scaleBar.note}
                  />
                </ul>
              </Panel>

              {result.colors.length >= 2 && (
                <Panel title="色觉模拟预览">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <figure>
                      <img src={result.originalUrl} alt="原图" className="w-full rounded-md border border-border" />
                      <figcaption className="mt-1 text-center text-xs text-muted-foreground">原图</figcaption>
                    </figure>
                    {result.cvdPreviews.map((p) => (
                      <figure key={p.type}>
                        <img src={p.url} alt={CVD_LABELS[p.type]} className="w-full rounded-md border border-border" />
                        <figcaption className="mt-1 text-center text-xs text-muted-foreground">{CVD_LABELS[p.type]}</figcaption>
                      </figure>
                    ))}
                  </div>
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">主色与两两色差（ΔE，CIE76；&lt; 18 偏弱，色盲模拟后 &lt; 12 不可区分）</p>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {result.colors.map((c, i) => (
                        <span key={i} className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs">
                          <span className="size-3.5 rounded-full border border-black/10" style={{ background: rgbCss(c.rgb) }} />
                          <span className="num">{rgbHex(c.rgb)}</span>
                          <span className="text-muted-foreground">{Math.round(c.share * 100)}%</span>
                        </span>
                      ))}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-left text-muted-foreground">
                            <th className="py-1.5 pr-3 font-medium">颜色对</th>
                            <th className="num py-1.5 pr-3 font-medium">原图 ΔE</th>
                            <th className="num py-1.5 pr-3 font-medium">红色盲</th>
                            <th className="num py-1.5 pr-3 font-medium">绿色盲</th>
                            <th className="num py-1.5 font-medium">蓝色盲</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.pairs.map((p, i) => (
                            <tr key={i} className="border-b border-border/60 last:border-0">
                              <td className="py-1.5 pr-3">
                                <span className="mr-1 inline-block size-3 rounded-full align-middle" style={{ background: rgbCss(p.a.rgb) }} />
                                <span className="mr-2 inline-block size-3 rounded-full align-middle" style={{ background: rgbCss(p.b.rgb) }} />
                                <span className="num text-muted-foreground">{rgbHex(p.a.rgb)} / {rgbHex(p.b.rgb)}</span>
                              </td>
                              <td className={`num py-1.5 pr-3 ${p.de < 18 ? "text-amber-600 dark:text-amber-400" : ""}`}>{p.de.toFixed(1)}</td>
                              {p.cvd.map((c) => (
                                <td key={c.type} className={`num py-1.5 pr-3 ${c.de < 12 ? "font-semibold text-rose-600 dark:text-rose-400" : ""}`}>{c.de.toFixed(1)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <Note>色觉模拟为矩阵近似，用于快速筛查；正式发表前建议用 Okabe-Ito 等色盲安全调色板，并以形状/线型作为颜色的冗余编码。</Note>
                </Panel>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}