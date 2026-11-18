import { lazy, Suspense, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { loadCards, loadFindings, loadPanels } from "@/lib/store";
const FigureAudit = lazy(() => import("@/modules/FigureAudit"));
const DataParagraph = lazy(() => import("@/modules/DataParagraph"));
const ImageIntegrity = lazy(() => import("@/modules/ImageIntegrity"));
const BatchCompare = lazy(() => import("@/modules/BatchCompare"));
const Storyboard = lazy(() => import("@/modules/Storyboard"));
const PlotStudio = lazy(() => import("@/modules/PlotStudio"));
const Compose = lazy(() => import("@/modules/Compose"));
const Formula = lazy(() => import("@/modules/Formula"));
import {
  ArrowRight,
  BarChart3,
  FileSearch,
  Images,
  Layers,
  LayoutGrid,
  Moon,
  Palette,
  Presentation,
  Sigma,
  Sun,
} from "lucide-react";

const NAV = [
  { hash: "#/", code: "00", label: "工作台总览", icon: BarChart3 },
  { hash: "#/plot", code: "01", label: "科研 / BI 绘图", icon: Palette },
  { hash: "#/audit", code: "02", label: "论文图表复核", icon: FileSearch },
  { hash: "#/paragraph", code: "03", label: "数据 → 论文段落", icon: BarChart3 },
  { hash: "#/integrity", code: "04", label: "图片防误用检测", icon: Images },
  { hash: "#/batch", code: "05", label: "跨批次对比", icon: Layers },
  { hash: "#/storyboard", code: "06", label: "数据故事板", icon: Presentation },
  { hash: "#/compose", code: "07", label: "多图自动排版", icon: LayoutGrid },
  { hash: "#/formula", code: "08", label: "公式截图 → LaTeX", icon: Sigma },
] as const;

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function Brand() {
  return (
    <a href="#/" className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-end justify-center gap-[3px] rounded-lg bg-primary p-[7px]" aria-hidden>
        <i className="w-[4px] rounded-sm bg-primary-foreground/70" style={{ height: "45%" }} />
        <i className="w-[4px] rounded-sm bg-primary-foreground" style={{ height: "80%" }} />
        <i className="w-[4px] rounded-sm bg-primary-foreground/70" style={{ height: "60%" }} />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-bold tracking-tight">科研数图<span className="text-primary">工作台</span></span>
        <span className="eyebrow block" style={{ fontSize: "0.6rem" }}>DATA · FIGURE · PROOF</span>
      </span>
    </a>
  );
}

function ThemeToggle({ light, onToggle }: { light: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={light ? "切换暗色主题" : "切换亮色主题"}
      title={light ? "切换暗色主题" : "切换亮色主题"}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      {light ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
    </button>
  );
}

function Overview() {
  const cards = loadCards();
  const findings = loadFindings();
  const panels = loadPanels();
  const modules = NAV.slice(1);
  const descs: Record<string, string> = {
    "#/audit": "检查单位、有效数字、误差棒声明、颜色辨识度（含色盲模拟）与图文数值一致性。",
    "#/paragraph": "上传 Excel / CSV，自动清洗、统计检验、绘制误差棒图，生成事实与推断分离的论文初稿。",
    "#/integrity": "对多张科研图片做感知哈希比对，检测重复使用、镜像翻转、裁剪重叠与比例尺不一致。",
    "#/batch": "对齐不同日期 / 仪器 / 批次数据，分解样品间、批次间及残差（交互作用＋测量误差）。",
    "#/storyboard": "把实验结果排成「研究问题 → 实验设计 → 关键发现 → 证据 → 结论」的组会故事板。",
    "#/plot": "73 种 SCI / BI 图形：聚类热图、PCA/PCoA、富集气泡、序列 LOGO、动态参数与图元精调。",
    "#/compose": "多张图自动排成期刊 Figure：A/B/C 面板编号、统一栏宽与间距，导出组合 SVG 与 600 dpi PNG。",
    "#/formula": "粘贴公式截图，本地 OCR 识别转 LaTeX，KaTeX 实时预览，支持模板插入与 .tex 下载。",
  };
  const tags: Record<string, string> = {
    "#/audit": "质量控制", "#/paragraph": "论文写作", "#/integrity": "图像诚信",
    "#/batch": "实验设计", "#/storyboard": "汇报展示", "#/plot": "科研绘图 · BI",
    "#/compose": "出版排版", "#/formula": "公式工具",
  };
  return (
    <div className="space-y-6">
      <section className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-sm xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <div className="px-6 py-7 sm:px-8 sm:py-9">
          <span className="eyebrow">DATA REVIEW DESK · 本地优先</span>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight">让每一张图，都经得起<span className="text-primary">数据追问。</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">从原始数据到出版图表、统计结论与论文文本：自由选型配色、按报告规范调字体线宽、检查文字遮挡、多图自动排版、公式截图转 LaTeX，全部在浏览器本地完成。</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#/plot" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90">开始科研 / BI 绘图<ArrowRight className="size-4" aria-hidden /></a>
            <a href="#/compose" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-secondary">多图排版</a>
            <a href="#/formula" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-secondary">公式识别</a>
          </div>
        </div>
        <div className="border-t border-border bg-secondary/45 px-6 py-6 xl:border-t-0 xl:border-l">
          <p className="eyebrow">当前工作区</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card p-3.5"><span className="num text-2xl font-semibold">{findings.length}</span><p className="mt-1 text-[11px] text-muted-foreground">分析发现</p></div>
            <div className="rounded-xl border border-border bg-card p-3.5"><span className="num text-2xl font-semibold">{cards.length}</span><p className="mt-1 text-[11px] text-muted-foreground">故事卡片</p></div>
            <div className="rounded-xl border border-border bg-card p-3.5"><span className="num text-2xl font-semibold">{panels.length}</span><p className="mt-1 text-[11px] text-muted-foreground">排版面板</p></div>
          </div>
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium">快速开始</p>
            <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted-foreground">
              <li className="flex gap-2"><span className="num font-semibold text-primary">01</span>上传 Excel / CSV 或粘贴数据</li>
              <li className="flex gap-2"><span className="num font-semibold text-primary">02</span>选择图形、套用规范并通过质量门</li>
              <li className="flex gap-2"><span className="num font-semibold text-primary">03</span>加入排版 / 复制结论 / 导出 600 dpi</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="平台能力">
        {[{ value: "8", label: "本地分析工具" }, { value: "73", label: "科研与 BI 图形" }, { value: "600 dpi", label: "出版级 PNG" }, { value: "100%", label: "浏览器本地计算" }].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card px-4 py-4"><span className="num text-xl font-semibold">{s.value}</span><p className="mt-1 text-xs text-muted-foreground">{s.label}</p></div>
        ))}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          <div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-semibold">分析工具</h2><p className="mt-1 text-xs text-muted-foreground">按任务选择模块，所有文件均留在本机。</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {modules.map((m) => (
              <a key={m.hash} href={m.hash} className="group flex min-h-52 flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                <div className="mb-4 flex items-center justify-between"><span className="num rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">MOD-{m.code}</span><m.icon className="size-4 text-muted-foreground" aria-hidden /></div>
                <span className="mb-2 w-fit rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{tags[m.hash]}</span>
                <h3 className="text-base font-semibold">{m.label}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{descs[m.hash]}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">进入模块<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
              </a>
            ))}
          </div>
        </section>
        <aside className="space-y-4 xl:sticky xl:top-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">推荐分析路径</h2>
            <div className="mt-4 space-y-4">
              {[{ n: "1", t: "数据复核", d: "先检查单位、异常值与批次结构" }, { n: "2", t: "绘图与统计", d: "实验模式看效应量，BI 模式看趋势与构成" }, { n: "3", t: "出版导出", d: "按栏宽设置字体、字号和线宽" }, { n: "4", t: "写作与汇报", d: "复制图注、结果段落或加入故事板" }].map((s) => <div key={s.n} className="flex gap-3"><span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{s.n}</span><div><p className="text-sm font-medium">{s.t}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.d}</p></div></div>)}
            </div>
          </section>
          <section className="rounded-xl border border-primary/20 bg-primary/6 p-5">
            <h2 className="text-sm font-semibold">报告规范提示</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">导出前确认栏宽、字体、误差线定义和有效数字；图注注明 n、统计方法、显著性阈值及数据来源。</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function App() {
  const hash = useHashRoute();
  const route = hash.split("?")[0];
  const [light, setLight] = useState(() => {
    try { return localStorage.getItem("scibench.theme") === "light"; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
    try { localStorage.setItem("scibench.theme", light ? "light" : "dark"); } catch { /* 忽略存储禁用 */ }
  }, [light]);

  let page: React.ReactNode;
  switch (route) {
    case "#/audit": page = <FigureAudit />; break;
    case "#/paragraph": page = <DataParagraph />; break;
    case "#/integrity": page = <ImageIntegrity />; break;
    case "#/batch": page = <BatchCompare />; break;
    case "#/storyboard": page = <Storyboard />; break;
    case "#/plot": page = <PlotStudio />; break;
    case "#/compose": page = <Compose />; break;
    case "#/formula": page = <Formula />; break;
    default: page = <Overview />;
  }

  return (
    <div className="flex min-h-dvh">
      <div className="noise-overlay" aria-hidden />
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="border-b border-border px-5 py-4">
          <Brand />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="模块导航">
          {NAV.map((m) => {
            const active = route === m.hash || (m.hash === "#/" && route === "");
            return (
              <a
                key={m.hash}
                href={m.hash}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-foreground/80 hover:bg-secondary",
                )}
              >
                <span className="num w-6 text-xs text-muted-foreground">{m.code}</span>
                <m.icon className="size-4 shrink-0" aria-hidden />
                {m.label}
              </a>
            );
          })}
        </nav>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            纯前端 · 无账号 · 无数据上传
            <br />
            统计结果供参考，发表前请人工复核
          </p>
          <ThemeToggle light={light} onToggle={() => setLight((v) => !v)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Brand />
            <ThemeToggle light={light} onToggle={() => setLight((v) => !v)} />
          </div>
          <nav className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-2" aria-label="模块导航">
            {NAV.map((m) => {
              const active = route === m.hash;
              return (
                <a
                  key={m.hash}
                  href={m.hash}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs whitespace-nowrap",
                    active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80",
                  )}
                >
                  {m.label}
                </a>
              );
            })}
          </nav>
        </header>
        <main className="paper-grid flex-1">
          <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Suspense
              fallback={
                <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground" role="status">
                  <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
                  模块加载中…
                </div>
              }
            >
              {page}
            </Suspense>
          </div>
        </main>
      </div>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
