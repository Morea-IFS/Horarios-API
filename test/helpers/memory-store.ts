import type { ActiveVersion, RunRecord, SyncStore } from '../../src/domain/sync.ts';
import type { ExtractedSchedule, Issue, KnownRoom, RoomMatch } from '../../src/domain/types.ts';

type Version = { id: string; sha: string; schedule: ExtractedSchedule; sourceUrl: string; issues: Issue[] };

export class MemoryStore implements SyncStore {
  versions: Version[] = [];
  activeId: string | null = null;
  runs: RunRecord[] = [];
  failPublish = false;
  rooms: KnownRoom[] = [];

  async getActive(): Promise<ActiveVersion | null> {
    const v = this.versions.find((x) => x.id === this.activeId);
    if (!v) return null;
    return {
      versionId: v.id, semester: v.schedule.semester, contentSha256: v.sha,
      roomCount: v.schedule.rooms.length,
      sessionCount: v.schedule.rooms.reduce((n, r) => n + r.sessions.length, 0),
    };
  }
  async listKnownRooms(): Promise<KnownRoom[]> { return this.rooms; }
  async publish(a: { sourceUrl: string; contentSha256: string; schedule: ExtractedSchedule; matches: Record<string, RoomMatch>; issues: Issue[] }) {
    if (this.failPublish) throw new Error('banco indisponível');
    const id = `v${this.versions.length + 1}`;
    this.versions.push({ id, sha: a.contentSha256, schedule: a.schedule, sourceUrl: a.sourceUrl, issues: a.issues });
    this.activeId = id; // troca atômica
    for (const r of a.schedule.rooms) {
      const m = a.matches[r.normalizedKey];
      if (m?.status !== 'EXACT') this.rooms.push({ id: `r${this.rooms.length + 1}`, normalizedKey: r.normalizedKey, canonicalName: r.rawName });
    }
    return { versionId: id };
  }
  async recordRun(run: RunRecord) { this.runs.push(run); }
}
