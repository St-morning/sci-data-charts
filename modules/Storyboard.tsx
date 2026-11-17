import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ModuleHeader, Note, Panel } from "@/components/shared";
import { SECTIONS, loadCards, loadFindings, saveCards, uid, type SectionId, type StoryCard } from "@/lib/store";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Import, Play, Plus, Trash2, X } from "lucide-react";

export default function Storyboard() {
  const [cards, setCards] = useState<StoryCard[]>(() => loadCards());
  const [findings, setFindings] = useState(() => loadFindings());
  const [presenting, setPresenting] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    saveCards(cards);
  }, [cards]);

  const slides = useMemo(
    () => SECTIONS.map((s) => ({ ...s, cards: cards.filter((c) => c.section === s.id) })).filter((s) => s.cards.length > 0),
    [cards],
  );

  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setSlide((i) => Math.min(i + 1, slides.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setSlide((i) => Math.max(i - 1, 0));
      } else if (e.key === "Escape") {
        setPresenting(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, slides.length]);

  function addCard(section: SectionId) {
    setCards((prev) => [...prev, { id: uid(), section, title: "", body: "", createdAt: Date.now() }]);
  }

  function patch(id: string, p: Partial<StoryCard>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }

  function move(id: string, dir: -1 | 1) {
    setCards((prev) => {
      const card = prev.find((c) => c.id === id);
      if (!card) return prev;
      const siblings = prev.filter((c) => c.section === card.section);
      const idx = siblings.findIndex((c) => c.id === id);
      const target = siblings[idx + dir];
      if (!target) return prev;
      const next = [...prev];
      const ia = next.findIndex((c) => c.id === id);
      const ib = next.findIndex((c) => c.id === target.id);
      [next[ia], next[ib]] = [next[ib], next[ia]];
      return next;
    });
  }

  function importFinding(fid: string) {
    const f = findings.find((x) => x.id === fid);
    if (!f) return;
    const now = Date.now();
    setCards((prev) => [
      ...prev,
      {
        id: uid(),
        section: "finding",
        title: `${f.metricName}${f.unit ? `（${f.unit}）` : ""}：组间差异`,
        body: f.results.join("\n"),
        createdAt: now,
      },
      {
        id: uid(),
        section: "evidence",
        title: f.summary || "统计检验与图表",
        body: f.groups.map((g) => `${g.name}：n=${g.n}，均值 ${g.mean.toPrecision(4)} ± ${g.sd.toPrecision(3)}（SD）`).join("\n"),
        imageDataUrl: f.chartDataUrl,
        createdAt: now + 1,
      },
    ]);
    toast.success("已导入为「关键发现」+「证据」两张卡片");
  }

  async function copyOutline() {
    const lines: string[] = ["# 组会汇报故事板", ""];
    for (const s of SECTIONS) {
      const cs = cards.filter((c) => c.section === s.id);
      if (cs.length === 0) continue;
      lines.push(`## ${s.label}`);
      for (const c of cs) {
        lines.push(`### ${c.title || "（未命名）"}`);
        if (c.body) lines.push(c.body);
        lines.push("");
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("汇报大纲已复制（Markdown）");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  const total = cards.length;

  return (
    <div>
      <ModuleHeader
        code="MOD-05"
        title="科研数据故事板"
        desc="把实验结果排成「研究问题 → 实验设计 → 关键发现 → 证据 → 结论」的可视化故事板，用于组会汇报。卡片自动保存在本机浏览器，可一键进入全屏演示模式。"
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button onClick={() => { setSlide(0); setPresenting(true); }} disabled={slides.length === 0}>
          <Play className="size-4" aria-hidden />
          演示模式（{slides.length} 节）
        </Button>
        <Button variant="outline" onClick={copyOutline} disabled={total === 0}>
          <Copy className="size-4" aria-hidden />
          复制汇报大纲
        </Button>
        <Button variant="outline" onClick={() => setFindings(loadFindings())}>
          <Import className="size-4" aria-hidden />
          刷新可导入的发现（{findings.length}）
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{total} 张卡片 · 自动保存于本机</span>
      </div>

      {findings.length > 0 && (
        <Panel title="从「数据 → 论文段落」导入分析发现" className="mb-5">
          <ul className="space-y-2">
            {findings.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
                {f.chartDataUrl && <img src={f.chartDataUrl} alt="" className="h-10 rounded border border-border" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.metricName}{f.unit ? `（${f.unit}）` : ""}</p>
                  <p className="num truncate text-xs text-muted-foreground">{f.summary}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => importFinding(f.id)}>
                  导入为发现 + 证据
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {SECTIONS.map((s, si) => {
          const cs = cards.filter((c) => c.section === s.id);
          return (
            <section key={s.id} className="flex flex-col rounded-xl border border-border bg-card shadow-sm">
              <header className="border-b border-border px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <span className="num rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">{si + 1}</span>
                  <h2 className="text-sm font-semibold">{s.label}</h2>
                  <Badge variant="outline" className="ml-auto text-[10px]">{cs.length}</Badge>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{s.hint}</p>
              </header>
              <div className="flex-1 space-y-3 p-3">
                {cs.map((c) => (
                  <article key={c.id} className="rounded-lg border border-border bg-background/60 p-2.5">
                    <Input
                      className="h-8 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-1"
                      placeholder="卡片标题"
                      value={c.title}
                      onChange={(e) => patch(c.id, { title: e.target.value })}
                      aria-label="卡片标题"
                    />
                    <Textarea
                      className="mt-1 min-h-20 border-0 bg-transparent px-1 text-xs leading-relaxed shadow-none focus-visible:ring-1"
                      placeholder="内容：数据、方法或论断…"
                      value={c.body}
                      onChange={(e) => patch(c.id, { body: e.target.value })}
                      aria-label="卡片内容"
                    />
                    {c.imageDataUrl && (
                      <img src={c.imageDataUrl} alt="证据图表" className="mt-1.5 w-full rounded border border-border" />
                    )}
                    <div className="mt-1.5 flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="size-6" aria-label="上移" onClick={() => move(c.id, -1)}>
                        <ArrowUp className="size-3" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-6" aria-label="下移" onClick={() => move(c.id, 1)}>
                        <ArrowDown className="size-3" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-6 text-muted-foreground hover:text-rose-600"
                        aria-label="删除卡片"
                        onClick={() => setCards((prev) => prev.filter((x) => x.id !== c.id))}
                      >
                        <Trash2 className="size-3" aria-hidden />
                      </Button>
                    </div>
                  </article>
                ))}
                <Button variant="outline" size="sm" className="w-full" onClick={() => addCard(s.id)}>
                  <Plus className="size-3.5" aria-hidden />
                  添加卡片
                </Button>
              </div>
            </section>
          );
        })}
      </div>

      {total === 0 && (
        <div className="mt-5">
          <Note>
            故事板为空。可以先在「数据 → 论文段落」中完成一次分析并保存发现，再回到这里导入；也可以直接在任意列添加卡片手动组织汇报逻辑。建议顺序：先写研究问题与结论，再填充中间的发现与证据。
          </Note>
        </div>
      )}

      {presenting && slides.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="故事板演示模式">
          <header className="flex items-center justify-between border-b border-border px-6 py-3">
            <p className="text-sm font-semibold">
              <span className="num mr-2 text-primary">{slide + 1} / {slides.length}</span>
              {slides[slide].label}
            </p>
            <Button variant="outline" size="sm" onClick={() => setPresenting(false)}>
              <X className="size-3.5" aria-hidden />
              退出演示（Esc）
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-12">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-6 text-3xl font-semibold tracking-tight">{slides[slide].label}</h2>
              <div className="space-y-6">
                {slides[slide].cards.map((c) => (
                  <article key={c.id} className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <h3 className="text-xl font-semibold">{c.title || "（未命名）"}</h3>
                    {c.body && <p className="mt-3 whitespace-pre-wrap text-base leading-8 text-foreground/90">{c.body}</p>}
                    {c.imageDataUrl && <img src={c.imageDataUrl} alt="证据图表" className="mt-4 max-h-80 rounded-lg border border-border" />}
                  </article>
                ))}
              </div>
            </div>
          </div>
          <footer className="flex items-center justify-between border-t border-border px-6 py-3">
            <Button variant="outline" onClick={() => setSlide((i) => Math.max(0, i - 1))} disabled={slide === 0}>
              <ArrowLeft className="size-4" aria-hidden />
              上一节
            </Button>
            <p className="hidden text-xs text-muted-foreground sm:block">← / → 方向键翻页 · Esc 退出</p>
            <Button onClick={() => setSlide((i) => Math.min(slides.length - 1, i + 1))} disabled={slide === slides.length - 1}>
              下一节
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </footer>
        </div>
      )}
    </div>
  );
}