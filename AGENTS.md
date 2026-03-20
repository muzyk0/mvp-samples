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
All exporters must read the **same effective dataset** for the same request parameters.

If you change filtering, slicing, ordering, seed behavior, or column mapping:
- keep all exporters aligned;
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
- `src/export/controllers/export-dataset.controller.ts`

### WASM assets
Canonical runtime assets live in:
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

Before claiming the sample works, run the real checks:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build:wasm
npm run build:rust-wasm
npm run build
npm test
npm run test:e2e
```
