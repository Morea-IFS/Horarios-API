import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRoom } from '../../src/domain/room-matcher.ts';
import { normalizeRoomKey } from '../../src/domain/normalize.ts';

const known = ['OFICINA SL-01', 'OFICINA- SL 02', 'SALA 01-BL02-S'].map((n, i) => ({
  id: `r${i}`, canonicalName: n, normalizedKey: normalizeRoomKey(n),
}));

test('nome idêntico após normalização vincula automaticamente', () => {
  const m = matchRoom('Sala 01 - BL02-S', known);
  assert.deepEqual(m, { status: 'EXACT', roomId: 'r2' });
});

test('nome parecido NÃO é vinculado: vai para revisão', () => {
  const m = matchRoom('OFICINA', known);
  assert.equal(m.status, 'NEEDS_REVIEW');
  if (m.status === 'NEEDS_REVIEW') assert.ok(m.candidates.length >= 1);
});

test('nome sem parecido é sala nova', () => {
  assert.deepEqual(matchRoom('GINÁSIO', known), { status: 'NEW' });
});
