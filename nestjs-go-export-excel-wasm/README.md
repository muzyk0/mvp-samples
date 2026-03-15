# nestjs-go-export-excel-wasm

Экспериментальный, но уже воспроизводимый sample для сравнения двух Excel-export путей в NestJS:

- `exceljs` — baseline на чистом Node.js
- `wasm` — экспорт через существующий Go/WASM bridge

## Что внутри

- два независимых HTTP entrypoint'а:
  - `POST /export/exceljs/download`
  - `POST /export/wasm/download`
- общий deterministic data generator с `seed`, чтобы оба варианта экспортировали один и тот же dataset
- benchmark endpoint:
  - `GET /export/benchmark/default`
  - `POST /export/benchmark`
- preview endpoint:
  - `POST /export/data`

## Идея архитектуры

Сейчас источник данных in-memory, но `DataGeneratorService` уже оформлен так, чтобы позже подменить источник на sqlite/repository слой без переписывания экспортёров.

Ключевая цель — честное сравнение: dataset строится один раз из одинаковых входных параметров (`limit`, `seed`, `filters`, `columns`) и затем уходит в оба экспортёра.

## Запуск

```bash
npm install
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

## Замечания

- WASM-ветка всё ещё экспериментальная и запускается последовательно через очередь, чтобы избежать гонок из-за глобального Go/WASM state.
- Потоковая отдача пока сведена к безопасной отдаче готового `Buffer` в ответ; это менее амбициозно, но заметно стабильнее для сравнения вариантов.
- Единственный актуальный WASM-артефакт хранится в `excel-streamer/`. Старые зеркальные копии удалены, чтобы не тащить неработающие хвосты.
- Для пересборки `excel_bridge.wasm` нужен Go toolchain; удобнее всего запустить `npm run build:wasm`.
