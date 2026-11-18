import {readWorkspace,writeWorkspace,type SaveResult} from "./workspace-storage";
export {initializeWorkspace,storageWarning} from "./workspace-storage";
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
  const value=readWorkspace<unknown>(PANELS_KEY,[]);
  return Array.isArray(value)?value.filter((p):p is PanelItem=>!!p&&typeof p.id==="string"&&typeof p.name==="string"&&(p.kind==="svg"||p.kind==="image")&&Number.isFinite(p.w)&&p.w>0&&Number.isFinite(p.h)&&p.h>0):[];
}

export function savePanels(list: PanelItem[]): Promise<SaveResult> {
  if(list.length>24)return Promise.resolve({ok:false,message:"最多保存 24 个面板，请先移除部分面板。"});
  return writeWorkspace(PANELS_KEY, list);
}

export async function addPanel(p: PanelItem): Promise<PanelItem[]> {
  const list = loadPanels().filter((x) => x.id !== p.id);
  list.push(p);
  const result=await savePanels(list);
  if(!result.ok)throw new Error(result.message);
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

export function loadCards(): StoryCard[] {
  const value=readWorkspace<unknown>(CARDS_KEY,[]);
  return Array.isArray(value)?value.filter((c):c is StoryCard=>!!c&&typeof c.id==="string"&&SECTIONS.some(s=>s.id===c.section)&&typeof c.title==="string"&&typeof c.body==="string"):[];
}

export function saveCards(cards: StoryCard[]): Promise<SaveResult> {
  return writeWorkspace(CARDS_KEY, cards);
}

export function loadFindings(): FindingSnapshot[] {
  const value=readWorkspace<unknown>(FINDINGS_KEY,[]);
  return Array.isArray(value)?value.filter((f):f is FindingSnapshot=>!!f&&typeof f.id==="string"&&typeof f.metricName==="string"&&typeof f.unit==="string"&&typeof f.summary==="string"&&Array.isArray(f.results)&&f.results.every((x:unknown)=>typeof x==="string")&&Array.isArray(f.groups)&&f.groups.every((g:{name?:unknown;n?:unknown;mean?:unknown;sd?:unknown})=>g&&typeof g.name==="string"&&typeof g.n==="number"&&Number.isFinite(g.mean)&&Number.isFinite(g.sd))):[];
}

export function saveFinding(f: FindingSnapshot): Promise<SaveResult> {
  const list = loadFindings().filter((x) => x.id !== f.id);
  list.unshift(f);
  return writeWorkspace(FINDINGS_KEY, list.slice(0, 12));
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
