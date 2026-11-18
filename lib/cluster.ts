import { mean, sd, pearson } from "./stats";
import type { HeatmapOptions } from "./chartmodel";

export function columnSelection(input: string, count: number, labelIndex: number): number[] {
  if (!input.trim()) return Array.from({length: count}, (_, i) => i).filter(i => i !== labelIndex);
  const out = new Set<number>();
  for (const token of input.replace(/，/g, ",").split(",")) {
    const m = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error("列范围格式应为 2-4,6-8（按原表 1 开始编号）");
    const a = +m[1], b = +(m[2] ?? m[1]);
    if (a < 1 || b > count || a > b) throw new Error(`列范围必须在 1–${count} 之间且起点不大于终点`);
    for (let i = a - 1; i < b; i++) { if(i === labelIndex) throw new Error(`第 ${i+1} 列是标签列，不能作为热图数值`); out.add(i); }
  }
  return [...out];
}
export const transpose = (v: number[][]) => v[0].map((_, j) => v.map(row => row[j]));
export function zscore(v: number[][]): number[][] { return v.map(row => { const m = mean(row), s = sd(row); return row.map(x => s > 0 ? (x-m)/s : 0); }); }
export function normalizeMatrix(v: number[][], mode: HeatmapOptions["normalize"]): number[][] {
  let out = v.map(r => [...r]);
  if(mode === "row" || mode === "both") out = zscore(out);
  if(mode === "column" || mode === "both") out = transpose(zscore(transpose(out)));
  return out;
}
export interface ClusterNode { ids: number[]; height: number; left?: ClusterNode; right?: ClusterNode }
export function hierarchy(v: number[][], distance: HeatmapOptions["distance"], linkage: HeatmapOptions["linkage"]): ClusterNode {
  if(v.length > 500) throw new Error("浏览器层次聚类最多支持 500 行/列，请先筛选数据或关闭聚类");
  const d = v.map(a => v.map(b => distance === "manhattan" ? a.reduce((s,x,k)=>s+Math.abs(x-b[k]),0) : distance === "correlation" ? (a.every((x,k)=>x===b[k]) ? 0 : 1-(Number.isFinite(pearson(a,b).r) ? pearson(a,b).r : 0)) : Math.sqrt(a.reduce((s,x,k)=>s+(x-b[k])**2,0))));
  const nodes: (ClusterNode & {key:number})[] = v.map((_,i)=>({ids:[i],height:0,key:i}));
  const distances=new Map<string,number>();
  const pair=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
  for(let i=0;i<v.length;i++)for(let j=i+1;j<v.length;j++)distances.set(pair(i,j),d[i][j]);
  let nextKey=v.length;
  while(nodes.length > 1) {
    let ai=0, bi=1, best=Infinity;
    for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) {
      const x=distances.get(pair(nodes[i].key,nodes[j].key))!;
      if(x<best){best=x;ai=i;bi=j;}
    }
    const left=nodes[ai], right=nodes[bi]; nodes.splice(bi,1);nodes.splice(ai,1);
    const key=nextKey++;
    for(const node of nodes){const a=distances.get(pair(left.key,node.key))!,b=distances.get(pair(right.key,node.key))!;distances.set(pair(key,node.key),linkage==="single"?Math.min(a,b):linkage==="complete"?Math.max(a,b):(a*left.ids.length+b*right.ids.length)/(left.ids.length+right.ids.length));}
    nodes.push({ids:[...left.ids,...right.ids],height:best,left,right,key});
  }
  return nodes[0];
}
