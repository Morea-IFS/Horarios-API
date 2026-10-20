// Gera um PDF SINTÉTICO que imita o leiaute REAL medido no PDF do IFS (aSc TimeTables):
// cards sem retângulo (apenas texto: disciplina, turma, docente); em cada coluna só existem as linhas
// horizontais ENTRE cards (como no aSc TimeTables: dentro de um card de vários períodos não há linha).
// Os horários abaixo são fictícios e servem só para testar o pipeline PDF -> geometria -> grade.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const FIXTURE_PERIODS: [string, string][] = [
  ['1', '07:30 - 08:20'], ['2', '08:20 - 09:10'], ['3', '09:10 - 10:00'], ['4', '10:10 - 11:00'],
  ['5', '11:00 - 11:50'], ['5,5', '11:50 - 12:40'], ['6', '13:00 - 13:50'], ['7', '13:50 - 14:40'],
  ['8', '14:40 - 15:30'], ['9', '15:50 - 16:40'], ['10', '16:40 - 17:30'], ['11', '19:00 - 19:50'],
  ['12', '19:50 - 20:40'], ['13', '20:40 - 21:30'], ['14', '21:30 - 22:20'],
];

/** row: primeira linha da grade (1 = período "1"); rows: quantas linhas o card ocupa; lines: disciplina..., turma, docente. */
export type FixtureCard = { day: number; row: number; rows: number; lines: string[] };
export type FixtureRoom = { name: string; cards: FixtureCard[] };

export const DEFAULT_ROOMS: FixtureRoom[] = [
  {
    name: 'Ateliê de desenho 01',
    cards: [
      { day: 1, row: 1, rows: 2, lines: ['Física I', '2º LFÍS-V', 'Ana Souza'] },
      { day: 2, row: 3, rows: 1, lines: ['Tecn. Mecânica', '3° IELTM-V', 'G2 Alcides Lima'] },
    ],
  },
  {
    name: 'SALA 01-BL02-S',
    cards: [
      { day: 3, row: 12, rows: 4, lines: ['Métodos', '5º LFIS-V/Optativas BSI/8° BEE', 'Bruno Reis'] },
      { day: 4, row: 7, rows: 3, lines: ['Instrumentação para o ensino de', 'física III', '7º LFIS-V', 'Carla Dias'] },
      { day: 5, row: 7, rows: 1, lines: ['Ética', '9 ° AU', 'Carla Dias'] },
      { day: 5, row: 8, rows: 2, lines: ['Ética', '9 ° AU', 'Carla Dias'] },
    ],
  },
  { name: 'OFICINA', cards: [] },
];

export async function makeFixturePdf(rooms: FixtureRoom[] = DEFAULT_ROOMS, semester = '2026/2'): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const left = 93.6, colW = 147.3, pitch = 30.36, row1Center = 467.4;
  const centerY = (f: number) => row1Center - (f - 1) * pitch; // f em unidades de linha (1 = centro da linha 1)
  for (const room of rooms) {
    const p = doc.addPage([842, 595]);
    // texto posicionado pelo CENTRO vertical (como o extrator mede): baseline = centro - tamanho/2
    const t = (s: string, x: number, cyPos: number, size = 8.5) => p.drawText(s, { x, y: cyPos - size / 2, size, font });
    const tc = (s: string, xCenter: number, cyPos: number, size = 8.5) => t(s, xCenter - font.widthOfTextAtSize(s, size) / 2, cyPos, size);
    t('Instituto Federal de Sergipe, Campus Lagarto, SE', 11.88, 543, 9);
    t('Horário criado:29/09/2026', 11.88, 25.8, 9);
    t('aSc TimeTables', 763, 25.8, 9);
    // linhas horizontais por coluna: todas as divisões, exceto as que ficam DENTRO de um card
    const top = row1Center + pitch / 2;
    for (let col = 1; col <= 5; col++) {
      for (let k = 0; k <= FIXTURE_PERIODS.length; k++) {
        const inside = room.cards.some((c) => c.day === col && c.row <= k && k <= c.row + c.rows - 2);
        if (inside) continue;
        const y = top - k * pitch;
        p.drawLine({ start: { x: left + (col - 1) * colW, y }, end: { x: left + col * colW, y }, thickness: 0.5, color: rgb(0, 0, 0) });
      }
    }
    for (let c = 0; c <= 5; c++) {
      p.drawLine({ start: { x: left + c * colW, y: row1Center + pitch / 2 }, end: { x: left + c * colW, y: row1Center + pitch / 2 - FIXTURE_PERIODS.length * pitch }, thickness: 0.5, color: rgb(0, 0, 0) });
    }
    ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].forEach((d, i) => tc(d, left + (i + 0.5) * colW, 513.5, 18));
    FIXTURE_PERIODS.forEach(([code, time], r) => {
      const c = centerY(r + 1);
      tc(code, 52.6, c + 4.8, 13);
      tc(time, 52.7, c - 4.8, 7.9);
    });
    for (const c of room.cards) {
      // bloco de texto centralizado no card: 1ª linha no topo, turma no CENTRO, docente embaixo (como no PDF real)
      const mid = c.row + (c.rows - 1) / 2; // centro do card, em unidades de linha
      const E = 0.9 * c.rows - 0.38; // distância 1ª -> última linha de texto, em unidades de linha
      const fFirst = mid - E / 2;
      const fLast = mid + E / 2;
      const nDisc = c.lines.length - 2;
      c.lines.forEach((ln, i) => {
        const f = i < nDisc ? fFirst + (i * 11.4) / pitch : i === nDisc ? mid : fLast;
        tc(ln, left + (c.day - 0.5) * colW, centerY(f));
      });
    }
    // ORDEM IMPORTANTE: rodapé primeiro, nome da sala depois (como no PDF real)
    tc(`Campus Lagarto (Horário ${semester})`, 421, 580, 12.3);
    tc(room.name, 421, 561, 20.5);
  }
  return new Uint8Array(await doc.save());
}
