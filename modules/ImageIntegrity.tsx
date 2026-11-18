import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckItem, DropZone, ModuleHeader, Note, Panel, type CheckStatus } from "@/components/shared";
import {
  blockHashes,
  dHash,
  detectScaleBar,
  flipHorizontal,
  hamming,
  loadImageFromFile,
  similarity,
  toCanvas,
  type ScaleBarHit,
} from "@/lib/image";
import { uid } from "@/lib/store";
import { Trash2 } from "lucide-react";

interface ImgEntry {
  id: string;
  name: string;
  url: string;
  markedUrl: string;
  width: number;
  height: number;
  hash: boolean[];
  mirrorHash: boolean[];
  blocks: boolean[][];
  bar: ScaleBarHit | null;
  scaleValue: string;
  scaleUnit: string;
}

interface PairReport {
  a: ImgEntry;
  b: ImgEntry;
  dup: number;
  mirror: number;
  overlap: number;
  flags: { status: CheckStatus; title: string; detail: string }[];
}

function markBar(canvas: HTMLCanvasElement, bar: ScaleBarHit | null): string {
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);
  if (bar) {
    ctx.strokeStyle = "#e11d48";
    ctx.lineWidth = 3;
    ctx.strokeRect(bar.x - 2, bar.y - bar.h - 2, bar.w + 4, bar.h + 6);
  }
  return c.toDataURL("image/png");
}

function matchBlocks(a: boolean[][], b: boolean[][]): number {
  let matched = 0;
  for (const ba of a) {
    let best = 64;
    for (const bb of b) best = Math.min(best, hamming(ba, bb));
    if (best <= 6) matched++;
  }
  return matched / a.length;
}

