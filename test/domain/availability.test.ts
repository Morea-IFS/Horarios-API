import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAvailability, parseHHmm, weekdayOf } from '../../src/domain/availability.ts';
import { groupByWeekday } from '../../src/domain/schedule-view.ts';

test('dia da semana por data', () => {
  assert.equal(weekdayOf('2026-10-19'), 1); // segunda
  assert.equal(weekdayOf('2026-10-17'), 6); // sábado
  assert.equal(weekdayOf('2026-10-18'), 7); // domingo
  assert.equal(weekdayOf('2026-02-30'), null);
  assert.equal(weekdayOf('19/10/2026'), null);
});

test('horário HH:mm', () => {
  assert.equal(parseHHmm('07:30'), 450);
  assert.equal(parseHHmm('24:00'), null);
  assert.equal(parseHHmm('7:30'), null);
});

const s = [{ roomId: 'A', weekday: 1, startMinute: 450, endMinute: 550, label: 'aula' }];

test('sala ocupada quando a janela sobrepõe a aula', () => {
  const [a, b] = computeAvailability(['A', 'B'], s, 1, 500, 560);
  assert.equal(a.free, false);
  assert.equal(a.conflicts.length, 1);
  assert.equal(b.free, true);
});

test('o fim da aula é exclusivo: pedir a partir de 09:10 encontra a sala livre', () => {
  assert.equal(computeAvailability(['A'], s, 1, 550, 600)[0].free, true);
  assert.equal(computeAvailability(['A'], s, 1, 400, 450)[0].free, true);
  assert.equal(computeAvailability(['A'], s, 1, 400, 451)[0].free, false);
});

test('outro dia da semana não conflita', () => {
  assert.equal(computeAvailability(['A'], s, 2, 450, 550)[0].free, true);
});

test('grade semanal agrupa por dia e ordena por horário', () => {
  const g = groupByWeekday([
    { weekday: 2, startMinute: 600, endMinute: 650 },
    { weekday: 2, startMinute: 450, endMinute: 500 },
    { weekday: 5, startMinute: 450, endMinute: 500 },
  ]);
  assert.deepEqual(g[2].map((x) => x.startMinute), [450, 600]);
  assert.equal(g[1].length, 0);
  assert.equal(g[5].length, 1);
});
