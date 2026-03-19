# Streaming Benchmark Results

This document records historical benchmark observations and explains how to interpret them now that
the benchmark payload includes three variants: `exceljs`, `goWasm`, and `rustWasm`.

## Status of this results file

The numeric results below came from an earlier benchmark run before the Rust/WASM path was added to
the public comparison surface. They remain useful as historical context for the ExcelJS vs Go/WASM
comparison, but they are not a substitute for a fresh three-variant benchmark run.

Use `docs/benchmarking.md` for the current commands and payload semantics.

## Historical benchmark environment

These measurements were collected on a constrained VPS and should be treated as environment-specific.

- host CPU: `2x Intel Xeon Gold 6354` or `2x Intel Xeon Gold 6226R`
- virtualization: `KVM`
- allocated CPU: `1 vCPU`
- RAM: `2 GB DDR4`

The app was not running on dedicated hardware, so timings include the usual Node.js, Prisma, SQLite,
and WASM overhead on a small VM.

## Historical project state

The earlier benchmark run was taken after:

- export paths were moved to direct-to-writable mode on the Node side;
- seed generation was rewritten to use batched inserts;
- the artificial export `limit` cap was removed;
- the dataset was seeded to `200,000` rows.

At that point the benchmark compared:

- `exceljs`
- Go/WASM only

The current payload shape has since changed to:

- `exceljs`
- `goWasm`
- `rustWasm`
- `deltas`
- `diagnostics`

## Historical large-limit verification

A direct request with:

```json
{
  "limit": 200000,
  "seed": 12345,
  "includeMemory": false
}
```

returned aligned row counts for the variants that existed at the time and confirmed that the
benchmark honored the requested limit instead of silently clamping it.

Today the equivalent expectation is stronger:

- `request.limit` should reflect the effective limit used by the shared plan;
- `exceljs.rowCount`, `goWasm.rowCount`, and `rustWasm.rowCount` should all match.

## Historical ExcelJS vs Go/WASM results

### Sweep on a 200k dataset

| Requested rows | ExcelJS duration | Go/WASM duration | Winner by speed |
|---|---:|---:|---|
| 10,000 | 1,836.73 ms | 4,798.89 ms | ExcelJS |
| 50,000 | 4,075.45 ms | 21,193.58 ms | ExcelJS |
| 100,000 | 7,646.25 ms | 48,448.81 ms | ExcelJS |
| 200,000 | 15,435.62 ms | 128,101.47 ms | ExcelJS |

### Direct 200k benchmark result

ExcelJS:

- `rowCount = 200000`
- `sizeBytes = 31,584,649`
- `durationMs = 39,813.48`

Go/WASM:

- `rowCount = 200000`
- `sizeBytes = 18,911,232`
- `durationMs = 126,261.4`

## How to interpret these results today

These numbers still suggest that, on that VM:

- ExcelJS was faster;
- Go/WASM produced a smaller XLSX file for that dataset;
- the Go/WASM bridge/runtime overhead was material.

But they do not answer the newer questions introduced by the Rust path:

- how `rustWasm.durationMs` compares to both other variants;
- how `rustWasm.sizeBytes` compares to both other variants;
- whether Node heap deltas stay comparable across all three variants.

## Current caveats that apply to any fresh run

### Memory

`memoryDeltaBytes` remains approximate and reports Node heap deltas only. It does not include
precise Go or Rust WASM linear-memory usage.

### Streaming semantics

- `exceljs` streams rows directly to the writable;
- `goWasm` emits ZIP bytes during finalization after internal workbook accumulation;
- `rustWasm` currently returns final workbook bytes after internal workbook accumulation.

Do not read "streaming" in this repository as "zero-memory" or "all variants emit bytes before
finalization."

### Operational fragility

- Go/WASM still relies on serialized execution.
- Rust/WASM still depends on generated local wasm-bindgen assets and final-buffer transfer.

## Next step for current data

If you need current numbers, rerun the benchmark with the live three-variant payload and record the
results under the current key names: `exceljs`, `goWasm`, and `rustWasm`.
