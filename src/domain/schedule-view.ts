export type ViewSession = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  [key: string]: unknown;
};

/** Agrupa aulas por dia da semana (1 a 5), ordenadas por horário. */
export function groupByWeekday<T extends ViewSession>(sessions: T[]): Record<number, T[]> {
  const out: Record<number, T[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const s of sessions) (out[s.weekday] ??= []).push(s);
  for (const k of Object.keys(out)) out[Number(k)].sort((a, b) => a.startMinute - b.startMinute);
  return out;
}
