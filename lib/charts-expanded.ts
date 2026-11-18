import { Matrix, EigenvalueDecomposition } from "ml-matrix";
import type { ChartSpec } from "./chartregistry";
import type { MatrixModel, LabelSeriesModel, XYModel, FlowModel, SingleModel, PairModel, PlotOpts, Rendered } from "./chartmodel";
import { esc, frame, cmapColor, CMAPS, legend, type Theme } from "./chartcore";
import { mean, sd, pearson, fmt } from "./stats";
import { normalizeMatrix, transpose, hierarchy, type ClusterNode } from "./cluster";
import { heatmap } from "./heatmap";
import { ellipseScatter } from "./charts-scatter2";
import type { RawTable } from "./data";

const sampleMatrix=():RawTable=>({sourceName:"合成表达矩阵",headers:["Gene","A1","A2","A3","B1","B2","B3"],rows:Array.from({length:18},(_,i)=>[`Gene${i+1}`,...Array.from({length:6},(_,j)=>(10+Math.sin(i*1.3+j*.7)*3+(j<3?i*.6:-i*.2)).toFixed(3))])});
const sampleComposition=():RawTable=>({sourceName:"合成构成数据",headers:["Category","A","B","C","D"],rows:[["S1","24","18","35","23"],["S2","12","32","26","30"],["S3","30","20","40","10"],["S4","21","29","19","31"]]});
const matrixSummary=(m:MatrixModel)=>({facts:[`输入矩阵 ${m.rows.length} 行 × ${m.cols.length} 列；输入值范围 ${fmt(Math.min(...m.v.flat()))}–${fmt(Math.max(...m.v.flat()))}。`],inference:["图形表示当前数据结构，聚类或降维分离本身不构成差异显著或因果证据。"],en:`Matrix visualization of ${m.rows.length} features and ${m.cols.length} samples.`});

export function ordination(m:MatrixModel,o:PlotOpts,method:"pca"|"pcoa") {
  const x=transpose(o.standardize?normalizeMatrix(m.v,"row"):m.v),n=x.length;
  if(n<3)throw new Error("降维至少需要 3 个样本列");
  if(n>300)throw new Error("浏览器降维最多支持 300 个样本列");
  let gram:number[][];
  if(method==="pca") {
    const means=transpose(x).map(mean);const c=x.map(r=>r.map((v,j)=>v-means[j]));
    gram=c.map(a=>c.map(b=>a.reduce((s,v,k)=>s+v*b[k],0)));
  } else {
    const d=x.map(a=>x.map(b=>o.distance==="bray"?(()=>{const den=a.reduce((s,v,k)=>s+Math.abs(v)+Math.abs(b[k]),0);return den?a.reduce((s,v,k)=>s+Math.abs(v-b[k]),0)/den:0;})():Math.sqrt(a.reduce((s,v,k)=>s+(v-b[k])**2,0))));
    const sq=d.map(r=>r.map(v=>v*v)),rm=sq.map(mean),gm=mean(sq.flat());
    gram=sq.map((r,i)=>r.map((v,j)=>-.5*(v-rm[i]-rm[j]+gm)));
  }
  const eig=new EigenvalueDecomposition(new Matrix(gram),{assumeSymmetric:true});
  const values=eig.realEigenvalues, order=values.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v), total=values.reduce((s,v)=>s+Math.max(0,v),0);
  const dims=[o.pcX-1,o.pcY-1];if(dims.some(i=>i<0||i>=n)||o.pcX===o.pcY)throw new Error(`主轴需不同且在 1–${n} 之间`);
  const scores=dims.map(d=>x.map((_,i)=>eig.eigenvectorMatrix.get(i,order[d].i)*Math.sqrt(Math.max(0,order[d].v))));
  const prefix=method==="pca"?"PC":"PCo",names=dims.map(d=>`${prefix}${d+1} (${(Math.max(0,order[d].v)/(total||1)*100).toFixed(1)}%)`);
  const annotations=new Map(o.heat.groups.split(/\r?\n/).map(l=>l.trim().split(/[\t,，]+/)).filter(r=>r.length>=2).map(r=>[r[0],r[1]]));
  const groups=[...new Set(m.cols.map(c=>annotations.get(c)??"Samples"))];
  const xy:XYModel={kind:"xy",xName:names[0],yName:names[1],groups,pts:m.cols.map((c,i)=>({x:scores[0][i],y:scores[1][i],label:c,g:groups.indexOf(annotations.get(c)??"Samples")}))};
  return {xy,negative:values.filter(v=>v< -1e-8).length};
}
function pcaPlot(m:MatrixModel,t:Theme,o:PlotOpts,method:"pca"|"pcoa"):Rendered {
  const {xy}=ordination(m,o,method);return ellipseScatter(xy,t,o);
}

