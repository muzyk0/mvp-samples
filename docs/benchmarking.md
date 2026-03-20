# Benchmarking and Large Dataset Runs

Эта инструкция нужна для ручного запуска benchmark'ов и больших прогонов экспорта в этом репозитории.
This guide covers the real benchmark flow for this repository.

The benchmark compares:

- `exceljs`
- `wasm` as `goWasm` in the payload
- `rust-wasm` as `rustWasm` in the payload

All three variants use the same SQLite/Prisma-backed dataset plan.

## Reproducible collector contract

Automated benchmark collection is defined by:

- profile: `benchmarks/profiles/continuous-default.json`
- normalized run schema: `benchmarks/schema/benchmark-run.schema.json`
- collector: `scripts/benchmarks/collect-benchmark-results.ts`

The collector does not add a second benchmark path. It always measures `POST /export/benchmark`,
then normalizes that controller response into a schema-validated run document with:

- `lane` as `continuous` or `recorded`
- scenario metadata and pinned request shape
- generic `implementations[]` entries instead of hard-coded site-facing keys
- sample timestamps
- git metadata
- runner metadata
- toolchain metadata

The continuous profile currently locks:

- `seed = 12345`
- `limit = 2000`
- explicit column selection
- `includeMemory = true`
- `warmupCount = 1`
- `sampleCount = 3`
- app start command and health checks

## What the benchmark is trying to measure

For medium and large datasets, look at:

- duration
- output size
- row count alignment
- Node heap delta when `includeMemory=true`
- stability at larger limits such as `10k`, `50k`, `100k`, and `200k`

## Important memory caveat

`memoryDeltaBytes` is intentionally narrow:

- it reflects Node heap deltas only;
- it does not instrument Go or Rust WASM linear memory;
- it should be treated as an application-level comparison signal, not a full profiler.

The benchmark response makes this explicit in `diagnostics.memory`.

## 1. Move into the sample

```bash
cd /path/to/mvp-samples
```

## 2. Prepare the dataset

Large seeds are inserted in batches, so `prisma/seed.ts` no longer has to build the entire dataset
in one JS array.

Example `200k` seed:

```bash
export SEED_EMPLOYEE_COUNT=200000
export SEED_DATASET_SEED=20260315
export SEED_BATCH_SIZE=1000

bun run prisma:generate
bun run prisma:migrate
bun run prisma:seed
```

Optional Node heap bump for very large runs:

```bash
NODE_OPTIONS="--max-old-space-size=4096" SEED_BATCH_SIZE=1000 bun run prisma:seed
```

## 3. Build everything needed for the benchmark

```bash
bun run build:wasm
bun run build:rust-wasm
bun run build
```

If Go is not already in `PATH`:

```bash
export PATH="/path/to/go/bin:$PATH"
```

If Rust tooling is not already in `PATH`:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

## 4. Start the application

```bash
PORT=3100 bun run start:prod
```

Health/status checks:

```bash
curl http://localhost:3100/export/exceljs/health
curl http://localhost:3100/export/wasm/status
curl http://localhost:3100/export/rust-wasm/status
```

## 5. Run the scripted benchmark

In a separate shell:

```bash
cd /path/to/mvp-samples
```

Example runs:

```bash
BASE_URL=http://localhost:3100 LIMIT=10000 SEED=12345 bun run test:comparison
BASE_URL=http://localhost:3100 LIMIT=50000 SEED=12345 bun run test:comparison
BASE_URL=http://localhost:3100 LIMIT=100000 SEED=12345 TIMEOUT=300000 bun run test:comparison
BASE_URL=http://localhost:3100 LIMIT=200000 SEED=12345 TIMEOUT=300000 bun run test:comparison
```

The helper script fails if:

- the benchmark route is unavailable;
- the payload is missing `exceljs`, `goWasm`, or `rustWasm`;
- row counts do not match across variants.

To collect a publishable normalized artifact with the fixed profile:

```bash
npm run benchmark:collect -- \
  --profile benchmarks/profiles/continuous-default.json \
  --output .tmp/benchmark-run.json
```

