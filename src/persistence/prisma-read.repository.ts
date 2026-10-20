import { Injectable } from '@nestjs/common';
import type { PeriodDef } from '../domain/types.ts';
import { PrismaService } from './prisma.service.ts';
import type { CurrentSchedule, LastRun, RoomRow, SessionRow } from './schedule.repository.ts';
import { ScheduleReadRepository } from './schedule.repository.ts';

@Injectable()
export class PrismaReadRepository extends ScheduleReadRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getCurrent(): Promise<CurrentSchedule | null> {
    const cur = await this.prisma.currentVersion.findUnique({ where: { id: 1 }, include: { version: true } });
    if (!cur) return null;
    const v = cur.version;
    return {
      versionId: v.id, semester: v.semester, pdfCreatedAt: v.pdfCreatedAt, sourceUrl: v.sourceUrl,
      contentSha256: v.contentSha256, activatedAt: v.activatedAt, roomCount: v.roomCount, sessionCount: v.sessionCount,
    };
  }

  private where(versionId: string, q?: string) {
    return {
      versionId,
      ...(q ? { room: { canonicalName: { contains: q, mode: 'insensitive' as const } } } : {}),
    };
  }

  private toRow(vr: { room: { id: string; canonicalName: string; externalRefs: { system: string; externalId: string }[] } }): RoomRow {
    return {
      id: vr.room.id,
      name: vr.room.canonicalName,
      externalIds: vr.room.externalRefs.map((e) => ({ system: e.system, externalId: e.externalId })),
    };
  }

  async listRooms(versionId: string, q: string | undefined, skip: number, take: number) {
    const where = this.where(versionId, q);
    const [rows, total] = await Promise.all([
      this.prisma.versionRoom.findMany({
        where, skip, take, orderBy: { room: { canonicalName: 'asc' } },
        include: { room: { include: { externalRefs: true } } },
      }),
      this.prisma.versionRoom.count({ where }),
    ]);
    return { rows: rows.map((r) => this.toRow(r)), total };
  }

  async allRooms(versionId: string, q: string | undefined): Promise<RoomRow[]> {
    const rows = await this.prisma.versionRoom.findMany({
      where: this.where(versionId, q), orderBy: { room: { canonicalName: 'asc' } },
      include: { room: { include: { externalRefs: true } } },
    });
    return rows.map((r) => this.toRow(r));
  }

  async getRoom(versionId: string, roomId: string): Promise<RoomRow | null> {
    const vr = await this.prisma.versionRoom.findUnique({
      where: { versionId_roomId: { versionId, roomId } },
      include: { room: { include: { externalRefs: true } } },
    });
    return vr ? this.toRow(vr) : null;
  }

  async listSessions(versionId: string, filter: { roomId?: string; weekday?: number }): Promise<SessionRow[]> {
    const rows = await this.prisma.classSession.findMany({
      where: { versionId, ...(filter.roomId ? { roomId: filter.roomId } : {}), ...(filter.weekday ? { weekday: filter.weekday } : {}) },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    });
    return rows.map((s) => ({
      roomId: s.roomId, weekday: s.weekday, startPeriod: s.startPeriod, endPeriod: s.endPeriod,
      startMinute: s.startMinute, endMinute: s.endMinute, kind: s.kind, classCodes: s.classCodes, lines: s.lines,
    }));
  }

  async listPeriods(versionId: string): Promise<PeriodDef[]> {
    const rows = await this.prisma.period.findMany({ where: { versionId }, orderBy: { sortOrder: 'asc' } });
    return rows.map((p) => ({ code: p.code, sortOrder: p.sortOrder, startMinute: p.startMinute, endMinute: p.endMinute }));
  }

  async getLastRun(): Promise<LastRun | null> {
    const r = await this.prisma.importRun.findFirst({ orderBy: { startedAt: 'desc' } });
    return r ? { outcome: r.outcome, finishedAt: r.finishedAt, errorCode: r.errorCode } : null;
  }

  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
