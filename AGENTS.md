# AGENTS.md

## Project identity

This sample compares **two Excel export implementations in NestJS** over the **same SQLite-backed dataset**:
- `exceljs`
- Go/WASM

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

### Controllers
- `src/export/controllers/exceljs-export.controller.ts`
- `src/export/controllers/wasm-export.controller.ts`
- `src/export/controllers/benchmark.controller.ts`
- `src/export/controllers/export-data.controller.ts`

### WASM assets
Canonical WASM runtime assets live in:
- `excel-streamer/excel_bridge.wasm`
- `excel-streamer/wasm_exec.js`

Do not add mirrored copies elsewhere unless there is a real runtime requirement.

## Active HTTP API
Treat these as the current live routes unless code changes them explicitly:
- `POST /export/exceljs/download`
- `GET /export/exceljs/quick`
- `GET /export/exceljs/health`
- `POST /export/wasm/download`
- `GET /export/wasm/quick`
- `GET /export/wasm/status`
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
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

If comparing both variants manually:

```bash
npm run start:dev
npm run test:comparison
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

## Notes on WASM path
The WASM exporter is still more fragile than `exceljs` and currently relies on serialized execution because of Go/WASM runtime characteristics.
That is acceptable for this sample, but do not misrepresent it as equivalent in operational simplicity.