By default the collector starts the app itself, waits for:

- `GET /export/exceljs/health`
- `GET /export/wasm/status`
- `GET /export/rust-wasm/status`

Then it executes the profile's warmup/sample policy, validates the normalized JSON against
`benchmarks/schema/benchmark-run.schema.json`, and stores the artifact at the requested output
path. If you already have the app running, add `--reuse-server`.

## 6. Call the benchmark route directly

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

Supported request knobs:

- `limit`
- `seed`
- `offset`
- `batchSize`
- `fileName`
- `sheetName`
- `includeMemory`
- shared export filters/column selection from `BenchmarkRequestDto`

## 7. Current benchmark payload shape

Top-level keys:

- `request`
- `exceljs`
- `goWasm`
- `rustWasm`
- `deltas`
- `diagnostics`

Per-variant summary fields:

- `variant`
- `fileName`
- `rowCount`
- `durationMs`
- `sizeBytes`
- `memoryDeltaBytes` when `includeMemory=true`

Delta keys:

- `goWasmVsExceljs`
- `rustWasmVsExceljs`
- `rustWasmVsGoWasm`

Diagnostics keys:

- `diagnostics.memory`
- `diagnostics.executionModel`

## 7a. Normalized run artifact shape

The collector output is intentionally different from the raw controller payload.

Top-level keys:

- `schemaVersion`
- `lane`
- `collectedAt`
- `profile`
- `source`
- `git`
- `runner`
- `toolchain`
- `scenario`
- `samples`

Each sample stores:

- `sampleIndex`
- `collectedAt`
- `request`
- `implementations[]`
- `comparisons[]`
- `diagnostics`

This keeps history storage and future site generation tied to one stable schema rather than the
current raw HTTP response shape.

## 8. How to read the execution model

`diagnostics.executionModel` should be interpreted literally:

- `exceljs` streams rows directly to the Node writable;
- `goWasm` accumulates workbook state inside Go/WASM and emits ZIP bytes during finalization;
- `rustWasm` accumulates workbook state inside Rust/WASM and returns final workbook bytes at finalize time.

That means:

- only the ExcelJS path is true row-streaming XLSX in this sample;
- both WASM variants can still have meaningful internal workbook memory even though Node does not
  fully buffer the response path.

## 9. Known limitations

### Seed volume

The seed path is batched, but very large runs can still be constrained by local CPU, disk, and RAM.

### Go/WASM fairness caveat

The Go bridge matches the shared dataset plan, but it still depends on a fragile runtime and
serialized execution.

### Rust/WASM fairness caveat

The Rust bridge currently uses JSON batch transfer plus final-buffer handoff. This keeps comparison
semantics close to the Go path, but it is not a claim of true XLSX byte streaming from Rust/WASM.

### Memory interpretation

Node heap deltas are useful, but they are not a substitute for dedicated WASM runtime memory
instrumentation.

## 10. Short happy path

If you want the shortest realistic three-variant benchmark flow:

```bash
cd /path/to/mvp-samples
export SEED_EMPLOYEE_COUNT=200000
export SEED_DATASET_SEED=20260315
export SEED_BATCH_SIZE=1000
bun run prisma:generate
bun run prisma:migrate
bun run prisma:seed
bun run build:wasm
bun run build:rust-wasm
bun run build
PORT=3100 bun run start:prod
```

Then in another shell:

```bash
cd /path/to/mvp-samples
BASE_URL=http://localhost:3100 LIMIT=100000 SEED=12345 TIMEOUT=300000 npm run test:comparison
cd /path/to/mvp-samples
BASE_URL=http://localhost:3100 LIMIT=100000 SEED=12345 TIMEOUT=300000 bun run test:comparison
```

If Bun is unavailable in the shell, use:

```bash
cd /path/to/mvp-samples
BASE_URL=http://localhost:3100 LIMIT=100000 SEED=12345 TIMEOUT=300000 node test/export-comparison.js
```
