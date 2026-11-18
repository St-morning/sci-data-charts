import * as XLSX from "xlsx";
import { outlierIndicesIQR } from "./stats";

export interface RawTable {
  headers: string[];
  rows: string[][];
  sourceName: string;
}

export function parseCSVText(text: string, sourceName: string): RawTable {
  if(text.length>20*1024*1024)throw new Error("文本过大，请限制为 20 MB 以内");
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const delim = [",", "\t", ";"]
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cur.trim());
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur.trim());
      cur = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  if (rows.length === 0) throw new Error("文件中没有可用数据行");
  const headers = rows[0].map((h, i) => h || `列${i + 1}`);
  return { headers, rows: rows.slice(1), sourceName };
}

export async function parseFile(file: File): Promise<RawTable> {
  if(file.size>20*1024*1024)throw new Error("数据文件超过 20 MB，请先筛选或拆分");
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    return parseCSVText(await file.text(), file.name);
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array",sheetRows:100002 });
    if(!wb.SheetNames.length)throw new Error("工作簿没有可用工作表");
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    const rows = aoa.filter((r) => r.some((c) => String(c).trim() !== ""));
    if(rows.length>100001)throw new Error("工作表超过 100000 行，请先拆分数据");
    if (rows.length === 0) throw new Error("工作表中没有可用数据行");
    const headers = rows[0].map((h, i) => String(h).trim() || `列${i + 1}`);
    return {
      headers,
      rows: rows.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? "").trim())),
      sourceName: `${file.name} · ${wb.SheetNames[0]}`,
    };
  }
  throw new Error("仅支持 .csv / .tsv / .xlsx / .xls 文件");
}

export function parseNumber(s: string): number | null {
  if (s == null) return null;
  const t = String(s).trim().replace(/,/g, "").replace(/%$/, "");
  if (t === "" || /^(na|n\/a|null|nan|-|—)$/i.test(t)) return null;
  const v = Number(t);
  return isFinite(v) ? v : null;
}

export interface ColumnInfo {
  name: string;
  index: number;
  numeric: boolean;
  numericCount: number;
  missing: number;
}

export function columnInfos(table: RawTable): ColumnInfo[] {
  return table.headers.map((name, index) => {
    let numericCount = 0;
    let missing = 0;
    for (const row of table.rows) {
      const raw = row[index] ?? "";
      if (raw.trim() === "") { missing++; continue; }
      if (parseNumber(raw) !== null) numericCount++;
    }
    return {
      name,
      index,
      numeric: numericCount > 0 && numericCount >= table.rows.length * 0.6,
      numericCount,
      missing,
    };
  });
}

export interface Group {
  name: string;
  values: number[];
  removedMissing: number;
  outlierCount: number;
}

export interface CleanReport {
  totalRows: number;
  usedRows: number;
  removedMissing: number;
  outliers: number;
  groups: Group[];
}

// 长格式：分组列 + 数值列
export function groupsFromLong(
  table: RawTable,
  groupIdx: number,
  valueIdx: number,
  removeOutliers: boolean,
): CleanReport {
  const map = new Map<string, { values: number[]; missing: number }>();
  let removedMissing = 0;
  for (const row of table.rows) {
    const g = (row[groupIdx] ?? "").trim() || "未命名组";
    const v = parseNumber(row[valueIdx] ?? "");
    if (!map.has(g)) map.set(g, { values: [], missing: 0 });
    const entry = map.get(g)!;
    if (v === null) { entry.missing++; removedMissing++; continue; }
    entry.values.push(v);
  }
  return finishGroups(map, table.rows.length, removeOutliers, removedMissing);
}

// 宽格式：每个数值列为一组
export function groupsFromWide(
  table: RawTable,
  valueIdxs: number[],
  removeOutliers: boolean,
): CleanReport {
  const map = new Map<string, { values: number[]; missing: number }>();
  for (const idx of valueIdxs) {
    map.set(table.headers[idx], { values: [], missing: 0 });
  }
  let removedMissing = 0;
  for (const row of table.rows) {
    for (const idx of valueIdxs) {
      const entry = map.get(table.headers[idx])!;
      const v = parseNumber(row[idx] ?? "");
      if (v === null) { entry.missing++; removedMissing++; continue; }
      entry.values.push(v);
    }
  }
  return finishGroups(map, table.rows.length, removeOutliers, removedMissing);
}

function finishGroups(
  map: Map<string, { values: number[]; missing: number }>,
  totalRows: number,
  removeOutliers: boolean,
  removedMissing: number,
): CleanReport {
  let outliers = 0;
  const groups: Group[] = [];
  for (const [name, { values, missing }] of map) {
    const outIdx = outlierIndicesIQR(values);
    outliers += outIdx.length;
    const kept = removeOutliers ? values.filter((_, i) => !outIdx.includes(i)) : values;
    groups.push({ name, values: kept, removedMissing: missing, outlierCount: outIdx.length });
  }
  const usedRows = groups.reduce((a, g) => a + g.values.length, 0);
  return { totalRows, usedRows, removedMissing, outliers, groups };
}

// 确定性伪随机示例数据：对照组 vs 处理组（细胞存活率 %）
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function sampleTable(): RawTable {
  const rng = mulberry32(20261117);
  const rows: string[][] = [];
  for (let i = 0; i < 12; i++) {
    rows.push([`对照组`, (96 + gaussian(rng) * 4).toFixed(1)]);
  }
  for (let i = 0; i < 12; i++) {
    rows.push([`处理组`, (78 + gaussian(rng) * 6).toFixed(1)]);
  }
  rows.push(["处理组", ""]); // 演示缺失值清洗
  return { headers: ["分组", "细胞存活率 (%)"], rows, sourceName: "内置示例数据（非真实实验）" };
}

export function sampleBatchTables(): { name: string; table: RawTable }[] {
  const rng = mulberry32(42);
  const samples = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
  const trueValue = samples.map(() => 40 + rng() * 60);
  const batchShift = [0, 6.5, -3.2];
  const batchNoise = [2.0, 2.4, 5.5];
  return ["批次A · 3月1日", "批次B · 3月8日", "批次C · 3月15日"].map((name, b) => ({
    name,
    table: {
      headers: ["样品ID", "测量值 (ng/mL)"],
      rows: samples.map((id, i) => [
        id,
        (trueValue[i] + batchShift[b] + gaussian(rng) * batchNoise[b]).toFixed(2),
      ]),
      sourceName: `${name}（内置示例）`,
    },
  }));
}
