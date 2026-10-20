import { stripAccents } from './normalize.ts';

export type ClassInfo = {
  /** Código normalizado, ex.: "3º IRC-V". */
  code: string;
  /** Sigla do curso: "IRC", "BSI", "AU"... */
  course: string;
  /** Período/ano (1, 2, 3...) ou null para optativas. */
  period: number | null;
  /** V (vespertino), N (noturno) ou null quando o código não informa. */
  shift: 'V' | 'N' | null;
  optional: boolean;
};

/** "3º IRC-V" -> { course: "IRC", period: 3, shift: "V" }; "OPTATIVAS BSI" -> { course: "BSI", optional: true }. */
export function parseClassCode(code: string): ClassInfo {
  const m = /^(\d{1,2})º\s+([A-Z0-9]+)(?:-([A-Z0-9]+))?$/.exec(code);
  if (m) {
    const shift = m[3] === 'V' || m[3] === 'N' ? m[3] : null;
    return { code, course: m[2], period: Number(m[1]), shift, optional: false };
  }
  const o = /^OPTATIVAS?\s+([A-Z0-9-]+)$/.exec(code);
  if (o) return { code, course: o[1], period: null, shift: null, optional: true };
  return { code, course: code, period: null, shift: null, optional: false };
}

/** Texto comparável: sem acento, minúsculo, só letras e números separados por espaço. */
export function searchKey(s: string): string {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Todas as palavras da busca precisam aparecer (em qualquer ordem) no texto. */
export function matchesAllTokens(haystack: string, query: string): boolean {
  const tokens = searchKey(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const h = ` ${searchKey(haystack)}`;
  return tokens.every((t) => h.includes(t));
}
