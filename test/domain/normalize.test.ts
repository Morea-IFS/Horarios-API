import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClassCode, findClassCodes, normalizeRoomKey, detectKind } from '../../src/domain/normalize.ts';

test('códigos de turma com variações de símbolo são normalizados', () => {
  assert.equal(normalizeClassCode('3° IELTM-V'), '3º IELTM-V');
  assert.equal(normalizeClassCode('8 ° AU'), '8º AU');
  assert.equal(normalizeClassCode('1° - BEE'), '1º BEE');
  assert.equal(normalizeClassCode('2º LFÍS-V'), '2º LFIS-V');
});

test('turmas diferentes NÃO são fundidas', () => {
  assert.notEqual(normalizeClassCode('3º IELTM-V'), normalizeClassCode('3º IAUT-V'));
});

test('card com várias turmas gera vários códigos', () => {
  assert.deepEqual(findClassCodes('5º LFIS-V/Optativas BSI/8° BEE'), ['5º LFIS-V', 'Optativas BSI', '8° BEE']);
});

test('chave de sala ignora acento, caixa e pontuação', () => {
  assert.equal(normalizeRoomKey('LAB. INFORMÁTICA 02-COINF-S'), 'LAB INFORMATICA 02 COINF S');
  assert.notEqual(normalizeRoomKey('OFICINA SL-01'), normalizeRoomKey('OFICINA'));
});

test('tipos de card', () => {
  assert.equal(detectKind('MONITORIA 3 Química', false), 'MONITORING');
  assert.equal(detectKind('PROJETO DE ENSINO NARRM', false), 'TEACHING_PROJECT');
  assert.equal(detectKind('Extesão TEC. SOLDA', false), 'EXTENSION');
  assert.equal(detectKind('3º IELTM-V Física', true), 'CLASS');
  assert.equal(detectKind('PartiuIF', false), 'OTHER');
});
