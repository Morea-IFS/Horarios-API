// Testes dos endpoints com repositório em memória (não precisam de banco).
// Executar: npm run test:e2e   (compila e roda; requer `npm install`)
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module.ts';
import { configureApp } from '../../src/app.setup.ts';
import { PrismaService } from '../../src/persistence/prisma.service.ts';
import { ScheduleReadRepository } from '../../src/persistence/schedule.repository.ts';
import type { CurrentSchedule, RoomRow, SessionRow } from '../../src/persistence/schedule.repository.ts';

const ROOM_A = '11111111-1111-4111-8111-111111111111';
const ROOM_B = '22222222-2222-4222-8222-222222222222';
const rooms: RoomRow[] = [
  { id: ROOM_A, name: 'SALA 01-BL02-S', externalIds: [] },
  { id: ROOM_B, name: 'LAB. FÍSICA BÁSICA', externalIds: [{ system: 'MERO', externalId: '7' }] },
];
const sessions: SessionRow[] = [
  { roomId: ROOM_A, weekday: 1, startPeriod: '1', endPeriod: '2', startMinute: 450, endMinute: 550, kind: 'CLASS', classCodes: ['2º LFIS-V'], lines: ['2º LFÍS-V', 'Física I'] },
  { roomId: ROOM_A, weekday: 1, startPeriod: '7', endPeriod: '8', startMinute: 830, endMinute: 930, kind: 'CLASS', classCodes: ['3º BSI-N'], lines: ['Programação Web I', '3º BSI-N', 'George Leite'] },
  { roomId: ROOM_B, weekday: 3, startPeriod: '3', endPeriod: '4', startMinute: 550, endMinute: 660, kind: 'MONITORING', classCodes: [], lines: ['Monitoria - Matemática', 'MONITORIA 1'] },
];
const current: CurrentSchedule = {
  versionId: 'v1', semester: '2026.2', pdfCreatedAt: '2026-09-29', sourceUrl: 'https://exemplo/HORARIO_SALAS_2026_2.pdf',
  contentSha256: 'abc', activatedAt: new Date('2026-10-01T00:00:00Z'), roomCount: 2, sessionCount: 3,
};

class FakeRepo extends ScheduleReadRepository {
  constructor(private readonly hasData: boolean, private readonly dbUp = true) { super(); }
  async getCurrent() { return this.hasData ? current : null; }
  async allRooms(_v: string, q?: string) { return rooms.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())); }
  async listRooms(v: string, q: string | undefined, skip: number, take: number) {
    const all = await this.allRooms(v, q);
    return { rows: all.slice(skip, skip + take), total: all.length };
  }
  async getRoom(_v: string, id: string) { return rooms.find((r) => r.id === id) ?? null; }
  async listSessions(_v: string, f: { roomId?: string; weekday?: number }) {
    return sessions.filter((s) => (!f.roomId || s.roomId === f.roomId) && (!f.weekday || s.weekday === f.weekday));
  }
  async listPeriods() { return [{ code: '1', sortOrder: 1, startMinute: 450, endMinute: 500 }, { code: '5,5', sortOrder: 6, startMinute: 710, endMinute: 760 }]; }
  async getLastRun() { return { outcome: 'PUBLISHED', finishedAt: new Date('2026-10-01T00:05:00Z'), errorCode: null }; }
  async ping() { if (!this.dbUp) throw new Error('down'); }
}

async function start(repo: ScheduleReadRepository): Promise<{ app: INestApplication; base: string }> {
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService).useValue({ $connect: async () => {}, $disconnect: async () => {} })
    .overrideProvider(ScheduleReadRepository).useValue(repo)
    .compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.listen(0);
  const addr = app.getHttpServer().address() as { port: number };
  return { app, base: `http://127.0.0.1:${addr.port}/api/v1` };
}

test('GET /rooms lista, pagina e filtra', async () => {
  const { app, base } = await start(new FakeRepo(true));
  try {
    const r = await fetch(`${base}/rooms?pageSize=1`);
    assert.equal(r.status, 200);
    const body = await r.json() as { data: unknown[]; meta: { total: number; totalPages: number; semester: string } };
    assert.equal(body.data.length, 1);
    assert.equal(body.meta.total, 2);
    assert.equal(body.meta.totalPages, 2);
    assert.equal(body.meta.semester, '2026.2');
    const f = await (await fetch(`${base}/rooms?q=lab`)).json() as { data: { name: string }[] };
    assert.deepEqual(f.data.map((x) => x.name), ['LAB. FÍSICA BÁSICA']);
  } finally { await app.close(); }
});

