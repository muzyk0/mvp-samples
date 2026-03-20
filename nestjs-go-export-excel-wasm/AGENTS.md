# AGENTS.md

## Project identity

This sample compares **three Excel export implementations in NestJS** over the **same SQLite-backed dataset**:
- `exceljs`
- Go/WASM (`wasm`)
- Rust/WASM (`rust-wasm`)

The point of the sample is not just "export to Excel", but a **fair comparison** between export variants.

## Ground truth

### Data source
The current source of truth is:
- SQLite
- Prisma
- repository-backed dataset reads

Do not silently reintroduce a separate in-memory source for one exporter only.
If you need generated data, it should flow through the shared generator/seed path and land in SQLite.

### Comparison rule
Both exporters must read the **same effective dataset** for the same request parameters.

If you change filtering, slicing, ordering, seed behavior, or column mapping:
- keep both exporters aligned;
- keep benchmark fairness intact.

## Important paths

### Data / DB
- `prisma/schema.prisma`
- `prisma.config.ts`
- `prisma/seed.ts`
- `src/export/data/employee-generator.ts`
- `src/export/repositories/export-dataset.repository.ts`
- `src/prisma/prisma.service.ts`
- `src/prisma/prisma.module.ts`

### Exporters
- `src/export/services/exceljs-export.service.ts`
- `src/export/services/wasm-excel.service.ts`
- `src/export/services/rust-wasm-excel.service.ts`

### Controllers
- `src/export/controllers/exceljs-export.controller.ts`
- `src/export/controllers/wasm-export.controller.ts`
- `src/export/controllers/rust-wasm-export.controller.ts`
- `src/export/controllers/export-benchmark.controller.ts`
- `src/export/controllers/export-data.controller.ts`

### WASM assets
Canonical WASM runtime assets live in:
- `excel-streamer/excel_bridge.wasm`
- `excel-streamer/wasm_exec.js`
- `rust-excel-streamer/pkg/rust_excel_streamer.js`
- `rust-excel-streamer/pkg/rust_excel_streamer_bg.wasm`

Do not add mirrored copies elsewhere unless there is a real runtime requirement.

## Active HTTP API
Treat these as the current live routes unless code changes them explicitly:
- `POST /export/exceljs/download`
- `GET /export/exceljs/quick`
- `GET /export/exceljs/health`
- `POST /export/wasm/download`
- `GET /export/wasm/quick`
- `GET /export/wasm/status`
- `POST /export/rust-wasm/download`
- `GET /export/rust-wasm/quick`
- `GET /export/rust-wasm/status`
- `POST /export/benchmark`
- `GET /export/benchmark/default`
- `POST /export/data`

If you change active routes:
- update README;
- update tests;
- remove or migrate stale scripts/controllers.

## Testing expectations

Before claiming the sample works, run the real checks from the sample directory:

```bash
bun run prisma:generate
bun run prisma:migrate
bun run prisma:seed
bun run build:wasm
bun run build:rust-wasm
bun run build
bun run lint
bun run test
bun run test:e2e
```

If comparing both variants manually:

```bash
bun run start:dev
bun run test:comparison
```

If Bun is unavailable but the app is already running, use:

```bash
BASE_URL=http://localhost:3000 node test/export-comparison.js
```

## Editing rules

### Prefer
- shared repository/data access for both exporters;
- deterministic seed behavior;
- explicit benchmark semantics;
- docs that match actual routes and scripts;
- tests that validate real `.xlsx` generation.

### Avoid
- reviving legacy routes that are no longer part of the sample;
- keeping dead controllers or dead scripts around;
- introducing exporter-specific data paths that make the benchmark unfair;
- duplicating wasm artifacts in multiple folders without necessity.

## If you add a new export variant
If another variant is added later:
- plug it into the same dataset pipeline;
- document it in README;
- add tests;
- make benchmark output compare it explicitly rather than implicitly.

## Notes on WASM paths
- Go/WASM remains more fragile than `exceljs` and currently relies on serialized execution because of Go runtime characteristics.
- Rust/WASM uses generated local assets, not a separate native Rust backend or standalone service, and currently serializes execution in the NestJS bridge to avoid re-entrancy surprises.
- Do not claim either WASM path is true row-streaming XLSX unless bytes are shown to leave the runtime before workbook finalization.
- Benchmark `memoryDeltaBytes` reflects Node heap deltas only unless the payload and code explicitly add separate WASM memory instrumentation.
- The benchmark payload is explicit now: `exceljs`, `goWasm`, `rustWasm`, `deltas`, and `diagnostics`.
