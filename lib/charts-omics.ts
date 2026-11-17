import { Theme, esc, frame, legend, textWidth } from "@/lib/chartcore";
import { VolcanoModel, EnrichModel, PlotOpts, Rendered } from "@/lib/chartmodel";
import { fmt } from "@/lib/stats";

const W = 1000, H = 700;
const FC_CUT = 1, P_CUT = 0.05;

export function volcanoClass(fc: number, p: number): "up" | "down" | "ns" {
  if (p < P_CUT && fc >= FC_CUT) return "up";
  if (p < P_CUT && fc <= -FC_CUT) return "down";
  return "ns";
}

function volcanoPanel(m: VolcanoModel, t: Theme, o: PlotOpts, ox: number, w: number): string {
  const ys = m.items.map((it) => -Math.log10(Math.max(it.p, 1e-300)));
  const xabs = Math.max(...m.items.map((it) => Math.abs(it.fc)), 2) * 1.1;
  const f = frame({ w, h: H, ml: 85, mr: 25, mt: 60, mb: 85, xlo: -xabs, xhi: xabs, ylo: 0, yhi: Math.max(...ys, 2) * 1.12, xlabel: o.xLabel || "log2(Fold Change)", ylabel: o.yLabel || "-log10(P)", title: ox === 0 ? o.title : "", theme: t });
  let s = `<g transform="translate(${ox},0)">${f.svg}`;
  const ycut = -Math.log10(P_CUT);
  s += `<line x1="${f.X(-xabs)}" y1="${f.Y(ycut)}" x2="${f.X(xabs)}" y2="${f.Y(ycut)}" stroke="${t.axis}" stroke-width="1.6" stroke-dasharray="6 5"/>`;
  s += `<line x1="${f.X(-FC_CUT)}" y1="${f.Y(0)}" x2="${f.X(-FC_CUT)}" y2="${f.Y(Math.max(...ys, 2) * 1.12)}" stroke="${t.axis}" stroke-width="1.6" stroke-dasharray="6 5"/>`;
  s += `<line x1="${f.X(FC_CUT)}" y1="${f.Y(0)}" x2="${f.X(FC_CUT)}" y2="${f.Y(Math.max(...ys, 2) * 1.12)}" stroke="${t.axis}" stroke-width="1.6" stroke-dasharray="6 5"/>`;
  const colOf = { up: t.colors[0], down: t.colors[1 % t.colors.length], ns: t.colors[7 % t.colors.length] };
  for (const it of m.items) {
    const cls = volcanoClass(it.fc, it.p);
    s += `<circle cx="${f.X(it.fc)}" cy="${f.Y(-Math.log10(Math.max(it.p, 1e-300)))}" r="${cls === "ns" ? 4.5 : 6}" fill="${colOf[cls]}" fill-opacity="${cls === "ns" ? 0.45 : 0.8}"/>`;
  }
  const top = [...m.items].filter((it) => volcanoClass(it.fc, it.p) !== "ns").sort((a, b) => a.p - b.p).slice(0, 6);
  const glFs = 17 * t.fontScale;
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  if (o.showLegend && ox === 0) placed.push({ x: 96, y: 20, w: 380, h: 30 });
  const ycutY = f.Y(ycut);
  const vxs = [f.X(-FC_CUT), f.X(FC_CUT)];
  const hitLine = (b: { x: number; y: number; w: number; h: number }) =>
    (b.y < ycutY + 1 && b.y + b.h > ycutY - 1) || vxs.some((vx) => b.x < vx + 1 && b.x + b.w > vx - 1);
  const hitPlaced = (b: { x: number; y: number; w: number; h: number }) =>
    placed.some((p) => b.x < p.x + p.w - 1 && p.x < b.x + b.w - 1 && b.y < p.y + p.h - 1 && p.y < b.y + b.h - 1);
  for (const it of top) {
    const x = f.X(it.fc), y0 = f.Y(-Math.log10(Math.max(it.p, 1e-300)));
    const tw = textWidth(it.label, glFs);
    let lx = x + (it.fc >= 0 ? 9 : -9);
    let anchor = it.fc >= 0 ? "start" : "end";
    if (anchor === "start" && lx + tw > w - 8) { lx = x - 9; anchor = "end"; }
    if (anchor === "end" && lx - tw < f.px + 4) { lx = x + 9; anchor = "start"; }
    let left = anchor === "start" ? lx : lx - tw;
    let ly = y0 - 6;
    let ok = false;
    for (let k = 0; k < 5; k++) {
      const box = { x: left, y: ly - glFs * 0.8, w: tw, h: glFs };
      if (!hitLine(box) && !hitPlaced(box)) { ok = true; break; }
      ly -= glFs * 1.25;
    }
    if (!ok) {
      const fAnchor = anchor === "start" ? "end" : "start";
      const fLx = fAnchor === "start" ? x + 9 : x - 9;
      const fLeft = fAnchor === "start" ? fLx : fLx - tw;
      if (fLeft >= f.px + 4 && fLeft + tw <= w - 8) {
        let fly = y0 - 6;
        for (let k = 0; k < 5; k++) {
          const box = { x: fLeft, y: fly - glFs * 0.8, w: tw, h: glFs };
          if (!hitLine(box) && !hitPlaced(box)) { lx = fLx; anchor = fAnchor; left = fLeft; ly = fly; ok = true; break; }
          fly -= glFs * 1.25;
        }
      }
    }
    if (!ok) continue;
    placed.push({ x: left, y: ly - glFs * 0.8, w: tw, h: glFs });
    s += `<text x="${lx}" y="${ly}" fill="${t.text}" font-size="${glFs.toFixed(1)}" text-anchor="${anchor}">${esc(it.label)}</text>`;
  }
  s += "</g>";
  return s;
}

