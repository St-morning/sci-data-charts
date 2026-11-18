import { useMemo, useState } from "react";
export type ElementEdits=Record<string,Record<string,string>>;
const allowed=["x","y","cx","cy","r","rx","ry","width","height","x1","x2","y1","y2","font-size","stroke-width","opacity","fill-opacity","stroke-opacity","fill","stroke","text-anchor","text"];
export function editSvg(inner:string,edits:ElementEdits):string {
  const doc=new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`,"image/svg+xml");
  Array.from(doc.querySelectorAll("text,rect,circle,ellipse,line,path,polygon,polyline")).forEach((el,i)=>{
    el.setAttribute("data-edit-id",String(i));
    for(const [key,value] of Object.entries(edits[String(i)]??{})) {
      if(!allowed.includes(key))continue;
      if(key==="text"){if(el.tagName==="text")el.textContent=value;continue;}
      if(key==="fill"||key==="stroke"){if(!/^(#[\da-f]{3,8}|none)$/i.test(value))continue;}
      else if(key==="text-anchor"){if(!["start","middle","end"].includes(value))continue;}
      else if(!Number.isFinite(Number(value)))continue;
      el.setAttribute(key,value);
    }
  });
  return doc.documentElement.innerHTML;
}
export function SvgElementEditor({svg,selected,onSelect,edits,onChange}:{svg:string;selected:string;onSelect:(id:string)=>void;edits:ElementEdits;onChange:(edits:ElementEdits)=>void}) {
  const [query,setQuery]=useState("");
  const elements=useMemo(()=>Array.from(new DOMParser().parseFromString(svg,"image/svg+xml").querySelectorAll("[data-edit-id]")),[svg]);
  const el=elements.find(e=>e.getAttribute("data-edit-id")===selected);
  return <details className="mt-4 rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">图元精调 · 点击预览中的文字 / 点 / 线 / 色块</summary><p className="mt-2 text-xs text-muted-foreground">逐项调整坐标、颜色、尺寸、线宽和文字；所有修改进入 SVG / PNG。切换数据或图形时重置。</p>
    <input aria-label="筛选图元" placeholder="搜索文字或图元类型" className="mt-2 w-full rounded border border-border bg-background p-2 text-xs" value={query} onChange={e=>setQuery(e.target.value)}/>
    <select aria-label="选择图元" className="mt-2 w-full rounded border border-border bg-background p-2 text-xs" value={selected} onChange={e=>onSelect(e.target.value)}><option value="">请选择或点击预览</option>{elements.filter(e=>(e.tagName+e.textContent).toLowerCase().includes(query.toLowerCase())).map(e=><option key={e.getAttribute("data-edit-id")} value={e.getAttribute("data-edit-id")!}>{e.getAttribute("data-edit-id")} · {e.tagName} · {e.tagName==="text"?e.textContent?.slice(0,70):e.getAttribute("fill")}</option>)}</select>
    {el&&<div className="mt-3 grid grid-cols-2 gap-2">{allowed.filter(k=>k==="text"?el.tagName==="text":el.hasAttribute(k)||["fill","stroke","opacity","stroke-width"].includes(k)).map(key=><label className="text-xs" key={key}>{key}<input aria-label={`图元 ${key}`} className="w-full rounded border border-border bg-background p-1.5 text-xs" value={edits[selected]?.[key]??(key==="text"?el.textContent??"":el.getAttribute(key)??"")} onChange={e=>onChange({...edits,[selected]:{...edits[selected],[key]:e.target.value}})}/></label>)}</div>}
    {Object.keys(edits).length>0&&<button type="button" onClick={()=>onChange({})} className="mt-3 text-xs underline">重置全部图元修改</button>}
  </details>;
}
