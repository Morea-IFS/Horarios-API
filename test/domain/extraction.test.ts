import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeFixturePdf, DEFAULT_ROOMS } from '../helpers/make-pdf.ts';
import { extractFromPdf } from '../../src/pdf/pdfjs-adapter.ts';
import { extractSchedule } from '../../src/domain/grid.ts';
import { validateSchedule } from '../../src/domain/validate.ts';
import type { PageGeometry } from '../../src/domain/types.ts';

// ---------- PÁGINAS REAIS do PDF 2026.2 (1, 2, 4, 15, 18, 26, 28, 32, 42 e 63): texto + linhas desenhadas ----------
const real: PageGeometry[] = JSON.parse(fs.readFileSync(new URL('../fixtures/real-pages-2026-2.json', import.meta.url), 'utf8'));
const realSchedule = extractSchedule(real);
const room = (page: number) => realSchedule.rooms.find((r) => r.page === page)!;
const at = (page: number, weekday: number, startPeriod: string) =>
  room(page).sessions.find((s) => s.weekday === weekday && s.startPeriod === startPeriod)!;

test('REAL: semestre, data de criação e os 15 períodos (incluindo "5,5")', () => {
  assert.equal(realSchedule.semester, '2026.2');
  assert.equal(realSchedule.createdAt, '2026-09-29');
  assert.equal(realSchedule.periods.length, 15);
  assert.deepEqual(realSchedule.periods[5], { code: '5,5', sortOrder: 5, startMinute: 710, endMinute: 760 });
  assert.deepEqual(realSchedule.periods[2], { code: '3', sortOrder: 2, startMinute: 550, endMinute: 600 });
});

test('REAL: nomes das salas e nenhum erro de extração', () => {
  assert.deepEqual(realSchedule.rooms.map((r) => r.page), [1, 2, 4, 15, 18, 26, 28, 32, 42, 63]);
  assert.equal(room(1).rawName, 'Ateliê de desenho 01');
  assert.equal(room(4).rawName, 'SALA 01-BL02-S');
  assert.equal(room(28).rawName, 'LAB. INFORMÁTICA 04-COINF-S');
  assert.deepEqual(realSchedule.issues.filter((i) => i.severity === 'ERROR'), []);
  const stats = realSchedule.issues.find((i) => i.code === 'EXTRACTION_STATS')!.context as { strayLines: number };
  assert.equal(stats.strayLines, 0);
});

test('REAL: quantidade de aulas por página', () => {
  const expected: Record<number, number> = { 1: 8, 2: 11, 4: 23, 15: 9, 18: 16, 26: 15, 28: 16, 32: 6, 42: 11, 63: 7 };
  for (const [page, n] of Object.entries(expected)) assert.equal(room(Number(page)).sessions.length, n, `página ${page}`);
});

test('REAL: cards de 1, 2, 3 e 4 períodos têm início e fim corretos', () => {
  const one = at(4, 5, '6');                                   // SMST, 1 período
  assert.deepEqual([one.endPeriod, one.startMinute, one.endMinute], ['6', 780, 830]);
  const two = at(4, 1, '1');                                   // Filosofia II, 2 períodos
  assert.deepEqual([two.endPeriod, two.startMinute, two.endMinute], ['2', 450, 550]);
  const three = at(4, 2, '7');                                 // Introdução a algoritmos, 3 períodos
  assert.deepEqual([three.endPeriod, three.startMinute, three.endMinute], ['9', 830, 1000]);
  const four = at(4, 3, '11');                                 // Projeto Integrador II, 4 períodos (noite inteira)
  assert.deepEqual([four.endPeriod, four.startMinute, four.endMinute], ['14', 1140, 1340]);
});

test('REAL: disciplina com título quebrado em duas linhas e dois docentes na mesma linha', () => {
  const wrapped = at(4, 3, '5');
  assert.equal(wrapped.endPeriod, '5,5');
  assert.equal(wrapped.lines.length, 4);
  assert.deepEqual(wrapped.classCodes, ['7º LFIS-V']);
  const two = at(28, 3, '1');
  assert.ok(two.rawText.includes('Duilio Almeida / Raphael Calazans'));
});

