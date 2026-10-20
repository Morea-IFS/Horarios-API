import type {
  ExtractedRoom, ExtractedSchedule, ExtractedSession, Issue, PageGeometry, PeriodDef, TextItem,
} from './types.ts';
import {
  detectKind, findClassCodes, normalizeClassCode, normalizeRoomKey, stripAccents, toMinutes,
} from './normalize.ts';

const TIME_RE = /^\s*(\d{1,2})\s*[:h.]\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*[:h.]\s*(\d{2})\s*$/;
const PERIOD_RE = /^\d{1,2}(?:[,.]\d)?$/;
const FOOTER_RE = /Campus\s+Lagarto\s*\(\s*Hor[aá]rio\s*(\d{4})\s*\/\s*([12])\s*\)/i;
const CREATED_RE = /Hor[aá]rio\s+criado:?\s*(\d{2})\/(\d{2})\/(\d{4})/i;
const DAY_RE = /^(seg|ter|qua|qui|sex)(unda|ca|rta|nta|ta)?(feira)?$/;

/**
 * No PDF real (aSc TimeTables) cada card é só TEXTO (disciplina, turma, docente) dentro de uma célula cuja
 * borda é desenhada por TRAÇOS horizontais: em cada coluna, a linha entre dois períodos só existe quando ali
 * termina um card (ou uma célula vazia). Linhas dentro de um card não são desenhadas. Portanto:
 *   card = trecho da coluna entre duas linhas consecutivas que contém texto.
 * Não depende do conteúdo do card (turma, docente, projeto, monitoria...). Se algo não bate, a extração dá ERRO.
 */
export const GRID = { snapTolerance: 0.15, borderMargin: 2.5, minLineCoverage: 0.5 };

function weekdayOfLabel(s: string): number | null {
  const t = stripAccents(s.trim().toLowerCase()).replace(/[.\-\s]/g, '');
  const m = DAY_RE.exec(t);
  if (!m) return null;
  return { seg: 1, ter: 2, qua: 3, qui: 4, sex: 5 }[m[1] as 'seg'];
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const cx = (i: TextItem): number => i.x + i.w / 2;
const cy = (i: TextItem): number => i.y + i.h / 2;

type Grid = {
  colCenters: number[];
  colWidth: number;
  rowCenters: number[]; // de cima para baixo
  pitch: number;
  periods: PeriodDef[];
};

export type PageStats = { cards: number; strayLines: number };

type PageResult = {
  room?: ExtractedRoom;
  semester?: string;
  createdAt?: string | null;
  periods?: PeriodDef[];
  issues: Issue[];
  stats: PageStats;
};

function findGrid(items: TextItem[], page: number, issues: Issue[]): Grid | null {
  const dayItems = new Map<number, TextItem>();
  for (const it of items) {
    const d = weekdayOfLabel(it.str);
    if (d && (!dayItems.has(d) || it.y > dayItems.get(d)!.y)) dayItems.set(d, it);
  }
  if (dayItems.size < 5) {
    issues.push({ severity: 'ERROR', code: 'GRID_NOT_FOUND', page, message: `Cabeçalhos de dia encontrados: ${dayItems.size}/5` });
    return null;
  }
  const colCenters = [1, 2, 3, 4, 5].map((d) => cx(dayItems.get(d)!));
  const colWidth = median(colCenters.slice(1).map((c, i) => c - colCenters[i]));
  if (!(colWidth > 10)) {
    issues.push({ severity: 'ERROR', code: 'GRID_NOT_FOUND', page, message: 'Colunas dos dias fora de ordem ou sobrepostas' });
    return null;
  }
  const left = colCenters[0] - colWidth / 2;

  // Rótulos de linha ficam À ESQUERDA da grade: número do período (em cima) e horário (embaixo).
  const labelZone = items.filter((i) => cx(i) < left);
  const timeItems = labelZone.filter((i) => TIME_RE.test(i.str)).sort((a, b) => cy(b) - cy(a));
  if (timeItems.length < 5) {
    issues.push({ severity: 'ERROR', code: 'GRID_NOT_FOUND', page, message: `Rótulos de horário encontrados: ${timeItems.length}` });
    return null;
  }
  const tys = timeItems.map(cy);
  const pitch = median(tys.slice(1).map((y, i) => tys[i] - y));
  if (tys.slice(1).some((y, i) => Math.abs(tys[i] - y - pitch) > pitch * 0.2)) {
    issues.push({ severity: 'ERROR', code: 'ROW_SPACING_UNEVEN', page, message: 'Linhas da grade com alturas diferentes' });
    return null;
  }
  const codeLabels = labelZone.filter((i) => PERIOD_RE.test(i.str.trim()));
  const periods: PeriodDef[] = [];
  const rowCenters: number[] = [];
  for (let r = 0; r < timeItems.length; r++) {
    const m = TIME_RE.exec(timeItems[r].str)!;
    const near = codeLabels
      .map((c) => ({ c, d: Math.abs(cy(c) - tys[r]) }))
      .filter((o) => o.d <= pitch * 0.75)
      .sort((a, b) => a.d - b.d)[0];
    if (!near) {
      issues.push({ severity: 'ERROR', code: 'PERIOD_CODE_MISSING', page, message: `Linha ${r + 1} sem número de período` });
      return null;
    }
    rowCenters.push((cy(near.c) + tys[r]) / 2); // centro da célula = ponto médio entre número e horário
    periods.push({
      code: near.c.str.trim().replace('.', ','),
      sortOrder: r,
      startMinute: toMinutes(m[1], m[2]),
      endMinute: toMinutes(m[3], m[4]),
    });
  }
  if (new Set(periods.map((p) => p.code)).size !== periods.length) {
    issues.push({ severity: 'ERROR', code: 'PERIOD_CODE_DUPLICATE', page, message: 'Códigos de período repetidos' });
    return null;
  }
  return { colCenters, colWidth, rowCenters, pitch, periods };
}

type Line = { text: string; cy: number; items: TextItem[] };

function groupLines(items: TextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: TextItem[][] = [];
  for (const it of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= 1.5) last.push(it);
    else groups.push([it]);
  }
  return groups.map((g) => {
    const row = g.sort((a, b) => a.x - b.x);
    return {
      text: row.map((i) => i.str.trim()).filter(Boolean).join(' '),
      cy: row.reduce((s, i) => s + cy(i), 0) / row.length,
      items: row,
    };
  }).filter((l) => l.text);
}

