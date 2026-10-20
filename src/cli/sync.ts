// Sincronização dos horários. Uso:
//   node dist/src/cli/sync.js                      -> consulta a página oficial e publica se houver versão nova
//   node dist/src/cli/sync.js --dry-run            -> só valida (não grava nada; funciona sem banco)
//   node dist/src/cli/sync.js --file=caminho.pdf   -> usa um PDF local em vez de baixar
//   --force  reimporta mesmo com o mesmo conteúdo | --trigger=nome | --report=arquivo.json
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { SOURCE_PAGE_URL, loadEnv } from '../config.ts';
import { runSync } from '../domain/sync.ts';
import type { SyncStore } from '../domain/sync.ts';
import { extractFromPdf } from '../pdf/pdfjs-adapter.ts';

const arg = (name: string): string | undefined => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const flag = (name: string): boolean => process.argv.slice(2).includes(`--${name}`);

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const UA = 'mero-horarios-sync/1.0 (+projeto MERO)';

const secrets = () => [process.env.DATABASE_URL].filter((s): s is string => !!s && s.length > 6);
const redact = (text: string): string => secrets().reduce((t, s) => t.split(s).join('***'), text);

class NullStore implements SyncStore {
  async getActive() { return null; }
  async listKnownRooms() { return []; }
  async publish(): Promise<{ versionId: string }> { throw new Error('sem banco configurado'); }
  async recordRun() { /* nada */ }
}

async function fetchChecked(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res;
}

async function main(): Promise<number> {
  loadEnv();
  const dryRun = flag('dry-run');
  const trigger = arg('trigger') ?? 'manual';
  const file = arg('file');

  let store: SyncStore;
  let disconnect: () => Promise<void> = async () => {};
  if (process.env.DATABASE_URL) {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaSyncStore } = await import('../persistence/prisma-sync.store.ts');
    const prisma = new PrismaClient();
    store = new PrismaSyncStore(prisma, trigger);
    disconnect = () => prisma.$disconnect();
  } else if (dryRun) {
    console.log('Sem DATABASE_URL: validando apenas o PDF (nada será gravado).');
    store = new NullStore();
  } else {
    console.error('Defina DATABASE_URL (veja .env.example) ou use --dry-run para validar sem banco.');
    return 2;
  }

  const localFile = file ? { path: file, bytes: new Uint8Array(await fs.readFile(file)) } : null;
  const result = await runSync(
    { pageUrl: SOURCE_PAGE_URL, dryRun, force: flag('force'), localFile },
    {
      fetchText: async (url) => (await fetchChecked(url)).text(),
      fetchBytes: async (url) => {
        const buf = new Uint8Array(await (await fetchChecked(url)).arrayBuffer());
        if (buf.length > MAX_PDF_BYTES) throw new Error('PDF maior que o limite de 50 MB');
        if (String.fromCharCode(...buf.slice(0, 5)) !== '%PDF-') throw new Error('O arquivo baixado não é um PDF');
        return buf;
      },
      extract: extractFromPdf,
      sha256: (b) => createHash('sha256').update(b).digest('hex'),
      store,
      now: () => new Date(),
    },
  );
  await disconnect().catch(() => {});

  const errors = result.issues.filter((i) => i.severity === 'ERROR');
  const warnings = result.issues.filter((i) => i.severity === 'WARNING');
  const stats = result.issues.find((i) => i.code === 'EXTRACTION_STATS')?.context;
  const lines = [
    `Resultado: ${result.outcome}${result.errorCode ? ` (${result.errorCode})` : ''}`,
    `Fonte: ${result.sourceUrl ?? '-'}`,
    `Semestre: ${result.semester ?? '-'}   Hash: ${result.contentSha256?.slice(0, 12) ?? '-'}`,
    stats ? `Extração: ${JSON.stringify(stats)}` : '',
    `Erros: ${errors.length}   Avisos: ${warnings.length}`,
    ...errors.map((e) => `  ERRO  ${e.code}${e.page ? ` p.${e.page}` : ''}${e.room ? ` [${e.room}]` : ''}: ${e.message}`),
    ...warnings.slice(0, 25).map((w) => `  aviso ${w.code}${w.page ? ` p.${w.page}` : ''}${w.room ? ` [${w.room}]` : ''}: ${w.message}`),
    warnings.length > 25 ? `  ... mais ${warnings.length - 25} avisos (veja --report)` : '',
  ].filter(Boolean);
  console.log(redact(lines.join('\n')));

  const report = arg('report');
  if (report) await fs.writeFile(report, redact(JSON.stringify(result, null, 2)));
  // Falhas e rejeições terminam com código 1 para o GitHub Actions ficar vermelho (os dados antigos continuam valendo).
  return result.outcome === 'FAILED' || result.outcome === 'REJECTED' ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
