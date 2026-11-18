import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { addPanel, loadPanels, savePanels, uid, type PanelItem } from "@/lib/store";
import { downloadBlob, downloadSvg, esc, svgToPngBlob } from "@/lib/chartcore";
import { auditSvg } from "@/lib/chartqa";
import {svgPanel,isRasterDataUrl} from "@/lib/svg-safety";
import {exportSvgPdf} from "@/lib/pdf-export";
import { ArrowDown, ArrowUp, Download, FileImage, LayoutGrid, Plus, Trash2, Upload } from "lucide-react";

const LABEL_STYLES = [
  { id: "upper", name: "A B C（大写）" },
  { id: "lower", name: "a b c（小写 · Nature）" },
  { id: "paren", name: "(A) (B) (C)" },
  { id: "none", name: "不加编号" },
] as const;

function panelLabel(style: string, i: number): string {
  const up = String.fromCharCode(65 + (i % 26));
  if (style === "upper") return up;
  if (style === "lower") return up.toLowerCase();
  if (style === "paren") return `(${up})`;
  return "";
}

export default function Compose() {
  const [panels, setPanels] = useState<PanelItem[]>(() => loadPanels());
  const [cols, setCols] = useState(0);
  const [gapMm, setGapMm] = useState(4);
  const [widthCm, setWidthCm] = useState(17);
  const [labelStyle, setLabelStyle] = useState<string>("lower");
  const [bg, setBg] = useState<"white" | "transparent">("white");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onStorage = () => setPanels(loadPanels());
    window.addEventListener("storage", onStorage);
    window.addEventListener("scibench:workspacechange",onStorage);
    return () => {window.removeEventListener("storage", onStorage);window.removeEventListener("scibench:workspacechange",onStorage);};
  }, []);

  const refresh = () => setPanels(loadPanels());

  const update = (list: PanelItem[]) => { setPanels(list);void savePanels(list).then(result=>{if(!result.ok)toast.error(result.message,{id:"panel-save-error"});}); };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= panels.length) return;
    const list = [...panels];
    [list[i], list[j]] = [list[j], list[i]];
    update(list);
  };
  const rename = (id: string, name: string) => update(panels.map((p) => (p.id === id ? { ...p, name } : p)));
  const remove = (id: string) => update(panels.filter((p) => p.id !== id));

  const onFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      try {
        if (f.type === "image/svg+xml" || f.name.endsWith(".svg")) {
          const text = await f.text();
          const { w, h,svg:cleaned } = svgPanel(text);
          await addPanel({ id: uid(), name: f.name.replace(/\.svg$/i, ""), kind: "svg", svg: cleaned, w, h, createdAt: Date.now() });
        } else if (f.type.startsWith("image/")) {
          const dataUrl = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.onerror = () => rej(new Error("读取失败"));
            r.readAsDataURL(f);
          });
          const dim = await new Promise<{ w: number; h: number }>((res, rej) => {
            const img = new Image();
            img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => rej(new Error("图片解析失败"));
            img.src = dataUrl;
          });
          if(!isRasterDataUrl(dataUrl))throw new Error("仅支持 PNG / JPG / GIF / WebP 位图");
          await addPanel({ id: uid(), name: f.name.replace(/\.[^.]+$/, ""), kind: "image", dataUrl, w: dim.w, h: dim.h, createdAt: Date.now() });
        } else {
          toast.error(`不支持的文件：${f.name}`);
          continue;
        }
        toast.success(`已加入排版：${f.name}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "导入失败");
      }
    }
    refresh();
  };

  const layout = useMemo(() => {
    const n = panels.length;
    const c = cols > 0 ? cols : n <= 1 ? 1 : n <= 4 ? 2 : 3;
    const W = 1000;
    const margin = 12;
    const gap = (gapMm / (widthCm * 10)) * W;
    const colW = (W - margin * 2 - gap * (c - 1)) / c;
    const labelSpace = labelStyle === "none" ? 6 : 34;
    const rows: { items: { p: PanelItem; x: number; y: number; w: number; h: number }[]; h: number }[] = [];
    let y = margin;
    for (let i = 0; i < n; i += c) {
      const chunk = panels.slice(i, i + c);
      const scaled = chunk.map((p, k) => {
        const w = colW;
        const h = (p.h / p.w) * w;
        return { p, x: margin + k * (colW + gap), y: 0, w, h };
      });
      const rowH = Math.max(...scaled.map((s) => s.h));
      for (const s of scaled) s.y = y + labelSpace + (rowH - s.h) / 2;
      rows.push({ items: scaled, h: rowH + labelSpace });
      y += rowH + labelSpace + gap;
    }
    const H = Math.max(200, y - gap + margin);
    return { c, W, H, colW, rows, labelSpace };
  }, [panels, cols, gapMm, widthCm, labelStyle]);

  const composite = useMemo(() => {
    const { W, H, rows } = layout;
    const ink = "#111111";
    let inner = "";
    let error="";
    let idx = 0;
    for (const row of rows) {
      for (const it of row.items) {
        const label = panelLabel(labelStyle, idx);
        if (label) {
          inner += `<text x="${it.x}" y="${it.y - 10}" fill="${ink}" font-size="30" font-weight="bold">${esc(label)}</text>`;
        }
        if (it.p.kind === "svg" && it.p.svg) {
          try {const panel=svgPanel(it.p.svg),root=new DOMParser().parseFromString(panel.svg,"image/svg+xml").documentElement;
          const ids=new Map(Array.from(root.querySelectorAll('[id]')).map(el=>[el.id,`panel-${idx}-${el.id}`]));
          for(const el of [root,...Array.from(root.querySelectorAll('*'))])for(const attr of Array.from(el.attributes)){if(attr.name==='id'&&ids.has(attr.value))el.setAttribute('id',ids.get(attr.value)!);else if(attr.value.startsWith('#')&&ids.has(attr.value.slice(1))&&attr.localName==='href')el.setAttribute(attr.name,`#${ids.get(attr.value.slice(1))}`);else if(attr.value.startsWith('url(#')){const id=attr.value.slice(5,-1);if(ids.has(id))el.setAttribute(attr.name,`url(#${ids.get(id)})`);}}
          root.setAttribute("x",String(it.x));root.setAttribute("y",String(it.y));root.setAttribute("width",String(it.w));root.setAttribute("height",String(it.h));
          inner+=new XMLSerializer().serializeToString(root);
          } catch(e){error=`面板 ${it.p.name} 无法安全解析：${e instanceof Error?e.message:"无效 SVG"}`;}
        } else if (it.p.dataUrl) {
          if(isRasterDataUrl(it.p.dataUrl))inner += `<image href="${esc(it.p.dataUrl)}" x="${it.x.toFixed(1)}" y="${it.y.toFixed(1)}" width="${it.w.toFixed(1)}" height="${it.h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
          else error=`面板 ${it.p.name} 含不支持的图片地址，请重新导入位图。`;
        }
        idx++;
      }
    }
    const bgRect = bg === "white" ? `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>` : "";
    const heightCm = (widthCm * H) / W;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthCm}cm" height="${heightCm.toFixed(3)}cm" viewBox="0 0 ${W} ${H}" font-family="Arial, 'Noto Sans SC', sans-serif">${bgRect}${inner}</svg>`;
    return { svg, inner: bgRect + inner, W, H, heightCm,error };
  }, [layout, labelStyle, bg, widthCm]);

  const qa = useMemo(() => {
    if (!panels.length) return null;
    try {
      return auditSvg(composite.svg, composite.W, composite.H, widthCm);
    } catch {
      return null;
    }
  }, [composite, panels.length, widthCm]);

  const exportPng = async () => {
    if (!panels.length || composite.error) return;
    setBusy(true);
    try {
      const blob = await svgToPngBlob(composite.svg, widthCm, composite.heightCm, 600);
      downloadBlob("figure-composite-600dpi.png", blob);
      toast.success("已导出 600 dpi 组合图 PNG");
    } catch {
      toast.error("PNG 导出失败，请尝试 SVG");
    } finally {
      setBusy(false);
    }
  };

  const exportPdf=async()=>{
    if(!panels.length||composite.error)return;
    setBusy(true);
    try{await exportSvgPdf("figure-composite.pdf",composite.svg,widthCm,composite.heightCm);toast.success("已导出组合图 PDF（600 dpi）");}
    catch(e){toast.error(e instanceof Error?e.message:"PDF 导出失败");}
    finally{setBusy(false);}
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="num text-xs tracking-widest text-muted-foreground uppercase">07 / COMPOSE</span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">多图自动排版工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">把绘图工作台的图或本地图片排成期刊 Figure：自动网格、A/B/C 面板编号、统一栏宽，导出组合 SVG 与 600 dpi PNG。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium hover:bg-secondary"><Upload className="size-4" aria-hidden />导入图片 / SVG</button>
          <input ref={fileRef} type="file" accept="image/*,.svg" multiple hidden onChange={(e) => { if (e.target.files?.length) void onFiles(e.target.files); e.target.value = ""; }} />
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><LayoutGrid className="size-4 text-primary" aria-hidden />版式设置</h2>
            <div className="mt-3 space-y-3 text-sm">
              <label className="block">每行 panels
                <select value={cols} onChange={(e) => setCols(Number(e.target.value))} className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5">
                  <option value={0}>自动（{layout.c} 列）</option>
                  <option value={1}>1 列 · 单栏竖排</option>
                  <option value={2}>2 列 · 双栏</option>
                  <option value={3}>3 列 · 宽版</option>
                </select>
              </label>
              <label className="block">期刊栏宽
                <select value={widthCm} onChange={(e) => setWidthCm(Number(e.target.value))} className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5">
                  <option value={8.5}>8.5 cm · 单栏（Nature）</option>
                  <option value={12}>12 cm · 1.5 栏</option>
                  <option value={17}>17 cm · 双栏通栏</option>
                </select>
              </label>
              <label className="block">面板间距：{gapMm} mm
                <input type="range" min={0} max={12} step={1} value={gapMm} onChange={(e) => setGapMm(Number(e.target.value))} className="mt-1 w-full accent-[var(--site-accent)]" />
              </label>
              <label className="block">面板编号
                <select value={labelStyle} onChange={(e) => setLabelStyle(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5">
                  {LABEL_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="block">画布背景
                <select value={bg} onChange={(e) => setBg(e.target.value as "white" | "transparent")} className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5">
                  <option value="white">白色（投稿默认）</option>
                  <option value="transparent">透明</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">面板列表 · {panels.length}</h2>
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="size-3.5" aria-hidden />添加</button>
            </div>
            {panels.length === 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">还没有面板。在「科研 / BI 绘图」点击“加入排版”，或直接导入 PNG / JPG / SVG。</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {panels.map((p, i) => (
                  <li key={p.id} className="rounded-lg border border-border bg-background p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="num flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">{panelLabel(labelStyle === "none" ? "upper" : labelStyle, i) || i + 1}</span>
                      <input value={p.name} onChange={(e) => rename(p.id, e.target.value)} aria-label={`面板 ${i + 1} 名称`} className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-input focus:border-input focus:outline-none" />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="num">{p.kind === "svg" ? "SVG 矢量" : "位图"} · {p.w}×{p.h}</span>
                      <span className="flex gap-1">
                        <button type="button" aria-label="上移" onClick={() => move(i, -1)} className="rounded p-1 hover:bg-secondary"><ArrowUp className="size-3.5" aria-hidden /></button>
                        <button type="button" aria-label="下移" onClick={() => move(i, 1)} className="rounded p-1 hover:bg-secondary"><ArrowDown className="size-3.5" aria-hidden /></button>
                        <button type="button" aria-label="删除" onClick={() => remove(p.id)} className="rounded p-1 text-destructive hover:bg-secondary"><Trash2 className="size-3.5" aria-hidden /></button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {qa && (
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">组合质量门</h2>
                <span className={`num rounded-full px-2 py-0.5 text-xs font-semibold ${qa.pass ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{qa.pass ? "PASS" : "CHECK"}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-secondary/60 p-2"><span className="num block text-lg font-semibold">{qa.overlap + qa.stroke}</span><span className="text-[11px] text-muted-foreground">文字碰撞</span></div>
                <div className="rounded-lg bg-secondary/60 p-2"><span className="num block text-lg font-semibold">{qa.clip}</span><span className="text-[11px] text-muted-foreground">越界元素</span></div>
                <div className="rounded-lg bg-secondary/60 p-2"><span className="num block text-lg font-semibold">{qa.occlusion}</span><span className="text-[11px] text-muted-foreground">遮挡风险</span></div>
                <div className="rounded-lg bg-secondary/60 p-2"><span className="num block text-lg font-semibold">{qa.minPt ? qa.minPt.toFixed(1) : "—"}</span><span className="text-[11px] text-muted-foreground">最小字号 pt</span></div>
              </div>
              {qa.issues.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-[11px] leading-relaxed">
                  {qa.issues.slice(0, 5).map((it, i) => (
                    <li key={i} className={it.level === "FAIL" ? "text-destructive" : "text-muted-foreground"}>{it.level === "FAIL" ? "✕" : "!"} {it.msg}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><FileImage className="size-4 text-primary" aria-hidden />组合预览 · {widthCm} cm · {layout.c} 列</h2>
            <div className="flex gap-2">
              <button type="button" disabled={!panels.length||!!composite.error} onClick={() => { downloadSvg("figure-composite.svg", composite.svg); toast.success("已导出组合 SVG（可编辑）"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-40"><Download className="size-3.5" aria-hidden />SVG</button>
              <button type="button" disabled={!panels.length || busy||!!composite.error} onClick={() => void exportPng()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"><Download className="size-3.5" aria-hidden />{busy ? "导出中…" : "PNG · 600 dpi"}</button>
              <button type="button" disabled={!panels.length||busy||!!composite.error} onClick={()=>void exportPdf()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-40"><Download className="size-3.5" aria-hidden />PDF</button>
            </div>
          </div>
          {composite.error&&<p role="alert" className="mt-3 text-sm text-destructive">{composite.error}</p>}
          {panels.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) void onFiles(e.dataTransfer.files); }}
              className="mt-4 flex h-72 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            >
              <Upload className="size-8" aria-hidden />
              <span className="text-sm font-medium">拖入多张图片，或点击导入</span>
              <span className="text-xs">支持 PNG / JPG / SVG · 也可从绘图工作台逐张加入</span>
            </button>
          ) : (
            <div className="mt-4 overflow-auto rounded-lg border border-border bg-white p-3">
              <div dangerouslySetInnerHTML={{ __html: composite.svg }} className="mx-auto max-w-full [&>svg]:h-auto [&>svg]:w-full" />
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">面板按各自比例缩放到统一列宽并垂直居中；编号遵循 Nature 风格（小写粗体 a/b/c）。位图面板放大超过原始分辨率时会降低清晰度，建议优先使用绘图工作台导出的 SVG。</p>
          <p className="mt-1 text-[11px] text-muted-foreground">PDF 保持当前页面物理尺寸并内嵌 600 dpi 图像；需要可编辑矢量图请使用 SVG。</p>
        </section>
      </div>
    </div>
  );
}
