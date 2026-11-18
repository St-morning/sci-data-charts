import { esc, cmapColor, CMAPS, textWidth, legend, type Theme } from "./chartcore";
import type { MatrixModel, PlotOpts, Rendered } from "./chartmodel";
import { hierarchy, normalizeMatrix, transpose, type ClusterNode } from "./cluster";
export function heatmap(m: MatrixModel, t: Theme, o: PlotOpts, variant="rect"): Rendered {
  const a=o.heat, v=normalizeMatrix(m.v,a.normalize), nr=v.length,nc=v[0].length;
  if(nr*nc>100000)throw new Error("热图最多展示 100000 个格子，请先筛选行列");
  const rt=a.clusterRows?hierarchy(v,a.distance,a.linkage):null, ct=a.clusterCols?hierarchy(transpose(v),a.distance,a.linkage):null;
  const ri=rt?.ids??m.rows.map((_,i)=>i), ci=ct?.ids??m.cols.map((_,i)=>i);
  const units=(pt:number)=>pt*(t.unitsPerPt??t.tickFont/7), mm=units(72/25.4);
  const rfs=units(a.rowPt), cfs=units(a.colPt), nfs=units(a.numberPt);
  const rowTree=!!rt&&(a.trees==="all"||a.trees==="row"), colTree=!!ct&&(a.trees==="all"||a.trees==="column");
  const labelSet=new Set(a.labels.split(/[\n,，]+/).map(x=>x.trim()).filter(Boolean));
  const rowLabelW=a.hideRows?0:Math.min(1500,Math.max(...m.rows.filter(r=>!labelSet.size||labelSet.has(r)).map(r=>textWidth(r,rfs)),0)+15);
  const colLabelH=a.hideCols?0:Math.max(...m.cols.map(c=>textWidth(c,cfs)),0)*Math.abs(Math.sin(a.rotation*Math.PI/180))+cfs+15;
  const tw=rowTree?a.treeWidth*mm:0, th=colTree?a.treeHeight*mm:0;
  const cw=a.cellWidth>0?a.cellWidth*mm:Math.max(12,(680-rowLabelW)/nc), ch=a.cellHeight>0?a.cellHeight*mm:Math.max(12,450/nr);
  const gx=30+tw, gy=70+th+colLabelH+(a.groups.trim()?24:0), gw=cw*nc,gh=ch*nr;
  const w=Math.max(1000,gx+gw+rowLabelW+160), h=Math.max(700,gy+gh+100);
  const flat=v.flat();let lo=a.min!==""?Number(a.min):Math.min(...flat), hi=a.max!==""?Number(a.max):Math.max(...flat);
  if(a.normalize!=="none"&&a.min===""&&a.max===""){const extent=Math.max(Math.abs(lo),Math.abs(hi));lo=-extent;hi=extent;}
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo>hi)throw new Error("色标最大值必须大于最小值");
  if(lo===hi){if(a.min!==""||a.max!=="")throw new Error("自定义色标最大值必须大于最小值");lo-=1;hi+=1;}
  const stops=a.customColors.trim()?a.customColors.split(/[,，]/).map(c=>c.trim()):(CMAPS[o.cmap]??["#008000","#000000","#ff0000"]);
  if(stops.length<2||stops.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw new Error("渐变颜色至少需要两个 #RRGGBB 色号，英文逗号分隔");
  const mid=a.midpoint===""?(lo+hi)/2:Number(a.midpoint);
  if(a.midpoint!==""&&(!Number.isFinite(mid)||mid<=lo||mid>=hi))throw new Error("色标中点必须在最小值与最大值之间");
  const color=(x:number)=>cmapColor(stops,Math.max(0,Math.min(1,x<=mid?0.5*(x-lo)/(mid-lo||1):0.5+0.5*(x-mid)/(hi-mid||1))));
  let s=`<text x="${w/2}" y="35" text-anchor="middle" font-size="${t.titleFont}" fill="${t.text}">${esc(o.title||"Heatmap")}</text>`;
  const groupMap=new Map(a.groups.split(/\r?\n/).map(line=>line.trim().split(/[\t,，]+/)).filter(x=>x.length>=2).map(x=>[x[0],x[1]]));
  const groupNames=[...new Set([...groupMap.values()])], groupColors=a.groupColors.trim()?a.groupColors.split(/[,，]/).map(x=>x.trim()):t.colors;
  if(a.groupColors.trim()&&(groupColors.length!==groupNames.length||groupColors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))) throw new Error("分组色号数量必须等于分组数量，使用 #RRGGBB");
  if(a.groups.trim()&&m.cols.some(c=>!groupMap.has(c)))throw new Error("分组注释必须包含所有选中的列名（每行：样本名,分组名）");
  for(let i=0;i<nr;i++)for(let j=0;j<nc;j++) {
    const x=gx+j*cw,y=gy+i*ch,value=v[ri[i]][ci[j]],col=variant==="binary"?(value>0?stops[stops.length-1]:stops[0]):color(value);
    const title=`<title>${esc(m.rows[ri[i]])} / ${esc(m.cols[ci[j]])}: ${value.toFixed(a.decimals)}</title>`;
    const stroke=`stroke="${esc(a.borderColor)}" stroke-width="${a.borderWidth}"`;
    if(variant==="dot"||variant==="bubble"||a.cellShape==="circle")s+=`<circle cx="${x+cw/2}" cy="${y+ch/2}" r="${Math.min(cw,ch)*0.47*(variant==="bubble"?Math.sqrt(Math.abs(value)/(Math.max(...flat.map(Math.abs))||1)):1)}" fill="${col}" ${stroke}>${title}</circle>`;
    else s+=`<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${col}" ${stroke}>${title}</rect>`;
    if(a.numbers){const number=value.toFixed(a.decimals),fs=Math.max(.1,Math.min(nfs,(cw-4)/textWidth(number,1),(ch-3)/1.2));s+=`<text x="${x+cw/2}" y="${y+ch/2}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="${parseInt(col.slice(1,3),16)*0.299+parseInt(col.slice(3,5),16)*0.587+parseInt(col.slice(5,7),16)*0.114>140?"#111111":"#ffffff"}">${number}</text>`;}
  }
  ri.forEach((idx,i)=>{if(!a.hideRows&&(!labelSet.size||labelSet.has(m.rows[idx])))s+=`<text x="${gx+gw+12}" y="${gy+(i+0.5)*ch}" dominant-baseline="middle" font-size="${rfs}" fill="${t.text}">${esc(m.rows[idx])}</text>`;});
  ci.forEach((idx,j)=>{
    const x=gx+(j+0.5)*cw,y=gy-(groupMap.size?30:10);
    if(!a.hideCols)s+=`<text x="${x}" y="${y}" transform="rotate(${-a.rotation} ${x} ${y})" text-anchor="start" font-size="${cfs}" fill="${t.text}">${esc(m.cols[idx])}</text>`;
    if(groupMap.size)s+=`<rect x="${gx+j*cw}" y="${gy-20}" width="${cw}" height="15" fill="${groupColors[groupNames.indexOf(groupMap.get(m.cols[idx])!)%groupColors.length]}"/>`;
  });
  const tree=(root:ClusterNode,order:number[],horizontal:boolean)=>{
    const scale=root.height||1;
    const draw=(n:ClusterNode):{x:number;y:number}=>{
      const pos=n.ids.reduce((sum,id)=>sum+order.indexOf(id)+0.5,0)/n.ids.length;
      const p=horizontal?{x:gx+pos*cw,y:gy-colLabelH-30-n.height/scale*th}:{x:gx-n.height/scale*tw,y:gy+pos*ch};
      if(n.left&&n.right){const l=draw(n.left),r=draw(n.right);s+=`<path d="${horizontal?`M ${l.x} ${l.y} V ${p.y} H ${r.x} V ${r.y}`:`M ${l.x} ${l.y} H ${p.x} V ${r.y} H ${r.x}`}" fill="none" stroke="${t.axis}" stroke-width="1.5"/>`;}
      return p;
    };draw(root);
  };
  if(rowTree)tree(rt!,ri,false);if(colTree)tree(ct!,ci,true);
  const bx=w-100;
  for(let k=0;k<80;k++)s+=`<rect x="${bx}" y="${gy+k*2}" width="20" height="2.2" fill="${color(hi-(hi-lo)*k/79)}"/>`;
  [hi,mid,lo].forEach((v,i)=>{s+=`<text x="${bx+25}" y="${gy+i*80+6}" fill="${t.text}" font-size="${t.legendFont}">${v.toFixed(a.decimals)}</text>`;});
  if(groupMap.size)s+=legend(groupNames.map((name,i)=>({name,color:groupColors[i%groupColors.length]})),gx,gy+gh+45,t);
  s+=`<text x="${gx}" y="${h-15}" font-size="${t.tickFont*0.8}" fill="${t.text}">Z-score: ${a.normalize}; clustering: ${a.distance} / ${a.linkage}</text>`;
  return {inner:s,w,h};
}
