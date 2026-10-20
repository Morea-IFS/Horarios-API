import test from 'node:test';
import assert from 'node:assert/strict';
import { findRoomPdfCandidates, pickLatest } from '../../src/domain/discovery.ts';

const PAGE = 'https://www.ifs.edu.br/horario-dos-docentes-proen/horario-lagarto.html';
// HTML sintético imitando as inconsistências observadas: rótulo de um semestre apontando para arquivo de outro
const html = `
<h3>2026.2</h3>
<a href="/images/arquivos/Proen/horarios/lagarto/HORARIO_SALAS_2026_2.pdf">Salas</a>
<h3>2025.2</h3>
<a href="/images/arquivos/Proen/HORARIO_SALAS_2026_1.pdf">Salas</a>
<h3>2025.1</h3>
<a href='https://www.ifs.edu.br/images/arquivos/Proen/HORARIO_SALAS_2025_2.pdf'>Salas</a>
<a href="/images/arquivos/Proen/HORARIO_DOCENTES_2026_1.pdf">Docentes</a>
`;

test('encontra apenas PDFs de salas e resolve URLs relativas', () => {
  const c = findRoomPdfCandidates(html, PAGE);
  assert.equal(c.length, 3);
  assert.ok(c.every((x) => x.url.startsWith('https://www.ifs.edu.br/')));
  assert.ok(!c.some((x) => x.filename.includes('DOCENTES')));
});

test('escolhe o semestre mais recente pelo arquivo, ignorando o rótulo da página', () => {
  assert.equal(pickLatest(findRoomPdfCandidates(html, PAGE))?.semester, '2026.2');
});

test('sem candidatos retorna null', () => {
  assert.equal(pickLatest(findRoomPdfCandidates('<p>nada</p>', PAGE)), null);
});

test('mesma URL repetida conta uma vez', () => {
  const dup = html + html;
  assert.equal(findRoomPdfCandidates(dup, PAGE).length, 3);
});
