export type PdfCandidate = { url: string; semester: string; filename: string };

const LINK_RE = /href\s*=\s*["']([^"']*HORARIO_SALAS_(\d{4})_([12])\.pdf)["']/gi;

/**
 * Procura na página oficial links para PDFs de salas.
 * O semestre vem do NOME do arquivo apenas como pista: a página tem rótulos que
 * não batem com os arquivos, então o semestre real é confirmado dentro do PDF.
 */
export function findRoomPdfCandidates(html: string, pageUrl: string): PdfCandidate[] {
  const out = new Map<string, PdfCandidate>();
  for (const m of html.matchAll(LINK_RE)) {
    let url: string;
    try {
      url = new URL(m[1].replace(/&amp;/g, '&'), pageUrl).toString();
    } catch {
      continue;
    }
    out.set(url, { url, semester: `${m[2]}.${m[3]}`, filename: url.split('/').pop() ?? '' });
  }
  return [...out.values()];
}

export function semesterRank(semester: string): number {
  const m = /^(\d{4})\.([12])$/.exec(semester);
  return m ? Number(m[1]) * 10 + Number(m[2]) : -1;
}

export function pickLatest(candidates: PdfCandidate[]): PdfCandidate | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => semesterRank(b.semester) - semesterRank(a.semester))[0];
}
