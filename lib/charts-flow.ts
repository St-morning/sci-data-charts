import { Theme, esc, textWidth } from "@/lib/chartcore";
import { FlowModel, MatrixModel, PlotOpts, Rendered } from "@/lib/chartmodel";
import { fmt } from "@/lib/stats";

const W = 1000, H = 700;

// ---------- 4. Sankey diagram ----------

export function sankey(m: FlowModel, t: Theme, o: PlotOpts): Rendered {
  const n = m.nodes.length;
  let s = "";
  if (o.title) s += `<text x="500" y="40" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  const links = m.links.filter((l) => l.v > 0 && l.s !== l.t && l.s >= 0 && l.s < n && l.t >= 0 && l.t < n);
  if (n === 0 || !links.length) return { inner: s, w: W, h: H };

  const inS = Array(n).fill(0) as number[];
  const outS = Array(n).fill(0) as number[];
  for (const l of links) { outS[l.s] += l.v; inS[l.t] += l.v; }
  const val = m.nodes.map((_, i) => Math.max(inS[i], outS[i]));

  // layering: sources at 0, longest-path relaxation, sinks at last layer, max 4 layers
  const layer = Array(n).fill(0) as number[];
  for (let it = 0; it < n; it++) {
    let changed = false;
    for (const l of links) {
      if (layer[l.t] < layer[l.s] + 1) { layer[l.t] = layer[l.s] + 1; changed = true; }
    }
    if (!changed) break;
  }
  let L = Math.max(...layer);
  if (L > 3) {
    for (let i = 0; i < n; i++) layer[i] = Math.round((layer[i] * 3) / L);
    L = 3;
  }
  for (let i = 0; i < n; i++) if (outS[i] === 0 && inS[i] > 0) layer[i] = L;
  const nLayers = L + 1;

  const ml = 150, mr = 150, mt = 80, mb = 50, nodeW = 18, gap = 16;
  const availH = H - mt - mb;
  const byLayer: number[][] = Array.from({ length: nLayers }, () => []);
  for (let i = 0; i < n; i++) byLayer[layer[i]].push(i);
  const used = byLayer.filter((ids) => ids.length > 0);
  const scale = Math.min(...used.map((ids) => {
    const total = ids.reduce((a, i) => a + val[i], 0) || 1e-9;
    return (availH - gap * (ids.length - 1)) / total;
  }));
  const nx = Array(n).fill(0) as number[];
  const ny = Array(n).fill(0) as number[];
  const nh = Array(n).fill(0) as number[];
  byLayer.forEach((ids, k) => {
    const x = nLayers > 1 ? ml + (k * (W - ml - mr - nodeW)) / (nLayers - 1) : (W - nodeW) / 2;
    const hs = ids.map((i) => Math.max(4, val[i] * scale));
    const totalH = hs.reduce((a, b) => a + b, 0) + gap * Math.max(0, ids.length - 1);
    let y = mt + (availH - totalH) / 2;
    ids.forEach((i, k2) => { nx[i] = x; ny[i] = y; nh[i] = hs[k2]; y += hs[k2] + gap; });
  });

  // link endpoint offsets (sorted to minimize crossings)
  const outOff = Array(n).fill(0) as number[];
  const inOff = Array(n).fill(0) as number[];
  const geo = links.map((l) => ({ l, th: Math.max(1.5, l.v * scale), sy: 0, ty: 0 }));
  const bySrc = new Map<number, typeof geo>();
  const byTgt = new Map<number, typeof geo>();
  for (const g of geo) {
    if (!bySrc.has(g.l.s)) bySrc.set(g.l.s, []);
    bySrc.get(g.l.s)!.push(g);
    if (!byTgt.has(g.l.t)) byTgt.set(g.l.t, []);
    byTgt.get(g.l.t)!.push(g);
  }
  for (const [i, gs] of bySrc) {
    gs.sort((a, b) => ny[a.l.t] - ny[b.l.t]);
    for (const g of gs) { g.sy = ny[i] + outOff[i]; outOff[i] += g.th; }
  }
  for (const [j, gs] of byTgt) {
    gs.sort((a, b) => ny[a.l.s] - ny[b.l.s]);
    for (const g of gs) { g.ty = ny[j] + inOff[j]; inOff[j] += g.th; }
  }

  // ribbons
  for (const g of geo) {
    const x0 = nx[g.l.s] + nodeW, x1 = nx[g.l.t], xm = (x0 + x1) / 2;
    const y0t = g.sy, y0b = g.sy + g.th, y1t = g.ty, y1b = g.ty + g.th;
    s += `<path d="M ${x0.toFixed(1)} ${y0t.toFixed(1)} C ${xm.toFixed(1)} ${y0t.toFixed(1)}, ${xm.toFixed(1)} ${y1t.toFixed(1)}, ${x1.toFixed(1)} ${y1t.toFixed(1)} L ${x1.toFixed(1)} ${y1b.toFixed(1)} C ${xm.toFixed(1)} ${y1b.toFixed(1)}, ${xm.toFixed(1)} ${y0b.toFixed(1)}, ${x0.toFixed(1)} ${y0b.toFixed(1)} Z" fill="${t.colors[g.l.s % t.colors.length]}" fill-opacity="0.35"/>`;
  }
  // nodes + outer labels with values
  for (let i = 0; i < n; i++) {
    const col = t.colors[i % t.colors.length];
    s += `<rect x="${nx[i].toFixed(1)}" y="${ny[i].toFixed(1)}" width="${nodeW}" height="${nh[i].toFixed(1)}" fill="${col}"/>`;
    const cy = ny[i] + nh[i] / 2;
    const left = layer[i] === 0;
    const tx = left ? nx[i] - 10 : nx[i] + nodeW + 10;
    const label = `${m.nodes[i]}  ${fmt(val[i])}`;
    const avail = left ? tx - 12 : W - 12 - tx;
    const fs = Math.min(t.tickFont, avail / Math.max(1, textWidth(label, 1)));
    s += `<text x="${tx.toFixed(1)}" y="${cy.toFixed(1)}" fill="${t.text}" font-size="${fs.toFixed(1)}" text-anchor="${left ? "end" : "start"}" dominant-baseline="middle">${esc(label)}</text>`;
  }
  return { inner: s, w: W, h: H };
}

// ---------- 5. Chord diagram ----------

export function chord(m: MatrixModel, t: Theme, o: PlotOpts): Rendered {
  let s = "";
  if (o.title) s += `<text x="500" y="40" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  // labels = rows ∪ cols, deduplicated, order preserved
  const labels: string[] = [];
  const idxOf = new Map<string, number>();
  for (const name of [...m.rows, ...m.cols]) {
    if (!idxOf.has(name)) { idxOf.set(name, labels.length); labels.push(name); }
  }
  const nl = labels.length;
  if (nl === 0) return { inner: s, w: W, h: H };

  const pairs: { si: number; tj: number; v: number }[] = [];
  for (let i = 0; i < m.rows.length; i++) {
    for (let j = 0; j < m.cols.length; j++) {
      const v = m.v[i]?.[j];
      if (v !== undefined && isFinite(v) && v > 0) pairs.push({ si: idxOf.get(m.rows[i])!, tj: idxOf.get(m.cols[j])!, v });
    }
  }
  const total = Array(nl).fill(0) as number[];
  for (const p of pairs) { total[p.si] += p.v; total[p.tj] += p.v; }
  const grand = total.reduce((a, b) => a + b, 0);
  if (grand <= 0) return { inner: s, w: W, h: H };

  const cx = 480, cy = 380, R = 250, ring = 20, r = R - ring;
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const pt = (deg: number, rr: number): [number, number] => [cx + rr * Math.cos(rad(deg)), cy + rr * Math.sin(rad(deg))];
  const P = (q: [number, number]) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;

  // arcs: 2° gap between segments
  const gapDeg = 2, avail = 360 - gapDeg * nl;
  const arcStart = Array(nl).fill(0) as number[];
  const span = Array(nl).fill(0) as number[];
  let cursor = 0;
  for (let k = 0; k < nl; k++) {
    span[k] = (total[k] / grand) * avail;
    arcStart[k] = cursor;
    cursor += span[k] + gapDeg;
  }

  // allocate ribbon sub-arcs at each endpoint
  const ends: { pair: number; other: number; v: number; side: "s" | "t" }[][] = labels.map(() => []);
  pairs.forEach((p, id) => {
    ends[p.si].push({ pair: id, other: p.tj, v: p.v, side: "s" });
    ends[p.tj].push({ pair: id, other: p.si, v: p.v, side: "t" });
  });
  const srcArc: [number, number][] = pairs.map(() => [0, 0]);
  const tgtArc: [number, number][] = pairs.map(() => [0, 0]);
  for (let k = 0; k < nl; k++) {
    ends[k].sort((a, b) => a.other - b.other);
    let a = arcStart[k];
    for (const e of ends[k]) {
      const a1 = a + (e.v / (total[k] || 1)) * span[k];
      if (e.side === "s") srcArc[e.pair] = [a, a1];
      else tgtArc[e.pair] = [a, a1];
      a = a1;
    }
  }

  // ribbons (under the ring)
  pairs.forEach((p, id) => {
    const [a0, a1] = srcArc[id], [b0, b1] = tgtArc[id];
    const la = a1 - a0 > 180 ? 1 : 0, lb = b1 - b0 > 180 ? 1 : 0;
    const d = `M ${P(pt(a0, r))} A ${r} ${r} 0 ${la} 1 ${P(pt(a1, r))} Q ${cx} ${cy} ${P(pt(b0, r))} A ${r} ${r} 0 ${lb} 1 ${P(pt(b1, r))} Q ${cx} ${cy} ${P(pt(a0, r))} Z`;
    s += `<path d="${d}" fill="${t.colors[p.si % t.colors.length]}" fill-opacity="0.45"/>`;
  });
  // ring segments
  for (let k = 0; k < nl; k++) {
    if (span[k] <= 0) continue;
    const a0 = arcStart[k], a1 = a0 + span[k], la = span[k] > 180 ? 1 : 0;
    const d = `M ${P(pt(a0, R))} A ${R} ${R} 0 ${la} 1 ${P(pt(a1, R))} L ${P(pt(a1, r))} A ${r} ${r} 0 ${la} 0 ${P(pt(a0, r))} Z`;
    s += `<path d="${d}" fill="${t.colors[k % t.colors.length]}"/>`;
  }
  // outer labels + totals
  for (let k = 0; k < nl; k++) {
    if (span[k] <= 0) continue;
    const mid = arcStart[k] + span[k] / 2;
    const [lx, ly] = pt(mid, R + 14);
    const c = Math.cos(rad(mid));
    const anchor = c > 0.15 ? "start" : c < -0.15 ? "end" : "middle";
    s += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${t.text}" font-size="${t.tickFont.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle">${esc(labels[k])} · ${fmt(total[k])}</text>`;
  }
  return { inner: s, w: W, h: H };
}