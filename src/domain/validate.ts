import type { ExtractedSchedule, ExtractedSession, Issue } from './types.ts';
import { formatMinutes } from './normalize.ts';

export type PreviousStats = { roomCount: number; sessionCount: number } | null;

export type ValidationResult = { ok: boolean; issues: Issue[]; schedule: ExtractedSchedule };

const sessionKey = (s: ExtractedSession): string =>
  [s.weekday, s.startPeriod, s.endPeriod, s.rawText].join('|');

/**
 * Valida a grade extraída. `ok` só é verdadeiro sem nenhum ERROR.
 * Duplicatas EXATAS (mesmo dia, períodos e texto) são removidas com aviso;
 * textos iguais em horários diferentes são aulas diferentes e são mantidos.
 */
export function validateSchedule(input: ExtractedSchedule, previous: PreviousStats): ValidationResult {
  const issues: Issue[] = [...input.issues];
  const add = (i: Issue) => issues.push(i);

  if (!/^\d{4}\.[12]$/.test(input.semester)) {
    add({ severity: 'ERROR', code: 'SEMESTER_INVALID', message: `Semestre inválido: "${input.semester}"` });
  }
  if (input.rooms.length === 0) add({ severity: 'ERROR', code: 'NO_ROOMS', message: 'Nenhuma sala extraída' });
  if (input.periods.length === 0) add({ severity: 'ERROR', code: 'NO_PERIODS', message: 'Nenhum período extraído' });

  const seen = new Map<string, number>();
  for (const r of input.rooms) seen.set(r.normalizedKey, (seen.get(r.normalizedKey) ?? 0) + 1);
  for (const [key, n] of seen) {
    if (n > 1) add({ severity: 'ERROR', code: 'DUPLICATE_ROOM', message: `Sala repetida no PDF: "${key}" (${n} páginas)` });
  }

  const rooms = input.rooms.map((room) => {
    const dedup = new Map<string, ExtractedSession>();
    for (const s of room.sessions) {
      if (s.weekday < 1 || s.weekday > 5 || s.startMinute >= s.endMinute) {
        add({ severity: 'ERROR', code: 'SESSION_INVALID', page: room.page, room: room.rawName, message: `Aula inválida (dia ${s.weekday}, ${s.startMinute}-${s.endMinute})` });
        continue;
      }
      const k = sessionKey(s);
      if (dedup.has(k)) {
        add({ severity: 'WARNING', code: 'DUPLICATE_SESSION', page: room.page, room: room.rawName, message: 'Registro duplicado removido', context: { lines: s.lines } });
        continue;
      }
      dedup.set(k, s);
    }
    const sessions = [...dedup.values()];
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        const a = sessions[i];
        const b = sessions[j];
        if (a.weekday === b.weekday && a.startMinute < b.endMinute && b.startMinute < a.endMinute) {
          add({
            severity: 'WARNING', code: 'OVERLAP', page: room.page, room: room.rawName,
            message: `Aulas sobrepostas na mesma sala (dia ${a.weekday}, ${formatMinutes(Math.max(a.startMinute, b.startMinute))})`,
            context: { a: a.lines, b: b.lines },
          });
        }
      }
    }
    return { ...room, sessions };
  });

  const sessionCount = rooms.reduce((n, r) => n + r.sessions.length, 0);
  if (rooms.length > 0 && sessionCount === 0) {
    add({ severity: 'ERROR', code: 'NO_SESSIONS', message: 'Nenhuma aula extraída em nenhuma sala' });
  }
  if (previous) {
    if (rooms.length < previous.roomCount * 0.7) {
      add({ severity: 'ERROR', code: 'ROOM_COUNT_DROP', message: `Salas caíram de ${previous.roomCount} para ${rooms.length}` });
    }
    if (sessionCount < previous.sessionCount * 0.5) {
      add({ severity: 'ERROR', code: 'SESSION_COUNT_DROP', message: `Aulas caíram de ${previous.sessionCount} para ${sessionCount}` });
    }
  }
  const ok = !issues.some((i) => i.severity === 'ERROR');
  return { ok, issues, schedule: { ...input, rooms, issues } };
}
