// Liga uma sala a um identificador externo (ex.: id da sala no MERO).
// Uso: node --experimental-strip-types scripts/link-room.ts --room="SALA 01-BL02-S" --system=MERO --id=123
import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../src/config.ts';
import { normalizeRoomKey } from '../src/domain/normalize.ts';

loadEnv();
const arg = (n: string) => process.argv.slice(2).find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const [room, system, id] = [arg('room'), arg('system'), arg('id')];
if (!room || !system || !id) { console.error('Uso: --room="Nome" --system=MERO --id=123'); process.exit(1); }

const prisma = new PrismaClient();
try {
  const r = await prisma.room.findUnique({ where: { normalizedKey: normalizeRoomKey(room) } });
  if (!r) throw new Error(`Sala "${room}" não encontrada (o nome precisa ser igual ao do PDF, ignorando acento e pontuação)`);
  await prisma.roomExternalRef.upsert({
    where: { roomId_system: { roomId: r.id, system } },
    update: { externalId: id },
    create: { roomId: r.id, system, externalId: id },
  });
  console.log(`OK: ${r.canonicalName} -> ${system}:${id}`);
} finally {
  await prisma.$disconnect();
}
