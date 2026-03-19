# Rust WASM Notes

## Chosen approach

The current Rust exporter uses:

- `rust_xlsxwriter`
- the crate's `wasm` feature
- `wasm32-unknown-unknown`
- `wasm-bindgen` output for Node consumption

The generated Node package lives under `rust-excel-streamer/pkg/` and is built locally via:

```bash
bun run build:rust-wasm
```

The current JS to WASM contract is deliberately close to the Go path:

- Node builds the shared stream plan from SQLite/Prisma data;
- batch payloads are serialized to JSON;
- Rust/WASM reconstructs rows, writes a workbook, and returns the final bytes;
- NestJS writes those bytes to the destination `Writable`.

## Why this approach was accepted

- `rust_xlsxwriter` worked in a Node-hosted WASM proof of concept without filesystem assumptions.
- `Workbook::save_to_buffer()` produced valid XLSX bytes under `wasm32-unknown-unknown`.
- The workbook can be validated from Node with ExcelJS, which keeps the sample honest.
- This path keeps Rust inside the same process and avoids introducing a separate backend service.

## Alternatives considered and rejected

### `rust_xlsxwriter` constant-memory mode

Rejected for this sample because it depends on `tempfile`, which is not something this project can
assume inside `wasm32-unknown-unknown`.

### Filesystem-backed workbook writes

Rejected because the proof-of-concept and current integration target a Node-hosted WASM module, not
a native Rust process with stable local filesystem access.

### Custom low-level ZIP/XML writer

Rejected for now because the current library path already works and keeps the scope narrow. A custom
writer remains a fallback only if `rust_xlsxwriter` becomes a blocker for correctness or runtime
behavior.

### Separate native Rust backend or standalone Rust service

Rejected because it would break the sample's design goal. The comparison is between exporters that
run in the existing NestJS application over the same dataset flow, not between different services.

## Fairness caveats

- The Rust path shares the same SQLite/Prisma dataset flow as ExcelJS and Go/WASM.
- JSON batch transfer adds JS/WASM boundary overhead that is part of the current comparison.
- The Rust path currently returns a final workbook buffer rather than true streaming XLSX bytes.
- Benchmark `memoryDeltaBytes` primarily reflects Node heap, not full Rust/WASM linear memory.

## Known risks and limitations

- large exports can still accumulate substantial workbook memory inside Rust/WASM;
- runtime assets must be generated locally or in CI before the Rust exporter can start;
- JS to WASM JSON transfer can become expensive at high row counts;
- the current architecture cannot honestly claim true XLSX streaming from Rust/WASM;
- if future runtime behavior proves non-reentrant, Rust/WASM may need stricter serialized execution.

## Practical implication

The current Rust exporter is good enough for:

- comparing workbook correctness;
- measuring end-to-end duration and output size under the shared dataset flow;
- evaluating low-memory Node response behavior versus full JS buffering.

It is not good evidence for:

- zero-copy transfer;
- zero-memory workbook generation;
- true incremental XLSX byte emission before workbook finalization.
