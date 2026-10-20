import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchedule } from '../../src/domain/validate.ts';
import type { ExtractedSchedule, ExtractedSession } from '../../src/domain/types.ts';

const sess = (over: Partial<ExtractedSession> = {}): ExtractedSession => ({
  weekday: 1, startPeriod: '1', endPeriod: '2', startMinute: 450, endMinute: 550, kind: 'CLASS',
  classCodes: ['3º IELTM-V'], classCodesRaw: ['3º IELTM-V'], lines: ['3º IELTM-V', 'Física'], rawText: '3º IELTM-V\nFísica', page: 1, ...over,
});
const sched = (rooms: ExtractedSchedule['rooms'], semester = '2026.2'): ExtractedSchedule => ({
  semester, createdAt: '2026-09-29', issues: [],
  periods: [{ code: '1', sortOrder: 0, startMinute: 450, endMinute: 500 }],
  rooms,
});
const room = (name: string, sessions: ExtractedSession[], page = 1) => ({ rawName: name, normalizedKey: name.toUpperCase(), page, sessions });

test('grade válida passa', () => {
  assert.equal(validateSchedule(sched([room('A', [sess()])]), null).ok, true);
});

test('duplicata exata é removida com aviso; mesmo texto em outro horário é mantido', () => {
  const r = validateSchedule(sched([room('A', [sess(), sess(), sess({ weekday: 3 })])]), null);
  assert.equal(r.ok, true);
  assert.equal(r.schedule.rooms[0].sessions.length, 2);
  assert.equal(r.issues.filter((i) => i.code === 'DUPLICATE_SESSION').length, 1);
});

test('aulas sobrepostas geram aviso, não erro', () => {
  const r = validateSchedule(sched([room('A', [sess(), sess({ startMinute: 500, endMinute: 600, rawText: 'outra', lines: ['outra'] })])]), null);
  assert.equal(r.ok, true);
  assert.ok(r.issues.some((i) => i.code === 'OVERLAP'));
});

test('sala repetida no PDF é erro', () => {
  const r = validateSchedule(sched([room('A', [sess()], 1), room('A', [sess()], 2)]), null);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === 'DUPLICATE_ROOM'));
});

test('dia ou horário inválidos são erro', () => {
  assert.equal(validateSchedule(sched([room('A', [sess({ weekday: 6 })])]), null).ok, false);
  assert.equal(validateSchedule(sched([room('A', [sess({ startMinute: 600, endMinute: 500 })])]), null).ok, false);
});

test('sem aulas em nenhuma sala é erro; sem salas é erro; semestre inválido é erro', () => {
  assert.equal(validateSchedule(sched([room('A', [])]), null).ok, false);
  assert.equal(validateSchedule(sched([]), null).ok, false);
  assert.equal(validateSchedule(sched([room('A', [sess()])], '2026-2'), null).ok, false);
});

test('queda brusca em relação à versão anterior é erro', () => {
  const r = validateSchedule(sched([room('A', [sess()])]), { roomCount: 60, sessionCount: 400 });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === 'ROOM_COUNT_DROP'));
});

test('erros vindos da extração impedem a aprovação', () => {
  const s = sched([room('A', [sess()])]);
  s.issues.push({ severity: 'ERROR', code: 'CARD_MISALIGNED', message: 'x' });
  assert.equal(validateSchedule(s, null).ok, false);
});
