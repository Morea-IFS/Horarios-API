import { Injectable } from '@nestjs/common';
import { matchesAllTokens, parseClassCode } from '../domain/class-code.ts';
import { formatMinutes, normalizeClassCode } from '../domain/normalize.ts';
import { pageMeta } from '../common/pagination.ts';
import { ScheduleReadRepository } from '../persistence/schedule.repository.ts';
import { RoomsService } from '../rooms/rooms.service.ts';
import type { SearchSessionsQuery } from './sessions.dto.ts';

@Injectable()
export class SessionsService {
  constructor(private readonly repo: ScheduleReadRepository, private readonly rooms: RoomsService) {}

  async search(query: SearchSessionsQuery) {
    const cur = await this.rooms.requireCurrent();
    const [rooms, sessions] = await Promise.all([
      this.repo.allRooms(cur.versionId, undefined),
      this.repo.listSessions(cur.versionId, { roomId: query.roomId, weekday: query.weekday }),
    ]);
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const wantedClass = query.classCode?.trim() ? normalizeClassCode(query.classCode) : null;
    const text = query.q?.trim() ?? '';

    const rows = sessions
      .filter((s) => roomById.has(s.roomId))
      .filter((s) => !wantedClass || s.classCodes.includes(wantedClass))
      .filter((s) => !text || matchesAllTokens(`${s.lines.join(' ')} ${s.classCodes.join(' ')}`, text))
      .map((s) => ({ s, room: roomById.get(s.roomId)! }))
      .sort((a, b) => a.s.weekday - b.s.weekday || a.s.startMinute - b.s.startMinute || a.room.name.localeCompare(b.room.name, 'pt-BR'));

    const data = rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map(({ s, room }) => ({
      room: { id: room.id, name: room.name },
      weekday: s.weekday,
      startPeriod: s.startPeriod,
      endPeriod: s.endPeriod,
      startTime: formatMinutes(s.startMinute),
      endTime: formatMinutes(s.endMinute),
      kind: s.kind,
      classCodes: s.classCodes,
      lines: s.lines,
    }));
    return { semester: cur.semester, forecastOnly: true, data, meta: pageMeta(query.page, query.pageSize, rows.length) };
  }

  async classes() {
    const cur = await this.rooms.requireCurrent();
    const sessions = await this.repo.listSessions(cur.versionId, {});
    const counts = new Map<string, number>();
    for (const s of sessions) for (const code of s.classCodes) counts.set(code, (counts.get(code) ?? 0) + 1);
    const data = [...counts.entries()]
      .map(([code, sessionCount]) => ({ ...parseClassCode(code), sessionCount }))
      .sort((a, b) => a.course.localeCompare(b.course, 'pt-BR') || Number(a.optional) - Number(b.optional) || (a.period ?? 0) - (b.period ?? 0));
    return { semester: cur.semester, data };
  }

  async periods() {
    const cur = await this.rooms.requireCurrent();
    const periods = await this.repo.listPeriods(cur.versionId);
    return {
      semester: cur.semester,
      data: periods.map((p) => ({ code: p.code, startTime: formatMinutes(p.startMinute), endTime: formatMinutes(p.endMinute) })),
    };
  }
}
