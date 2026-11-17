import { Theme, esc, frame, legend, cmapColor, CMAPS, hexRgb, textWidth } from "@/lib/chartcore";
import { XYModel, XLongModel, MatrixModel, PlotOpts, Rendered, gstat, errVal } from "@/lib/chartmodel";
import { linreg, poly2, fmt, tQuantile975, mean } from "@/lib/stats";

const W = 1000, H = 700;

export function scatterFit(m: XYModel, t: Theme, o: PlotOpts): Rendered {
  const xs = m.pts.map((p) => p.x), ys = m.pts.map((p) => p.y);
  const px = (Math.max(...xs) - Math.min(...xs) || 1) * 0.06;
  const py = (Math.max(...ys) - Math.min(...ys) || 1) * 0.08;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: Math.min(...xs) - px, xhi: Math.max(...xs) + px, ylo: Math.min(...ys) - py, yhi: Math.max(...ys) + py, xlabel: o.xLabel || m.xName, ylabel: o.yLabel || m.yName, title: o.title, theme: t });
  let s = f.svg;
  const groups = m.groups.length ? m.groups : ["全部"];
  groups.forEach((gname, gi) => {
    const pts = m.pts.filter((p) => p.g === gi);
    if (pts.length < 2) return;
    const col = t.colors[gi % t.colors.length];
    const gx = pts.map((p) => p.x), gy = pts.map((p) => p.y);
    const x0 = Math.min(...gx), x1 = Math.max(...gx);
    if (o.fit === "linear") {
      const r = linreg(gx, gy);
      if (o.band) {
        const mx = mean(gx);
        const sxx = gx.reduce((a, v) => a + (v - mx) ** 2, 0);
        const resid = gy.map((v, i) => v - (r.intercept + r.slope * gx[i]));
        const residSd = Math.sqrt(resid.reduce((a, v) => a + v * v, 0) / Math.max(1, pts.length - 2));
        const tq = tQuantile975(Math.max(1, pts.length - 2));
        let up = "", dn = "";
        for (let k = 0; k <= 40; k++) {
          const x = x0 + ((x1 - x0) * k) / 40;
          const se = residSd * Math.sqrt(1 / pts.length + (x - mx) ** 2 / (sxx || 1));
          const yhat = r.intercept + r.slope * x;
          up += `${k === 0 ? "M" : "L"} ${f.X(x)} ${f.Y(yhat + tq * se)} `;
          dn = `L ${f.X(x)} ${f.Y(yhat - tq * se)} ` + dn;
        }
        s += `<path d="${up}${dn}Z" fill="${col}" fill-opacity="0.15" stroke="none"/>`;
      }
      s += `<line x1="${f.X(x0)}" y1="${f.Y(r.intercept + r.slope * x0)}" x2="${f.X(x1)}" y2="${f.Y(r.intercept + r.slope * x1)}" stroke="${col}" stroke-width="3"/>`;
    } else {
      const p2 = poly2(gx, gy);
      let d = "";
      for (let k = 0; k <= 60; k++) {
        const x = x0 + ((x1 - x0) * k) / 60;
        d += `${k === 0 ? "M" : "L"} ${f.X(x)} ${f.Y(p2.a0 + p2.a1 * x + p2.a2 * x * x)} `;
      }
      s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="3"/>`;
    }
    for (const p of pts) s += `<circle cx="${f.X(p.x)}" cy="${f.Y(p.y)}" r="6.5" fill="${col}" fill-opacity="0.75"/>`;
  });
  if (m.groups.length > 1 && o.showLegend) s += legend(m.groups.map((n, i) => ({ name: n, color: t.colors[i % t.colors.length], shape: "dot" })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

export function lineBand(m: XLongModel, t: Theme, o: PlotOpts): Rendered {
  const stats = m.values.map((row) => row.map((xs) => gstat(xs)));
  let lo = Infinity, hi = -Infinity;
  for (const row of stats) for (const g of row) {
    const e = errVal(g, o.error);
    lo = Math.min(lo, g.mean - e); hi = Math.max(hi, g.mean + e);
  }
  const pad = (hi - lo || 1) * 0.1;
  const f = frame({ w: W, h: H, ml: 95, mr: 40, mt: 60, mb: 85, xlo: m.xs[0], xhi: m.xs[m.xs.length - 1], ylo: lo - pad, yhi: hi + pad, xlabel: o.xLabel || m.xName, ylabel: o.yLabel || m.valueName, title: o.title, theme: t });
  let s = f.svg;
  m.series.forEach((nm, j) => {
    const col = t.colors[j % t.colors.length];
    if (o.band && o.error !== "none") {
      let up = "", dn = "";
      m.xs.forEach((x, i) => {
        const g = stats[i][j];
        const e = errVal(g, o.error);
        up += `${i === 0 ? "M" : "L"} ${f.X(x)} ${f.Y(g.mean + e)} `;
        dn = `L ${f.X(x)} ${f.Y(g.mean - e)} ` + dn;
      });
      s += `<path d="${up}${dn}Z" fill="${col}" fill-opacity="0.18"/>`;
    }
    let d = "";
    m.xs.forEach((x, i) => { d += `${i === 0 ? "M" : "L"} ${f.X(x)} ${f.Y(stats[i][j].mean)} `; });
    s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="3"/>`;
    m.xs.forEach((x, i) => { s += `<circle cx="${f.X(x)}" cy="${f.Y(stats[i][j].mean)}" r="6" fill="${col}"/>`; });
  });
  if (o.showLegend) s += legend(m.series.map((n, i) => ({ name: n, color: t.colors[i % t.colors.length], shape: "line" })), f.px + 8, f.py - 26, t);
  return { inner: s, w: W, h: H };
}

