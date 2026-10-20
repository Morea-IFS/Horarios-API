import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { groupByWeekday } from '../domain/schedule-view.ts';
import { formatMinutes } from '../domain/normalize.ts';
import { pageMeta } from '../common/pagination.ts';
import { ScheduleReadRepository } from '../persistence/schedule.repository.ts';
import type { CurrentSchedule, SessionRow } from '../persistence/schedule.repository.ts';

export const WEEKDAY_NAMES = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira'];

export const presentSession = (s: SessionRow) => ({
  weekday: s.weekday,
  startPeriod: s.startPeriod,
  endPeriod: s.endPeriod,
  startTime: formatMinutes(s.startMinute),
  endTime: formatMinutes(s.endMinute),
  kind: s.kind,
  classCodes: s.classCodes,
  lines: s.lines,
});

@Injectable()
export class RoomsService {
  constructor(private readonly repo: ScheduleReadRepository) {}

  async requireCurrent(): Promise<CurrentSchedule> {
    const cur = await this.repo.getCurrent();
    if (!cur) throw new ServiceUnavailableException('Nenhuma grade de horários disponível ainda');
    return cur;
  }

  async list(q: string | undefined, page: number, pageSize: number) {
    const cur = await this.requireCurrent();
    const { rows, total } = await this.repo.listRooms(cur.versionId, q?.trim() || undefined, (page - 1) * pageSize, pageSize);
    return { data: rows, meta: { ...pageMeta(page, pageSize, total), semester: cur.semester } };
  }

  async schedule(roomId: string, weekday?: number) {
    const cur = await this.requireCurrent();
    const room = await this.repo.getRoom(cur.versionId, roomId);
    if (!room) throw new NotFoundException('Sala não encontrada na grade atual');
    const sessions = await this.repo.listSessions(cur.versionId, { roomId, weekday });
    const grouped = groupByWeekday(sessions);
    const days = [1, 2, 3, 4, 5]
      .filter((d) => !weekday || d === weekday)
      .map((d) => ({ weekday: d, name: WEEKDAY_NAMES[d - 1], sessions: grouped[d].map(presentSession) }));
    return { room, semester: cur.semester, forecastOnly: true, days };
  }
}
