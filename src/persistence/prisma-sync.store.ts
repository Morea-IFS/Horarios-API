import type { PrismaClient } from '@prisma/client';
import type { ActiveVersion, RunRecord, SyncStore } from '../domain/sync.ts';
import type { ExtractedSchedule, Issue, KnownRoom, RoomMatch } from '../domain/types.ts';

export class PrismaSyncStore implements SyncStore {
  // Sem "parameter properties": o `npm run sync:dry` roda este arquivo direto pelo Node (strip-only), que não aceita essa sintaxe.
  private readonly prisma: PrismaClient;
  private readonly trigger: string;

  constructor(prisma: PrismaClient, trigger: string) {
    this.prisma = prisma;
    this.trigger = trigger;
  }

  async getActive(): Promise<ActiveVersion | null> {
    const cur = await this.prisma.currentVersion.findUnique({ where: { id: 1 }, include: { version: true } });
    if (!cur) return null;
    const v = cur.version;
    return { versionId: v.id, semester: v.semester, contentSha256: v.contentSha256, roomCount: v.roomCount, sessionCount: v.sessionCount };
  }

  async listKnownRooms(): Promise<KnownRoom[]> {
    const rooms = await this.prisma.room.findMany();
    return rooms.map((r) => ({ id: r.id, normalizedKey: r.normalizedKey, canonicalName: r.canonicalName }));
  }

  /** Tudo ou nada: se qualquer passo falhar, a transação desfaz e a versão atual continua valendo. */
  async publish(a: {
    sourceUrl: string; contentSha256: string; schedule: ExtractedSchedule; matches: Record<string, RoomMatch>; issues: Issue[];
  }): Promise<{ versionId: string }> {
    const { schedule } = a;
    const sessionCount = schedule.rooms.reduce((n, r) => n + r.sessions.length, 0);
    return this.prisma.$transaction(
      async (tx) => {
        // Reimportação do mesmo conteúdo (--force): substitui a versão com o mesmo hash.
        const existing = await tx.scheduleVersion.findUnique({ where: { contentSha256: a.contentSha256 } });
        if (existing) {
          await tx.currentVersion.deleteMany({ where: { versionId: existing.id } });
          await tx.scheduleVersion.delete({ where: { id: existing.id } });
        }
        const version = await tx.scheduleVersion.create({
          data: {
            semester: schedule.semester, sourceUrl: a.sourceUrl, contentSha256: a.contentSha256,
            pdfCreatedAt: schedule.createdAt, roomCount: schedule.rooms.length, sessionCount,
            issues: a.issues as unknown as object,
          },
        });
        await tx.period.createMany({
          data: schedule.periods.map((p) => ({ versionId: version.id, code: p.code, sortOrder: p.sortOrder, startMinute: p.startMinute, endMinute: p.endMinute })),
        });
        for (const room of schedule.rooms) {
          const match = a.matches[room.normalizedKey];
          let roomId: string;
          if (match?.status === 'EXACT') roomId = match.roomId;
          else {
            const created = await tx.room.upsert({
              where: { normalizedKey: room.normalizedKey },
              update: {},
              create: { canonicalName: room.rawName, normalizedKey: room.normalizedKey },
            });
            roomId = created.id;
          }
          await tx.versionRoom.create({
            data: {
              versionId: version.id, roomId, rawName: room.rawName, page: room.page,
              matchStatus: match?.status ?? 'NEW',
              candidates: match?.status === 'NEEDS_REVIEW' ? (match.candidates as unknown as object) : undefined,
            },
          });
          if (room.sessions.length) {
            await tx.classSession.createMany({
              data: room.sessions.map((s) => ({
                versionId: version.id, roomId, weekday: s.weekday, startPeriod: s.startPeriod, endPeriod: s.endPeriod,
                startMinute: s.startMinute, endMinute: s.endMinute, kind: s.kind, classCodes: s.classCodes,
                classCodesRaw: s.classCodesRaw, lines: s.lines, rawText: s.rawText, page: s.page,
              })),
            });
          }
        }
        await tx.currentVersion.upsert({ where: { id: 1 }, update: { versionId: version.id }, create: { id: 1, versionId: version.id } });
        return { versionId: version.id };
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  }

  async recordRun(run: RunRecord): Promise<void> {
    await this.prisma.importRun.create({
      data: {
        trigger: this.trigger, outcome: run.outcome, startedAt: run.startedAt, finishedAt: run.finishedAt,
        sourceUrl: run.sourceUrl, contentSha256: run.contentSha256, semester: run.semester, versionId: run.versionId,
        errorCode: run.errorCode, issues: run.issues as unknown as object,
      },
    });
  }
}
