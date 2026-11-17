import { useCallback, useEffect, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/chartcore";
import { ClipboardPaste, Copy, Download, Eraser, ScanLine, Sigma } from "lucide-react";

const SYMBOL_MAP: [RegExp, string][] = [
  [/∑/g, "\\sum "], [/∏/g, "\\prod "], [/∫/g, "\\int "], [/∬/g, "\\iint "], [/∮/g, "\\oint "],
  [/√/g, "\\sqrt{}"], [/∞/g, "\\infty "], [/∂/g, "\\partial "], [/∇/g, "\\nabla "],
  [/±/g, "\\pm "], [/×/g, "\\times "], [/÷/g, "\\div "], [/·/g, "\\cdot "],
  [/≤/g, "\\leq "], [/≥/g, "\\geq "], [/≠/g, "\\neq "], [/≈/g, "\\approx "], [/≡/g, "\\equiv "], [/∝/g, "\\propto "],
  [/→/g, "\\to "], [/⇒/g, "\\Rightarrow "], [/↔/g, "\\leftrightarrow "],
  [/∈/g, "\\in "], [/∉/g, "\\notin "], [/⊂/g, "\\subset "], [/∪/g, "\\cup "], [/∩/g, "\\cap "], [/∀/g, "\\forall "], [/∃/g, "\\exists "],
  [/α/g, "\\alpha "], [/β/g, "\\beta "], [/γ/g, "\\gamma "], [/δ/g, "\\delta "], [/ε/g, "\\epsilon "], [/ζ/g, "\\zeta "],
  [/η/g, "\\eta "], [/θ/g, "\\theta "], [/λ/g, "\\lambda "], [/μ/g, "\\mu "], [/ν/g, "\\nu "], [/ξ/g, "\\xi "],
  [/π/g, "\\pi "], [/ρ/g, "\\rho "], [/σ/g, "\\sigma "], [/τ/g, "\\tau "], [/φ/g, "\\phi "], [/χ/g, "\\chi "],
  [/ψ/g, "\\psi "], [/ω/g, "\\omega "], [/Γ/g, "\\Gamma "], [/Δ/g, "\\Delta "], [/Θ/g, "\\Theta "], [/Λ/g, "\\Lambda "],
  [/Σ/g, "\\Sigma "], [/Φ/g, "\\Phi "], [/Ω/g, "\\Omega "],
  [/²/g, "^{2}"], [/³/g, "^{3}"], [/°/g, "^{\\circ}"],
  [/−/g, "-"], [/–/g, "-"], [/—/g, "-"], [/“|”/g, ""], [/‘|’/g, "'"],
];

const TEMPLATES = [
  { label: "分数", tex: "\\frac{a}{b}" },
  { label: "求和", tex: "\\sum_{i=1}^{n} x_i" },
  { label: "积分", tex: "\\int_{a}^{b} f(x)\\,dx" },
  { label: "根号", tex: "\\sqrt{x}" },
  { label: "上标", tex: "x^{2}" },
  { label: "下标", tex: "x_{i}" },
  { label: "均值", tex: "\\bar{x}" },
  { label: "向量", tex: "\\vec{v}" },
  { label: "极限", tex: "\\lim_{x \\to 0}" },
  { label: "矩阵", tex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
  { label: "希腊 α β σ", tex: "\\alpha\\ \\beta\\ \\sigma" },
  { label: "正态分布", tex: "X \\sim N(\\mu, \\sigma^{2})" },
];

function preprocess(img: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.max(1, Math.min(3, 1400 / img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = lum < 150 ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function toLatex(raw: string, autoSub: boolean, autoFrac: boolean): string {
  let s = raw.trim();
  for (const [re, rep] of SYMBOL_MAP) s = s.replace(re, rep);
  s = s.replace(/\s+/g, " ").replace(/\n+/g, " \\\\ ");
  if (autoSub) s = s.replace(/([A-Za-z])(\d)(?![\d])/g, "$1_{$2}");
  if (autoFrac) s = s.replace(/(\([^()]+\)|[A-Za-z0-9_{}^]+)\s*\/\s*(\([^()]+\)|[A-Za-z0-9_{}^]+)/g, "\\frac{$1}{$2}");
  s = s.replace(/\(\s*/g, "(").replace(/\s*\)/g, ")");
  return s.trim();
}

export default function Formula() {
  const [preview, setPreview] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const [latex, setLatex] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "recognizing" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [autoSub, setAutoSub] = useState(true);
  const [autoFrac, setAutoFrac] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const recognize = useCallback(async (img: HTMLImageElement) => {
    setStatus("loading");
    setProgress(0);
    try {
      const canvas = preprocess(img);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") { setStatus("recognizing"); setProgress(Math.round(m.progress * 100)); }
        },
      });
      try {
        const { data } = await worker.recognize(canvas);
        const text = data.text ?? "";
        setRaw(text);
        setLatex(toLatex(text, autoSub, autoFrac));
        setStatus("done");
        if (!text.trim()) toast.warning("未识别到文字，请尝试更清晰的截图");
        else toast.success("识别完成，请核对并修正 LaTeX");
      } finally {
        await worker.terminate();
      }
    } catch (e) {
      setStatus("error");
      toast.error(e instanceof Error ? `识别失败：${e.message}` : "识别失败，首次使用需联网下载 OCR 模型");
    }
  }, [autoSub, autoFrac]);

  const loadFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) { toast.error("请提供图片文件（PNG / JPG）"); return; }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setPreview(url);
      void recognize(img);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast.error("图片解析失败"); };
    img.src = url;
  }, [recognize]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (f) { e.preventDefault(); loadFile(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  const html = (() => {
    if (!latex.trim()) return "";
    try {
      return katex.renderToString(latex, { throwOnError: true, displayMode: true, strict: false });
    } catch (e) {
      return `<span style="color:#ff7a5c">语法待修正：${e instanceof Error ? e.message.replace(/</g, "&lt;") : "未知错误"}</span>`;
    }
  })();

  const insert = (tex: string) => {
    const ta = taRef.current;
    if (!ta) { setLatex((v) => v + tex); return; }
    const s = ta.selectionStart ?? latex.length;
    const e = ta.selectionEnd ?? s;
    const next = latex.slice(0, s) + tex + latex.slice(e);
    setLatex(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + tex.length, s + tex.length); });
  };

  const busy = status === "loading" || status === "recognizing";

  return (
    <div className="space-y-5">
      <header>
        <span className="num text-xs tracking-widest text-muted-foreground uppercase">08 / FORMULA OCR</span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">公式截图 → LaTeX</h1>
        <p className="mt-1 text-sm text-muted-foreground">粘贴或上传公式截图，本地 OCR 识别后转换为 LaTeX，实时 KaTeX 预览。识别结果为草稿，投稿前请逐项核对符号、上下标与括号。</p>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><ScanLine className="size-4 text-primary" aria-hidden />截图输入</h2>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
            className="mt-3 flex min-h-52 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-center text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            {preview ? (
              <img src={preview} alt="公式截图预览" className="max-h-64 max-w-full rounded bg-white object-contain p-2" />
            ) : (
              <>
                <ClipboardPaste className="size-8" aria-hidden />
                <span className="text-sm font-medium">点击上传、拖入图片，或直接 Ctrl+V 粘贴截图</span>
                <span className="text-xs">建议白底黑字、分辨率 ≥ 300 px 宽</span>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }} />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <button type="button" disabled={!imgRef.current || busy} onClick={() => imgRef.current && void recognize(imgRef.current)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">
              <ScanLine className="size-3.5" aria-hidden />{busy ? (status === "loading" ? "加载 OCR 模型…" : `识别中 ${progress}%`) : "重新识别"}
            </button>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={autoSub} onChange={(e) => setAutoSub(e.target.checked)} className="accent-[var(--site-accent)]" />字母+数字自动下标</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={autoFrac} onChange={(e) => setAutoFrac(e.target.checked)} className="accent-[var(--site-accent)]" />a/b 自动转分式</label>
          </div>
          {busy && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${status === "loading" ? 8 : progress}%` }} /></div>}
          {raw && (
            <details className="mt-3 rounded-lg border border-border bg-background p-3 text-xs">
              <summary className="cursor-pointer font-medium">OCR 原始文本</summary>
              <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">{raw}</pre>
            </details>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">OCR 在本机浏览器内运行（tesseract.js），截图不会上传；首次识别需联网下载英文模型。手写体、复杂分式与矩阵识别率有限，请用下方模板与编辑框修正。</p>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Sigma className="size-4 text-primary" aria-hidden />LaTeX 编辑与预览</h2>
            <div className="flex gap-2">
              <button type="button" disabled={!latex.trim()} onClick={() => { void navigator.clipboard.writeText(latex).then(() => toast.success("已复制 LaTeX")).catch(() => toast.error("复制失败")); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-40"><Copy className="size-3.5" aria-hidden />复制</button>
              <button type="button" disabled={!latex.trim()} onClick={() => { downloadBlob("formula.tex", new Blob([`% 由公式截图识别生成，请人工核对\n\\[\n${latex}\n\\]\n`], { type: "application/x-tex" })); toast.success("已下载 .tex"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-40"><Download className="size-3.5" aria-hidden />.tex</button>
              <button type="button" disabled={!latex && !raw} onClick={() => { setLatex(""); setRaw(""); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-40"><Eraser className="size-3.5" aria-hidden />清空</button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button key={t.label} type="button" onClick={() => insert(t.tex)} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] hover:border-primary/50 hover:text-primary">{t.label}</button>
            ))}
          </div>
          <textarea
            ref={taRef}
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder={"识别后在此修正，例如：\\sigma = \\sqrt{\\frac{1}{n}\\sum_{i=1}^{n}(x_i-\\bar{x})^{2}}"}
            className="num mt-3 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-relaxed focus:border-primary focus:outline-none"
          />
          <div className="mt-3 min-h-24 overflow-x-auto rounded-lg border border-border bg-white px-4 py-5 text-[#111]">
            {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-center text-xs text-[#8f9b94]">KaTeX 实时预览区</p>}
          </div>
        </section>
      </div>
    </div>
  );
}