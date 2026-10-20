import type { PeriodDef } from '../domain/types.ts';

export type CurrentSchedule = {
  versionId: string;
  semester: string;
  pdfCreatedAt: string | null;
  sourceUrl: string;
  contentSha256: string;
  activatedAt: Date;
  roomCount: number;
  sessionCount: number;
};
export type RoomRow = { id: string; name: string; externalIds: { system: string; externalId: string }[] };
export type SessionRow = {
  roomId: string;
  weekday: number;
  startPeriod: string;
  endPeriod: string;
  startMinute: number;
  endMinute: number;
  kind: string;
  classCodes: string[];
  lines: string[];
};
export type LastRun = { outcome: string; finishedAt: Date; errorCode: string | null };

/** Porta de leitura usada pela API. Implementada com Prisma (produção) e em memória (testes). */
export abstract class ScheduleReadRepository {
  abstract getCurrent(): Promise<CurrentSchedule | null>;
  abstract listRooms(versionId: string, q: string | undefined, skip: number, take: number): Promise<{ rows: RoomRow[]; total: number }>;
  abstract allRooms(versionId: string, q: string | undefined): Promise<RoomRow[]>;
  abstract getRoom(versionId: string, roomId: string): Promise<RoomRow | null>;
  abstract listSessions(versionId: string, filter: { roomId?: string; weekday?: number }): Promise<SessionRow[]>;
  abstract listPeriods(versionId: string): Promise<PeriodDef[]>;
  abstract getLastRun(): Promise<LastRun | null>;
  abstract ping(): Promise<void>;
}
