#!/bin/sh
# Inicialização no contêiner: aplica as migrations e sobe a API.
set -e
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy
elif [ "$NODE_ENV" = "production" ]; then
  echo "ERRO: não há migrations em prisma/migrations. Rode 'npm run db:migrate' localmente e envie a pasta gerada." >&2
  exit 1
else
  echo "AVISO: sem migrations; usando 'prisma db push' (somente para desenvolvimento)."
  npx prisma db push --skip-generate
fi
exec node dist/src/main.js
