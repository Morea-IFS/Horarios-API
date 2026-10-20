import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runSync } from '../../src/domain/sync.ts';
import type { SyncPorts } from '../../src/domain/sync.ts';
import { MemoryStore } from '../helpers/memory-store.ts';
import { makeFixturePdf, DEFAULT_ROOMS } from '../helpers/make-pdf.ts';
import { extractFromPdf } from '../../src/pdf/pdfjs-adapter.ts';

const PAGE = 'https://www.ifs.edu.br/horario-dos-docentes-proen/horario-lagarto.html';
const html = (sem: string) => `<a href="/x/HORARIO_SALAS_${sem}.pdf">Salas</a>`;

type Opts = { sem?: string; bytes?: Uint8Array; failPage?: boolean; failPdf?: boolean; extract?: SyncPorts['extract'] };
function ports(store: MemoryStore, o: Opts): SyncPorts {
  return {
    fetchText: async () => { if (o.failPage) throw new Error('timeout'); return html(o.sem ?? '2026_2'); },
    fetchBytes: async () => { if (o.failPdf) throw new Error('404'); return o.bytes!; },
    extract: o.extract ?? extractFromPdf,
    sha256: (b) => createHash('sha256').update(b).digest('hex'),
    store, now: () => new Date('2026-10-17T12:00:00Z'),
  };
}

const pdfA = await makeFixturePdf();
const pdfB = await makeFixturePdf([...DEFAULT_ROOMS, { name: 'GINÁSIO', cards: [{ day: 2, row: 1, rows: 1, lines: ['Educação Física', '1º IEDF-V', 'Rui Costa'] }] }]);

test('primeira sincronização publica e ativa a grade', async () => {
  const store = new MemoryStore();
  const r = await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfA }));
  assert.equal(r.outcome, 'PUBLISHED');
  assert.equal(store.activeId, 'v1');
  assert.equal(store.runs.length, 1);
});

test('mesmo conteúdo (hash igual): nenhuma mudança', async () => {
  const store = new MemoryStore();
  await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfA }));
  const r = await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfA }));
  assert.equal(r.outcome, 'NO_CHANGE');
  assert.equal(store.versions.length, 1);
});

test('PDF substituído na mesma URL é detectado pelo hash e vira nova versão', async () => {
  const store = new MemoryStore();
  await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfA }));
  const r = await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfB }));
  assert.equal(r.outcome, 'PUBLISHED');
  assert.equal(store.activeId, 'v2');
  assert.equal(store.versions[1].schedule.rooms.length, 4);
});

test('falha ao baixar a página preserva a versão ativa', async () => {
  const store = new MemoryStore();
  await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfA }));
  const r = await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfB, failPage: true }));
  assert.equal(r.outcome, 'FAILED');
  assert.equal(r.errorCode, 'PAGE_DOWNLOAD_FAILED');
  assert.equal(store.activeId, 'v1');
});

test('falha ao baixar o PDF preserva a versão ativa', async () => {
  const store = new MemoryStore();
  await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfA }));
  const r = await runSync({ pageUrl: PAGE }, ports(store, { failPdf: true }));
  assert.equal(r.errorCode, 'PDF_DOWNLOAD_FAILED');
  assert.equal(store.activeId, 'v1');
});

test('falha na extração preserva a versão ativa', async () => {
  const store = new MemoryStore();
  await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfA }));
  const r = await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfB, extract: async () => { throw new Error('PDF corrompido'); } }));
  assert.equal(r.errorCode, 'EXTRACTION_FAILED');
  assert.equal(store.activeId, 'v1');
});

test('PDF que não passa na validação é rejeitado e não substitui nada', async () => {
  const store = new MemoryStore();
  await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfA }));
  const empty = await makeFixturePdf([{ name: 'OFICINA', cards: [] }]);
  const r = await runSync({ pageUrl: PAGE }, ports(store, { bytes: empty }));
  assert.equal(r.outcome, 'REJECTED');
  assert.equal(store.activeId, 'v1');
  assert.ok(r.issues.some((i) => i.severity === 'ERROR'));
});

test('falha ao gravar no banco preserva a versão ativa', async () => {
  const store = new MemoryStore();
  await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfA }));
  store.failPublish = true;
  const r = await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfB }));
  assert.equal(r.errorCode, 'PUBLISH_FAILED');
  assert.equal(store.activeId, 'v1');
});

test('semestre mais antigo que o ativo é rejeitado', async () => {
  const store = new MemoryStore();
  await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfA }));
  const old = await makeFixturePdf(DEFAULT_ROOMS, '2026/1');
  const r = await runSync({ pageUrl: PAGE }, ports(store, { bytes: old, sem: '2026_1' }));
  assert.equal(r.outcome, 'REJECTED');
  assert.ok(r.issues.some((i) => i.code === 'SEMESTER_REGRESSION'));
});

test('arquivo diz 2026_2 mas o PDF diz outro semestre: rejeitado', async () => {
  const store = new MemoryStore();
  const other = await makeFixturePdf(DEFAULT_ROOMS, '2026/1');
  const r = await runSync({ pageUrl: PAGE }, ports(store, { bytes: other }));
  assert.equal(r.outcome, 'REJECTED');
  assert.ok(r.issues.some((i) => i.code === 'SEMESTER_FILENAME_MISMATCH'));
  assert.equal(store.activeId, null);
});

test('dry-run valida mas não grava nada', async () => {
  const store = new MemoryStore();
  const r = await runSync({ pageUrl: PAGE, dryRun: true }, ports(store, { bytes: pdfA }));
  assert.equal(r.outcome, 'DRY_RUN_OK');
  assert.equal(store.versions.length, 0);
  assert.equal(store.runs.length, 0);
});

test('arquivo local é aceito (sem acessar a página)', async () => {
  const store = new MemoryStore();
  const r = await runSync(
    { pageUrl: PAGE, localFile: { path: 'HORARIO_SALAS_2026_2.pdf', bytes: pdfA } },
    ports(store, { failPage: true }),
  );
  assert.equal(r.outcome, 'PUBLISHED');
});

test('sala com nome parecido fica para revisão e não é vinculada', async () => {
  const store = new MemoryStore();
  await runSync({ pageUrl: PAGE }, ports(store, { bytes: pdfA }));
  store.rooms.push({ id: 'rX', normalizedKey: 'OFICINA SL 01', canonicalName: 'OFICINA SL-01' });
  store.rooms = store.rooms.filter((r) => r.normalizedKey !== 'OFICINA');
  const r = await runSync({ pageUrl: PAGE, force: true }, ports(store, { bytes: pdfA }));
  assert.equal(r.outcome, 'PUBLISHED');
  assert.ok(r.issues.some((i) => i.code === 'ROOM_NEEDS_REVIEW' && i.room === 'OFICINA'));
});
