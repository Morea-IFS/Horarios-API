import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesAllTokens, parseClassCode, searchKey } from '../../src/domain/class-code.ts';

test('turma: curso, período e turno', () => {
  assert.deepEqual(parseClassCode('3º IRC-V'), { code: '3º IRC-V', course: 'IRC', period: 3, shift: 'V', optional: false });
  assert.deepEqual(parseClassCode('10º AU'), { code: '10º AU', course: 'AU', period: 10, shift: null, optional: false });
  assert.deepEqual(parseClassCode('2º BSI-N'), { code: '2º BSI-N', course: 'BSI', period: 2, shift: 'N', optional: false });
});

test('turma: optativas e códigos desconhecidos', () => {
  assert.deepEqual(parseClassCode('OPTATIVAS BSI'), { code: 'OPTATIVAS BSI', course: 'BSI', period: null, shift: null, optional: true });
  assert.equal(parseClassCode('XYZ').course, 'XYZ');
});

test('busca: sem acento, qualquer ordem, todas as palavras', () => {
  assert.equal(searchKey('Física Mód. III'), 'fisica mod iii');
  assert.ok(matchesAllTokens('Fìsica Mod. III / 8° LFIS-V', 'fisica lfis'));
  assert.ok(matchesAllTokens('Programação Web I', 'WEB programacao'));
  assert.ok(!matchesAllTokens('Programação Web I', 'web java'));
  assert.ok(matchesAllTokens('qualquer coisa', '   '));
});