export default function ImageIntegrity() {
  const [images, setImages] = useState<ImgEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFiles(files: File[]) {
    setBusy(true);
    setError("");
    const added: ImgEntry[] = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const img = await loadImageFromFile(f);
        const canvas = toCanvas(img, 512);
        const bar = detectScaleBar(canvas);
        added.push({
          id: uid(),
          name: f.name,
          url: URL.createObjectURL(f),
          markedUrl: markBar(canvas, bar),
          width: img.naturalWidth,
          height: img.naturalHeight,
          hash: dHash(canvas),
          mirrorHash: dHash(flipHorizontal(canvas)),
          blocks: blockHashes(canvas, 4),
          bar,
          scaleValue: "",
          scaleUnit: "µm",
        });
      } catch {
        setError(`无法读取 ${f.name}`);
      }
    }
    if (added.length === 0 && !error) setError("请选择图片文件（PNG / JPG / WebP）");
    setImages((prev) => [...prev, ...added]);
    setBusy(false);
  }

  function updateScale(id: string, patch: Partial<Pick<ImgEntry, "scaleValue" | "scaleUnit">>) {
    setImages((prev) => prev.map((im) => (im.id === id ? { ...im, ...patch } : im)));
  }

  const pairs = useMemo<PairReport[]>(() => {
    const out: PairReport[] = [];
    for (let i = 0; i < images.length; i++) {
      for (let j = i + 1; j < images.length; j++) {
        const a = images[i];
        const b = images[j];
        const dup = similarity(a.hash, b.hash);
        const mirror = Math.max(similarity(a.hash, b.mirrorHash), similarity(a.mirrorHash, b.hash));
        const overlap = matchBlocks(a.blocks, b.blocks);
        const flags: PairReport["flags"] = [];
        if (dup >= 0.94) {
          flags.push({ status: "fail", title: "疑似重复使用", detail: `整体感知哈希相似度 ${(dup * 100).toFixed(1)}%（≥94%）。两图内容几乎相同，可能为同一图片重复投稿/重复展示，或仅做了压缩、缩放。请核对原始实验记录。` });
        } else if (dup >= 0.88) {
          flags.push({ status: "warn", title: "整体高度相似", detail: `相似度 ${(dup * 100).toFixed(1)}%。可能为同一样品的相近视野或轻微修改，建议人工比对。` });
        }
        if (mirror >= 0.94 && dup < 0.94) {
          flags.push({ status: "fail", title: "疑似镜像翻转", detail: `一图与另一图的水平镜像相似度 ${(mirror * 100).toFixed(1)}%。镜像翻转复用图片属于典型图片误用，请确认是否为不同实验条件。` });
        } else if (mirror >= 0.88 && dup < 0.88) {
          flags.push({ status: "warn", title: "镜像相似度偏高", detail: `镜像相似度 ${(mirror * 100).toFixed(1)}%，建议人工检查是否存在翻转复用。` });
        }
        if (overlap >= 0.25 && dup < 0.88 && mirror < 0.88) {
          flags.push({ status: "fail", title: "疑似裁剪重叠", detail: `${Math.round(overlap * 100)}% 的局部区块在另一图中找到高相似匹配（分块哈希，4×4 网格）。整体不同但局部重合，可能为同一原图的不同裁剪区域被当作独立结果展示。` });
        } else if (overlap >= 0.15 && dup < 0.88) {
          flags.push({ status: "warn", title: "局部区块相似", detail: `${Math.round(overlap * 100)}% 区块匹配。可能为同类样品的相似纹理，也可能为裁剪重叠，请放大比对匹配区域。` });
        }
        const av = Number(a.scaleValue);
        const bv = Number(b.scaleValue);
        if (a.bar && b.bar && av > 0 && bv > 0) {
          if (a.scaleUnit !== b.scaleUnit) {
            flags.push({ status: "warn", title: "比例尺单位不同", detail: `两图比例尺声明单位分别为 ${a.scaleUnit} 与 ${b.scaleUnit}，请先统一单位再比较放大倍数。` });
          } else {
            const pa = a.bar.w / av;
            const pb = b.bar.w / bv;
            const ratio = Math.max(pa, pb) / Math.min(pa, pb);
            if (ratio > 1.15) {
              flags.push({ status: "fail", title: "比例尺不一致", detail: `按声明长度换算，像素/单位比值为 ${pa.toFixed(2)} 与 ${pb.toFixed(2)}（相差 ${((ratio - 1) * 100).toFixed(0)}%）。若两图声称相同放大倍数，则比例尺或声明长度有误；若倍数不同，须在图注中分别标明。` });
            } else {
              flags.push({ status: "pass", title: "比例尺一致", detail: `像素/单位比值 ${pa.toFixed(2)} 与 ${pb.toFixed(2)}，差异 ${((ratio - 1) * 100).toFixed(0)}%（≤15%），与相同放大倍数一致。` });
            }
          }
        } else if ((a.bar && !b.bar) || (!a.bar && b.bar)) {
          flags.push({ status: "warn", title: "比例尺缺失不对称", detail: "仅一张图检测到比例尺。同组比较的成像图应都带比例尺，或统一在图注中说明放大倍数。" });
        } else if (!a.bar && !b.bar) {
          flags.push({ status: "info", title: "未检测到比例尺", detail: "两图均未检测到明显比例尺横条。若为显微/成像图片请补充比例尺；若为统计图可忽略此项。" });
        } else {
          flags.push({ status: "info", title: "比例尺待声明", detail: "检测到比例尺横条（红框标出），请在左侧填写其代表的实际长度后自动核对一致性。" });
        }
        if (flags.length === 0) {
          flags.push({ status: "pass", title: "未发现误用信号", detail: `整体相似度 ${(dup * 100).toFixed(1)}%、镜像 ${(mirror * 100).toFixed(1)}%、区块重叠 ${Math.round(overlap * 100)}%，均在正常范围。` });
        }
        out.push({ a, b, dup, mirror, overlap, flags });
      }
    }
    return out;
  }, [images]);

  const failPairs = pairs.filter((p) => p.flags.some((f) => f.status === "fail")).length;

  return (
    <div>
      <ModuleHeader
        code="MOD-04"
        title="科研图片防误用检测器"
        desc="上传同一论文或同一课题的多张图片，用感知哈希检测重复使用、镜像翻转与裁剪重叠，并结合比例尺声明核对放大倍数一致性。结果为筛查信号，最终认定需人工比对原始数据。"
      />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <Panel title="1 · 上传图片（≥2 张）">
            <DropZone onFiles={onFiles} accept="image/*" multiple hint="可一次选择多张；红框为自动检测到的比例尺候选" compact />
            {busy && <p className="mt-2 text-xs text-muted-foreground">正在计算感知哈希…</p>}
            {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            {images.length > 0 && (
              <ul className="mt-3 space-y-3">
                {images.map((im) => (
                  <li key={im.id} className="rounded-md border border-border p-2.5">
                    <div className="flex items-start gap-2.5">
                      <img src={im.markedUrl} alt={im.name} className="size-16 shrink-0 rounded border border-border object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium" title={im.name}>{im.name}</p>
                        <p className="num text-[11px] text-muted-foreground">
                          {im.width}×{im.height}px · {im.bar ? `比例尺候选 ${im.bar.w}px` : "无比例尺候选"}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Input
                            className="num h-7 w-20 px-2 text-xs"
                            placeholder="长度"
                            value={im.scaleValue}
                            onChange={(e) => updateScale(im.id, { scaleValue: e.target.value })}
                            aria-label={`${im.name} 比例尺代表长度`}
                          />
                          <select
                            className="h-7 rounded-md border border-input bg-card px-1.5 text-xs"
                            value={im.scaleUnit}
                            onChange={(e) => updateScale(im.id, { scaleUnit: e.target.value })}
                            aria-label={`${im.name} 比例尺单位`}
                          >
                            {["µm", "mm", "nm", "cm"].map((u) => <option key={u}>{u}</option>)}
                          </select>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label={`移除 ${im.name}`}
                        onClick={() => setImages((prev) => prev.filter((x) => x.id !== im.id))}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Note>
            检测原理：dHash 感知哈希比较整体与水平镜像；4×4 分块哈希定位局部重叠；比例尺为边缘纯色横条启发式检测。哈希阈值针对「同图修改」筛查设定，相似实验条件产生的正常相似图片可能触发注意级提示。
          </Note>
        </div>

        <div className="space-y-5">
          {images.length < 2 ? (
            <Panel>
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <p className="text-sm font-medium">至少上传 2 张图片开始比对</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  已上传 {images.length} 张。上传后自动两两比对：重复 / 镜像 / 裁剪重叠 / 比例尺一致性。
                </p>
              </div>
            </Panel>
          ) : (
            <>
              <Panel
                title={`两两比对报告（${pairs.length} 对）`}
                aside={
                  <Badge variant="secondary" className={failPairs > 0 ? "bg-rose-600/12 text-rose-700 dark:text-rose-400" : "bg-emerald-600/12 text-emerald-700 dark:text-emerald-400"}>
                    {failPairs > 0 ? `${failPairs} 对存在问题信号` : "未发现误用信号"}
                  </Badge>
                }
              >
                <div className="space-y-5">
                  {pairs.map((p) => (
                    <div key={p.a.id + p.b.id} className="rounded-lg border border-border p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        <img src={p.a.markedUrl} alt={p.a.name} className="size-14 rounded border border-border object-cover" />
                        <span className="text-xs text-muted-foreground">vs</span>
                        <img src={p.b.markedUrl} alt={p.b.name} className="size-14 rounded border border-border object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{p.a.name} ↔ {p.b.name}</p>
                          <p className="num mt-0.5 text-[11px] text-muted-foreground">
                            整体 {(p.dup * 100).toFixed(1)}% · 镜像 {(p.mirror * 100).toFixed(1)}% · 区块重叠 {Math.round(p.overlap * 100)}%
                          </p>
                        </div>
                      </div>
                      <ul>
                        {p.flags.map((f, i) => (
                          <CheckItem key={i} status={f.status} title={f.title} detail={f.detail} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Panel>
              <Note tone="warn">
                本工具输出的是<b>筛查信号</b>而非学术不端认定。阳性结果请调取原始成像文件、实验记录与投稿版本人工核对；阴性结果也不能完全排除经过复杂修改的误用。
              </Note>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