test('REAL: variações de símbolo nas turmas ("8 ° AU", "4°AU") viram códigos normalizados', () => {
  assert.deepEqual(at(1, 4, '8').classCodes, ['4º AU']);   // "4°AU"
  assert.deepEqual(at(1, 3, '9').classCodes, ['8º AU']);   // "8 ° AU"
  assert.deepEqual(at(4, 4, '8').classCodes, ['2º BEE', 'OPTATIVAS BSI']);
});

test('REAL: mesmo texto em horários diferentes são aulas diferentes; nada se sobrepõe', () => {
  const fis = room(4).sessions.filter((s) => s.lines[0] === 'Fis. Ger e Exp. I' && s.weekday === 1);
  assert.deepEqual(fis.map((s) => s.startPeriod), ['11', '13']);
  const v = validateSchedule(realSchedule, null);
  assert.equal(v.ok, true);
  assert.ok(!v.issues.some((i) => i.code === 'OVERLAP' || i.code === 'DUPLICATE_SESSION'));
});

test('REAL: texto de dia da semana dentro de disciplina não é confundido com cabeçalho ("Termodinâmica")', () => {
  assert.ok(room(4).sessions.some((s) => s.lines[0] === 'Termodinâmica'));
});

// ---------- PDF SINTÉTICO (testa a leitura do arquivo PDF de ponta a ponta) ----------
test('SINTÉTICO: do arquivo PDF até a grade', async () => {
  const s = await extractFromPdf(await makeFixturePdf());
  assert.equal(s.semester, '2026.2');
  assert.deepEqual(s.issues.filter((i) => i.severity === 'ERROR'), [], JSON.stringify(s.issues));
  assert.deepEqual(s.rooms.map((r) => r.rawName), ['Ateliê de desenho 01', 'SALA 01-BL02-S', 'OFICINA']);
  const a = s.rooms[0].sessions[0];
  assert.deepEqual([a.weekday, a.startPeriod, a.endPeriod, a.startMinute, a.endMinute], [1, '1', '2', 450, 550]);
  assert.equal(s.rooms[2].sessions.length, 0); // sala sem aulas é válida
  const multi = s.rooms[1].sessions.find((x) => x.weekday === 3)!;
  assert.deepEqual([multi.startPeriod, multi.endPeriod], ['11', '14']);
  assert.deepEqual(multi.classCodes, ['5º LFIS-V', 'OPTATIVAS BSI', '8º BEE']);
  const wrapped = s.rooms[1].sessions.find((x) => x.weekday === 4)!;
  assert.deepEqual([wrapped.startPeriod, wrapped.endPeriod, wrapped.lines.length], ['6', '8', 4]);
  const sex = s.rooms[1].sessions.filter((x) => x.weekday === 5).map((x) => [x.startPeriod, x.endPeriod]);
  assert.deepEqual(sex, [['6', '6'], ['7', '8']]);
});

test('SINTÉTICO: PDF sem a grade esperada falha fechado (erro, nada inventado)', async () => {
  const { PDFDocument } = await import('pdf-lib');
  const d = await PDFDocument.create();
  d.addPage([842, 595]);
  const s = await extractFromPdf(new Uint8Array(await d.save()));
  assert.ok(s.issues.some((i) => i.severity === 'ERROR'));
  assert.equal(s.rooms.length, 0);
});

// ---------- CARDS FORA DO PADRÃO "disciplina + turma + docente" (antes davam CARD_PARSE / CARD_MISALIGNED) ----------
test('REAL: dois cards idênticos colados (Olimpíada de Química) ficam separados pela linha divisória', () => {
  const a = at(2, 2, '7');
  const b = at(2, 2, '9');
  assert.deepEqual([a.endPeriod, b.endPeriod], ['8', '10']);
  assert.equal(a.kind, 'TEACHING_PROJECT');
  assert.deepEqual(a.classCodes, []);
});

