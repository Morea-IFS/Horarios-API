import path from 'node:path';
import { createRequire } from 'node:module';
import type { HLine, PageGeometry, RectItem, TextItem } from '../domain/types.ts';
import { extractSchedule } from '../domain/grid.ts';
import type { ExtractedSchedule } from '../domain/types.ts';

// Versão testada do pdfjs-dist: 5.6.205 (o formato das operações gráficas muda entre versões maiores).

type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5],
];
const round = (n: number) => Math.round(n * 100) / 100;

// Códigos do caminho em constructPath (pdfjs 5.x): 0 moveTo, 1 lineTo, 2 curveTo, 3 quadratic, 4 closePath
function subpathRects(data: ArrayLike<number>, ctm: Matrix): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  let pts: [number, number][] = [];
  let curved = false;
  const flush = () => {
    if (pts.length >= 4 && !curved) {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
      // só vale como retângulo se todos os pontos estão nos cantos da caixa
      const onCorner = pts.every((p) => (Math.abs(p[0] - x) < 0.01 || Math.abs(p[0] - x - w) < 0.01) && (Math.abs(p[1] - y) < 0.01 || Math.abs(p[1] - y - h) < 0.01));
      if (onCorner && w > 0.5 && h > 0.5) out.push({ x, y, w, h });
    }
    pts = []; curved = false;
  };
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    if (op === 0) { flush(); pts.push(apply(ctm, data[i], data[i + 1])); i += 2; }
    else if (op === 1) { pts.push(apply(ctm, data[i], data[i + 1])); i += 2; }
    else if (op === 2) { curved = true; i += 6; }
    else if (op === 3) { curved = true; i += 4; }
    else if (op === 4) { /* fecha subcaminho */ }
    else { i += 0; }
  }
  flush();
  return out;
}

/** Segmentos horizontais de um caminho (inclui as arestas horizontais de retângulos e o fechamento do subcaminho). */
function subpathHLines(data: ArrayLike<number>, ctm: Matrix): HLine[] {
  const out: HLine[] = [];
  let first: [number, number] | null = null;
  let prev: [number, number] | null = null;
  const seg = (a: [number, number], b: [number, number]) => {
    if (Math.abs(a[1] - b[1]) < 0.05 && Math.abs(a[0] - b[0]) > 1) out.push({ x1: Math.min(a[0], b[0]), x2: Math.max(a[0], b[0]), y: (a[1] + b[1]) / 2 });
  };
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    if (op === 0) { const pt = apply(ctm, data[i], data[i + 1]); i += 2; first = pt; prev = pt; }
    else if (op === 1) { const pt = apply(ctm, data[i], data[i + 1]); i += 2; if (prev) seg(prev, pt); prev = pt; }
    else if (op === 2) { prev = apply(ctm, data[i + 4], data[i + 5]); i += 6; }
    else if (op === 3) { prev = apply(ctm, data[i + 2], data[i + 3]); i += 4; }
    else if (op === 4) { if (prev && first) seg(prev, first); prev = first; }
  }
  return out;
}

export type LoadOptions = { standardFontDataUrl?: string };

export async function loadPageGeometries(bytes: Uint8Array, opts: LoadOptions = {}): Promise<PageGeometry[]> {
  // @ts-ignore — módulo ESM carregado dinamicamente; sem tipos estáticos
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const OPS = pdfjs.OPS;
  const STROKE = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const PAINT = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

  let fontUrl = opts.standardFontDataUrl;
  if (!fontUrl) {
    try {
      const req = createRequire(path.join(process.cwd(), 'noop.js'));
      fontUrl = path.join(path.dirname(req.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
    } catch { /* sem fontes padrão: só gera aviso do pdfjs */ }
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true, standardFontDataUrl: fontUrl, verbosity: 0,
  }).promise;

  const pages: PageGeometry[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    // A ORDEM do fluxo do PDF é preservada (o nome da sala vem depois do rodapé).
    const items: TextItem[] = tc.items
      .filter((it: any) => typeof it.str === 'string' && it.str.trim() !== '')
      .map((it: any) => ({ str: it.str, x: round(it.transform[4]), y: round(it.transform[5]), w: round(it.width), h: round(it.height) }));

    const list = await page.getOperatorList();
    const rects: RectItem[] = [];
    const hlines: HLine[] = [];
    const seen = new Set<string>();
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    let fill: string | null = null;
    for (let i = 0; i < list.fnArray.length; i++) {
      const fn = list.fnArray[i];
      const args = list.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
      else if (fn === OPS.transform) ctm = mul(ctm, args as Matrix);
      else if (fn === OPS.setFillRGBColor) fill = typeof args?.[0] === 'string' ? args[0] : JSON.stringify(args);
      else if (fn === OPS.setFillGray) fill = JSON.stringify(args);
      else if (fn === OPS.constructPath) {
        if (PAINT.has(args[0])) {
          for (const r of subpathRects(args[1][0], ctm)) rects.push({ x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h), fill });
        }
        if (STROKE.has(args[0])) {
          for (const l of subpathHLines(args[1][0], ctm)) {
            const h: HLine = { x1: round(l.x1), x2: round(l.x2), y: round(l.y) };
            const key = `${h.x1}|${h.x2}|${h.y}`;
            if (!seen.has(key)) { seen.add(key); hlines.push(h); }
          }
        }
      }
    }
    pages.push({ page: n, items, rects, hlines });
  }
  return pages;
}

export async function extractFromPdf(bytes: Uint8Array): Promise<ExtractedSchedule> {
  return extractSchedule(await loadPageGeometries(bytes));
}