function lum(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function heatMap(m: MatrixModel, t: Theme, o: PlotOpts): Rendered {
  const nr = m.rows.length, nc = m.cols.length;
  const flat = m.v.flat();
  const isCorr = Math.min(...flat) >= -1.001 && Math.max(...flat) <= 1.001;
  const absMax = Math.max(...flat.map(Math.abs), 1e-9);
  const lo = isCorr ? -absMax : Math.min(...flat);
  const hi = isCorr ? absMax : Math.max(...flat);
  const stops = CMAPS[o.cmap] ?? CMAPS["蓝-红（相关）"];
  const gx = 190, gy = 130;
  const gw = o.margBar ? 520 : 640, gh = 480;
  const cw = gw / nc, ch = gh / nr;
  let s = "";
  for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
    const v = m.v[i][j];
    const col = cmapColor(stops, (v - lo) / (hi - lo || 1));
    s += `<rect x="${gx + j * cw}" y="${gy + i * ch}" width="${cw - 1.5}" height="${ch - 1.5}" fill="${col}"/>`;
    if (nr * nc <= 144) s += `<text x="${gx + j * cw + cw / 2}" y="${gy + i * ch + ch / 2}" fill="${lum(col) > 0.55 ? "#111111" : "#ffffff"}" font-size="${(17 * t.fontScale).toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${fmt(v, 2)}</text>`;
  }
  m.rows.forEach((r, i) => {
    s += `<text x="${gx - 10}" y="${gy + i * ch + ch / 2}" fill="${t.text}" font-size="${(20 * t.fontScale).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(r)}</text>`;
  });
  const colFs = 20 * t.fontScale;
  const maxColTw = Math.max(...m.cols.map((c) => textWidth(c, colFs)), 0);
  const colY = gy - 14 - maxColTw * 0.707;
  m.cols.forEach((c, j) => {
    const x = gx + j * cw + cw / 2;
    s += `<text x="${x}" y="${colY}" fill="${t.text}" font-size="${colFs.toFixed(1)}" text-anchor="end" dominant-baseline="middle" transform="rotate(-45 ${x} ${colY})">${esc(c)}</text>`;
  });
  const cbx = gx + gw + 30;
  for (let k = 0; k < 60; k++) {
    const tt = k / 59;
    s += `<rect x="${cbx}" y="${gy + gh - (k + 1) * (gh / 60)}" width="22" height="${gh / 60 + 0.5}" fill="${cmapColor(stops, tt)}"/>`;
  }
  for (const v of [lo, (lo + hi) / 2, hi]) {
    const y = gy + gh - ((v - lo) / (hi - lo || 1)) * gh;
    s += `<text x="${cbx + 28}" y="${y}" fill="${t.text}" font-size="${(18 * t.fontScale).toFixed(1)}" dominant-baseline="middle">${fmt(v, 2)}</text>`;
  }
  if (o.margBar) {
    const bx = cbx + 90, bw = 1000 - bx - 20;
    const rowMean = m.v.map((row) => mean(row.map((v) => (isCorr ? Math.abs(v) : v))));
    const rmax = Math.max(...rowMean, 1e-9);
    rowMean.forEach((v, i) => {
      const y = gy + i * ch + ch * 0.2;
      s += `<rect x="${bx}" y="${y}" width="${(v / rmax) * bw}" height="${ch * 0.6}" fill="${t.colors[i % t.colors.length]}" fill-opacity="0.8"/>`;
    });
    s += `<text x="${bx + bw / 2}" y="${gy - 16}" fill="${t.text}" font-size="${(19 * t.fontScale).toFixed(1)}" text-anchor="middle">${isCorr ? "平均 |r|" : "行均值"}</text>`;
  }
  if (o.title) s += `<text x="${gx + gw / 2}" y="${52}" fill="${t.text}" font-size="${t.titleFont.toFixed(1)}" font-weight="bold" text-anchor="middle">${esc(o.title)}</text>`;
  return { inner: s, w: W, h: H };
}