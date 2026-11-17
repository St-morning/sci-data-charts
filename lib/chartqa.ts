import { textWidth } from "@/lib/chartcore";

export interface QaIssue {
  level: "FAIL" | "WARN";
  kind: "overlap" | "clip" | "stroke" | "occlusion" | "font";
  msg: string;
}

export interface QaReport {
  overlap: number;
  clip: number;
  occlusion: number;
  stroke: number;
  minPt: number;
  textCount: number;
  issues: QaIssue[];
  pass: boolean;
}

interface Box { x: number; y: number; w: number; h: number; text: string; fs: number }

// affine matrix [a b c d e f]
type Mat = [number, number, number, number, number, number];
const ID: Mat = [1, 0, 0, 1, 0, 0];

function mul(A: Mat, B: Mat): Mat {
  return [
    A[0] * B[0] + A[2] * B[1],
    A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3],
    A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}

function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function scaleOf(m: Mat): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}

function parseTransform(tr: string): Mat {
  let m: Mat = ID;
  const re = /(translate|scale|rotate|matrix|skewX|skewY)\s*\(([^)]*)\)/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(tr))) {
    const args = hit[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Mat = ID;
    if (hit[1] === "translate") t = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
    else if (hit[1] === "scale") t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
    else if (hit[1] === "rotate") {
      const a = ((args[0] || 0) * Math.PI) / 180;
      const cos = Math.cos(a), sin = Math.sin(a);
      const r: Mat = [cos, sin, -sin, cos, 0, 0];
      if (args.length >= 3) {
        t = mul(mul([1, 0, 0, 1, args[1], args[2]], r), [1, 0, 0, 1, -args[1], -args[2]]);
      } else t = r;
    } else if (hit[1] === "matrix" && args.length >= 6) {
      t = [args[0], args[1], args[2], args[3], args[4], args[5]];
    } else if (hit[1] === "skewX") {
      t = [1, 0, Math.tan(((args[0] || 0) * Math.PI) / 180), 1, 0, 0];
    } else if (hit[1] === "skewY") {
      t = [1, Math.tan(((args[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = mul(m, t);
  }
  return m;
}

// cumulative transform from element user space to root user space,
// including nested <svg x y width height viewBox> viewport mapping
function ctm(el: Element): Mat {
  let m: Mat = ID;
  let cur: Element | null = el;
  while (cur) {
    let step: Mat = ID;
    const tr = cur.getAttribute("transform");
    if (tr) step = parseTransform(tr);
    if (cur.tagName === "svg" && cur.parentElement) {
      const vb = (cur.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
      const x = Number(cur.getAttribute("x") || 0);
      const y = Number(cur.getAttribute("y") || 0);
      let sx = 1, sy = 1;
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
        const wAttr = cur.getAttribute("width"), hAttr = cur.getAttribute("height");
        if (wAttr && hAttr) {
          sx = Number(wAttr) / vb[2];
          sy = Number(hAttr) / vb[3];
        }
      }
      step = mul([1, 0, 0, 1, x - vb[0] * sx, y - vb[1] * sy], mul([sx, 0, 0, sy, 0, 0], step));
    }
    m = mul(step, m);
    cur = cur.parentElement;
  }
  return m;
}

function bboxOf(m: Mat, x: number, y: number, w: number, h: number): Box {
  const pts = [apply(m, x, y), apply(m, x + w, y), apply(m, x, y + h), apply(m, x + w, y + h)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs), by = Math.min(...ys);
  return { x: bx, y: by, w: Math.max(...xs) - bx, h: Math.max(...ys) - by, text: "", fs: 0 };
}

function textBox(el: Element): Box | null {
  const content = (el.textContent ?? "").trim();
  if (!content) return null;
  const fs = Number(el.getAttribute("font-size") || 12);
  const x = Number(el.getAttribute("x") || 0);
  const y = Number(el.getAttribute("y") || 0);
  const tw = textWidth(content, fs);
  const anchor = el.getAttribute("text-anchor") ?? "start";
  const base = el.getAttribute("dominant-baseline") ?? "alphabetic";
  let left = x;
  if (anchor === "middle") left = x - tw / 2;
  else if (anchor === "end") left = x - tw;
  let top = y - fs * 0.8;
  if (base === "middle" || base === "central") top = y - fs / 2;
  else if (base === "hanging" || base === "text-before-edge") top = y;
  const m = ctm(el);
  const box = bboxOf(m, left, top, tw, fs);
  box.text = content;
  box.fs = fs * scaleOf(m);
  return box;
}

function intersects(a: Box, b: Box, pad = 0): boolean {
  return a.x < b.x + b.w - pad && b.x < a.x + a.w - pad &&
    a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;
}

function segRect(x1: number, y1: number, x2: number, y2: number, b: Box): boolean {
  const inside = (x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  if (inside(x1, y1) || inside(x2, y2)) return true;
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - b.x, b.x + b.w - x1, y1 - b.y, b.y + b.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return t0 <= t1;
}

function isLightFill(f: string): boolean {
  const s = f.trim().toLowerCase();
  if (s === "white" || s === "#fff" || s === "#ffffff") return true;
  const m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 235;
  }
  const rgb = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s);
  if (rgb) return 0.2126 * +rgb[1] + 0.7152 * +rgb[2] + 0.0722 * +rgb[3] > 235;
  return false;
}

export function auditSvg(svg: string, w: number, h: number, widthCm: number): QaReport {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const texts = Array.from(doc.querySelectorAll("text"));
  const boxes: Box[] = [];
  for (const el of texts) {
    const b = textBox(el);
    if (b) boxes.push(b);
  }
  const issues: QaIssue[] = [];
  let overlap = 0, clip = 0, occlusion = 0, stroke = 0;
  const ptPerUnit = ((widthCm / 2.54) * 72) / w;
  let minPt = Infinity;
  for (const b of boxes) {
    const pt = b.fs * ptPerUnit;
    if (pt < minPt) minPt = pt;
    if (pt < 5) issues.push({ level: "FAIL", kind: "font", msg: `文字“${b.text.slice(0, 12)}”约 ${pt.toFixed(1)} pt，低于 5 pt 可读下限` });
    const tol = 1;
    if (b.x < -tol || b.y < -tol || b.x + b.w > w + tol || b.y + b.h > h + tol) {
      clip++;
      issues.push({ level: "FAIL", kind: "clip", msg: `文字“${b.text.slice(0, 12)}”超出画布边界` });
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (intersects(boxes[i], boxes[j], 1)) {
        overlap++;
        if (overlap <= 6) issues.push({ level: "FAIL", kind: "overlap", msg: `文字碰撞：“${boxes[i].text.slice(0, 10)}” × “${boxes[j].text.slice(0, 10)}”` });
      }
    }
  }
  const lines = Array.from(doc.querySelectorAll("line")).map((ln) => {
    const m = ctm(ln);
    const p1 = apply(m, Number(ln.getAttribute("x1")), Number(ln.getAttribute("y1")));
    const p2 = apply(m, Number(ln.getAttribute("x2")), Number(ln.getAttribute("y2")));
    return { p1, p2, sw: Number(ln.getAttribute("stroke-width") || 1) * scaleOf(m) };
  });
  const fills = Array.from(doc.querySelectorAll("rect,circle,ellipse,path,polygon"))
    .filter((el) => {
      const f = el.getAttribute("fill");
      return f && f !== "none" && !f.startsWith("url") && !isLightFill(f);
    })
    .map((el) => {
      const m = ctm(el);
      if (el.tagName === "circle") {
        const c = apply(m, Number(el.getAttribute("cx")), Number(el.getAttribute("cy")));
        return { kind: "circle" as const, cx: c[0], cy: c[1], r: Number(el.getAttribute("r")) * scaleOf(m), op: Number(el.getAttribute("fill-opacity") ?? 1) };
      }
      if (el.tagName === "rect") {
        const b = bboxOf(m, Number(el.getAttribute("x")), Number(el.getAttribute("y")), Number(el.getAttribute("width")), Number(el.getAttribute("height")));
        return { kind: "rect" as const, box: b, op: Number(el.getAttribute("fill-opacity") ?? 1) };
      }
      return null;
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  for (const b of boxes) {
    for (const ln of lines) {
      if (ln.sw < 1.5) continue;
      if (segRect(ln.p1[0], ln.p1[1], ln.p2[0], ln.p2[1], b)) {
        stroke++;
        if (stroke <= 6) issues.push({ level: "FAIL", kind: "stroke", msg: `文字“${b.text.slice(0, 10)}”与线条/误差棒重叠` });
        break;
      }
    }
    for (const f of fills) {
      let hit = false;
      if (f.kind === "circle") {
        const nx = Math.max(b.x, Math.min(f.cx, b.x + b.w));
        const ny = Math.max(b.y, Math.min(f.cy, b.y + b.h));
        hit = (nx - f.cx) ** 2 + (ny - f.cy) ** 2 < f.r * f.r * 0.8;
      } else {
        hit = intersects(b, f.box, 2);
      }
      if (hit) {
        if (f.op > 0.5) {
          occlusion++;
          if (occlusion <= 6) issues.push({ level: "WARN", kind: "occlusion", msg: `文字“${b.text.slice(0, 10)}”位于深色填充上，注意对比度` });
        }
        break;
      }
    }
  }
  if (!isFinite(minPt)) minPt = 0;
  const fails = issues.filter((i) => i.level === "FAIL").length;
  return { overlap, clip, occlusion, stroke, minPt, textCount: boxes.length, issues, pass: fails === 0 };
}