function extractPage(p: PageGeometry): PageResult {
  const issues: Issue[] = [];
  const stats: PageStats = { cards: 0, strayLines: 0 };
  const items = p.items.filter((i) => i.str.trim() !== '');

  // O PDF traz o nome da sala DEPOIS do rodapé "Campus Lagarto (Horário AAAA/N)".
  const footerIdx = items.findIndex((i) => FOOTER_RE.test(i.str));
  if (footerIdx < 0) {
    issues.push({ severity: 'ERROR', code: 'FOOTER_NOT_FOUND', page: p.page, message: 'Rodapé com o semestre não encontrado' });
    return { issues, stats };
  }
  const fm = FOOTER_RE.exec(items[footerIdx].str)!;
  const semester = `${fm[1]}.${fm[2]}`;
  const tail = items.slice(footerIdx + 1).filter((i) => !CREATED_RE.test(i.str));
  const rawName = tail.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
  if (!rawName) {
    issues.push({ severity: 'ERROR', code: 'ROOM_NAME_MISSING', page: p.page, message: 'Nome da sala não encontrado após o rodapé' });
    return { issues, stats, semester };
  }
  if (tail.length > 2) {
    issues.push({ severity: 'WARNING', code: 'ROOM_NAME_MULTIPART', page: p.page, room: rawName, message: `Nome da sala montado com ${tail.length} trechos` });
  }
  const createdItem = items.map((i) => CREATED_RE.exec(i.str)).find(Boolean);
  const createdAt = createdItem ? `${createdItem[3]}-${createdItem[2]}-${createdItem[1]}` : null;

  const body = items.slice(0, footerIdx);
  const grid = findGrid(body, p.page, issues);
  if (!grid) return { issues, stats, semester, createdAt };

  const { colCenters, colWidth, rowCenters, pitch } = grid;
  const nRows = rowCenters.length;
  const gridLeft = colCenters[0] - colWidth / 2;
  const gridRight = colCenters[4] + colWidth / 2;
  // y de cada divisão de período, estimado pelos rótulos; abaixo é corrigido pela posição REAL das linhas desenhadas
  const bounds = Array.from({ length: nRows + 1 }, (_, k) => rowCenters[0] + pitch / 2 - k * pitch);
  const hlines = p.hlines ?? [];
  if (hlines.length === 0) {
    issues.push({ severity: 'ERROR', code: 'GRID_LINES_NOT_FOUND', page: p.page, room: rawName, message: 'Nenhuma linha divisória desenhada na página (não dá para delimitar os cards)' });
    return { issues, stats, semester, createdAt };
  }
  // Alinha as divisões estimadas com as linhas reais (deslocamento mediano das linhas próximas de cada divisão).
  {
    const offs: number[] = [];
    for (const l of hlines) {
      if (l.x2 - l.x1 < colWidth * GRID.minLineCoverage || l.x2 < colCenters[0] - colWidth / 2 || l.x1 > colCenters[4] + colWidth / 2) continue;
      const k = Math.round((bounds[0] - l.y) / pitch);
      if (k >= 0 && k <= nRows && Math.abs(l.y - bounds[k]) < pitch * 0.35) offs.push(l.y - bounds[k]);
    }
    if (offs.length) { const shift = median(offs); for (let k = 0; k <= nRows; k++) bounds[k] += shift; }
  }
  const gridTop = bounds[0];
  const gridBottom = bounds[nRows];
  // Em cada coluna, quais divisões (0..nRows) têm linha desenhada. As bordas externas sempre contam.
  const present: Set<number>[] = colCenters.map(() => new Set<number>([0, nRows]));
  let strayLines = 0;
  for (const l of hlines) {
    if (l.x2 - l.x1 < colWidth * GRID.minLineCoverage) continue;
    if (l.x2 < gridLeft || l.x1 > gridRight) continue;
    if (l.y > gridTop + pitch * GRID.snapTolerance || l.y < gridBottom - pitch * GRID.snapTolerance) continue; // cabeçalho/rodapé
    const k = Math.round((gridTop - l.y) / pitch);
    if (k < 0 || k > nRows || Math.abs(l.y - bounds[k]) > pitch * GRID.snapTolerance) { strayLines++; continue; }
    colCenters.forEach((c, ci) => { if (l.x1 <= c && c <= l.x2) present[ci].add(k); });
  }
  stats.strayLines = strayLines;
  if (strayLines > 0) {
    issues.push({ severity: 'WARNING', code: 'GRID_STRAY_LINE', page: p.page, room: rawName, message: `${strayLines} linha(s) horizontal(is) dentro da grade fora das divisões de período (ignoradas)` });
  }

  const perCol: TextItem[][] = [[], [], [], [], []];
  for (const it of body) {
    const x = cx(it);
    const y = cy(it);
    if (x < gridLeft || x > gridRight || y < gridBottom || y > gridTop) continue; // cabeçalho, rótulos, rodapé
    let best = 0;
    for (let c = 1; c < 5; c++) if (Math.abs(x - colCenters[c]) < Math.abs(x - colCenters[best])) best = c;
    perCol[best].push(it);
  }

  const sessions: ExtractedSession[] = [];
  for (let col = 0; col < 5; col++) {
    const lines = groupLines(perCol[col]);
    if (lines.length === 0) continue;
    const cuts = [...present[col]].sort((a, b) => a - b);
    const cells: Line[][] = cuts.slice(1).map(() => []);
    for (const line of lines) {
      const k = (gridTop - line.cy) / pitch; // posição em unidades de linha (0 = topo da grade)
      let idx = -1;
      for (let i = 0; i < cuts.length - 1; i++) if (k >= cuts[i] && k < cuts[i + 1]) { idx = i; break; }
      const tag = { page: p.page, room: rawName, context: { lines: [line.text], weekday: col + 1 } };
      if (idx < 0) { issues.push({ severity: 'ERROR', code: 'CARD_OUTSIDE_GRID', message: 'Texto fora das linhas da grade', ...tag }); continue; }
      const dist = Math.min(k - cuts[idx], cuts[idx + 1] - k) * pitch;
      // o texto precisa caber dentro da célula; fontes pequenas (cards encolhidos pelo aSc) têm margem proporcional
      const lineH = Math.max(...line.items.map((i) => i.h));
      if (dist < Math.min(GRID.borderMargin, lineH / 2)) {
        issues.push({ severity: 'ERROR', code: 'CARD_TEXT_ON_BORDER', message: 'Texto colado em uma linha divisória (card ambíguo)', ...tag });
        continue;
      }
      cells[idx].push(line);
    }
    cells.forEach((cellLines, i) => {
      if (cellLines.length === 0) return; // célula vazia
      const startRow = cuts[i] + 1; // 1-based
      const endRow = cuts[i + 1];
      const texts = cellLines.map((l) => l.text);
      const tag = { page: p.page, room: rawName, context: { lines: texts, weekday: col + 1 } };
      const rawText = texts.join('\n');
      const codesRaw = findClassCodes(rawText);
      const kind = detectKind(rawText, codesRaw.length > 0);
      if (kind === 'OTHER') {
        issues.push({ severity: 'WARNING', code: 'CARD_UNCLASSIFIED', message: 'Card sem turma, monitoria ou projeto reconhecido (mantido como OTHER)', ...tag });
      }
      sessions.push({
        weekday: col + 1,
        startPeriod: grid.periods[startRow - 1].code,
        endPeriod: grid.periods[endRow - 1].code,
        startMinute: grid.periods[startRow - 1].startMinute,
        endMinute: grid.periods[endRow - 1].endMinute,
        kind,
        classCodes: [...new Set(codesRaw.map(normalizeClassCode))],
        classCodesRaw: codesRaw,
        lines: texts,
        rawText,
        page: p.page,
      });
    });
  }
  stats.cards = sessions.length;
  sessions.sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  return {
    room: { rawName, normalizedKey: normalizeRoomKey(rawName), page: p.page, sessions },
    semester, createdAt, periods: grid.periods, issues, stats,
  };
}