test('GET /rooms valida parâmetros (400)', async () => {
  const { app, base } = await start(new FakeRepo(true));
  try {
    assert.equal((await fetch(`${base}/rooms?page=0`)).status, 400);
    assert.equal((await fetch(`${base}/rooms?pageSize=1000`)).status, 400);
    assert.equal((await fetch(`${base}/rooms?naoExiste=1`)).status, 400);
  } finally { await app.close(); }
});

test('GET /rooms/:id/schedule: grade semanal, 404 e 400', async () => {
  const { app, base } = await start(new FakeRepo(true));
  try {
    const r = await fetch(`${base}/rooms/${ROOM_A}/schedule`);
    assert.equal(r.status, 200);
    const body = await r.json() as { days: { weekday: number; sessions: { startTime: string; endTime: string }[] }[]; forecastOnly: boolean };
    assert.equal(body.days.length, 5);
    assert.deepEqual([body.days[0].sessions[0].startTime, body.days[0].sessions[0].endTime], ['07:30', '09:10']);
    assert.equal(body.forecastOnly, true);
    const one = await (await fetch(`${base}/rooms/${ROOM_A}/schedule?weekday=2`)).json() as { days: unknown[] };
    assert.equal(one.days.length, 1);
    assert.equal((await fetch(`${base}/rooms/33333333-3333-4333-8333-333333333333/schedule`)).status, 404);
    assert.equal((await fetch(`${base}/rooms/nao-e-uuid/schedule`)).status, 400);
    assert.equal((await fetch(`${base}/rooms/${ROOM_A}/schedule?weekday=7`)).status, 400);
  } finally { await app.close(); }
});

test('GET /availability: ocupada, livre, fim exclusivo, validação', async () => {
  const { app, base } = await start(new FakeRepo(true));
  try {
    const busy = await (await fetch(`${base}/availability?date=2026-10-19&start=08:00&end=09:00`)).json() as { data: { room: { id: string }; free: boolean }[] };
    assert.equal(busy.data.find((d) => d.room.id === ROOM_A)!.free, false);
    assert.equal(busy.data.find((d) => d.room.id === ROOM_B)!.free, true);
    const edge = await (await fetch(`${base}/availability?date=2026-10-19&start=09:10&end=10:00&onlyFree=true`)).json() as { data: unknown[] };
    assert.equal(edge.data.length, 2);
    const weekend = await (await fetch(`${base}/availability?date=2026-10-17&start=08:00&end=09:00`)).json() as { data: { free: boolean }[] };
    assert.ok(weekend.data.every((d) => d.free));
    assert.equal((await fetch(`${base}/availability?date=19-10-2026&start=08:00&end=09:00`)).status, 400);
    assert.equal((await fetch(`${base}/availability?date=2026-10-19&start=8:00&end=09:00`)).status, 400);
    assert.equal((await fetch(`${base}/availability?date=2026-10-19&start=09:00&end=08:00`)).status, 422);
    assert.equal((await fetch(`${base}/availability?date=2026-02-30&start=08:00&end=09:00`)).status, 422);
    assert.equal((await fetch(`${base}/availability?start=08:00&end=09:00`)).status, 400);
  } finally { await app.close(); }
});

test('GET /metadata/current e /health', async () => {
  const { app, base } = await start(new FakeRepo(true));
  try {
    const m = await (await fetch(`${base}/metadata/current`)).json() as { schedule: { semester: string }; lastSync: { outcome: string } };
    assert.equal(m.schedule.semester, '2026.2');
    assert.equal(m.lastSync.outcome, 'PUBLISHED');
    assert.equal((await fetch(`${base}/health`)).status, 200);
  } finally { await app.close(); }
});

test('sem grade importada: 503; banco fora: /health 503', async () => {
  const empty = await start(new FakeRepo(false));
  try {
    assert.equal((await fetch(`${empty.base}/rooms`)).status, 503);
    assert.equal((await fetch(`${empty.base}/metadata/current`)).status, 503);
  } finally { await empty.app.close(); }
  const down = await start(new FakeRepo(true, false));
  try { assert.equal((await fetch(`${down.base}/health`)).status, 503); } finally { await down.app.close(); }
});

