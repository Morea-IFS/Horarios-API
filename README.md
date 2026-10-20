# Horários API

API com os horários **previstos** das salas e laboratórios do IFS Campus Lagarto, lidos do PDF oficial da PROEN.

## 1. O que é uma API (em 30 segundos)

Uma API é um "garçom" para programas: outro sistema (o MERO, por exemplo) faz um **pedido** por um endereço web
(ex.: `/api/v1/rooms`) e recebe uma **resposta** em formato JSON, que é só texto organizado.
Aqui os pedidos são sempre de **leitura** ("quais salas existem?", "a sala X está livre terça às 9h?").
Você não precisa programar para testar: a API tem uma página com botões, o **Swagger** (`/docs`).

## 2. O que foi verificado e o que NÃO foi

| Parte | Situação |
|---|---|
| Lógica central: leitura da grade, validação, duplicatas, casamento de salas, disponibilidade, detecção de versão nova, preservar dados em caso de falha, descoberta do PDF | **Testada** (`npm test`, 58 testes passam) |
| Leitura do PDF real do IFS | **Testada com o PDF real 2026.2 inteiro** (63 páginas, 652 aulas, 0 erros): nenhum texto da grade é perdido e nenhuma aula se sobrepõe a outra. Os cards são delimitados pelas **linhas horizontais desenhadas** no PDF (não pelo conteúdo), então projetos, monitorias e cards sem docente ou sem turma funcionam. Avisos `CARD_UNCLASSIFIED` indicam cards sem turma/monitoria/projeto reconhecido (ficam como `OTHER`). |
| Servidor (NestJS), endpoints, Swagger, Prisma, PostgreSQL | **Escritos, mas nunca executados.** Os testes `npm run test:e2e` existem, mas ainda não rodaram. |
| GitHub Actions | **Escrito, nunca executado.** Só vale depois de rodar no seu GitHub. |
| Docker / Render / Supabase | **Escritos, nunca executados.** |

Por segurança, se a leitura do PDF real não bater com o esperado, a sincronização **é rejeitada** e nada é publicado.
O primeiro passo é rodar o PDF real inteiro (passo 4 abaixo) e ver o relatório.

## 3. Instalação (uma vez só)

1. Instale o **Node.js 22.18 ou mais novo** (recomendo o LTS atual): https://nodejs.org
2. (Opcional, para o banco local) Instale o **Docker Desktop**: https://www.docker.com/products/docker-desktop
3. Abra o terminal **dentro da pasta do projeto** e rode: `npm install`

## 4. Primeiro teste: o PDF real (não precisa de banco)

1. Baixe o PDF: https://www.ifs.edu.br/images/arquivos/Proen/horarios/lagarto/HORARIO_SALAS_2026_2.pdf
   e salve na pasta do projeto como `HORARIO_SALAS_2026_2.pdf`.
2. Rode: `npm test` (testes da lógica; devem passar todos).
3. Rode: `npm run inspect -- HORARIO_SALAS_2026_2.pdf`
   Mostra as salas encontradas, o número de aulas por sala e os problemas.
4. Rode: `npm run sync:dry -- --file=HORARIO_SALAS_2026_2.pdf`
   Resultado esperado: `DRY_RUN_OK` e `Erros: 0`. Avisos `CARD_UNCLASSIFIED` são esperados (cards como "partiuIF" ou "IFSKART"). Erros possíveis: `GRID_LINES_NOT_FOUND` (página sem linhas desenhadas), `CARD_TEXT_ON_BORDER` (texto em cima de uma linha divisória). Se aparecer `REJECTED`, **envie a saída** (e o arquivo `out/extraction.json`
   gerado pelo passo 3) — significa que o leiaute real difere do que assumi, e o ajuste é no extrator.

## 5. Rodar a API de verdade

```bash
cp .env.example .env              # (Windows: copy .env.example .env)
docker compose up -d db           # sobe o PostgreSQL local (porta 5433 no seu computador)
npm run db:push                   # cria as tabelas (desenvolvimento)
npm run build
node dist/src/cli/sync.js --file=HORARIO_SALAS_2026_2.pdf    # importa o PDF para o banco
npm start
```

Abra **http://localhost:3000/docs**. Para testar: clique em um endpoint → **Try it out** → **Execute**.

