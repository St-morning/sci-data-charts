import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckItem, DropZone, ModuleHeader, Note, Panel, type CheckStatus } from "@/components/shared";
import { columnInfos, parseFile, parseNumber, sampleBatchTables, type RawTable } from "@/lib/data";
import { decomposeBatches, describe, fmt, fmtP, mean, sd, spearman, type BatchDecomposition } from "@/lib/stats";
import { uid } from "@/lib/store";
import { FlaskConical, Trash2 } from "lucide-react";

interface Batch {
  id: string;
  name: string;
  table: RawTable;
  idIdx: number;
  valIdx: number;
}

type Norm = "raw" | "z" | "shift" | "ref";

const NORM_LABELS: Record<Norm, string> = {
  raw: "原始值（不对齐）",
  z: "批内 Z-score 标准化",
  shift: "批次均值平移对齐",
  ref: "参考样品比值对齐",
};

const selectCls =
  "h-8 rounded-md border border-input bg-card px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

const LINE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

interface BatchResult {
  samples: string[];
  matrix: number[][];
  rawMatrix: number[][];
  dropped: string[];
  dec: BatchDecomposition;
  rankCorr: number;
  batchStats: { name: string; mean: number; sd: number }[];
  verdict: { status: CheckStatus; title: string; detail: string };
  notes: { status: CheckStatus; title: string; detail: string }[];
}

