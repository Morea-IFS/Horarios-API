// Tipos do domínio. Apenas sintaxe "apagável" (sem enums), para rodar direto no Node.

export type TextItem = { str: string; x: number; y: number; w: number; h: number };
export type RectItem = { x: number; y: number; w: number; h: number; fill: string | null };
/** Segmento horizontal desenhado (traço) em coordenadas da página: de x1 a x2, na altura y. */
export type HLine = { x1: number; x2: number; y: number };
export type PageGeometry = { page: number; items: TextItem[]; rects: RectItem[]; hlines: HLine[] };

export type Severity = 'ERROR' | 'WARNING' | 'INFO';
export type Issue = {
  severity: Severity;
  code: string;
  message: string;
  page?: number;
  room?: string;
  context?: Record<string, unknown>;
};

export type SessionKind = 'CLASS' | 'TEACHING_PROJECT' | 'EXTENSION' | 'MONITORING' | 'OTHER';

export type ExtractedSession = {
  weekday: number; // 1 = segunda ... 5 = sexta
  startPeriod: string;
  endPeriod: string;
  startMinute: number;
  endMinute: number;
  kind: SessionKind;
  classCodes: string[]; // normalizados
  classCodesRaw: string[]; // como aparecem no PDF
  lines: string[]; // texto original do card, linha a linha
  rawText: string;
  page: number;
};

export type PeriodDef = { code: string; sortOrder: number; startMinute: number; endMinute: number };

export type ExtractedRoom = {
  rawName: string;
  normalizedKey: string;
  page: number;
  sessions: ExtractedSession[];
};

export type ExtractedSchedule = {
  semester: string; // "2026.2"
  createdAt: string | null; // "2026-09-29" (data de criação do PDF)
  periods: PeriodDef[];
  rooms: ExtractedRoom[];
  issues: Issue[];
};

export type KnownRoom = { id: string; normalizedKey: string; canonicalName: string };

export type RoomMatch =
  | { status: 'EXACT'; roomId: string }
  | { status: 'NEW' }
  | { status: 'NEEDS_REVIEW'; candidates: { roomId: string; name: string; score: number }[] };
