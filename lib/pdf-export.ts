import {downloadBlob,svgToPngBlob} from "./chartcore";
import {sanitizeSvg} from "./svg-safety";

/** 600 dpi raster PDF preserves the browser's font rendering, including Chinese. */
export async function exportSvgPdf(name:string,svg:string,widthCm:number,heightCm:number):Promise<void> {
  if(!Number.isFinite(widthCm)||!Number.isFinite(heightCm)||widthCm<=0||heightCm<=0)throw new Error("PDF 尺寸无效");
  const widthPt=widthCm/2.54*72,heightPt=heightCm/2.54*72;
  if(Math.max(widthPt,heightPt)>14400)throw new Error("PDF 页面过大，请减少面板或缩小出版尺寸");
  const {PDFDocument}=await import("pdf-lib");
  const png=await svgToPngBlob(sanitizeSvg(svg),widthCm,heightCm,600);
  const pdf=await PDFDocument.create(),image=await pdf.embedPng(await png.arrayBuffer());
  pdf.addPage([widthPt,heightPt]).drawImage(image,{x:0,y:0,width:widthPt,height:heightPt});
  pdf.setTitle(name.replace(/\.pdf$/i,""));pdf.setCreator("科研数图工作台");
  const bytes=await pdf.save();downloadBlob(name,new Blob([bytes as unknown as BlobPart],{type:"application/pdf"}));
}
