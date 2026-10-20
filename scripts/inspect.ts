// Diagnóstico do PDF: mostra o que a extração enxerga, página por página.
// Uso: node scripts/inspect.ts HORARIO_SALAS_2026_2.pdf [--pages=1,4,28] [--out=out]
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { extractSchedule } from '../src/domain/grid.ts';
import { loadPageGeometries } from '../src/pdf/pdfjs-adapter.ts';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const opt = (n: string, d: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
if (!file) { console.error('Uso: node scripts/inspect.ts <arquivo.pdf> [--pages=1,4] [--out=out]'); process.exit(1); }

const bytes = new Uint8Array(await fs.readFile(file));
const pages = await loadPageGeometries(bytes);
const schedule = extractSchedule(pages);
const outDir = opt('out', 'out');
await fs.mkdir(outDir, { recursive: true });
const selected = new Set(opt('pages', '1,4,28').split(',').map(Number));

console.log(`Arquivo: ${path.basename(file)}  sha256=${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}…`);
console.log(`Páginas: ${pages.length} | Salas extraídas: ${schedule.rooms.length} | Semestre: ${schedule.semester} | Criado: ${schedule.createdAt}`);
console.log(`Períodos: ${schedule.periods.map((p) => p.code).join(' ')}`);
for (const r of schedule.rooms) console.log(`  p${String(r.page).padStart(2)}  ${r.rawName.padEnd(52)} aulas=${r.sessions.length}`);
const bad = schedule.issues.filter((i) => i.severity !== 'INFO');
console.log(`\nProblemas: ${bad.length}`);
for (const i of bad.slice(0, 60)) {
  console.log(`  ${i.severity} ${i.code} p.${i.page ?? '-'} ${i.room ? `[${i.room}] ` : ''}${i.message}`);
  const lines = (i.context as { lines?: string[] } | undefined)?.lines;
  if (lines) console.log(`        texto: ${JSON.stringify(lines)}`);
}
if (bad.length > 60) console.log(`  ... mais ${bad.length - 60} (veja out/extraction.json)`);

await fs.writeFile(path.join(outDir, 'extraction.json'), JSON.stringify(schedule, null, 1));
await fs.writeFile(
  path.join(outDir, 'pages-selected.json'),
  JSON.stringify(pages.filter((p) => selected.has(p.page)).map((p) => ({ ...p, items: [...p.items], rects: p.rects })), null, 1),
);
console.log(`\nGerado: ${outDir}/extraction.json e ${outDir}/pages-selected.json`);
