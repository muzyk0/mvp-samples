# nestjs-go-export-excel-wasm

Sample для честного сравнения двух Excel-export путей в NestJS, где оба экспортёра (`exceljs` и Go/WASM) читают **один и тот же dataset из SQLite через Prisma**.

## Что внутри

- Prisma ORM + SQLite (`prisma/schema.prisma`, migration, seed)
- NestJS `PrismaModule` / `PrismaService`
- единый repository/data-access слой для export dataset
- два независимых HTTP entrypoint'а:
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
2. `ExportDatasetRepository` читает один и тот же набор строк для обоих экспортёров;
3. `ExportComparisonService` строит dataset **один раз** и передаёт его и в `exceljs`, и в `wasm`;
4. `seed` влияет на deterministic slice из БД, чтобы запросы оставались воспроизводимыми, даже если источник теперь не in-memory.

То есть benchmark сравнивает именно разницу экспортёров, а не разницу источников данных.

## Prisma / SQLite setup

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

По умолчанию используется `DATABASE_URL="file:./prisma/dev.db"`.

### Seed strategy

- таблица: `Employee`
- размер seed dataset по умолчанию: **10_000** сотрудников
- dataset строится детерминированно через общий генератор (`src/export/data/employee-generator.ts`)
- можно переопределить:
  - `SEED_EMPLOYEE_COUNT`
  - `SEED_DATASET_SEED`

## Запуск

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
npm run start:dev
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
  -d '{"limit":2000,"seed":12345,"fileName":"exceljs.xlsx"}' \
  --output exceljs.xlsx
```

### WASM export

```bash
curl -X POST http://localhost:3000/export/wasm/download \
  -H 'Content-Type: application/json' \
  -d '{"limit":2000,"seed":12345,"fileName":"wasm.xlsx"}' \
  --output wasm.xlsx
```

### Benchmark comparison

```bash
curl http://localhost:3000/export/benchmark/default

curl -X POST http://localhost:3000/export/benchmark \
  -H 'Content-Type: application/json' \
  -d '{"limit":5000,"seed":42,"includeMemory":true}'
```

### Scripted benchmark

```bash
npm run test:comparison
```

Скрипт ожидает поднятое приложение на `BASE_URL` (по умолчанию `http://localhost:3000`) и вызывает `POST /export/benchmark`.

## Проверка локально

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

## Замечания

- WASM-ветка всё ещё экспериментальная и запускается последовательно через очередь, чтобы избежать гонок из-за глобального Go/WASM state.
- Потоковая отдача пока сведена к безопасной отдаче готового `Buffer` в ответ; это менее амбициозно, но стабильнее для сравнения вариантов.
- Единственный актуальный WASM-артефакт хранится в `excel-streamer/`.
- Для пересборки `excel_bridge.wasm` нужен Go toolchain; удобнее всего запустить `npm run build:wasm`.