export default function BatchCompare() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [norm, setNorm] = useState<Norm>("raw");
  const [refSample, setRefSample] = useState("");
  const [error, setError] = useState("");

  function autoMap(table: RawTable): { idIdx: number; valIdx: number } {
    const infos = columnInfos(table);
    const idCol = infos.find((c) => !c.numeric) ?? infos[0];
    const valCol = infos.find((c) => c.numeric) ?? infos[infos.length - 1];
    return { idIdx: idCol.index, valIdx: valCol.index };
  }

  async function onFiles(files: File[]) {
    setError("");
    const added: Batch[] = [];
    for (const f of files) {
      try {
        const table = await parseFile(f);
        const { idIdx, valIdx } = autoMap(table);
        added.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ""), table, idIdx, valIdx });
      } catch (e) {
        setError(e instanceof Error ? e.message : `解析 ${f.name} 失败`);
      }
    }
    setBatches((prev) => [...prev, ...added]);
  }

  function loadSample() {
    setError("");
    setBatches(
      sampleBatchTables().map((b) => {
        const { idIdx, valIdx } = autoMap(b.table);
        return { id: uid(), name: b.name, table: b.table, idIdx, valIdx };
      }),
    );
    setNorm("raw");
  }

  const result = useMemo<BatchResult | { error: string } | null>(() => {
    if (batches.length < 2) return null;
    const maps = batches.map((b) => {
      const m = new Map<string, number>();
      for (const row of b.table.rows) {
        const id = (row[b.idIdx] ?? "").trim();
        const v = parseNumber(row[b.valIdx] ?? "");
        if (id && v !== null && !m.has(id)) m.set(id, v);
      }
      return m;
    });
    const allIds = [...new Set(maps.flatMap((m) => [...m.keys()]))];
    const samples = allIds.filter((id) => maps.every((m) => m.has(id)));
    const dropped = allIds.filter((id) => !samples.includes(id));
    if (samples.length < 3) {
      return { error: `完整对齐的样品不足（${samples.length} 个）。需要至少 3 个在所有批次中都出现的样品 ID 才能做方差分解。请检查 ID 列是否一致。` };
    }
    const rawMatrix = samples.map((id) => maps.map((m) => m.get(id)!));
    const b = batches.length;
    const colMeans = Array.from({ length: b }, (_, j) => mean(rawMatrix.map((r) => r[j])));
    const colSds = Array.from({ length: b }, (_, j) => sd(rawMatrix.map((r) => r[j])));
    const grand = mean(rawMatrix.flat());
    let matrix = rawMatrix;
    if (norm === "z") {
      matrix = rawMatrix.map((r) => r.map((v, j) => (colSds[j] > 0 ? (v - colMeans[j]) / colSds[j] : 0)));
    } else if (norm === "shift") {
      matrix = rawMatrix.map((r) => r.map((v, j) => v - colMeans[j] + grand));
    } else if (norm === "ref") {
      const ri = samples.indexOf(refSample);
      if (ri < 0) return { error: "请选择一个参考样品用于比值对齐。" };
      const refVals = rawMatrix[ri];
      if (refVals.some((v) => v === 0)) return { error: "参考样品在某批次中值为 0，无法做比值对齐。请换参考样品或改用均值平移。" };
      const refMean = mean(refVals);
      matrix = rawMatrix.map((r) => r.map((v, j) => (v / refVals[j]) * refMean));
    }
    const dec = decomposeBatches(matrix);
    if (!dec) return { error: "方差分解失败：需要至少 2 个样品 × 2 个批次。" };
    let rankSum = 0;
    let rankN = 0;
    for (let i = 0; i < b; i++) {
      for (let j = i + 1; j < b; j++) {
        const rho = spearman(matrix.map((r) => r[i]), matrix.map((r) => r[j]));
        if (isFinite(rho)) { rankSum += rho; rankN++; }
      }
    }
    const rankCorr = rankN > 0 ? rankSum / rankN : NaN;
    const batchStats = batches.map((bb, j) => ({
      name: bb.name,
      mean: mean(matrix.map((r) => r[j])),
      sd: sd(matrix.map((r) => r[j])),
    }));

    const notes: BatchResult["notes"] = [];
    let verdict: BatchResult["verdict"];
    const batchSig = isFinite(dec.pBatch) && dec.pBatch < 0.05;
    const sampleSig = isFinite(dec.pSample) && dec.pSample < 0.05;
    if (batchSig && dec.shareBatch > dec.shareSample) {
      verdict = {
        status: "fail",
        title: "批次效应占比高于样品间差异",
        detail: `批次效应显著（F = ${fmt(dec.fBatch, 3)}，p ${fmtP(dec.pBatch)}），且批次间方差占比 ${(dec.shareBatch * 100).toFixed(0)}% 超过样品间占比 ${(dec.shareSample * 100).toFixed(0)}%。当前数据中的「差异」更可能反映日期/仪器/操作条件，而非样品本身。建议先做批次校正（均值平移或参考样品比值），或用混合效应模型把批次作为随机效应。`,
      };
    } else if (!batchSig && sampleSig && dec.icc >= 0.75) {
      verdict = {
        status: "pass",
        title: "变化主要来自样品本身",
        detail: `批次效应未达显著（p ${fmtP(dec.pBatch)}），样品效应显著（p ${fmtP(dec.pSample)}），跨批次一致性 ICC = ${fmt(dec.icc, 2)}（≥0.75）。样品间差异相对残差较大；残差包含样品×批次交互和测量误差，当前无重复设计无法区分，仍需独立重复验证。`,
      };
    } else if (batchSig) {
      verdict = {
        status: "warn",
        title: "存在批次效应，但样品差异仍占主导",
        detail: `批次效应显著（p ${fmtP(dec.pBatch)}，占比 ${(dec.shareBatch * 100).toFixed(0)}%），样品间占比 ${(dec.shareSample * 100).toFixed(0)}%。样品排序信息可用，但绝对值跨批次比较前建议校正；报告时注明批次来源。`,
      };
    } else {
      verdict = {
        status: "warn",
        title: "证据不足：样品与批次效应均不显著",
        detail: `样品效应 p ${fmtP(dec.pSample)}、批次效应 p ${fmtP(dec.pBatch)}，ICC = ${fmt(dec.icc, 2)}。残差（样品×批次交互＋测量误差）占比 ${(dec.shareError * 100).toFixed(0)}%，可能掩盖了样品差异。建议增加样品×批次单元内的重复测量，以区分交互和测量误差。`,
      };
    }
    if (isFinite(rankCorr)) {
      notes.push({
        status: rankCorr >= 0.8 ? "pass" : rankCorr >= 0.5 ? "warn" : "fail",
        title: `跨批次样品排序一致性（平均 Spearman ρ = ${fmt(rankCorr, 2)}）`,
        detail:
          rankCorr >= 0.8
            ? "各批次对样品的排序高度一致，即使存在批次偏移，相对高低关系仍可信。"
            : "排序一致性偏低：批次不仅改变绝对值，还改变了样品相对顺序，跨批次结论需格外谨慎。",
      });
    }
    notes.push({
      status: "info",
      title: `方差分解（样品 ${dec.nSamples} × 批次 ${dec.nBatches}，无重复双因素模型）`,
      detail: `样品间 ${(dec.shareSample * 100).toFixed(1)}% · 批次间 ${(dec.shareBatch * 100).toFixed(1)}% · 残差（样品×批次交互＋测量误差）${(dec.shareError * 100).toFixed(1)}%。ICC(一致性) = ${fmt(dec.icc, 3)}。交互和测量误差在无重复设计下不可分离，不能将残差单独视为测量误差。`,
    });
    if (dropped.length > 0) {
      notes.push({
        status: "warn",
        title: `${dropped.length} 个样品因缺失被排除`,
        detail: `未在所有批次中出现的样品：${dropped.slice(0, 8).join("、")}${dropped.length > 8 ? " 等" : ""}。方差分解要求完整矩阵，请补测或确认 ID 拼写一致。`,
      });
    }
    if (norm === "raw" && batchSig) {
      notes.push({
        status: "info",
        title: "建议尝试对齐后复核",
        detail: "切换「批次均值平移对齐」或「参考样品比值对齐」可消除系统性批次偏移；若对齐后批次效应消失而样品效应保留，说明偏移为加性/乘性系统误差，可校正后合并分析。",
      });
    }
    return { samples, matrix, rawMatrix, dropped, dec, rankCorr, batchStats, verdict, notes };
  }, [batches, norm, refSample]);

  const ok = result && !("error" in result) ? result : null;
  const chartData = ok
    ? batches.map((b, j) => {
        const row: Record<string, number | string> = { batch: b.name };
        ok.samples.forEach((s, i) => { row[s] = ok.matrix[i][j]; });
        return row;
      })
    : [];

  return (
    <div>
      <ModuleHeader
        code="MOD-05"
        title="跨实验批次对比平台"
        desc="上传不同日期 / 仪器 / 批次的数据（每文件一个批次，按样品 ID 对齐），用无重复双因素方差分解评估样品间、批次间与残差（样品×批次交互＋测量误差）；此设计不能单独估计测量误差。"
      />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <Panel title="1 · 批次数据">
            <div className="mb-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={loadSample}>
                <FlaskConical className="size-3.5" aria-hidden />
                示例：3 个批次
              </Button>
            </div>
            <DropZone onFiles={onFiles} accept=".csv,.tsv,.txt,.xlsx,.xls" multiple hint="每个文件 = 一个批次；需含样品 ID 列与测量值列" compact />
            {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            {batches.length > 0 && (
              <ul className="mt-3 space-y-2.5">
                {batches.map((b) => {
                  const infos = columnInfos(b.table);
                  return (
                    <li key={b.id} className="rounded-md border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-medium">{b.name}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label={`移除 ${b.name}`}
                          onClick={() => setBatches((prev) => prev.filter((x) => x.id !== b.id))}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="mb-0.5 block text-[11px] text-muted-foreground">样品 ID 列</span>
                          <select
                            className={selectCls + " w-full"}
                            value={b.idIdx}
                            onChange={(e) =>
                              setBatches((prev) => prev.map((x) => x.id === b.id ? { ...x, idIdx: Number(e.target.value) } : x))
                            }
                          >
                            {infos.map((c) => <option key={c.index} value={c.index}>{c.name}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-0.5 block text-[11px] text-muted-foreground">测量值列</span>
                          <select
                            className={selectCls + " w-full"}
                            value={b.valIdx}
                            onChange={(e) =>
                              setBatches((prev) => prev.map((x) => x.id === b.id ? { ...x, valIdx: Number(e.target.value) } : x))
                            }
                          >
                            {infos.map((c) => <option key={c.index} value={c.index}>{c.name}</option>)}
                          </select>
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          {batches.length >= 2 && (
            <Panel title="2 · 对齐方式">
              <div className="space-y-2">
                {(Object.keys(NORM_LABELS) as Norm[]).map((n) => (
                  <label key={n} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="norm" checked={norm === n} onChange={() => setNorm(n)} />
                    {NORM_LABELS[n]}
                  </label>
                ))}
                {norm === "ref" && ok && (
                  <label className="block pt-1">
                    <span className="mb-0.5 block text-xs text-muted-foreground">参考样品（各批次均应有稳定值）</span>
                    <select className={selectCls + " w-full"} value={refSample} onChange={(e) => setRefSample(e.target.value)}>
                      <option value="">请选择…</option>
                      {ok.samples.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                )}
                <Note>对齐只消除系统性批次偏移，不能修复随机测量误差。判定基于当前所选对齐方式下的方差分解。</Note>
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          {!result ? (
            <Panel>
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <p className="text-sm font-medium">上传至少 2 个批次开始对比</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  或点击「示例：3 个批次」查看完整判定流程：对齐 → 方差分解 → 样品 / 批次 / 误差占比 → 结论。
                </p>
              </div>
            </Panel>
          ) : "error" in result ? (
            <Panel title="无法分析">
              <p className="text-sm text-rose-600 dark:text-rose-400">{result.error}</p>
            </Panel>
          ) : (
            <>
              <Panel
                title="判定结论"
                aside={<Badge variant="outline" className="text-xs">{NORM_LABELS[norm]}</Badge>}
              >
                <ul>
                  <CheckItem status={result.verdict.status} title={result.verdict.title} detail={result.verdict.detail} />
                  {result.notes.map((n, i) => (
                    <CheckItem key={i} status={n.status} title={n.title} detail={n.detail} />
                  ))}
                </ul>
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">总变异构成</p>
                  <div className="flex h-6 w-full overflow-hidden rounded-md border border-border" role="img" aria-label="方差占比条">
                    <div style={{ width: `${result.dec.shareSample * 100}%`, background: "var(--chart-1)" }} title={`样品间 ${(result.dec.shareSample * 100).toFixed(1)}%`} />
                    <div style={{ width: `${result.dec.shareBatch * 100}%`, background: "var(--chart-2)" }} title={`批次间 ${(result.dec.shareBatch * 100).toFixed(1)}%`} />
                    <div style={{ width: `${result.dec.shareError * 100}%`, background: "var(--chart-5)" }} title={`残差（交互作用＋测量误差） ${(result.dec.shareError * 100).toFixed(1)}%`} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--chart-1)" }} />样品间 {(result.dec.shareSample * 100).toFixed(1)}%</span>
                    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--chart-2)" }} />批次间 {(result.dec.shareBatch * 100).toFixed(1)}%</span>
                    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--chart-5)" }} />残差（交互作用＋测量误差） {(result.dec.shareError * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </Panel>

              <Panel title="各样品跨批次轨迹">
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--site-border)" />
                      <XAxis dataKey="batch" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
                      <Tooltip formatter={(v) => fmt(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {result.samples.map((s, i) => (
                        <Line key={s} type="monotone" dataKey={s} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <Note>线条平行 = 批次仅造成整体偏移（可校正）；线条交叉 = 批次改变了样品排序（校正后仍需谨慎）。</Note>
              </Panel>

              <Panel title="对齐后数据矩阵与批次统计">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">样品</th>
                        {batches.map((b) => <th key={b.id} className="num py-2 pr-3 font-medium">{b.name}</th>)}
                        <th className="num py-2 pr-3 font-medium">样品均值</th>
                        <th className="num py-2 font-medium">跨批 SD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.samples.map((s, i) => (
                        <tr key={s} className="border-b border-border/60 last:border-0">
                          <td className="py-1.5 pr-3 font-medium">{s}</td>
                          {result.matrix[i].map((v, j) => <td key={j} className="num py-1.5 pr-3">{fmt(v)}</td>)}
                          <td className="num py-1.5 pr-3">{fmt(mean(result.matrix[i]))}</td>
                          <td className="num py-1.5">{fmt(sd(result.matrix[i]))}</td>
                        </tr>
                      ))}
                      <tr className="bg-secondary/60">
                        <td className="py-1.5 pr-3 text-xs font-medium text-muted-foreground">批次均值 ± SD</td>
                        {result.batchStats.map((b) => (
                          <td key={b.name} className="num py-1.5 pr-3 text-xs">{fmt(b.mean)} ± {fmt(b.sd)}</td>
                        ))}
                        <td colSpan={2} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
