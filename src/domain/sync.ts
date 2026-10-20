import type { ExtractedSchedule, Issue, KnownRoom, RoomMatch } from './types.ts';
import { findRoomPdfCandidates, pickLatest, semesterRank } from './discovery.ts';
import type { PdfCandidate } from './discovery.ts';
import { validateSchedule } from './validate.ts';
import { matchRoom } from './room-matcher.ts';

export type ActiveVersion = {
  versionId: string;
  semester: string;
  contentSha256: string;
  roomCount: number;
  sessionCount: number;
};

export type RunOutcome = 'NO_CHANGE' | 'PUBLISHED' | 'REJECTED' | 'FAILED' | 'DRY_RUN_OK';

export type RunRecord = {
  outcome: RunOutcome;
  startedAt: Date;
  finishedAt: Date;
  sourceUrl: string | null;
  contentSha256: string | null;
  semester: string | null;
  versionId: string | null;
  errorCode: string | null;
  issues: Issue[];
};

/** Tudo que a sincronização precisa do banco. Implementações: memória (testes) e Prisma. */
export interface SyncStore {
  getActive(): Promise<ActiveVersion | null>;
  listKnownRooms(): Promise<KnownRoom[]>;
  /** Cria a versão, as salas, as aulas e a torna ATIVA numa única transação. */
  publish(args: {
    sourceUrl: string;
    contentSha256: string;
    schedule: ExtractedSchedule;
    matches: Record<string, RoomMatch>; // por normalizedKey
    issues: Issue[];
  }): Promise<{ versionId: string }>;
  recordRun(run: RunRecord): Promise<void>;
}

export type SyncPorts = {
  fetchText(url: string): Promise<string>;
  fetchBytes(url: string): Promise<Uint8Array>;
  extract(bytes: Uint8Array): Promise<ExtractedSchedule>;
  sha256(bytes: Uint8Array): string;
  store: SyncStore;
  now(): Date;
};

export type SyncOptions = {
  pageUrl: string;
  dryRun?: boolean;
  force?: boolean; // reimportar mesmo com o mesmo hash
  localFile?: { path: string; bytes: Uint8Array } | null;
};

export type SyncResult = RunRecord;

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Executa uma sincronização. NUNCA lança exceção e NUNCA mexe nos dados ativos
 * a menos que a nova grade tenha sido baixada, extraída e validada com sucesso.
 */
export async function runSync(opts: SyncOptions, ports: SyncPorts): Promise<SyncResult> {
  const startedAt = ports.now();
  const base = {
    startedAt, sourceUrl: null as string | null, contentSha256: null as string | null,
    semester: null as string | null, versionId: null as string | null, errorCode: null as string | null,
    issues: [] as Issue[],
  };
  const finish = async (outcome: RunOutcome, patch: Partial<RunRecord> = {}): Promise<SyncResult> => {
    const run: RunRecord = { ...base, ...patch, outcome, finishedAt: ports.now() };
    if (!opts.dryRun) {
      try { await ports.store.recordRun(run); } catch { /* o registro não pode derrubar a sincronização */ }
    }
    return run;
  };
  const fail = (code: string, message: string, extra: Partial<RunRecord> = {}) =>
    finish('FAILED', { errorCode: code, issues: [{ severity: 'ERROR', code, message }], ...extra });

  // 1. Descoberta
  let candidate: PdfCandidate | null;
  let bytes: Uint8Array;
  if (opts.localFile) {
    const m = /HORARIO_SALAS_(\d{4})_([12])/i.exec(opts.localFile.path);
    candidate = { url: `file:${opts.localFile.path}`, semester: m ? `${m[1]}.${m[2]}` : '', filename: opts.localFile.path };
    bytes = opts.localFile.bytes;
  } else {
    let html: string;
    try { html = await ports.fetchText(opts.pageUrl); }
    catch (e) { return fail('PAGE_DOWNLOAD_FAILED', `Falha ao baixar a página oficial: ${errorMessage(e)}`); }
    candidate = pickLatest(findRoomPdfCandidates(html, opts.pageUrl));
    if (!candidate) return fail('NO_CANDIDATE', 'Nenhum link de PDF de salas encontrado na página oficial');
    // 2. Download
    try { bytes = await ports.fetchBytes(candidate.url); }
    catch (e) { return fail('PDF_DOWNLOAD_FAILED', `Falha ao baixar o PDF: ${errorMessage(e)}`, { sourceUrl: candidate.url }); }
  }
  const sha = ports.sha256(bytes);
  const common = { sourceUrl: candidate.url, contentSha256: sha };

  // 3. Mudou?
  let active: ActiveVersion | null;
  try { active = await ports.store.getActive(); }
  catch (e) { return fail('STORE_READ_FAILED', `Falha ao ler a versão ativa: ${errorMessage(e)}`, common); }
  if (active && active.contentSha256 === sha && !opts.force) {
    return finish('NO_CHANGE', { ...common, semester: active.semester, versionId: active.versionId });
  }

  // 4. Extração
  let extracted: ExtractedSchedule;
  try { extracted = await ports.extract(bytes); }
  catch (e) { return fail('EXTRACTION_FAILED', `Falha ao extrair o PDF: ${errorMessage(e)}`, common); }

  // 5. Validação
  const result = validateSchedule(extracted, active ? { roomCount: active.roomCount, sessionCount: active.sessionCount } : null);
  const issues = [...result.issues];
  if (candidate.semester && extracted.semester && candidate.semester !== extracted.semester) {
    issues.push({ severity: 'ERROR', code: 'SEMESTER_FILENAME_MISMATCH', message: `Arquivo indica ${candidate.semester}, mas o PDF diz ${extracted.semester}` });
  }
  if (active && semesterRank(extracted.semester) < semesterRank(active.semester)) {
    issues.push({ severity: 'ERROR', code: 'SEMESTER_REGRESSION', message: `PDF (${extracted.semester}) é mais antigo que a grade ativa (${active.semester})` });
  }
  const ok = !issues.some((i) => i.severity === 'ERROR');
  const withSemester = { ...common, semester: extracted.semester || null, issues };
  if (!ok) return finish('REJECTED', { ...withSemester, errorCode: 'VALIDATION_FAILED' });
  if (opts.dryRun) return finish('DRY_RUN_OK', withSemester);

  // 6. Publicação atômica
  try {
    const known = await ports.store.listKnownRooms();
    const matches: Record<string, RoomMatch> = {};
    for (const r of result.schedule.rooms) {
      const m = matchRoom(r.rawName, known);
      matches[r.normalizedKey] = m;
      if (m.status === 'NEEDS_REVIEW') {
        issues.push({
          severity: 'WARNING', code: 'ROOM_NEEDS_REVIEW', room: r.rawName, page: r.page,
          message: 'Nome parecido com sala já cadastrada; não foi vinculada automaticamente',
          context: { candidates: m.candidates },
        });
      }
    }
    const { versionId } = await ports.store.publish({
      sourceUrl: candidate.url, contentSha256: sha, schedule: result.schedule, matches, issues,
    });
    return finish('PUBLISHED', { ...withSemester, versionId });
  } catch (e) {
    const message = `Falha ao publicar (dados anteriores preservados): ${errorMessage(e)}`;
    return fail('PUBLISH_FAILED', message, {
      ...common, semester: extracted.semester,
      issues: [...issues, { severity: 'ERROR', code: 'PUBLISH_FAILED', message }],
    });
  }
}
