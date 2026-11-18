import DOMPurify from "dompurify";

const tags=["svg","g","defs","path","rect","circle","ellipse","line","polyline","polygon","text","tspan","title","desc","clipPath","mask","linearGradient","radialGradient","stop","pattern","marker","image","use","symbol"];
const attrs=["id","xmlns","viewBox","x","y","x1","y1","x2","y2","cx","cy","r","rx","ry","width","height","d","points","transform","fill","fill-opacity","fill-rule","stroke","stroke-width","stroke-opacity","stroke-linecap","stroke-linejoin","stroke-dasharray","stroke-dashoffset","opacity","font-family","font-size","font-weight","font-style","text-anchor","dominant-baseline","alignment-baseline","textLength","lengthAdjust","dx","dy","rotate","clip-path","clip-rule","mask","href","xlink:href","preserveAspectRatio","gradientUnits","gradientTransform","offset","stop-color","stop-opacity","patternUnits","patternTransform","markerWidth","markerHeight","markerUnits","refX","refY","orient","marker-start","marker-mid","marker-end","style","color"];
const styleProps=new Set(["fill","fill-opacity","fill-rule","stroke","stroke-width","stroke-opacity","stroke-linecap","stroke-linejoin","stroke-dasharray","opacity","font-family","font-size","font-weight","font-style","text-anchor","dominant-baseline","color"]);
const fragment=/^#[A-Za-z_][\w:.-]*$/;
export const isRasterDataUrl=(value:string)=>/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(value);

export function sanitizeSvg(input:string):string {
  if(input.length>8*1024*1024)throw new Error("SVG 超过 8 MB，请简化后导入");
  if(/<!DOCTYPE|<!ENTITY/i.test(input))throw new Error("不支持包含 DTD / 实体声明的 SVG");
  const source=new DOMParser().parseFromString(input,"image/svg+xml");
  if(source.querySelector("parsererror")||source.documentElement.localName!=="svg")throw new Error("不是有效的 SVG 文件");
  const clean=DOMPurify.sanitize(input,{ALLOWED_TAGS:tags,ALLOWED_ATTR:attrs,ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,KEEP_CONTENT:false,PARSER_MEDIA_TYPE:"image/svg+xml"});
  const doc=new DOMParser().parseFromString(clean,"image/svg+xml");
  if(doc.querySelector("parsererror")||doc.documentElement.localName!=="svg")throw new Error("SVG 清理后无法解析");
  for(const el of Array.from(doc.querySelectorAll("*"))) {
    for(const attr of Array.from(el.attributes)) {
      const name=attr.localName.toLowerCase(),value=attr.value.trim();
      if(name.startsWith("on")){el.removeAttributeNode(attr);continue;}
      if(name==="href") {
        if(!fragment.test(value)&&!(el.localName==="image"&&isRasterDataUrl(value)))el.removeAttributeNode(attr);
      } else if(name==="style") {
        const safe:string[]=[];
        for(const declaration of value.split(";")) {
          const i=declaration.indexOf(":");if(i<0)continue;
          const key=declaration.slice(0,i).trim().toLowerCase(),v=declaration.slice(i+1).trim();
          if(styleProps.has(key)&&!/[\\@<>]|url\s*\(|expression\s*\(|var\s*\(/i.test(v))safe.push(`${key}:${v}`);
        }
        if(safe.length)el.setAttribute("style",safe.join(";"));else el.removeAttribute("style");
      } else if(/url\s*\(/i.test(value)) {
        if(!/^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/.test(value))el.removeAttributeNode(attr);
      } else if(/[\\@]|javascript:|https?:|\/\//i.test(value)&&name!=="xmlns")el.removeAttributeNode(attr);
    }
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

export function svgPanel(svg:string):{svg:string;inner:string;w:number;h:number;viewBox:string} {
  const cleaned=sanitizeSvg(svg),root=new DOMParser().parseFromString(cleaned,"image/svg+xml").documentElement;
  const raw=root.getAttribute("viewBox");
  let box=raw?.trim().split(/[\s,]+/).map(Number);
  if(!box){const length=(s:string|null)=>{const m=s?.match(/^([\d.]+)\s*(px|pt|mm|cm|in)?$/);if(!m)return NaN;return Number(m[1])*({px:1,pt:96/72,mm:96/25.4,cm:96/2.54,in:96}[m[2]||"px"]??1);};box=[0,0,length(root.getAttribute("width")),length(root.getAttribute("height"))];}
  if(box.length!==4||box.some(x=>!Number.isFinite(x))||box[2]<=0||box[3]<=0||box[2]>100000||box[3]>100000)throw new Error("SVG 需要有效的 viewBox 或宽高，尺寸必须大于 0");
  // Preserve the original viewport origin and root presentation attributes.
  root.setAttribute("viewBox",box.join(" "));
  return {svg:new XMLSerializer().serializeToString(root),inner:root.innerHTML,w:box[2],h:box[3],viewBox:box.join(" ")};
}