1. `GET /api/v1/rooms` → copie o `id` de uma sala.
2. `GET /api/v1/rooms/{id}/schedule` → cole o id; veja a grade semanal.
3. `GET /api/v1/availability` → `date=2026-10-19`, `start=09:20`, `end=11:00` → salas livres/ocupadas.
4. `GET /api/v1/metadata/current` → semestre, data do PDF, última sincronização.

**Sem Docker?** Crie um projeto grátis no Supabase, copie a string de conexão do **Session pooler** e coloque em `DATABASE_URL` no `.env`.

Para sincronizar pela internet (descobre o PDF mais novo na página oficial): `node dist/src/cli/sync.js`.

## 6. Endpoints

| Método e caminho | Para quê | Erros possíveis |
|---|---|---|
| `GET /api/v1/rooms?q=&page=&pageSize=` | Lista salas (paginado) | 400 |
| `GET /api/v1/rooms/:id/schedule?weekday=` | Grade semanal da sala | 400, 404 |
| `GET /api/v1/availability?date=&start=&end=&q=&onlyFree=` | Disponibilidade **prevista** | 400 (formato), 422 (data inexistente, fim ≤ início) |
| `GET /api/v1/metadata/current` | Versão atual e último sync | 503 (sem grade) |
| `GET /api/v1/health` | Saúde da API e do banco | 503 (banco fora) |

Todos podem responder `429` (limite de requisições, padrão 60/min por IP) e `503` se ainda não houver grade importada.
Erros têm sempre o formato `{ statusCode, error, message, path, timestamp }`.

## 7. Como a atualização funciona

1. Lê a página oficial e acha os links `HORARIO_SALAS_AAAA_N.pdf`; pega o semestre mais novo.
   **Atenção:** a página tem rótulos que não batem com os arquivos, então o semestre real é confirmado dentro do PDF
   (rodapé "Horário AAAA/N"); se divergir do nome do arquivo, a versão é rejeitada.
2. Baixa o PDF e calcula o hash (SHA-256). Hash igual ao da versão ativa = nada a fazer.
   Isso detecta PDF trocado **na mesma URL**.
3. Extrai, valida e só então publica, **numa transação única**. Falhou em qualquer ponto = a versão anterior continua valendo.
4. Nunca aceita um semestre mais antigo que o ativo.
5. Toda execução fica registrada na tabela `import_runs` (visível em `/metadata/current`).

Nomes de sala só são ligados a salas antigas quando são **idênticos** (ignorando acento e pontuação).
Nomes parecidos ("OFICINA" × "OFICINA SL-01") viram aviso `ROOM_NEEDS_REVIEW` e a sala é tratada como nova.
Para ligar uma sala a um id externo (ex.: MERO): `npm run room:link -- --room="SALA 01-BL02-S" --system=MERO --id=123`.

## 8. GitHub Actions (precisa de um repositório — opcional)

Arquivo: `.github/workflows/sync-horarios.yml` (toda segunda, 06:00 de Brasília, e manual).

1. Crie o repositório e envie o projeto (o `.env` NÃO vai: está no `.gitignore`).
2. Em **Settings → Secrets and variables → Actions**, crie o secret `DATABASE_URL`.
   Use a string do **Session pooler** do Supabase: as máquinas do GitHub usam IPv4 e a conexão direta do Supabase costuma ser só IPv6 (confirme no painel).
3. Execução manual: aba **Actions → Sincronizar horários → Run workflow** (há opções "só validar" e "forçar").
4. O relatório (`sync-report.json`) fica como artefato da execução. Falha/rejeição deixa a execução vermelha, mas os dados antigos permanecem.

Não considere a automação funcional até uma execução manual ter terminado em verde.
Aviso do GitHub: workflows agendados são desativados após ~60 dias sem atividade no repositório.

## 9. Migrations e produção

`db:push` é só para desenvolvimento. Para produção, gere as migrations uma vez e **envie a pasta `prisma/migrations`**:

```bash
npm run db:migrate     # cria prisma/migrations/...init
npm run db:deploy      # aplica migrations existentes (usado no contêiner)
```

O contêiner (`scripts/start.sh`) recusa subir em produção sem migrations.

## 10. Hospedagem gratuita: riscos (confira os planos atuais antes de contar com eles)