test('REAL: card sem docente e card sem turma são lidos pelo que o PDF mostra', () => {
  const noTeacher = at(42, 1, '6');
  assert.deepEqual([noTeacher.endPeriod, noTeacher.lines], ['7', ['Fìsica Mod. III', '8° LFIS-V']]);
  const ead = at(15, 2, '6');
  assert.deepEqual([ead.endPeriod, ead.kind, ead.lines[0]], ['10', 'OTHER', 'partiuIF']);
  assert.ok(realSchedule.issues.some((i) => i.code === 'CARD_UNCLASSIFIED' && i.page === 15 && i.severity === 'WARNING'));
});

test('REAL: projetos de extensão e monitorias têm o tipo certo', () => {
  assert.equal(at(63, 3, '6').kind, 'EXTENSION');
  assert.equal(at(63, 3, '6').endPeriod, '10');
  assert.equal(at(18, 5, '1').kind, 'MONITORING');
});

test('REAL: cards com fonte minúscula (encolhidos pelo aSc) são lidos, inclusive com 5 períodos', () => {
  const tiny = at(32, 1, '6');
  assert.deepEqual([tiny.endPeriod, tiny.lines], ['10', ['IFSKART', 'Clayton']]);
  const mon = at(18, 1, '5,5');
  assert.deepEqual([mon.endPeriod, mon.lines], ['5,5', ['Monitoria-Revit']]);
  const pi = at(26, 1, '7');
  assert.deepEqual([pi.endPeriod, pi.classCodes], ['7', ['3º IAUT']]);
});

test('REAL: dois cards de 1 período empilhados na mesma coluna não se fundem', () => {
  assert.deepEqual(room(26).sessions.filter((s) => s.weekday === 3).map((s) => [s.startPeriod, s.endPeriod]), [['1', '1'], ['2', '2'], ['9', '10']]);
});

// ---------- FALHAR FECHADO ----------
test('página sem nenhuma linha desenhada gera ERRO (não adivinha os cards)', () => {
  const broken = structuredClone(real.slice(0, 1));
  broken[0].hlines = [];
  const s = extractSchedule(broken);
  assert.ok(s.issues.some((i) => i.severity === 'ERROR' && i.code === 'GRID_LINES_NOT_FOUND'));
  assert.equal(s.rooms.length, 0);
});

test('texto em cima de uma linha divisória gera ERRO (card ambíguo)', () => {
  const broken = structuredClone(real.slice(0, 1));
  const boundary = broken[0].hlines.filter((l) => l.x2 - l.x1 > 100).map((l) => l.y).sort((a, b) => b - a)[5]; // uma divisão entre períodos, no meio da grade
  broken[0].items.splice(3, 0, { str: 'Texto na linha', x: 130, y: boundary - 3, w: 80, h: 9 });
  const s = extractSchedule(broken);
  assert.ok(s.issues.some((i) => i.severity === 'ERROR' && i.code === 'CARD_TEXT_ON_BORDER'));
});

test('linha divisória removida junta dois cards em UM (a delimitação depende das linhas desenhadas)', () => {
  const pg = structuredClone(real.filter((p) => p.page === 2));
  const titles = pg[0].items.filter((i) => i.str === 'Olimpíada de Química').map((i) => i.y).sort((a, b) => b - a);
  assert.equal(titles.length, 2);
  const x = pg[0].items.find((i) => i.str === 'Olimpíada de Química')!.x;
  const between = (l: { x1: number; x2: number; y: number }) => l.y < titles[0] && l.y > titles[1] && l.x1 <= x && l.x2 >= x;
  assert.equal(pg[0].hlines.filter(between).length, 1);
  pg[0].hlines = pg[0].hlines.filter((l) => !between(l));
  const merged = extractSchedule(pg).rooms[0].sessions.filter((s) => s.weekday === 2);
  assert.deepEqual(merged.map((s) => [s.startPeriod, s.endPeriod, s.lines.length]), [['2', '5', 3], ['7', '10', 6]]);
});

test('sanidade do fixture', () => {
  assert.equal(DEFAULT_ROOMS.length, 3);
});
