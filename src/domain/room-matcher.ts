import type { KnownRoom, RoomMatch } from './types.ts';
import { normalizeRoomKey } from './normalize.ts';

function tokens(key: string): Set<string> {
  return new Set(key.split(' ').filter(Boolean));
}

/** Similaridade de Jaccard entre conjuntos de palavras (0 a 1). */
export function tokenSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = inter / (ta.size + tb.size - inter);
  // Um nome contido no outro ("OFICINA" x "OFICINA SL 01") também é suspeito.
  const containment = inter / Math.min(ta.size, tb.size);
  return Math.max(jaccard, containment * 0.6);
}

const REVIEW_THRESHOLD = 0.5;

/**
 * Regra de segurança: só há vínculo automático quando a chave normalizada é IDÊNTICA.
 * Nomes parecidos (ex.: "OFICINA" x "OFICINA SL-01") nunca são ligados sozinhos:
 * viram NEEDS_REVIEW com candidatos, e a sala é tratada como nova.
 */
export function matchRoom(rawName: string, known: KnownRoom[]): RoomMatch {
  const key = normalizeRoomKey(rawName);
  const exact = known.filter((k) => k.normalizedKey === key);
  if (exact.length === 1) return { status: 'EXACT', roomId: exact[0].id };
  if (exact.length > 1) {
    return {
      status: 'NEEDS_REVIEW',
      candidates: exact.map((k) => ({ roomId: k.id, name: k.canonicalName, score: 1 })),
    };
  }
  const candidates = known
    .map((k) => ({ roomId: k.id, name: k.canonicalName, score: tokenSimilarity(key, k.normalizedKey) }))
    .filter((c) => c.score >= REVIEW_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return candidates.length ? { status: 'NEEDS_REVIEW', candidates } : { status: 'NEW' };
}