function enrichBubble(m:XYModel,t:Theme,o:PlotOpts,circle=false):Rendered {
  const pts=[...m.pts].filter(p=>p.y>0&&p.y<=o.pCut).sort((a,b)=>a.y-b.y).slice(0,o.topN);
  if(!pts.length)throw new Error("当前 P/Q 阈值下无条目；请调整阈值");
  const maxSize=Math.max(...pts.map(p=>p.s??1),1),scores=pts.map(p=>-Math.log10(p.y)),lo=Math.min(...scores),hi=Math.max(...scores),stops=CMAPS[o.cmap];
  if(!stops)throw new Error("请选择有效渐变配色");
  const f=frame({w:1000,h:Math.max(700,pts.length*32+150),ml:300,mr:110,mt:65,mb:85,xlo:0,xhi:Math.max(...pts.map(p=>p.x),.01)*1.15,ylo:0,yhi:pts.length,yticks:[],theme:t,xlabel:o.xLabel||"Rich factor",ylabel:"",title:o.title});let s=f.svg;
  pts.forEach((p,i)=>{const y=f.Y(pts.length-i-.5),col=cmapColor(stops,(scores[i]-lo)/(hi-lo||1));s+=`<text x="${f.px-12}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="${t.text}" font-size="${t.tickFont}">${esc(p.label??`Term ${i+1}`)}</text>`;
    if(circle)s+=`<line x1="${f.X(0)}" y1="${y}" x2="${f.X(p.x)}" y2="${y}" stroke="${col}" stroke-width="${o.edgeWidth}"/>`;
    s+=`<circle cx="${f.X(p.x)}" cy="${y}" r="${4+18*Math.sqrt((p.s??1)/maxSize)}" fill="${col}" opacity="${o.opacity}"><title>${esc(p.label??'Term')}: factor=${p.x}, p=${p.y}, count=${p.s??1}</title></circle>`;
  });
  s+=`<text x="${f.px}" y="35" fill="${t.text}" font-size="${t.tickFont*.8}">Color: −log10(P/Q); size: Count; selected ${pts.length} terms</text>`;
  return {inner:s,w:1000,h:Math.max(700,pts.length*32+150)};
}
function kmeans(m:MatrixModel,t:Theme,o:PlotOpts):Rendered {
  const x=transpose(o.standardize?normalizeMatrix(m.v,"row"):m.v),k=Math.min(o.clusterK,x.length);
  let centers=Array.from({length:k},(_,i)=>[...x[Math.floor(i*x.length/k)]]),assign=x.map(()=>0);
  for(let it=0;it<100;it++){const next=x.map(row=>centers.map(c=>row.reduce((s,v,j)=>s+(v-c[j])**2,0)).reduce((best,v,i,a)=>v<a[best]?i:best,0));if(it>0&&next.every((v,i)=>v===assign[i]))break;assign=next;centers=centers.map((old,g)=>{const rows=x.filter((_,i)=>assign[i]===g);return rows.length?old.map((_,j)=>mean(rows.map(r=>r[j]))):old;});}
  const {xy}=ordination(m,o,"pca");xy.groups=Array.from({length:k},(_,i)=>`Cluster ${i+1}`);xy.pts.forEach((p,i)=>p.g=assign[i]);
  return ellipseScatter(xy,t,o);
}
function dendrogram(m:MatrixModel,t:Theme,o:PlotOpts):Rendered {
  const x=transpose(o.standardize?normalizeMatrix(m.v,"row"):m.v),root=hierarchy(x,o.heat.distance,o.heat.linkage),order=root.ids;
  let s="";const draw=(n:ClusterNode):{x:number;y:number}=>{const p={x:100+n.ids.reduce((sum,id)=>sum+order.indexOf(id)+.5,0)/n.ids.length*800/order.length,y:590-n.height/(root.height||1)*480};if(n.left&&n.right){const l=draw(n.left),r=draw(n.right);s+=`<path d="M ${l.x} ${l.y} V ${p.y} H ${r.x} V ${r.y}" fill="none" stroke="${t.axis}" stroke-width="2"/>`;}return p;};draw(root);
  order.forEach((id,i)=>s+=`<text x="${100+(i+.5)*800/order.length}" y="620" fill="${t.text}" text-anchor="middle" font-size="${t.tickFont}">${esc(m.cols[id])}</text>`);
  s+=`<text x="500" y="40" text-anchor="middle" font-size="${t.titleFont}" fill="${t.text}">${esc(o.title||"Hierarchical clustering")}</text>`;
  return {inner:s,w:1000,h:700};
}
function pie(m:LabelSeriesModel,t:Theme,o:PlotOpts,donut:boolean):Rendered{
  const values=m.values.map(r=>r.reduce((s,v)=>s+v,0));if(values.some(v=>v<0)||!values.some(v=>v>0))throw new Error("饼图需要非负数且合计大于 0");
  const total=values.reduce((a,b)=>a+b,0),cx=480,cy=340,r=230,inner=donut?r*o.donutHole:0;let angle=o.startAngle*Math.PI/180,s="";
  values.forEach((v,i)=>{const span=v/total*Math.PI*2,end=angle+Math.min(span,Math.PI*2-1e-7),p=(radius:number,a:number)=>`${cx+radius*Math.cos(a)} ${cy+radius*Math.sin(a)}`;
    s+=`<path d="M ${p(r,angle)} A ${r} ${r} 0 ${span>Math.PI?1:0} 1 ${p(r,end)} ${inner?`L ${p(inner,end)} A ${inner} ${inner} 0 ${span>Math.PI?1:0} 0 ${p(inner,angle)}`:`L ${cx} ${cy}`} Z" fill="${t.colors[i%t.colors.length]}" stroke="${t.bg}" stroke-width="2"><title>${esc(m.labels[i])}: ${v} (${(v/total*100).toFixed(2)}%)</title></path>`;
    if(o.showLabels&&v>0){const a=angle+span/2;s+=`<text x="${cx+(r+32)*Math.cos(a)}" y="${cy+(r+32)*Math.sin(a)}" fill="${t.text}" text-anchor="middle" font-size="${t.tickFont}">${esc(m.labels[i])} ${(v/total*100).toFixed(1)}%</text>`;} angle+=span;});
  if(o.showLegend)s+=legend(m.labels.map((name,i)=>({name,color:t.colors[i%t.colors.length]})),65,650,t);
  return {inner:s,w:1000,h:720};
}
function circular(m:MatrixModel,t:Theme,o:PlotOpts):Rendered {
  const v=normalizeMatrix(m.v,o.heat.normalize),flat=v.flat(),lo=Math.min(...flat),hi=Math.max(...flat),stops=o.heat.customColors?o.heat.customColors.split(/[,，]/).map(c=>c.trim()):CMAPS[o.cmap];
  if(!stops||stops.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw new Error("色标必须为 #RRGGBB 色号");
  const n=m.rows.length,cx=470,cy=360,r0=80,dr=200/m.cols.length;let s="";
  m.rows.forEach((name,i)=>{const a=o.startAngle*Math.PI/180+i/n*Math.PI*2,b=a+Math.PI*2/n*.94;const p=(r:number,a:number)=>`${cx+r*Math.cos(a)} ${cy+r*Math.sin(a)}`;
    m.cols.forEach((_,j)=>{const r=r0+j*dr,R=r+dr*.95;s+=`<path d="M ${p(R,a)} A ${R} ${R} 0 ${b-a>Math.PI?1:0} 1 ${p(R,b)} L ${p(r,b)} A ${r} ${r} 0 ${b-a>Math.PI?1:0} 0 ${p(r,a)} Z" fill="${cmapColor(stops,(v[i][j]-lo)/(hi-lo||1))}" stroke="${o.heat.borderColor}" stroke-width="${o.heat.borderWidth}"><title>${esc(name)} / ${esc(m.cols[j])}: ${v[i][j]}</title></path>`;});
    if(o.showLabels){const a2=(a+b)/2;s+=`<text x="${cx+305*Math.cos(a2)}" y="${cy+305*Math.sin(a2)}" text-anchor="middle" fill="${t.text}" font-size="${t.tickFont*.7}">${esc(name)}</text>`;}});
  return {inner:s,w:1000,h:740};
}
function network(m:FlowModel,t:Theme,o:PlotOpts,directed:boolean):Rendered{
  const pts=m.nodes.map((_,i)=>({x:480+260*Math.cos(i/m.nodes.length*2*Math.PI+o.startAngle*Math.PI/180),y:350+260*Math.sin(i/m.nodes.length*2*Math.PI+o.startAngle*Math.PI/180)}));
  const max=Math.max(...m.links.map(l=>l.v));let s='<defs><marker id="network-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>';
  m.links.forEach(l=>{const a=pts[l.s],b=pts[l.t],d=Math.hypot(a.x-b.x,a.y-b.y)||1,r=o.nodeRadius+3; s+=`<line x1="${a.x+(b.x-a.x)/d*r}" y1="${a.y+(b.y-a.y)/d*r}" x2="${b.x-(b.x-a.x)/d*r}" y2="${b.y-(b.y-a.y)/d*r}" stroke="${t.axis}" color="${t.axis}" stroke-width="${o.edgeWidth*(.2+l.v/(max||1))}" opacity="${o.opacity}" ${directed?'marker-end="url(#network-arrow)"':""}><title>${esc(m.nodes[l.s])} → ${esc(m.nodes[l.t])}: ${l.v}</title></line>`;});
  pts.forEach((p,i)=>{s+=`<circle cx="${p.x}" cy="${p.y}" r="${o.nodeRadius}" fill="${t.colors[i%t.colors.length]}"/>`;if(o.showLabels)s+=`<text x="${p.x}" y="${p.y-o.nodeRadius-8}" text-anchor="middle" font-size="${t.tickFont}" fill="${t.text}">${esc(m.nodes[i])}</text>`;});return {inner:s,w:1000,h:720};
}
function area(m:LabelSeriesModel,t:Theme,o:PlotOpts):Rendered {
  if(m.values.some(r=>r.some(v=>v<0)))throw new Error("堆叠面积图要求非负数值");
  const vals=m.values.map(r=>{const sum=r.reduce((a,b)=>a+b,0);return r.map(v=>o.percent?v/(sum||1)*100:v);}),totals=vals.map(r=>r.reduce((a,b)=>a+b,0));
  const f=frame({w:1000,h:700,ml:100,mr:40,mt:65,mb:85,xlo:0,xhi:Math.max(1,m.labels.length-1),ylo:0,yhi:Math.max(...totals,1),xcat:m.labels.map((label,i)=>({label,at:i})),theme:t,title:o.title,ylabel:o.yLabel});let s=f.svg;
  m.series.forEach((_,j)=>{const upper=vals.map(r=>r.slice(0,j+1).reduce((a,b)=>a+b,0)),lower=vals.map(r=>r.slice(0,j).reduce((a,b)=>a+b,0));s+=`<path d="${upper.map((v,i)=>`${i?'L':'M'} ${f.X(i)} ${f.Y(v)}`).join(' ')} ${lower.map((v,i)=>({v,i})).reverse().map(({v,i})=>`L ${f.X(i)} ${f.Y(v)}`).join(' ')} Z" fill="${t.colors[j%t.colors.length]}" opacity="${o.opacity}"/>`;});if(o.showLegend)s+=legend(m.series.map((name,i)=>({name,color:t.colors[i%t.colors.length]})),110,38,t);return {inner:s,w:1000,h:700};
}
function density(m:SingleModel,t:Theme,o:PlotOpts):Rendered{
  const lo=Math.min(...m.values),hi=Math.max(...m.values),span=hi-lo||1,bw=Math.max(1e-8,1.06*(sd(m.values)||span)*m.values.length**-.2),xs=Array.from({length:Math.max(20,o.bins*5)},(_,i)=>lo-span*.2+span*1.4*i/(Math.max(20,o.bins*5)-1)),ys=xs.map(x=>m.values.reduce((s,v)=>s+Math.exp(-.5*((x-v)/bw)**2),0)/(m.values.length*bw*Math.sqrt(2*Math.PI)));
  const f=frame({w:1000,h:700,ml:100,mr:40,mt:65,mb:85,xlo:xs[0],xhi:xs[xs.length-1],ylo:0,yhi:Math.max(...ys)*1.1,theme:t,xlabel:o.xLabel||m.valueName,ylabel:o.yLabel||"Density",title:o.title});return {inner:f.svg+`<path d="M ${f.X(xs[0])} ${f.Y(0)} ${xs.map((x,i)=>`L ${f.X(x)} ${f.Y(ys[i])}`).join(' ')} L ${f.X(xs[xs.length-1])} ${f.Y(0)} Z" fill="${t.colors[0]}" fill-opacity="${o.opacity}" stroke="${t.colors[0]}" stroke-width="2"/>`,w:1000,h:700};
}
function seqLogo(m:LabelSeriesModel,t:Theme,o:PlotOpts):Rendered{
  const alphabet=m.series.length, max=o.percent?1:Math.log2(alphabet);if(alphabet<2)throw new Error("序列 LOGO 至少需要两种字符列");
  const f=frame({w:1000,h:700,ml:100,mr:40,mt:60,mb:85,xlo:0,xhi:m.labels.length,ylo:0,yhi:max,theme:t,ylabel:o.percent?"Probability":"Information (bits)",title:o.title});let s=f.svg;const cw=f.pw/m.labels.length;
  m.values.forEach((row,i)=>{if(row.some(v=>v<0))throw new Error("频数不能为负");const sum=row.reduce((a,b)=>a+b,0);const ps=row.map(v=>v/(sum||1)),info=o.percent?1:Math.max(0,max+ps.reduce((a,p)=>a+(p?p*Math.log2(p):0),0));let y=0;ps.map((p,j)=>({p,j})).sort((a,b)=>a.p-b.p).forEach(({p,j})=>{const height=p*info,px=height/max*f.ph;if(px>.1)s+=`<text x="${f.X(i+.5)}" y="${f.Y(y)}" text-anchor="middle" textLength="${cw*.85}" lengthAdjust="spacingAndGlyphs" font-size="${px/0.72}" font-family="Arial" font-weight="bold" fill="${t.colors[j%t.colors.length]}">${esc(m.series[j])}</text>`;y+=height;});});return {inner:s,w:1000,h:700};
}
export function sequenceTable(text:string,mode:"logo"|"length"):RawTable {
  const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const sequences:{name:string;seq:string}[]=[];
  if(lines.some(x=>x.startsWith('>'))){for(const line of lines){if(line.startsWith('>'))sequences.push({name:line.slice(1),seq:""});else {if(!sequences.length)throw new Error("FASTA 必须先有 >名称");sequences[sequences.length-1].seq+=line.replace(/\s/g,"");}}}else lines.forEach((seq,i)=>sequences.push({name:`Seq${i+1}`,seq}));
  if(!sequences.length||sequences.some(r=>!r.seq))throw new Error("没有可用序列");
  if(mode==="length")return {sourceName:"序列长度",headers:["Length"],rows:sequences.map(r=>[String(r.seq.replace(/[-.]/g,"").length)])};
  const n=sequences[0].seq.length;if(sequences.some(r=>r.seq.length!==n))throw new Error("LOGO 要求已对齐且等长的序列；请先完成多序列比对");
  const chars=[...new Set(sequences.flatMap(r=>r.seq.toUpperCase().split('')))].filter(c=>c!=="-"&&c!==".").sort();
  if(chars.some(c=>!/[A-Z]/.test(c)))throw new Error("序列中存在非字母字符");
  return {sourceName:"对齐序列频数矩阵",headers:["Position",...chars],rows:Array.from({length:n},(_,i)=>[String(i+1),...chars.map(c=>String(sequences.filter(r=>r.seq[i].toUpperCase()===c).length))])};
}
const commonSummary=()=>({facts:["图形基于导入数据计算；悬停图元可查看原始数值。"],inference:["图中趋势需结合数据来源、样本量和适用统计检验解释。"],en:"Visualization of the supplied data."});
export const EXPANDED_CHARTS:ChartSpec[]=[
  ...([['enrich-bubble','富集气泡图（GO / KEGG 结果）',false],['enrich-lollipop','富集点棒图（P/Q 色标）',true]] as const).map(([id,name,circle]):ChartSpec=>({id,name,family:"功能分析",shape:"xy",docRef:"X=RichFactor，Y=P/Q，Size=Count，标签=Term；输入已有富集结果",opts:["pCut","topN","cmap","opacity","edgeWidth"],sample:()=>({sourceName:"合成富集结果",headers:["RichFactor","Pvalue","Database","Count","Term"],rows:Array.from({length:12},(_,i)=>[(.03+i*.02).toFixed(3),(0.0001*(i+1)**2).toFixed(6),"GO",String(i+5),`Pathway ${i+1}`])}),render:(m,_,t,o)=>enrichBubble(m as XYModel,t,o,circle),conclude:commonSummary})),
  {id:"kmeans",name:"K-means 聚类（PCA 投影）",family:"聚类分析",shape:"matrix",docRef:"确定性初始化；原始特征空间 Lloyd 迭代，PCA 仅用于展示",opts:["clusterK","standardize","pcX","pcY","band","showLegend"],sample:sampleMatrix,render:(m,_,t,o)=>kmeans(m as MatrixModel,t,o),conclude:commonSummary},
  {id:"ma-plot",name:"MA 差异表达图",family:"差异检验",shape:"pair",docRef:"A/B 列为非负表达量；伪计数 1，M=log2((B+1)/(A+1))",opts:["fcCut","opacity","showLabels"],sample:()=>({sourceName:"合成表达量",headers:["Gene","Control","Treatment"],rows:Array.from({length:24},(_,i)=>[`Gene${i+1}`,String(10+i*8),String(8+i*9+(i%4===0?70:0))])}),render:(m,_,t,o)=>{const a=m as PairModel;if([...a.a,...a.b].some(v=>v<0))throw new Error("MA 输入表达量不能为负");const xy:XYModel={kind:"xy",groups:["Features"],xName:"A: mean log2 expression",yName:"M: log2 fold change",pts:a.labels.map((label,i)=>({label,g:0,x:(Math.log2(a.a[i]+1)+Math.log2(a.b[i]+1))/2,y:Math.log2((a.b[i]+1)/(a.a[i]+1))}))};const xs=xy.pts.map(p=>p.x),ys=xy.pts.map(p=>p.y);const f=frame({w:1000,h:700,ml:110,mr:40,mt:65,mb:85,xlo:Math.min(...xs)-.5,xhi:Math.max(...xs)+.5,ylo:Math.min(...ys,-o.fcCut)-.3,yhi:Math.max(...ys,o.fcCut)+.3,theme:t,xlabel:xy.xName,ylabel:xy.yName,title:o.title});return {inner:f.svg+xy.pts.map(p=>`<circle cx="${f.X(p.x)}" cy="${f.Y(p.y)}" r="5" fill="${t.colors[Math.abs(p.y)>=o.fcCut?0:1]}" opacity="${o.opacity}"><title>${esc(p.label!)}: ${p.y}</title></circle>`).join('')+[-o.fcCut,0,o.fcCut].map(y=>`<line x1="${f.px}" x2="${f.px+f.pw}" y1="${f.Y(y)}" y2="${f.Y(y)}" stroke="${t.axis}" stroke-dasharray="5 5"/>`).join(''),w:1000,h:700};},conclude:commonSummary},
  ...([['binary-heatmap','二值热图','binary'],['dot-heatmap','点棒热图','dot'],['bubble-heatmap','气泡组合热图','bubble']] as const).map(([id,name,v]):ChartSpec=>({id,name,family:"热图工具",shape:"matrix",docRef:"参考 OmicShare · 独立实现",opts:["cmap"],sample:sampleMatrix,render:(m,_,t,o)=>heatmap(m as MatrixModel,t,o,v),conclude:m=>matrixSummary(m as MatrixModel)})),
  {id:"circular-heatmap",name:"环状热图 / Circos 热图",family:"热图工具",shape:"matrix",docRef:"参考 OmicShare",opts:["cmap","startAngle","showLabels"],sample:sampleMatrix,render:(m,_,t,o)=>circular(m as MatrixModel,t,o),conclude:m=>matrixSummary(m as MatrixModel)},
  ...([['pca','PCA 主成分分析','pca'],['pcoa','PCoA 主坐标分析','pcoa']] as const).map(([id,name,method]):ChartSpec=>({id,name,family:"聚类分析",shape:"matrix",docRef:"样本为列，特征为行；真实特征分解",opts:["pcX","pcY","standardize","distance","band","showLabels","showLegend"],sample:sampleMatrix,render:(m,_,t,o)=>pcaPlot(m as MatrixModel,t,o,method),conclude:(m,_,o)=>{const r=ordination(m as MatrixModel,o,method);return {facts:[`分析 ${(m as MatrixModel).cols.length} 个样本；${r.xy.xName}，${r.xy.yName}。`,...(r.negative?[`存在 ${r.negative} 个负特征值，正轴不能完整表示原距离。`]:[])],inference:["坐标来自特征分解；图形分离不等于组间显著。"],en:`${method.toUpperCase()} ordination; ${r.xy.xName} and ${r.xy.yName}.`};}})),
  {id:"hca",name:"HCA 层次聚类树",family:"聚类分析",shape:"matrix",docRef:"样本为列；真实距离/连接聚类",opts:["standardize"],sample:sampleMatrix,render:(m,_,t,o)=>dendrogram(m as MatrixModel,t,o),conclude:m=>matrixSummary(m as MatrixModel)},
  {id:"sample-correlation",name:"组内样本相关性热图",family:"差异检验",shape:"matrix",docRef:"由原始表达矩阵计算 Pearson 相关",opts:["cmap"],sample:sampleMatrix,render:(m,_,t,o)=>{const a=m as MatrixModel,x=transpose(a.v);const v=x.map(p=>x.map(q=>pearson(p,q).r));if(v.flat().some(x=>!Number.isFinite(x)))throw new Error("存在常量样本列，无法计算相关性");return heatmap({kind:"matrix",rows:a.cols,cols:a.cols,v},t,o);},conclude:commonSummary},
  ...([['pie','饼图',false],['donut','环形饼图',true]] as const).map(([id,name,donut]):ChartSpec=>({id,name,family:"基础绘图",shape:"labelseries",docRef:"非负构成数据",opts:["donutHole","startAngle","showLabels","showLegend"],sample:sampleComposition,render:(m,_,t,o)=>pie(m as LabelSeriesModel,t,o,donut),conclude:commonSummary})),
  {id:"stacked-area",name:"堆叠 / 百分比面积图",family:"基础绘图",shape:"labelseries",docRef:"宽表类别与系列",opts:["percent","opacity","showLegend"],sample:sampleComposition,render:(m,_,t,o)=>area(m as LabelSeriesModel,t,o),conclude:commonSummary},
  {id:"density",name:"核密度分布图 KDE",family:"基础绘图",shape:"single",docRef:"Gaussian KDE / Silverman bandwidth",opts:["bins","opacity"],sample:()=>({sourceName:"合成数据",headers:["Value"],rows:Array.from({length:40},(_,i)=>[String(5+Math.sin(i)*2+i*.05)])}),render:(m,_,t,o)=>density(m as SingleModel,t,o),conclude:commonSummary},
  ...([['weighted-network','权重网络图',false],['directed-network','有向网络图',true]] as const).map(([id,name,directed]):ChartSpec=>({id,name,family:"动态交互",shape:"flow",docRef:"Source,Target,Value；圆形布局",opts:["nodeRadius","edgeWidth","opacity","startAngle","showLabels"],sample:()=>({sourceName:"示例网络",headers:["Source","Target","Value"],rows:[["A","B","6"],["B","C","3"],["A","C","2"],["C","D","5"],["D","A","4"]]}),render:(m,_,t,o)=>network(m as FlowModel,t,o,directed),conclude:commonSummary})),
  {id:"sequence-logo",name:"核酸 / 蛋白序列 LOGO",family:"序列处理",shape:"labelseries",docRef:"FASTA / 等长序列 / 位置频数矩阵",opts:["percent"],sample:()=>sequenceTable(">S1\nACGTACGT\n>S2\nACGTTCGT\n>S3\nACGAACGT\n>S4\nACGTACGA",'logo'),render:(m,_,t,o)=>seqLogo(m as LabelSeriesModel,t,o),conclude:commonSummary},
  {id:"sequence-length",name:"序列长度分布",family:"序列处理",shape:"single",docRef:"FASTA 或长度数值表；长度不计 gap",opts:["bins","opacity"],sample:()=>({sourceName:"合成长度",headers:["Length"],rows:Array.from({length:20},(_,i)=>[String(50+i*7)])}),render:(m,_,t,o)=>density(m as SingleModel,t,o),conclude:commonSummary},
];
