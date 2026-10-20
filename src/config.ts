export const SOURCE_PAGE_URL =
  'https://www.ifs.edu.br/horario-dos-docentes-proen/horario-lagarto.html';

/** Carrega o arquivo .env (se existir) sem depender de bibliotecas. Node 22+. */
export function loadEnv(): void {
  try {
    (process as unknown as { loadEnvFile: (p?: string) => void }).loadEnvFile();
  } catch {
    /* sem .env: usa as variáveis do ambiente */
  }
}

export function intEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
