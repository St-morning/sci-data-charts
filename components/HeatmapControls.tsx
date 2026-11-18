import { Field } from "./shared";
import type { HeatmapOptions } from "@/lib/chartmodel";
const cls="h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
export function HeatmapControls({value:a,onChange:set}:{value:HeatmapOptions;onChange:(a:HeatmapOptions)=>void}) {
  const update=<K extends keyof HeatmapOptions>(k:K,v:HeatmapOptions[K])=>set({...a,[k]:v});
  const num=(key:keyof HeatmapOptions,label:string,min=0,max=200,step=1)=><label key={key} className="block text-xs">{label}<input className={cls} aria-label={label} type="number" min={min} max={max} step={step} value={a[key] as number} onChange={e=>update(key,Math.max(min,Math.min(max,Number(e.target.value))) as never)}/></label>;
  const text=(key:keyof HeatmapOptions,label:string,hint?:string)=><Field key={key} label={label} hint={hint}><input className={cls} aria-label={label} value={a[key] as string} onChange={e=>update(key,e.target.value as never)}/></Field>;
  const select=(key:keyof HeatmapOptions,label:string,items:[string,string][])=><label key={key} className="block text-xs">{label}<select className={cls} aria-label={label} value={String(a[key])} onChange={e=>update(key,e.target.value as never)}>{items.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
  return <div className="space-y-4" data-testid="heatmap-controls">
    {text("columns","选择用于作图的列","原表从 1 开始编号；如 2-4,6-8；留空使用全部数值列，标签列不能入选")}
    <div className="grid grid-cols-2 gap-3">
      {select("normalize","Z-score 归一化",[["row","行 row"],["column","列 column"],["both","先行后列"],["none","不处理"]])}
      {select("trees","显示聚类树",[["all","行和列"],["row","行"],["column","列"],["none","隐藏树（保留聚类排序）"]])}
      {select("distance","聚类距离",[["euclidean","Euclidean 欧氏"],["manhattan","Manhattan 曼哈顿"],["correlation","1 − Pearson r"]])}
      {select("linkage","聚类连接方法",[["average","Average 平均"],["complete","Complete 最长"],["single","Single 最短"]])}
      {([["clusterRows","对行聚类"],["clusterCols","对列聚类"],["hideRows","隐藏行标签"],["hideCols","隐藏列标签"],["numbers","格子中显示数字"]] as const).map(([key,label])=><label key={key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={a[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>)}
      {num("treeHeight","上方聚类树高度 mm",0,100)}{num("treeWidth","左侧聚类树宽度 mm",0,100)}
      {num("rowPt","行名字号 pt",1,40,0.5)}{num("colPt","列名字号 pt",1,40,0.5)}
      {num("numberPt","格子数字字号 pt",1,40,0.5)}{num("decimals","数字小数位",0,8)}
      {num("cellWidth","格子宽度 mm（0=自适应）",0,30,0.5)}{num("cellHeight","格子高度 mm（0=自适应）",0,30,0.5)}
      {num("rotation","列名旋转角度 °",0,90)}{num("borderWidth","格子描边粗细",0,10,0.1)}
      {select("cellShape","格子形状",[["rect","矩形"],["circle","圆形"]])}
      <label className="text-xs">格子描边颜色<input type="color" className={cls} value={a.borderColor} onChange={e=>update("borderColor",e.target.value)}/></label>
    </div>
    {text("customColors","自定义渐变色","留空使用色标预设；例 #008000,#000000,#ff0000；支持两个或多个颜色")}
    <div className="grid grid-cols-3 gap-2">{text("min","色标最小值")}{text("midpoint","色标中点")}{text("max","色标最大值")}</div>
    <Field label="分组注释" hint="每行：样本名,分组名；支持上传分组文件或粘贴（可含表头）"><textarea aria-label="分组注释" rows={4} className={cls+" h-auto"} value={a.groups} onChange={e=>update("groups",e.target.value)}/><input aria-label="上传分组文件" type="file" accept=".csv,.tsv,.txt" onChange={e=>{const f=e.target.files?.[0];if(f)void f.text().then(s=>update("groups",s.replace(/^\uFEFF/,"").split(/\r?\n/).filter(l=>!/^(sample|样本|sampleid)[\t,，]/i.test(l.trim())).join("\n")));e.target.value="";}}/></Field>
    {text("groupColors","分组颜色","#RRGGBB 逗号分隔，数量与分组数相同；留空使用全图配色")}
    <Field label="仅显示指定行标签" hint="每行一个行名，留空显示全部；可上传单列文本文件"><textarea aria-label="仅显示指定行标签" rows={3} className={cls+" h-auto"} value={a.labels} onChange={e=>update("labels",e.target.value)}/><input aria-label="上传标签文件" type="file" accept=".txt,.csv,.tsv" onChange={e=>{const f=e.target.files?.[0];if(f)void f.text().then(s=>update("labels",s));e.target.value="";}}/></Field>
    <p className="text-xs text-muted-foreground">改动实时作用于预览与导出。固定格子尺寸会扩展画布，保持 mm 尺寸；常量行/列归一化为 0。数字为归一化后的值；数字过宽时自动缩小以免越格，可增加格子宽度保持大字号。</p>
  </div>;
}