- **Render (grátis):** o serviço "dorme" por inatividade; a primeira requisição depois disso demora (cold start). Sem garantia de disponibilidade.
- **Supabase (grátis):** projetos podem ser **pausados por inatividade**; limites de armazenamento e conexões; **sem backups automáticos** nesse plano. Faça `pg_dump` periódico se os dados importarem (aqui são recriáveis a partir do PDF).
- **Postgres gratuito do Render** costuma ser temporário; por isso a escolha do Supabase.
- Deploy no Render: crie um Web Service apontando para o repositório (usa o `Dockerfile`; `render.yaml` é um modelo), defina `DATABASE_URL`, health check em `/api/v1/health`.

## 11. Integração futura com o MERO

```js
const res = await fetch('https://SUA-API/api/v1/availability?date=2026-10-19&start=09:20&end=11:00&onlyFree=true');
const { data, notice } = await res.json();   // data[].room.name, data[].free
```

Mostre sempre o `notice`: é uma **previsão pela grade regular**, sem feriados, eventos, trocas de sala ou reservas.

## Endpoints usados pelo MERO

| Endpoint | Para quê |
|---|---|
| `GET /api/v1/periods` | Os 15 horários de aula (1 a 14, com 5,5) e o semestre |
| `GET /api/v1/availability?date&start&end` | Salas livres/ocupadas numa janela; cada sala livre traz `freeUntil` ("livre até 13:50") |
| `GET /api/v1/rooms` e `/rooms/:id/schedule` | Lista de salas e a semana de uma sala |
| `GET /api/v1/classes` | Turmas com aula (ex.: `3º BSI-N`), com curso, período e turno |
| `GET /api/v1/sessions?classCode&q&weekday&roomId` | Aulas em todas as salas: semana de uma turma ou busca por disciplina, docente ou turma (sem acento) |

## 12. Como os cards são lidos (descoberto no PDF real)

No PDF do IFS os cards **não são retângulos coloridos**: são só texto (disciplina, turma, docente) dentro de uma célula.
O que existe são **linhas horizontais desenhadas** entre os períodos: em cada coluna, a linha só aparece onde um card termina
(dentro de um card de vários períodos não há linha). Portanto, **card = trecho da coluna entre duas linhas que contém texto**.
Isso não depende do conteúdo, então projetos, monitorias e cards sem turma ou sem docente funcionam.

O que não se encaixa vira **erro**, nunca palpite: página sem linhas (`GRID_LINES_NOT_FOUND`) ou texto em cima de uma linha
divisória (`CARD_TEXT_ON_BORDER`). Cards sem turma, monitoria ou projeto reconhecido entram como `OTHER` com aviso `CARD_UNCLASSIFIED`.
Cards com fonte minúscula (o aSc encolhe o texto quando não cabe) são lidos normalmente.
Os parâmetros ficam em `GRID` (`src/domain/grid.ts`); a verificação foi feita no PDF 2026.2 inteiro (63 páginas, 652 aulas).

## 13. Decisões e limitações

- Sem endpoints administrativos: a sincronização acessa o banco direto (CLI), então não há porta de escrita exposta.
- O texto do card (turma, disciplina, docente) vem em `lines`, **sem separar docente de disciplina**, porque o formato é ambíguo no PDF. `classCodes` traz as turmas normalizadas.
- O PDF não informa início/fim do semestre; `/availability` não bloqueia datas fora do semestre.
- Docentes aparecem nos textos porque estão no PDF público; remova de `lines` se não quiser expô-los.
- Não há filtro por tipo de sala (laboratório/sala): o PDF não traz esse campo e não vou inferi-lo.

## 14. Estrutura

```
src/domain/       lógica pura (testada): grid, validate, availability, discovery, sync, room-matcher
src/pdf/          leitura do PDF (pdfjs-dist) -> geometria
src/persistence/  Prisma (leitura da API e gravação do sync)
src/{rooms,availability,metadata,health}/   módulos NestJS
src/cli/sync.ts   sincronização (usada localmente e pelo GitHub Actions)
scripts/          inspect (diagnóstico do PDF), link-room, start.sh
test/domain/      testes da lógica   |   test/fixtures/ páginas reais do PDF   |   test/e2e/  testes dos endpoints
prisma/schema.prisma   modelo do banco
```

## 15. Problemas comuns

- `node: bad option` ou erro de `.ts`: Node antigo. Precisa de 22.18+.
- `REJECTED` no passo 4: envie a saída; o ajuste é no extrator.
- `Can't reach database server`: o Docker está ligado? `docker compose up -d db`.
