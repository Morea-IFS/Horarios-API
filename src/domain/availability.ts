export type SessionLite = {
  roomId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  label: string;
};

export type RoomAvailability = {
  roomId: string;
  free: boolean;
  conflicts: SessionLite[];
};

/** Dia da semana (1 = segunda ... 7 = domingo) de uma data AAAA-MM-DD, sem depender de fuso. */
export function weekdayOf(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const js = dt.getUTCDay(); // 0 = domingo
  return js === 0 ? 7 : js;
}

export function parseHHmm(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Uma sala está ocupada se alguma aula do dia se sobrepõe à janela [start, end). */
export function computeAvailability(
  roomIds: string[],
  sessions: SessionLite[],
  weekday: number,
  startMinute: number,
  endMinute: number,
): RoomAvailability[] {
  return roomIds.map((roomId) => {
    const conflicts = sessions.filter(
      (s) => s.roomId === roomId && s.weekday === weekday && s.startMinute < endMinute && startMinute < s.endMinute,
    );
    return { roomId, free: conflicts.length === 0, conflicts };
  });
}
