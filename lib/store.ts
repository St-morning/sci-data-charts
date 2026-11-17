export interface StoryCard {
  id: string;
  section: SectionId;
  title: string;
  body: string;
  imageDataUrl?: string;
  createdAt: number;
}

export type SectionId = "question" | "design" | "finding" | "evidence" | "conclusion";

export const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: "question", label: "研究问题", hint: "要回答什么？为什么重要？" },
  { id: "design", label: "实验设计", hint: "分组、样本量、测量指标与方法" },
  { id: "finding", label: "关键发现", hint: "最重要的 1–3 个结果，用数据说话" },
  { id: "evidence", label: "证据", hint: "支撑发现的图表与统计检验" },
  { id: "conclusion", label: "结论", hint: "回答研究问题，说明边界与下一步" },
];

const CARDS_KEY = "scibench.storyboard.v1";
const FINDINGS_KEY = "scibench.findings.v1";
const PANELS_KEY = "scibench.panels.v1";

export interface PanelItem {
  id: string;
  name: string;
  kind: "svg" | "image";
  svg?: string;
  dataUrl?: string;
  w: number;
  h: number;
  createdAt: number;
}

export function loadPanels(): PanelItem[] {
  return read<PanelItem[]>(PANELS_KEY, []);
}

export function savePanels(list: PanelItem[]): void {
  write(PANELS_KEY, list.slice(0, 24));
}

export function addPanel(p: PanelItem): PanelItem[] {
  const list = loadPanels().filter((x) => x.id !== p.id);
  list.push(p);
  savePanels(list);
  return loadPanels();
}

export interface FindingSnapshot {
  id: string;
  createdAt: number;
  metricName: string;
  unit: string;
  summary: string;
  results: string[];
  chartDataUrl?: string;
  groups: { name: string; n: number; mean: number; sd: number }[];
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储已满或被禁用时静默降级为会话内状态
  }
}

export function loadCards(): StoryCard[] {
  return read<StoryCard[]>(CARDS_KEY, []);
}

export function saveCards(cards: StoryCard[]): void {
  write(CARDS_KEY, cards);
}

export function loadFindings(): FindingSnapshot[] {
  return read<FindingSnapshot[]>(FINDINGS_KEY, []);
}

export function saveFinding(f: FindingSnapshot): void {
  const list = loadFindings().filter((x) => x.id !== f.id);
  list.unshift(f);
  write(FINDINGS_KEY, list.slice(0, 12));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}