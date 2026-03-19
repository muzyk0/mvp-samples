# nestjs-go-export-excel-wasm

Sample для честного сравнения двух **streaming Excel export** путей в NestJS, где оба экспортёра (`exceljs` и Go/WASM) читают **один и тот же dataset из SQLite через Prisma**.

## Что внутри

- Prisma ORM + SQLite (`prisma/schema.prisma`, migration, seed)
- NestJS `PrismaModule` / `PrismaService`
- единый repository/data-access слой для export dataset
- общий stream-plan для обоих экспортёров
- два HTTP entrypoint'а:
  - `POST /export/exceljs/download`
  - `POST /export/wasm/download`
- benchmark endpoint:
  - `GET /export/benchmark/default`
  - `POST /export/benchmark`
- preview endpoint:
  - `POST /export/data`

## Архитектура

Ключевая цель — честное сравнение:

1. данные живут в SQLite;
2. `ExportDatasetRepository` строит **одинаковый stream-plan** для обоих экспортёров;
3. строки читаются из Prisma **батчами**, а не одним большим массивом;
4. `seed` и `offset` по-прежнему определяют deterministic slice из БД;
5. benchmark сравнивает именно разницу экспортёров, а не разницу источников данных.

### Что реально stream'ится

#### ExcelJS

- используется `ExcelJS.stream.xlsx.WorkbookWriter`;
- строки коммитятся по мере чтения батчей из Prisma;
- `.xlsx` пишется сразу в `Writable` (HTTP response или temp file для benchmark);
- готовый workbook **не собирается целиком в JS buffer** перед ответом.

#### WASM

- JS-слой больше не собирает чанки в памяти перед отправкой;
- Go/WASM bridge пишет `.xlsx` в кастомный writer, который отдает байты обратно в Node по мере `file.Write(...)`;
- Node сразу пишет эти байты в `Writable` (HTTP response или temp file для benchmark);
- итоговый `.xlsx` **не буферится целиком в Node/Nest перед ответом**.

### Что всё ещё не идеально

- Excelize внутри Go/WASM всё ещё управляет собственной внутренней структурой workbook до финальной записи zip-потока; это лучше, чем буферить готовый файл ещё и в Node, но не магически делает zero-memory export.
- WASM-ветка по-прежнему выполняется последовательно через очередь из-за глобального Go/WASM runtime state.
- В unit-тестах используются buffer helper'ы, но они нужны только для валидации содержимого generated `.xlsx`, а не для production download path.

## Prisma / SQLite setup

```bash
bun install
bun run prisma:generate
bun run prisma:migrate
bun run prisma:seed
```

По умолчанию используется `DATABASE_URL="file:./prisma/dev.db"`.

### Seed strategy

- таблица: `Employee`
- размер seed dataset по умолчанию: **10_000** сотрудников
- dataset строится детерминированно через общий генератор (`src/export/data/employee-generator.ts`)
- seed пишет данные **батчами**, не собирая весь dataset в один большой JS-массив
- batch insert по умолчанию: **1000** записей за итерацию
- можно переопределить:
  - `SEED_EMPLOYEE_COUNT`
  - `SEED_DATASET_SEED`
  - `SEED_BATCH_SIZE`

Пример большого batched seed:

```bash
SEED_EMPLOYEE_COUNT=200000 SEED_BATCH_SIZE=1000 bun run prisma:seed
```

## WASM build

`excel-streamer/excel_bridge.wasm` и `excel-streamer/wasm_exec.js` — это **сгенерированные build-артефакты**. Они не должны храниться в git: их нужно собирать локально, в CI или на этапе деплоя.

В окружениях, где Go не в `PATH`, сначала добавь его в `PATH` удобным для твоей системы способом, затем собери WASM:

```bash
export PATH="/path/to/go/bin:$PATH"
bun run build:wasm
```

## Запуск

```bash
bun install
export PATH="/path/to/go/bin:$PATH" # если нужен rebuild wasm
bun run prisma:generate
bun run prisma:migrate
bun run prisma:seed
bun run build
bun run start:dev
```

## Примеры

### Preview данных

```bash
curl -X POST http://localhost:3000/export/data \
  -H 'Content-Type: application/json' \
  -d '{"limit":5,"seed":12345}'
```

### ExcelJS export

```bash
curl -X POST http://localhost:3000/export/exceljs/download \
  -H 'Content-Type: application/json' \
  -d '{"limit":2000,"seed":12345,"batchSize":500,"fileName":"exceljs.xlsx"}' \
  --output exceljs.xlsx
```

### WASM export

```bash
curl -X POST http://localhost:3000/export/wasm/download \
  -H 'Content-Type: application/json' \
  -d '{"limit":2000,"seed":12345,"batchSize":500,"fileName":"wasm.xlsx"}' \
  --output wasm.xlsx
```

### Benchmark comparison

```bash
curl http://localhost:3000/export/benchmark/default

curl -X POST http://localhost:3000/export/benchmark \
  -H 'Content-Type: application/json' \
  -d '{"limit":5000,"seed":42,"batchSize":500,"includeMemory":true}'
```

### Scripted benchmark

```bash
bun run test:comparison
```

Скрипт ожидает поднятое приложение на `BASE_URL` (по умолчанию `http://localhost:3000`) и вызывает `POST /export/benchmark`.

## Проверка локально

```bash
export PATH="/path/to/go/bin:$PATH" # если пересобираешь wasm
bun run build:wasm
bun run prisma:generate
bun run prisma:migrate
bun run prisma:seed
bun run build
bun run test
bun run test:e2e
```
