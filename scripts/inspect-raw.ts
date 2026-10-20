// Diagnóstico BRUTO de páginas do PDF: como os cards e rótulos estão realmente desenhados.
// Uso: node scripts/inspect-raw.ts HORARIO_SALAS_2026_2.pdf --pages=1,28 [--out=out]
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const opt = (n: string, d: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
if (!file) { console.error('Uso: node scripts/inspect-raw.ts <arquivo.pdf> --pages=1,28'); process.exit(1); }
const pagesWanted = opt('pages', '1,28').split(',').map(Number);
const outDir = opt('out', 'out');

// @ts-ignore
const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
const OPS = pdfjs.OPS;
const opName: Record<number, string> = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v as number, k]));
const req = createRequire(path.join(process.cwd(), 'noop.js'));
const fontUrl = path.join(path.dirname(req.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
const doc = await pdfjs.getDocument({ data: new Uint8Array(await fs.readFile(file)), isEvalSupported: false, useSystemFonts: true, standardFontDataUrl: fontUrl, verbosity: 0 }).promise;

const r1 = (n: number) => Math.round(n * 10) / 10;
const result: Record<string, unknown>[] = [];

for (const n of pagesWanted) {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  const items = tc.items.filter((i: any) => i.str?.trim()).map((i: any) => ({ s: i.str, x: r1(i.transform[4]), y: r1(i.transform[5]), w: r1(i.width), h: r1(i.height) }));
  const list = await page.getOperatorList();

  const ops: Record<string, number> = {};
  const paints: Record<string, number> = {};
  const fills: Record<string, number> = {};
  const shapes: Record<string, number> = {};
  const samples: unknown[] = [];
  let fill = 'none';
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    ops[opName[fn]] = (ops[opName[fn]] ?? 0) + 1;
    if (fn === OPS.setFillRGBColor || fn === OPS.setFillGray || fn === OPS.setFillColor || fn === OPS.setFillColorN || fn === OPS.setFillCMYKColor) {
      fill = `${opName[fn]}:${JSON.stringify(args)}`.slice(0, 60);
    } else if (fn === OPS.constructPath) {
      const paint = opName[args[0]] ?? String(args[0]);
      paints[paint] = (paints[paint] ?? 0) + 1;
      const data: number[] = Array.from(args[1]?.[0] ?? []);
      const kinds = new Set<number>();
      for (let k = 0; k < data.length;) { const o = data[k]; kinds.add(o); k += o === 0 || o === 1 ? 3 : o === 2 ? 7 : o === 3 ? 5 : 1; }
      const shape = [...kinds].sort().join(',');
      shapes[`ops[${shape}] paint=${paint}`] = (shapes[`ops[${shape}] paint=${paint}`] ?? 0) + 1;
      if (/fill/i.test(paint)) fills[fill] = (fills[fill] ?? 0) + 1;
      if (samples.length < 12 && /fill/i.test(paint)) samples.push({ paint, fill, minMax: args[2] ? Array.from(args[2] as number[]).map(r1) : null, path: data.slice(0, 20).map(r1), len: data.length });
    }
  }
  const labels = items.filter((i: any) => /^\d{1,2}:\d{2}|^(Seg|Ter|Qua|Qui|Sex)|^\d{1,2}([,.]\d)?$/.test(i.s.trim()) && i.x < 200);
  const summary = { page: n, view: page.view, textItems: items.length, ops, paints, fillsOfFilledPaths: fills, pathShapes: shapes, filledPathSamples: samples, labelCandidates: labels.slice(0, 80) };
  result.push(summary);
  console.log(`\n=== página ${n} === textos=${items.length}`);
  console.log('operações:', JSON.stringify(ops));
  console.log('caminhos pintados:', JSON.stringify(paints));
  console.log('formas:', JSON.stringify(shapes));
  console.log('cores de preenchimento:', JSON.stringify(fills));
  console.log('rótulos à esquerda (x<200):', labels.map((l: any) => `${l.s}@(${l.x},${l.y})`).join('  '));
}
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'raw-inspect.json'), JSON.stringify(result, null, 1));
console.log(`\nGerado: ${outDir}/raw-inspect.json`);