export function volcanoPlot(m: VolcanoModel, t: Theme, o: PlotOpts): Rendered {
  let s = volcanoPanel(m, t, o, 0, W);
  const nUp = m.items.filter((i) => volcanoClass(i.fc, i.p) === "up").length;
  const nDn = m.items.filter((i) => volcanoClass(i.fc, i.p) === "down").length;
  if (o.showLegend) s += legend([{ name: `上调 (${nUp})`, color: t.colors[0], shape: "dot" }, { name: `下调 (${nDn})`, color: t.colors[1 % t.colors.length], shape: "dot" }, { name: "不显著", color: t.colors[7 % t.colors.length], shape: "dot" }], 100, 34, t);
  return { inner: s, w: W, h: H };
}

function enrichRows(m: EnrichModel, o: PlotOpts): { term: string; score: number; dir: string; genes: string; header?: string }[] {
  const up = m.terms.filter((x) => x.dir === "up").sort((a, b) => b.score - a.score);
  const dn = m.terms.filter((x) => x.dir === "down").sort((a, b) => b.score - a.score);
  const ot = m.terms.filter((x) => x.dir === "other").sort((a, b) => b.score - a.score);
  const rows: { term: string; score: number; dir: string; genes: string; header?: string }[] = [];
  const push = (list: typeof up, header: string) => {
    if (!list.length) return;
    if (o.gaps && rows.length) rows.push({ term: "", score: 0, dir: "", genes: "", header });
    else if (o.gaps) rows.push({ term: "", score: 0, dir: "", genes: "", header });
    rows.push(...list);
  };
  push(up, "Up-regulated");
  push(dn, "Down-regulated");
  push(ot, "Other");
  return rows;
}

