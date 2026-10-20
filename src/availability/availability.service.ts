import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { computeAvailability, parseHHmm, weekdayOf } from '../domain/availability.ts';
import { formatMinutes } from '../domain/normalize.ts';
import { pageMeta } from '../common/pagination.ts';
import { ScheduleReadRepository } from '../persistence/schedule.repository.ts';
import { RoomsService } from '../rooms/rooms.service.ts';
import type { AvailabilityQuery } from './availability.dto.ts';

@Injectable()
export class AvailabilityService {
  constructor(private readonly repo: ScheduleReadRepository, private readonly rooms: RoomsService) {}

  async find(q: AvailabilityQuery) {
    const weekday = weekdayOf(q.date);
    if (weekday === null) throw new UnprocessableEntityException('Data inexistente');
    const start = parseHHmm(q.start)!;
    const end = parseHHmm(q.end)!;
    if (end <= start) throw new UnprocessableEntityException('end deve ser depois de start');

    const cur = await this.rooms.requireCurrent();
    const rooms = await this.repo.allRooms(cur.versionId, q.q?.trim() || undefined);
    const isSchoolDay = weekday <= 5;
    const sessions = isSchoolDay ? await this.repo.listSessions(cur.versionId, { weekday }) : [];
    const result = computeAvailability(rooms.map((r) => r.id), sessions.map((s) => ({ ...s, label: s.lines.join(' / ') })), weekday, start, end);

    // "livre até": começo da próxima aula da sala depois do fim da janela (null = livre o resto do dia)
    const nextStart = (roomId: string): string | null => {
      const later = sessions.filter((s) => s.roomId === roomId && s.startMinute >= end).map((s) => s.startMinute);
      return later.length ? formatMinutes(Math.min(...later)) : null;
    };
    let items = rooms.map((room, i) => ({
      room,
      free: result[i].free,
      freeUntil: result[i].free ? nextStart(room.id) : null,
      conflicts: result[i].conflicts.map((c) => ({ startTime: formatMinutes(c.startMinute), endTime: formatMinutes(c.endMinute), label: c.label })),
    }));
    if (q.onlyFree) items = items.filter((i) => i.free);
    const total = items.length;
    const data = items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    return {
      query: { date: q.date, weekday, start: q.start, end: q.end },
      semester: cur.semester,
      forecastOnly: true,
      notice: isSchoolDay
        ? 'Previsão baseada apenas na grade regular do semestre. Não considera feriados, eventos, trocas de sala ou reservas.'
        : 'Fim de semana: a grade regular não tem aulas previstas.',
      data,
      meta: pageMeta(q.page, q.pageSize, total),
    };
  }
}
