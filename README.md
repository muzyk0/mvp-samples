# mvp-samples

NestJS sample for a fair Excel export comparison across three implementations that all read the
same SQLite/Prisma dataset:

- `exceljs`
- `wasm` (Go/WASM)
- `rust-wasm`

This is not a generic export demo. The sample exists to compare exporter behavior while keeping
data access, request parameters, and benchmark semantics aligned.

## What is in the project

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

- materializes the selected dataset in memory before invoking the Rust bridge;
- generates the workbook inside a Rust/WASM module via `rust_xlsxwriter`;
- returns a final XLSX buffer back to Node;
- is useful as a comparison point, but is not a fully streaming path today.

## Setup

```bash
bun install
bun run prisma:generate
bun run prisma:migrate
bun run prisma:seed
bun run build:wasm
bun run build:rust-wasm
```

If Go is not already in `PATH`:

```bash
export PATH="/path/to/go/bin:$PATH"
```

If Rust tooling is not already in `PATH`:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

## Run locally

```bash
bun run start:dev
```

## Test locally

```bash
bun run build
bun run test
bun run test:e2e
bun run test:comparison
bun run test:rust-wasm
```

## Benchmark collection contract

Continuous benchmark collection now uses a pinned profile file:

- `benchmarks/profiles/continuous-default.json`

That profile fixes the benchmark lane, environment label, request payload, warmup/sample counts,
health checks, and output contract. The collector keeps using `POST /export/benchmark`, so every
runtime still measures the same SQLite/Prisma-backed dataset path.

The collector script:

1. starts the app with the profile's `startCommand`;
2. waits for the configured exporter health/status routes to pass;
3. runs warmup requests that are not stored;
4. runs measured samples against `POST /export/benchmark`;
5. normalizes the HTTP payload into a generic implementation list;
6. validates the normalized run against `benchmarks/schema/benchmark-run.schema.json`;
7. writes one JSON artifact without mixing in site generation.

Example:

```bash
bun run build:wasm
bun run build:rust-wasm
bun run build
npm run benchmark:collect -- --profile benchmarks/profiles/continuous-default.json --output .tmp/benchmark-run.json
```

## Benchmark publishing pipeline

The benchmark publication flow is intentionally split into separate stages:

1. collect one normalized raw run document from `POST /export/benchmark`
2. store/import immutable raw JSON under `benchmarks/data/runs/...`
3. rebuild history indexes under `benchmarks/data/indexes/...`
4. generate a static site from stored indexes only
5. validate the stored data and generated site before publication

The project keeps two histories separate on purpose:

- continuous GitHub-hosted runner history
- recorded dedicated-hardware history

That separation is carried in the lane plus environment label, so trend views do not silently mix
GitHub runner noise with manually collected workstation runs.

Developer commands:

```bash
npm run benchmark:collect -- --profile benchmarks/profiles/continuous-default.json --output .tmp/benchmark-run.json
npm run benchmark:import-recorded -- --input .tmp/recorded-run.json --data-dir .tmp/benchmarks/data
npm run benchmark:history -- --data-dir .tmp/benchmarks/data
npm run benchmark:site -- --data-dir .tmp/benchmarks/data --out-dir .tmp/benchmarks/site
npm run benchmark:validate -- --data-dir .tmp/benchmarks/data --site-dir .tmp/benchmarks/site
npm run benchmark:pages -- --collect
```

## Docs

- `docs/benchmarking.md`
- `docs/benchmark-pages.md`
- `docs/benchmark-results-streaming.md`
- `docs/rust-wasm-notes.md`
- `docs/plans/completed/issue-7-rust-wasm-export-plan.md`
