# Horários API

API REST com os horários **previstos** das salas e laboratórios do IFS Campus Lagarto, lidos do PDF oficial da PROEN.
É usada pelo **MERO** ([mapa-ifs-react](https://github.com/Morea-IFS/mapa-ifs-react)) na página `/horarios`.

Este README é o tutorial para quem vai mexer no projeto: o que instalar, como rodar tudo na sua máquina e como entregar.

**Em produção:**

| O quê | Endereço |
|---|---|
| API | https://mero-api-gltq.onrender.com/api/v1 (Swagger em https://mero-api-gltq.onrender.com/docs) |
| Página que usa a API | https://mero.morea-ifs.org/horarios |

---

## 1. Como funciona (resumo)

```
PDF oficial (ifs.edu.br) ──sync (CLI)──▶ PostgreSQL ◀──leitura── API NestJS (/api/v1, só GET) ◀──HTTP/JSON── MERO (/horarios)
```

- **Só o sync grava** no banco (`src/cli/sync.ts`). A API apenas lê e não tem rota de escrita.
- Cada PDF importado vira uma **versão**. Uma única versão fica ativa (`current_version`), e a troca de versão acontece numa transação.
- O MERO chama a API **direto do navegador** usando `NEXT_PUBLIC_HORARIOS_API_URL`. Por isso a API precisa liberar a origem do mapa no CORS.

## 2. Situação atual

| Parte | Situação |
|---|---|
| Lógica (grade, validação, disponibilidade, sync) | Testada com `npm test` |
| Leitura do PDF real 2026.2 | Testada: 63 salas, 652 aulas, 0 erros |
| API, Prisma, PostgreSQL e imagem Docker | Rodando localmente e em produção |
| Integração com o MERO (`/horarios`) | **No ar** desde 22/10/2026 (`master` do mapa, publicada pela Vercel) |
| GitHub Actions | CI verde, sync manual testado e Release `v1.0.1` com deploy automático no Render |
| Supabase (banco de produção) | Região us-east-2. Migration aplicada e grade 2026.2 importada |
| Render (API em produção) | Serviço `mero-api`, plano free, região Virginia. Deploy só por tag `v*` |

## 3. Dependências

| Ferramenta | Versão | Para quê |
|---|---|---|
| [Node.js](https://nodejs.org) | **22.18 ou mais novo** (o contêiner usa 22.23.4) | Rodar, buildar e testar. A API usa TypeScript nativo do Node |
| npm | O que vem com o Node | Instalar pacotes |
| [Docker](https://docs.docker.com/get-docker/) + Docker Compose | Recente | Banco PostgreSQL 16 local e imagem da API |
| Git | Qualquer | Clonar e trabalhar nas branches |

As versões das bibliotecas estão fixadas no `package-lock.json`. Use `npm ci`, e não `npm install`, para instalar exatamente o que está lá.

## 4. Primeira vez na máquina

```bash
git clone https://github.com/Morea-IFS/Horarios-API.git
cd Horarios-API
git switch develop
npm ci
```

Baixe o PDF de horários e salve na pasta do projeto como `HORARIO_SALAS_2026_2.pdf`:
https://www.ifs.edu.br/images/arquivos/Proen/horarios/lagarto/HORARIO_SALAS_2026_2.pdf

```bash
# 1. Banco local (contêiner horarios-api-db-1, porta 5433 no seu PC)
docker compose up -d

# 2. Conexão do banco local para os comandos abaixo
export DATABASE_URL="postgresql://mero:mero_local_dev@localhost:5433/mero_horarios"

# 3. Cria as tabelas (aplica prisma/migrations) e compila
npm run db:deploy
npm run build

# 4. Importa o PDF (esperado: PUBLISHED, 63 salas, 652 aulas, 0 erros)
npm run sync -- --file=HORARIO_SALAS_2026_2.pdf

# 5. Cria a imagem e o contêiner da API (porta 3000)
docker build -t horarios-api:local .
docker run -d --name horarios-api-local -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://mero:mero_local_dev@host.docker.internal:5433/mero_horarios" \
  horarios-api:local
```

Por que `host.docker.internal` no passo 5: dentro do contêiner, `localhost` é o próprio contêiner. Esse nome aponta para o seu PC, onde o banco está na porta 5433.

Confira:

```bash
curl http://localhost:3000/api/v1/health     # esperado: "status": "ok" e database "up"
```

## 5. Dia a dia

```bash
docker compose up -d                  # banco
docker start horarios-api-local       # API
```

| Endereço | O que é |
|---|---|
| http://localhost:3000/docs | Swagger: lista as rotas e testa cada uma (**Try it out → Execute**) |
| http://localhost:3000/api/v1/health | Saúde da API e do banco |
| http://localhost:3000/ | Responde **404, e isso é normal**: as rotas ficam em `/api/v1` |

- Logs: `docker logs -f horarios-api-local`
- Desligar: `docker stop horarios-api-local horarios-api-db-1`. Os dados ficam no volume do Docker `mero_pgdata`.

**Banco local** (dados do `docker-compose.yml`; a senha serve **só** para uso local):

| Host | Porta | Banco | Usuário | Senha |
|---|---|---|---|---|
| `localhost` | `5433` | `mero_horarios` | `mero` | `mero_local_dev` |

Abra no DBeaver, no pgAdmin ou pelo terminal: `docker exec -it horarios-api-db-1 psql -U mero -d mero_horarios` (`\dt` lista as tabelas, `\q` sai).

### Rodar o MERO usando esta API

No repositório `mapa-ifs-react`, depois de `npm ci`:

```bash
NEXT_PUBLIC_HORARIOS_API_URL=http://localhost:3000/api/v1 npx next dev -p 3001
```

Abra http://localhost:3001/horarios. A porta 3001 evita conflito com a API. O CORS da API libera qualquer origem por padrão (`CORS_ORIGINS=*`).

### Rodar a API sem Docker (opcional, para depurar)

Com o banco no ar e o `DATABASE_URL` exportado: `npm run start:dev` (compila e sobe na porta 3000). Antes, pare o contêiner, porque os dois usam a mesma porta.

### Quando algo muda

| Mudou | O que fazer |
|---|---|
| Código da API | `docker build -t horarios-api:local .`, depois `docker rm -f horarios-api-local` e o `docker run` do passo 5 |
| `prisma/schema.prisma` | `npm run db:migrate` gera uma migration nova em `prisma/migrations`; **envie a pasta no commit** e recrie o contêiner |
| PDF novo | `npm run build` e depois `npm run sync -- --file=ARQUIVO.pdf` (com `DATABASE_URL` exportado) |
| Nome de sala no PDF | No mapa, atualize `src/data/horariosRooms.ts`: o "Traçar rota" casa a sala **pelo nome** |

## 6. Variáveis de ambiente

| Variável | Onde | Padrão | Para quê |
|---|---|---|---|
| `DATABASE_URL` | API e sync | (obrigatória) | Conexão PostgreSQL |
| `PORT` | API | `3000` | Porta HTTP |
| `CORS_ORIGINS` | API | `*` | Origens liberadas, separadas por vírgula (ex.: a URL da Vercel) |
| `RATE_LIMIT_PER_MINUTE` | API | `300` | Limite de requisições por IP |
| `NODE_ENV` | API | n/d | Em `production`, o contêiner exige migrations |
| `NEXT_PUBLIC_HORARIOS_API_URL` | Mapa | `http://localhost:3000/api/v1` | URL da API vista pelo navegador. É **pública** de propósito |

Você pode usar um arquivo `.env` (há um modelo em `.env.example`). O `.env` está no `.gitignore` e no `.dockerignore`: **nunca o envie para o repositório**.
Em produção, os valores reais ficam nos painéis (Render, Vercel) e nos *secrets* do GitHub.

## 7. Testes e verificações

```bash
npm test             # testes da lógica (test/domain)
npm run test:e2e     # testes das rotas, com repositório em memória (não precisa de banco)
npm run typecheck    # checagem de tipos
npm run inspect -- HORARIO_SALAS_2026_2.pdf          # diagnóstico do PDF: salas, aulas, problemas
npm run sync:dry -- --file=HORARIO_SALAS_2026_2.pdf  # valida a importação sem gravar (esperado: DRY_RUN_OK)
```

Se aparecer `REJECTED`, a leitura do PDF não bateu com o esperado: o ajuste é no extrator (`src/domain/grid.ts`).

## 8. Rotas (todas em `/api/v1`)

| Rota | Para quê | Erros |
|---|---|---|
| `GET /health` | Saúde da API e do banco | 503 (banco fora) |
| `GET /metadata/current` | Semestre, data do PDF, último sync | 503 (sem grade) |
| `GET /periods` | Os 15 horários de aula (1 a 14 e o 5,5) | |
| `GET /rooms?q=&page=&pageSize=` | Lista de salas (paginada) | 400 |
| `GET /rooms/:id/schedule?weekday=` | Semana de uma sala | 400, 404 |
| `GET /availability?date=&start=&end=&q=&onlyFree=` | Salas livres e ocupadas; as livres trazem `freeUntil` | 400, 422 |
| `GET /classes` | Turmas com aula (ex.: `3º BSI-N`) | |
| `GET /sessions?classCode=&q=&weekday=&roomId=` | Aulas: semana de uma turma ou busca (sem acento) | 400 |

Todas as rotas podem responder `429` (limite de requisições) e `503` (grade ainda não importada).
Erros seguem sempre o formato `{ statusCode, error, message, path, timestamp }`.
Mostre sempre o `notice` da resposta: os dados são uma **previsão pela grade regular**, sem feriados, eventos, trocas de sala ou reservas.

## 9. Estrutura do código

```
src/domain/       lógica pura e testada: grid, validate, availability, discovery, sync, room-matcher
src/pdf/          leitura do PDF (pdfjs-dist) -> geometria
src/persistence/  Prisma: leitura (API) e gravação (sync)
src/{rooms,availability,sessions,metadata,health}/   módulos NestJS (controller -> service -> repositório)
src/cli/sync.ts   sincronização (local e GitHub Actions)
scripts/          inspect (diagnóstico do PDF), link-room, start.sh (inicialização do contêiner)
test/domain/      testes da lógica  |  test/fixtures/ páginas reais do PDF  |  test/e2e/ testes das rotas
prisma/           schema.prisma e migrations
```

Para criar uma rota nova, siga um módulo existente (ex.: `src/rooms/`): controller, service e DTO, mais o registro em `app.module.ts`.

## 10. Como a sincronização funciona

1. Lê a página oficial e acha os links `HORARIO_SALAS_AAAA_N.pdf`, pegando o semestre mais novo. O semestre real é confirmado dentro do PDF (rodapé "Horário AAAA/N"). Se divergir do nome do arquivo, a versão é rejeitada.
2. Calcula o SHA-256 do PDF. Se o hash for igual ao da versão ativa, não faz nada. Isso detecta PDF trocado na mesma URL.
3. Extrai, valida e só então publica, numa transação única. Se falhar em qualquer ponto, a versão anterior continua valendo.
4. Nunca aceita um semestre mais antigo que o ativo.
5. Cada execução fica registrada na tabela `import_runs` (visível em `/metadata/current`).

Sem `--file`, o sync baixa o PDF mais novo da internet: `npm run sync`.

**Salas entre semestres:** só são ligadas quando o nome normalizado é idêntico (ignorando acento e pontuação). Nomes parecidos geram o aviso `ROOM_NEEDS_REVIEW`.
Para guardar o id de uma sala em outro sistema: `npm run room:link -- --room="SALA 01-BL02-S" --system=MERO --id=123`. O mapa **ainda não usa** esses ids; hoje ele casa as salas pelo nome.

**Como os cards são lidos:** no PDF do IFS, os cards são só texto dentro de uma célula. O que delimita cada card são as **linhas horizontais desenhadas** entre os períodos.
Então: card = trecho da coluna entre duas linhas que contém texto.
- O que não se encaixa vira erro, nunca palpite: `GRID_LINES_NOT_FOUND` e `CARD_TEXT_ON_BORDER`.
- Cards sem turma, monitoria ou projeto reconhecido entram como `OTHER`, com o aviso `CARD_UNCLASSIFIED`.
- Os parâmetros ficam em `GRID` (`src/domain/grid.ts`).

## 11. Fluxo de trabalho e entrega (CI/CD)

- Trabalhe na `develop` ou numa `feature/*`. A `main` recebe só versões prontas, com merge feito pelo responsável.
- **CI** (`.github/workflows/ci.yml`): a cada push em `develop`, `main` ou `feature/**` e em todo PR, roda `npm ci`, os testes, o typecheck, os testes e2e e o build da imagem.
- **Release** (`.github/workflows/release.yml`): ao criar uma tag `v*` (ex.: `git tag v1.0.0 && git push origin v1.0.0`), publica a imagem em `ghcr.io/morea-ifs/horarios-api` (`:<versão>` e `:latest`, como registro da versão), cria a Release e chama o Deploy Hook do Render com o commit da tag. O Render monta a própria imagem a partir do `Dockerfile` deste repositório.
- **Sync semanal** (`.github/workflows/sync-horarios.yml`): toda segunda às 06:00 (Brasília) e também manual. Usa o secret `DATABASE_URL`.

**Configuração única, feita por quem administra o repositório:**
- **Secrets do GitHub:** crie `DATABASE_URL` (Session pooler do Supabase, porque o GitHub usa IPv4) e `RENDER_DEPLOY_HOOK_URL`.
- **No Render:** crie um Web Service a partir do **repositório público** `https://github.com/Morea-IFS/Horarios-API`, branch `main`, runtime **Docker**, região **Virginia** (a mesma dos outros serviços da área de trabalho; o Supabase, em Ohio, fica ao lado) e **Auto-Deploy desligado** (modelo em `render.yaml`). Defina `DATABASE_URL`, `NODE_ENV=production` e `CORS_ORIGINS=https://mero.morea-ifs.org`. O health check fica em `/api/v1/health`. Copie o **Deploy Hook** (Settings) para o secret `RENDER_DEPLOY_HOOK_URL`.
- **Na Vercel** (projeto do mapa): defina `NEXT_PUBLIC_HORARIOS_API_URL` com a URL do Render terminando em `/api/v1`.

Ao subir, o contêiner (`scripts/start.sh`) roda `prisma migrate deploy` antes da API. Em produção, ele recusa subir se não houver migrations.

## 12. Hospedagem gratuita: riscos

Confira os planos atuais antes de contar com eles:
- **Render (grátis):** o serviço "dorme" por inatividade, e a primeira requisição depois disso demora. O mapa espera até 45 s. Cada deploy monta a imagem do zero, o que leva alguns minutos.
- **Supabase (grátis):** o projeto pode ser pausado por inatividade e não tem backup automático. Os dados podem ser recriados a partir do PDF.
- **GitHub Actions:** workflows agendados são desativados depois de cerca de 60 dias sem atividade no repositório.

## 13. Decisões e limitações

- Não há rotas administrativas: o sync acessa o banco direto pela CLI.
- O texto do card vem em `lines`, sem separar docente de disciplina, porque isso é ambíguo no PDF. `classCodes` traz as turmas normalizadas.
- O PDF não informa início e fim do semestre, então `/availability` não bloqueia datas fora dele.
- Docentes aparecem nos textos porque estão no PDF público.
- Não há filtro por tipo de sala: o PDF não traz esse campo.

## 14. Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `Cannot GET /` (404) | Normal. Use `/docs` ou `/api/v1/...` |
| `Can't reach database server` | O banco não está no ar: `docker compose up -d` |
| `/health` com `database: down` no contêiner | Falta o `--add-host=host.docker.internal:host-gateway` ou o `DATABASE_URL` aponta para `localhost` |
| `port is already allocated` | Já há algo na 3000 (outro contêiner ou `npm run start:dev`): `docker ps` |
| `503` em todas as rotas | A grade não foi importada: rode o sync (passo 4) |
| `node: bad option` ou erro de `.ts` | Node antigo: precisa do 22.18+ |
| Erro de CORS no navegador | Inclua a origem do mapa em `CORS_ORIGINS` |
| `REJECTED` no sync | A leitura do PDF não bateu: veja `npm run inspect` e ajuste o extrator |
