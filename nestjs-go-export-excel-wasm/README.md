# nestjs-go-export-excel-wasm

NestJS sample for a fair Excel export comparison across three implementations that all read the
same SQLite/Prisma dataset:

- `exceljs`
- `wasm` (Go/WASM)
- `rust-wasm`

This is not a generic export demo. The sample exists to compare exporter behavior while keeping
data access, request parameters, and benchmark semantics aligned.

## What is in the sample

- SQLite + Prisma dataset and seed flow
- shared repository-backed export data pipeline
- shared stream-plan generation for every exporter
- three HTTP download surfaces:
  - `POST /export/exceljs/download`
  - `POST /export/wasm/download`
  - `POST /export/rust-wasm/download`
- quick/status routes:
  - `GET /export/exceljs/quick`
  - `GET /export/exceljs/health`
  - `GET /export/wasm/quick`
  - `GET /export/wasm/status`
  - `GET /export/rust-wasm/quick`
  - `GET /export/rust-wasm/status`
- comparison/benchmark routes:
  - `GET /export/benchmark/default`
  - `POST /export/benchmark`
- dataset preview:
  - `POST /export/data`

## Comparison rules

The sample treats fairness as a feature:

1. data lives in SQLite, not in exporter-specific in-memory sources;
2. `ExportDatasetRepository` and `DataGeneratorService` build the same effective plan for all exporters;
3. Prisma rows are read in batches;
4. `seed`, `offset`, filters, and selected columns stay aligned across variants;
5. benchmark output compares exporter behavior, not dataset drift.

## Execution model

### ExcelJS

- uses `ExcelJS.stream.xlsx.WorkbookWriter`;
- commits rows as batches arrive from Prisma;
- writes `.xlsx` bytes directly to the target `Writable`;
- is the only path in this sample that is true row-to-writable streaming.

### Go/WASM

- keeps workbook state inside the Go/WASM runtime;
- emits ZIP bytes back to Node during finalization callbacks;
- Node writes those bytes directly to the HTTP response or temp file;
- does not keep the final XLSX buffered in Node, but still accumulates workbook state inside WASM.

### Rust/WASM

- uses `rust_xlsxwriter` compiled to `wasm32-unknown-unknown` and wrapped with `wasm-bindgen`;
- builds workbook state inside Rust/WASM and returns the final workbook bytes at finalize time;
- Node writes the resulting `Uint8Array` into the destination `Writable` without an extra full
  `Buffer.from(...)` copy;
- is low-memory on the Node side compared with fully buffering the response in JS, but it is not
  true XLSX streaming from WASM.

## Toolchain and setup

Install dependencies and prepare the SQLite database:

```bash
bun install
bun run prisma:generate
bun run prisma:migrate
bun run prisma:seed
```

Default database URL:

```bash
DATABASE_URL="file:./prisma/dev.db"
```

### Seed configuration

- table: `Employee`
- default dataset size: `10_000`
- deterministic generator: `src/export/data/employee-generator.ts`
- batched insert seed path to avoid building one giant JS array
- default seed batch size: `1000`

Supported environment variables:

- `SEED_EMPLOYEE_COUNT`
- `SEED_DATASET_SEED`
- `SEED_BATCH_SIZE`

Example large seed run:

```bash
SEED_EMPLOYEE_COUNT=200000 SEED_BATCH_SIZE=1000 bun run prisma:seed
```

## Build commands

### Application build

```bash
bun run build
```

### Go/WASM build

Generated Go WASM artifacts are local build outputs:

- `excel-streamer/excel_bridge.wasm`
- `excel-streamer/wasm_exec.js`

Build them with Go available in `PATH`:

```bash
export PATH="/path/to/go/bin:$PATH"
bun run build:wasm
```

### Rust/WASM build

Generated Rust WASM artifacts are local build outputs:

- `rust-excel-streamer/pkg/`
- `rust-excel-streamer/target/`

Build them with Rust tooling available in `PATH`:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
bun run build:rust-wasm
```

The script ensures:

- `cargo` is available;
- `wasm-bindgen-cli` is installed;
- the `wasm32-unknown-unknown` target exists;
- the Node-consumable wrapper is generated into `rust-excel-streamer/pkg/`.

Rust-specific notes and tradeoffs are documented in `docs/rust-wasm-notes.md`.

## Running the sample

```bash
bun install
export PATH="/path/to/go/bin:$PATH"
export PATH="$HOME/.cargo/bin:$PATH"
bun run prisma:generate
bun run prisma:migrate
bun run prisma:seed
bun run build:wasm
bun run build:rust-wasm
bun run build
bun run start:dev
```

## Route examples

### Preview dataset

```bash
curl -X POST http://localhost:3000/export/data \
  -H 'Content-Type: application/json' \
  -d '{"limit":5,"seed":12345}'
```

### ExcelJS download

```bash
curl -X POST http://localhost:3000/export/exceljs/download \
  -H 'Content-Type: application/json' \
  -d '{"limit":2000,"seed":12345,"batchSize":500,"fileName":"exceljs.xlsx"}' \
  --output exceljs.xlsx
```

### Go/WASM download

```bash
curl -X POST http://localhost:3000/export/wasm/download \
  -H 'Content-Type: application/json' \
  -d '{"limit":2000,"seed":12345,"batchSize":500,"fileName":"go-wasm.xlsx"}' \
  --output go-wasm.xlsx
```

### Rust/WASM download

```bash
curl -X POST http://localhost:3000/export/rust-wasm/download \
  -H 'Content-Type: application/json' \
  -d '{"limit":2000,"seed":12345,"batchSize":500,"fileName":"rust-wasm.xlsx"}' \
  --output rust-wasm.xlsx
```

### Status routes

```bash
curl http://localhost:3000/export/exceljs/health
curl http://localhost:3000/export/wasm/status
curl http://localhost:3000/export/rust-wasm/status
```

### Benchmark routes

```bash
curl http://localhost:3000/export/benchmark/default

curl -X POST http://localhost:3000/export/benchmark \
  -H 'Content-Type: application/json' \
  -d '{"limit":5000,"seed":42,"batchSize":500,"includeMemory":true}'
```

The benchmark response contains:

- `request`
- `exceljs`
- `goWasm`
- `rustWasm`
- `deltas`
- `diagnostics`

`memoryDeltaBytes` fields are present only when `includeMemory=true`. Those values represent Node
heap deltas, not full Go/Rust WASM linear-memory usage.

## Verification commands

Rust smoke test:

```bash
bun run test:rust-wasm
```

Project verification:

```bash
bun run build:wasm
bun run build:rust-wasm
bun run build
bun run lint
bun run test
bun run test:e2e
```

Live benchmark verification (`bun run start:prod` blocks, so use a second terminal or background the server):

```bash
# Terminal 1
PORT=3000 bun run start:prod

# Terminal 2
BASE_URL=http://localhost:3000 bun run test:comparison
```

Or in one shell with the server in the background:

```bash
PORT=3000 bun run start:prod &
BASE_URL=http://localhost:3000 bun run test:comparison
```

`bun run test:comparison` expects the app to already be running at `BASE_URL` and validates that
the benchmark payload contains `exceljs`, `goWasm`, and `rustWasm`, all three row counts match,
and the explicit delta keys are present.

If Bun is unavailable in the shell but the app is already running, you can invoke the helper
directly:

```bash
BASE_URL=http://localhost:3000 node test/export-comparison.js
```
