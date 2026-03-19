# Benchmarking and Large Dataset Runs

Эта инструкция нужна для ручного запуска benchmark'ов и больших прогонов экспорта в проекте `nestjs-go-export-excel-wasm`.

## Зачем это нужно

Проект сравнивает три варианта экспорта Excel:
- `exceljs`
- `wasm` (Go/WASM)
- `rust-wasm`

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
cd /home/admin/.openclaw/workspace/projects/mvp-samples/nestjs-go-export-excel-wasm
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

Если нужен пересбор Rust/WASM bridge:

```bash
npm run build:rust-wasm
```

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
cd /home/admin/.openclaw/workspace/projects/mvp-samples/nestjs-go-export-excel-wasm
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
- `goWasm.durationMs`
- `rustWasm.durationMs`
- `exceljs.sizeBytes`
- `goWasm.sizeBytes`
- `rustWasm.sizeBytes`
- `exceljs.memoryDeltaBytes`
- `goWasm.memoryDeltaBytes`
- `rustWasm.memoryDeltaBytes`
- `deltas.*`

### Важно

`memoryDeltaBytes` — это грубая прикладная метрика, а не идеальный профайлер.

Особенно для Go/Rust WASM это может быть не полной правдой, потому что часть памяти может жить:
- вне обычного Node heap;
- внутри wasm runtime;
- во внутренних буферах stream/runtime.

Поэтому memory-результаты лучше интерпретировать как ориентир, а не как абсолютную истину.

### Где сейчас концентрируется память в `rust-wasm`

Для больших `limit` у текущего Rust path есть четыре основные точки роста памяти:

1. JS собирает строки батчей в один payload-объект и затем сериализует его в JSON.
2. Rust/WASM держит workbook state внутри `rust_xlsxwriter` до финализации ZIP.
3. Финальный `.xlsx` материализуется целиком в Rust перед возвратом в JS.
4. Node все еще получает итоговый `Uint8Array`, но больше не делает дополнительную полную
   копию через `Buffer.from(...)` перед записью в `Writable`: сервис режет этот массив на view-
   чанки и отдает их в stream pipeline с нормальной backpressure-семантикой.

Это low-memory behavior для Node-ответа по сравнению с полным JS buffering, но это не true
streaming XLSX из Rust/WASM.

### Почему Rust path пока не переведен на callback/chunk output

`rust_xlsxwriter` умеет `save_to_writer()`, и это подтверждено в текущем prototype. Но в WASM
варианте это не убирает ключевое ограничение:

- workbook все равно собирается полностью до финализации;
- для возврата в Node через `wasm-bindgen` нужен полный буфер;
- callback-only redesign сейчас уменьшил бы только JS-side burst во время финальной записи, но не
  снял бы основной пик памяти внутри Rust/WASM.

Поэтому текущий выбор прагматичный:
- оставить final-buffer handoff;
- писать его в `Writable` без дополнительной полной Node-копии;
- не называть этот путь “streaming XLSX”, пока байты не начнут выходить до финализации workbook.

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
Могут быть менее показательными, чем для чистого Node-пути. Текущий benchmark явно отражает
Node heap deltas, но не пытается выдавать грубые цифры за точную оценку Go/Rust WASM
linear-memory usage.

### Streaming не означает нулевую память
Даже streaming экспорт не гарантирует “почти 0 RAM”, потому что:
- библиотеки всё равно держат внутреннее состояние workbook;
- есть stream buffers;
- у Go/Rust `wasm` есть дополнительные runtime overhead'ы.

Но streaming всё равно лучше полного buffer-based подхода на больших объёмах.

---

## 10. Короткий happy path

Если нужен самый короткий практический сценарий:

```bash
cd /home/admin/.openclaw/workspace/projects/mvp-samples/nestjs-go-export-excel-wasm
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
cd /home/admin/.openclaw/workspace/projects/mvp-samples/nestjs-go-export-excel-wasm
BASE_URL=http://localhost:3100 LIMIT=100000 SEED=12345 TIMEOUT=300000 npm run test:comparison
```