function enrichPanel(m: EnrichModel, t: Theme, o: PlotOpts, ox: number, w: number, withTitle: boolean): string {
  const rows = enrichRows(m, o);
  const smax = Math.max(...m.terms.map((x) => x.score), 1e-9);
  const maxTermU = Math.max(...rows.map((r) => textWidth(r.term || r.header || "", 1)), 1);
  const ml = Math.min(w * 0.55, Math.max(150, maxTermU * 18 * t.fontScale + 24));
  const fsMin = t.tickFont * 0.75;
  const termFs = Math.max(fsMin, Math.min(18 * t.fontScale, (ml - 24) / maxTermU));
  const fitTerm = (str: string) => {
    const maxU = (ml - 24) / termFs;
    if (textWidth(str, 1) <= maxU) return str;
    let out = str;
    while (out.length > 1 && textWidth(out + "…", 1) > maxU) out = out.slice(0, -1);
    return out + "…";
  };
  const f = frame({ w, h: H, ml, mr: o.genes ? 150 : 40, mt: 60, mb: 70, xlo: 0, xhi: smax * 1.15, ylo: 0, yhi: rows.length, yticks: [], xlabel: o.xLabel || (w < 600 ? "Score" : "Enrichment score"), ylabel: "", title: withTitle ? o.title : "", theme: t });
  let s = `<g transform="translate(${ox},0)">${f.svg}`;
  const rh = f.ph / rows.length;
  rows.forEach((r, i) => {
    const cy = f.Y(i + 0.5);
    if (r.header !== undefined) {
      s += `<text x="${f.px - 12}" y="${cy}" fill="${t.text}" font-size="${Math.min(20 * t.fontScale, termFs * 1.1).toFixed(1)}" font-weight="bold" text-anchor="end" dominant-baseline="middle" font-style="italic">${esc(r.header)}</text>`;
      return;
    }
    s += `<text x="${f.px - 12}" y="${cy}" fill="${t.text}" font-size="${termFs.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(fitTerm(r.term))}</text>`;
    const base = r.dir === "down" ? t.colors[1 % t.colors.length] : r.dir === "up" ? t.colors[0] : t.colors[2 % t.colors.length];
    const op = 0.35 + 0.6 * (r.score / smax);
    const x1 = f.X(r.score);
    if (o.lollipop) {
      s += `<line x1="${f.X(0)}" y1="${cy}" x2="${x1}" y2="${cy}" stroke="${base}" stroke-width="2.6"/>`;
      s += `<circle cx="${x1}" cy="${cy}" r="${Math.min(10, rh * 0.32)}" fill="${base}" fill-opacity="${op.toFixed(2)}"/>`;
    } else {
      s += `<rect x="${f.X(0)}" y="${cy - rh * 0.3}" width="${Math.max(0, x1 - f.X(0))}" height="${rh * 0.6}" fill="${base}" fill-opacity="${op.toFixed(2)}"/>`;
    }
    if (o.genes && r.genes) s += `<text x="${x1 + 8}" y="${cy}" fill="${t.text}" font-size="${(15 * t.fontScale).toFixed(1)}" dominant-baseline="middle" fill-opacity="0.8">${esc(r.genes)}</text>`;
  });
  s += "</g>";
  return s;
}

export function enrichBar(m: EnrichModel, t: Theme, o: PlotOpts): Rendered {
  let s = enrichPanel(m, t, o, 0, W, true);
  if (o.showLegend) s += legend([{ name: "上调", color: t.colors[0] }, { name: "下调", color: t.colors[1 % t.colors.length] }], 320, 34, t);
  return { inner: s, w: W, h: H };
}

export function volcanoEnrich(v: VolcanoModel, e: EnrichModel, t: Theme, o: PlotOpts): Rendered {
  const s = volcanoPanel(v, t, { ...o, title: "" }, 0, 560) + enrichPanel(e, t, { ...o, lollipop: o.lollipop }, 560, 440, false);
  let out = s;
  if (o.title) out += `<text x="${500}" y="${34}" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  return { inner: out, w: W, h: H };
}

export function enrichTop(m: EnrichModel, dir: "up" | "down", n = 3): string {
  return m.terms.filter((x) => x.dir === dir).sort((a, b) => b.score - a.score).slice(0, n).map((x) => `${x.term} (score ${fmt(x.score)})`).join("、");
}