test('limite de requisições devolve 429', async () => {
  process.env.RATE_LIMIT_PER_MINUTE = '3';
  const { app, base } = await start(new FakeRepo(true));
  try {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await fetch(`${base}/rooms`)).status);
    assert.ok(codes.includes(429), `códigos: ${codes.join(',')}`);
  } finally { delete process.env.RATE_LIMIT_PER_MINUTE; await app.close(); }
});

test('GET /sessions busca por texto (sem acento), turma, sala e dia', async () => {
  const { app, base } = await start(new FakeRepo(true));
  try {
    type Body = { data: { room: { name: string }; weekday: number; startTime: string; endTime: string; lines: string[] }[]; meta: { total: number } };
    const get = async (qs: string) => (await (await fetch(`${base}/sessions?${qs}`)).json()) as Body;

    const all = await get('');
    assert.equal(all.meta.total, 3);
    assert.deepEqual(all.data.map((x) => [x.weekday, x.startTime]), [[1, '07:30'], [1, '13:50'], [3, '09:10']]); // ordenado por dia e hora

    const fisica = await get(`q=${encodeURIComponent('fisica')}`); // sem acento acha "Física"
    assert.equal(fisica.meta.total, 1);
    assert.equal(fisica.data[0].room.name, 'SALA 01-BL02-S');

    const docente = await get('q=george%20leite');
    assert.equal(docente.data[0].lines[0], 'Programação Web I');

    assert.equal((await get('q=web%20zzz')).meta.total, 0); // todas as palavras precisam aparecer
    assert.equal((await get(`classCode=${encodeURIComponent('3° bsi-n')}`)).meta.total, 1); // normaliza a turma
    assert.equal((await get('weekday=3')).data[0].room.name, 'LAB. FÍSICA BÁSICA');
    assert.equal((await get(`roomId=${ROOM_A}`)).meta.total, 2);
    assert.equal((await fetch(`${base}/sessions?weekday=9`)).status, 400);
    assert.equal((await fetch(`${base}/sessions?roomId=abc`)).status, 400);
  } finally { await app.close(); }
});

test('GET /classes e GET /periods', async () => {
  const { app, base } = await start(new FakeRepo(true));
  try {
    const c = await (await fetch(`${base}/classes`)).json() as { data: { code: string; course: string; period: number; shift: string; sessionCount: number }[] };
    assert.deepEqual(c.data.map((x) => [x.code, x.course, x.period, x.shift, x.sessionCount]), [['3º BSI-N', 'BSI', 3, 'N', 1], ['2º LFIS-V', 'LFIS', 2, 'V', 1]]);
    const p = await (await fetch(`${base}/periods`)).json() as { data: { code: string; startTime: string; endTime: string }[] };
    assert.deepEqual(p.data.map((x) => [x.code, x.startTime, x.endTime]), [['1', '07:30', '08:20'], ['5,5', '11:50', '12:40']]);
  } finally { await app.close(); }
});

test('GET /availability informa até quando a sala fica livre (freeUntil)', async () => {
  const { app, base } = await start(new FakeRepo(true));
  try {
    type Body = { data: { room: { name: string }; free: boolean; freeUntil: string | null }[] };
    // segunda 2026-10-19, 09:20-11:00: A está livre (aulas 07:30-09:10 e 13:50-15:30) -> livre até 13:50; B sem aula na segunda -> o dia todo
    const r = await (await fetch(`${base}/availability?date=2026-10-19&start=09:20&end=11:00`)).json() as Body;
    const byName = Object.fromEntries(r.data.map((x) => [x.room.name, x]));
    assert.deepEqual([byName['SALA 01-BL02-S'].free, byName['SALA 01-BL02-S'].freeUntil], [true, '13:50']);
    assert.deepEqual([byName['LAB. FÍSICA BÁSICA'].free, byName['LAB. FÍSICA BÁSICA'].freeUntil], [true, null]);
    // ocupada: sem freeUntil
    const busy = await (await fetch(`${base}/availability?date=2026-10-19&start=08:00&end=09:00`)).json() as Body;
    assert.deepEqual(busy.data.filter((x) => !x.free).map((x) => [x.room.name, x.freeUntil]), [['SALA 01-BL02-S', null]]);
  } finally { await app.close(); }
});