/** Converte a geometria (texto + retângulos) de todas as páginas em uma grade estruturada. */
export function extractSchedule(pages: PageGeometry[]): ExtractedSchedule {
  const issues: Issue[] = [];
  const rooms: ExtractedRoom[] = [];
  const semesters: string[] = [];
  const created: string[] = [];
  let periods: PeriodDef[] | null = null;
  const total: PageStats = { cards: 0, strayLines: 0 };

  for (const p of pages) {
    const r = extractPage(p);
    issues.push(...r.issues);
    total.cards += r.stats.cards;
    total.strayLines += r.stats.strayLines;
    if (r.semester) semesters.push(r.semester);
    if (r.createdAt) created.push(r.createdAt);
    if (r.room) rooms.push(r.room);
    if (r.periods) {
      if (!periods) periods = r.periods;
      else if (JSON.stringify(periods) !== JSON.stringify(r.periods)) {
        issues.push({ severity: 'ERROR', code: 'PERIODS_MISMATCH', page: p.page, message: 'Horários dos períodos diferem da primeira página' });
      }
    }
  }
  const uniq = [...new Set(semesters)];
  if (uniq.length > 1) {
    issues.push({ severity: 'ERROR', code: 'SEMESTER_MISMATCH', message: `Páginas com semestres diferentes: ${uniq.join(', ')}` });
  }
  if (uniq.length === 0) {
    issues.push({ severity: 'ERROR', code: 'SEMESTER_NOT_FOUND', message: 'Nenhum semestre identificado no PDF' });
  }
  issues.push({
    severity: 'INFO', code: 'EXTRACTION_STATS', message: 'Estatísticas da extração',
    context: { pages: pages.length, rooms: rooms.length, cards: total.cards, strayLines: total.strayLines },
  });
  return {
    semester: uniq[0] ?? '',
    createdAt: created[0] ?? null,
    periods: periods ?? [],
    rooms,
    issues,
  };
}
