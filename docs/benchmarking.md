# Benchmarking and Large Dataset Runs

Эта инструкция нужна для ручного запуска benchmark'ов и больших прогонов экспорта в этом репозитории.

## Зачем это нужно

Проект сравнивает два варианта экспорта Excel:
- `exceljs`
- `wasm`

Для больших наборов данных важно смотреть не только на корректность, но и на:
- время выполнения;
- потребление памяти;
- размер итогового файла;
- устойчивость на больших объёмах (`10k`, `50k`, `100k`, `200k`).

## Важный нюанс про большие seed-данные

`prisma/seed.ts` теперь генерирует сотрудников и делает `createMany` **батчами**, а не строит весь dataset целиком в памяти. Это заметно снижает пиковое потребление RAM и делает прогоны на `100k`/`200k+` практичнее.

По умолчанию используется `SEED_BATCH_SIZE=1000`, но его можно менять под машину/драйвер:

```bash
SEED_BATCH_SIZE=1000 npm run prisma:seed
```

Если на очень больших объёмах всё же хочется больше запаса, можно дополнительно увеличить heap Node.js, но это уже fallback, а не обязательное условие batched seed:

```bash
NODE_OPTIONS="--max-old-space-size=4096" SEED_BATCH_SIZE=1000 npm run prisma:seed
```

---

## 1. Перейти в sample

```bash
cd /home/admin/.openclaw/workspace/projects/mvp-samples
```

---

## 2. Подготовить большие данные

### Пример: 200k записей

```bash
export SEED_EMPLOYEE_COUNT=200000
export SEED_DATASET_SEED=20260315
export SEED_BATCH_SIZE=1000
```

Далее:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Если данных нужно меньше, можно поменять `SEED_EMPLOYEE_COUNT`, например:
- `10000`
- `50000`
- `100000`
- `200000`

---

## 3. Собрать проект

```bash
npm run build
```

Если нужен пересбор Go/WASM bridge:

```bash
npm run build:wasm
```

Если `go` не в `PATH`, сначала добавьте его в окружение.

---

## 4. Запустить приложение

### Production build

```bash
PORT=3100 npm run start:prod
```

или эквивалентно:

```bash
PORT=3100 node dist/src/main.js
```

После запуска приложение будет доступно на:

```text
http://localhost:3100
```

Проверка health:

```bash
curl http://localhost:3100/export/exceljs/health
```

---

## 5. Запуск benchmark script

В отдельной консоли:

```bash
cd /home/admin/.openclaw/workspace/projects/mvp-samples
```

### Примеры запусков

#### 10k

```bash
BASE_URL=http://localhost:3100 LIMIT=10000 SEED=12345 npm run test:comparison
```

#### 50k

```bash
BASE_URL=http://localhost:3100 LIMIT=50000 SEED=12345 npm run test:comparison
```

#### 100k

```bash
BASE_URL=http://localhost:3100 LIMIT=100000 SEED=12345 TIMEOUT=300000 npm run test:comparison
```

#### 200k

```bash
BASE_URL=http://localhost:3100 LIMIT=200000 SEED=12345 TIMEOUT=300000 npm run test:comparison
```

Для больших наборов данных лучше сразу задавать повышенный timeout.

---

## 6. Прямой вызов benchmark endpoint

Если хочется вызывать benchmark без helper script:

```bash
curl -X POST http://localhost:3100/export/benchmark \
  -H 'content-type: application/json' \
  -d '{
    "limit": 10000,
    "seed": 12345,
    "fileName": "benchmark.xlsx",
    "includeMemory": true
  }'
```

Можно менять:
- `limit`
- `seed`
- `fileName`
- `includeMemory`

---

## 7. Как интерпретировать результаты

В benchmark ответе обычно важны:
- `exceljs.durationMs`
- `wasm.durationMs`
- `exceljs.sizeBytes`
- `wasm.sizeBytes`
- `exceljs.memoryDeltaBytes`
- `wasm.memoryDeltaBytes`
- `delta.*`

### Важно

`memoryDeltaBytes` — это грубая прикладная метрика, а не идеальный профайлер.

Особенно для `wasm` это может быть не полной правдой, потому что часть памяти может жить:
- вне обычного Node heap;
- внутри wasm runtime;
- во внутренних буферах stream/runtime.

Поэтому memory-результаты лучше интерпретировать как ориентир, а не как абсолютную истину.

---

## 8. Рекомендуемый сценарий сравнения

Чтобы сравнение было честнее:

1. Использовать один и тот же `seed`
2. Использовать одинаковый `limit`
3. Прогонять несколько размеров:
   - `10000`
   - `50000`
   - `100000`
   - `200000`
4. На каждый размер делать несколько прогонов
5. Сравнивать средние значения, а не один случайный запуск

---

## 9. Известные ограничения

### Seed на 200k+
Теперь выполняется батчами и обычно не требует отдельного full-dataset массива в памяти. При желании можно подобрать `SEED_BATCH_SIZE` под конкретную машину.

### WASM memory metrics
Могут быть менее показательными, чем для чистого Node-пути.

### Streaming не означает нулевую память
Даже streaming экспорт не гарантирует “почти 0 RAM”, потому что:
- библиотеки всё равно держат внутреннее состояние workbook;
- есть stream buffers;
- у `wasm` есть дополнительные runtime overhead'ы.

Но streaming всё равно лучше полного buffer-based подхода на больших объёмах.

---

## 10. Короткий happy path

Если нужен самый короткий практический сценарий:

```bash
cd /home/admin/.openclaw/workspace/projects/mvp-samples
export SEED_EMPLOYEE_COUNT=200000
export SEED_DATASET_SEED=20260315
export SEED_BATCH_SIZE=1000
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
PORT=3100 npm run start:prod
```

Потом в другой консоли:

```bash
cd /home/admin/.openclaw/workspace/projects/mvp-samples
BASE_URL=http://localhost:3100 LIMIT=100000 SEED=12345 TIMEOUT=300000 npm run test:comparison
```
