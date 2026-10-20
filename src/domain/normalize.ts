import type { SessionKind } from './types.ts';

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Chave para comparar nomes de sala: sem acento, maiúscula, só letras/números. */
export function normalizeRoomKey(name: string): string {
  return stripAccents(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** "3° IELTM-V", "3º  IELTM-V", "8 ° AU" -> "3º IELTM-V". Não funde códigos diferentes. */
export function normalizeClassCode(raw: string): string {
  return stripAccents(raw)
    .toUpperCase()
    .replace(/(\d)\s*[º°]\s*-?\s*/g, '$1º ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ex.: "3º IELTM-V", "1° - BEE", "8 ° AU", "Optativas BSI"
const CLASS_CODE_RE =
  /\b\d{1,2}\s*[º°]\s*-?\s*[A-Za-zÀ-ú][A-Za-zÀ-ú0-9]*(?:-[A-Za-z0-9]+)?|\bOptativas?\s+[A-ZÀ-Ú]{2,}[A-Z0-9-]*/g;

export function findClassCodes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CLASS_CODE_RE)) out.push(m[0].trim());
  return out;
}

export function detectKind(text: string, hasClassCode: boolean): SessionKind {
  const t = stripAccents(text).toUpperCase();
  if (/\bMONITORIA\b/.test(t)) return 'MONITORING';
  if (/PROJETO DE ENSINO/.test(t)) return 'TEACHING_PROJECT';
  if (/PROJETO DE EXTENS|EXTENSAO|EXTESAO/.test(t)) return 'EXTENSION';
  return hasClassCode ? 'CLASS' : 'OTHER';
}

export function toMinutes(h: string | number, m: string | number): number {
  return Number(h) * 60 + Number(m);
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
