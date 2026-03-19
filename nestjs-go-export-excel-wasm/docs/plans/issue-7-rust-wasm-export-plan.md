# Add Rust WASM Excel Export Variant to the NestJS Comparison Sample
## Overview
Add a third export path, Rust-to-WASM, to the existing NestJS comparison sample so the project can
compare ExcelJS, Go/WASM, and Rust/WASM over the same SQLite/Prisma-backed dataset and the same
Node streaming flow. The first milestone stays narrow and low-risk: validate Rust XLSX generation
under WASM, prove JS↔WASM byte transfer and workbook correctness, and only then wire the Rust
variant into the HTTP and benchmark surface.
## Context
  - Files involved:
  - nestjs-go-export-excel-wasm/package.json
  - nestjs-go-export-excel-wasm/README.md
  - nestjs-go-export-excel-wasm/docs/benchmarking.md
  - nestjs-go-export-excel-wasm/docs/benchmark-results-streaming.md
  - nestjs-go-export-excel-wasm/src/export/excel-export.module.ts
  - nestjs-go-export-excel-wasm/src/export/dto/export-request.dto.ts
  - nestjs-go-export-excel-wasm/src/export/interfaces/export-data.interface.ts
  - nestjs-go-export-excel-wasm/src/export/interfaces/wasm-callback.interface.ts
  - nestjs-go-export-excel-wasm/src/export/controllers/wasm-export.controller.ts
  - nestjs-go-export-excel-wasm/src/export/controllers/export-benchmark.controller.ts
  - nestjs-go-export-excel-wasm/src/export/services/export-comparison.service.ts
  - nestjs-go-export-excel-wasm/src/export/services/wasm-excel.service.ts
  - nestjs-go-export-excel-wasm/src/export/services/wasm-excel.service.spec.ts
  - nestjs-go-export-excel-wasm/test/app.e2e-spec.ts
  - nestjs-go-export-excel-wasm/excel-streamer/excel_bridge.go
  - new Rust WASM workspace under nestjs-go-export-excel-wasm, likely a sibling to excel-streamer
such as rust-excel-streamer/
  - Related patterns:
  - ExcelJS writes directly to a Node Writable with WorkbookWriter.
  - Go/WASM is loaded from local runtime assets, instantiated inside Node, serialized through a
single-job queue, receives row batches as JSON, and returns ZIP bytes to JS through callbacks
during final write.
  - Benchmarking currently compares exceljs vs wasm by streaming each variant to a temp file and
reporting duration, output size, and optional memory delta.
  - External dependency evaluation:
  - rust_xlsxwriter is the first candidate because it has an explicit wasm feature and
save_to_writer support in current upstream docs/changelog.
  - rust_xlsxwriter constant_memory uses tempfile, so it is likely unsuitable for
wasm32-unknown-unknown and cannot be assumed available in the Rust WASM path.
  - If rust_xlsxwriter cannot meet the required JS/WASM integration or memory profile, fallback is
a purpose-built low-level ZIP/XML writer inside Rust WASM, still invoked from Node and not as a
native Rust service.
  - Current architecture facts confirmed from the codebase:
  - Data stays in SQLite and flows through ExportDatasetRepository/DataGeneratorService for all
exporters.
  - Go/WASM currently does not stream true row-level XLSX bytes while rows are arriving; it
accumulates workbook state in excelize and only emits ZIP bytes when finalize writes the workbook.
  - Node avoids buffering the final XLSX for production downloads, but the WASM module itself
still owns workbook memory until finalization.
  - The Go runtime is serialized via queue because its global runtime/exports are process-global
and fragile.
## Development Approach
  - Testing approach: Regular
  - Complete each task fully before moving to the next
  - Keep the Rust variant on the same dataset pipeline, same benchmark semantics, and the same
direct-to-Writable Node response path
  - Prefer the smallest viable integration surface first: one worksheet, headers, plain scalar
values, no styling, no formulas, no images
  - Model the Rust runtime contract after the current Go service only where it helps reuse and
benchmark fairness; do not over-abstract before feasibility is proven
  - Treat memory claims precisely:
  - true XLSX streaming from Rust WASM to HTTP is unlikely if the library only emits ZIP bytes on
finalize
  - the first implementation should target low-memory Node behavior, not zero-copy or zero-memory
WASM behavior
  - benchmark/documentation must distinguish Node heap use from WASM
linear-memory/workbook-internal use
  - **CRITICAL: every task MUST include new/updated tests**
  - **CRITICAL: all tests must pass before starting next task**
## Implementation Steps
### Task 1: Validate Rust WASM XLSX architecture with a narrow proof of concept
**Files:**
  - Create: `nestjs-go-export-excel-wasm/rust-excel-streamer/Cargo.toml`
  - Create: `nestjs-go-export-excel-wasm/rust-excel-streamer/src/lib.rs`
  - Create: `nestjs-go-export-excel-wasm/rust-excel-streamer/README.md`
  - Create: `nestjs-go-export-excel-wasm/rust-excel-streamer/test_wasm.js`
  - Modify: `nestjs-go-export-excel-wasm/package.json`
  - Modify: `nestjs-go-export-excel-wasm/README.md`
  - [x] scaffold a Rust wasm crate built for `wasm32-unknown-unknown` with `wasm-bindgen` output
for Node consumption
  - [x] implement a minimal exported API that creates a workbook, writes headers plus a few rows,
finalizes to bytes, and returns either a `Uint8Array` or chunk callback output
  - [x] attempt the proof of concept with `rust_xlsxwriter` first using its wasm feature and an
in-memory writer path such as `save_to_buffer` or `save_to_writer`
  - [x] explicitly test whether `rust_xlsxwriter` works under Node-hosted WASM without
filesystem/tempdir assumptions and document the result in the local Rust README
  - [x] if `rust_xlsxwriter` fails at this stage, record the blocking constraint and switch the
remaining plan to a low-level ZIP/XML proof of concept before any NestJS integration
  - [x] add build scripts for the Rust wasm artifact generation, keeping artifacts local/generated
like the Go wasm assets rather than introducing a separate backend
  - [x] write tests for this task:
  - Rust-side or Node-side smoke test that generated bytes start with `PK`
  - workbook validity check by loading the bytes with ExcelJS in Node
  - explicit failure-mode test for missing runtime/build artifacts
  - [x] run the relevant verification for this task before task 2:
  - Rust wasm build command
  - Node smoke test for the generated wasm package
  - existing unit tests that are still affected by script/package changes
### Task 2: Add a Rust WASM runtime bridge in NestJS without changing the shared dataset pipeline
**Files:**
  - Create: `nestjs-go-export-excel-wasm/src/export/services/rust-wasm-excel.service.ts`
  - Create: `nestjs-go-export-excel-wasm/src/export/services/rust-wasm-excel.service.spec.ts`
  - Create: `nestjs-go-export-excel-wasm/src/export/controllers/rust-wasm-export.controller.ts`
  - Modify: `nestjs-go-export-excel-wasm/src/export/excel-export.module.ts`
  - Modify: `nestjs-go-export-excel-wasm/src/export/interfaces/export-data.interface.ts`
  - Modify: `nestjs-go-export-excel-wasm/src/export/interfaces/wasm-callback.interface.ts`
  - Modify: `nestjs-go-export-excel-wasm/package.json`
  - [x] implement a dedicated Rust WASM service that mirrors the current production contract:
initialize assets, instantiate runtime, export to `Writable`, export to buffer for tests, and
expose status
  - [x] decide the JS↔WASM row transfer contract for the first integrated version:
  - preferred initial option: send JSON batch strings, matching the Go path and minimizing
fairness drift
  - optional later optimization: structured arrays or columnar transfer only if the JSON overhead
materially skews comparison
  - [x] decide the WASM→JS output contract after the proof of concept:
  - if the Rust crate can only return the complete workbook bytes at finalize, stream that buffer
into the writable in JS and document that this is low-memory in Node but not true XLSX streaming
from WASM
  - if chunk callbacks from Rust are practical, use them, but only after verifying they do not add
unnecessary complexity versus a single final `Uint8Array`
  - [x] isolate any runtime-global state and determine whether Rust WASM also needs serialized
execution; if the exported JS/WASM module is not safely re-entrant, add a queue analogous to the
Go service
  - [x] define a distinct variant name such as `rust-wasm` in execution result types rather than
overloading the existing `wasm` label
  - [x] add HTTP endpoints parallel to the current pattern, for example:
  - `POST /export/rust-wasm/download`
  - `GET /export/rust-wasm/quick`
  - `GET /export/rust-wasm/status`
  - [x] write tests for this task:
  - service unit test validating a real XLSX workbook for the Rust variant
  - status test validating asset detection/runtime availability
  - controller/e2e tests for the new download/quick/status routes
  - [x] run the project unit and e2e suites before task 3
### Task 3: Integrate the Rust variant into comparison and benchmark flows with explicit memory
semantics
**Files:**
  - Modify: `nestjs-go-export-excel-wasm/src/export/services/export-comparison.service.ts`
  - Modify: `nestjs-go-export-excel-wasm/src/export/controllers/export-benchmark.controller.ts`
  - Modify: `nestjs-go-export-excel-wasm/src/export/interfaces/export-data.interface.ts`
  - Modify: `nestjs-go-export-excel-wasm/src/export/dto/export-request.dto.ts`
  - Modify: `nestjs-go-export-excel-wasm/test/app.e2e-spec.ts`
  - Modify: `nestjs-go-export-excel-wasm/test/export-comparison.js`
  - [ ] extend benchmark execution to run all three variants explicitly: `exceljs`, `wasm` (Go),
and `rust-wasm`
  - [ ] update result types so the benchmark payload reports all three summaries plus clearly
named deltas, instead of a single generic `wasm` field
  - [ ] keep all variants on the same precomputed stream plan and same repository-backed row
stream
  - [ ] measure and report memory carefully:
  - continue reporting Node heap delta as today for comparability
  - add a separate documented note that this does not include precise Rust/Go WASM linear memory
unless separately instrumented
  - if feasible, capture coarse WASM memory pages/byte length from the instantiated module before
and after export for diagnostic reporting, but do not block implementation on this if runtime
access is awkward
  - [ ] make the benchmark output and docs explicit about the difference between:
  - ExcelJS true streaming to a Writable
  - Go WASM final ZIP write callbacks after internal workbook accumulation
  - Rust WASM either final-buffer handoff or callback chunk handoff after internal workbook
accumulation
  - [ ] write tests for this task:
  - benchmark e2e test asserting all three variants are present
  - benchmark test asserting row counts remain aligned across variants
  - benchmark test asserting memory fields are omitted consistently when `includeMemory=false`
  - [ ] run unit tests, e2e tests, and the scripted benchmark check before task 4
### Task 4: Reduce fairness gaps and memory surprises in the Rust path
**Files:**
  - Modify: `nestjs-go-export-excel-wasm/src/export/services/rust-wasm-excel.service.ts`
  - Modify: `nestjs-go-export-excel-wasm/rust-excel-streamer/src/lib.rs`
  - Modify: `nestjs-go-export-excel-wasm/src/export/services/rust-wasm-excel.service.spec.ts`
  - Modify: `nestjs-go-export-excel-wasm/docs/benchmarking.md`
  - [ ] profile the initial Rust WASM path for large limits and identify where memory
concentrates:
  - JS batch serialization
  - WASM-side row accumulation
  - final workbook byte materialization
  - JS buffer copies during transfer to the writable
  - [ ] minimize avoidable copies in the accepted architecture, for example by reusing callback
buffers or avoiding an extra concatenation layer in Node
  - [ ] if `rust_xlsxwriter` is used, confirm whether it exposes any writer-based finalization
path that avoids creating two complete final copies in Rust+JS at the same time
  - [ ] if the initial implementation returns one final `Uint8Array`, evaluate whether chunked
transfer from Rust to JS is worth adding solely to reduce JS peak memory during response writing
  - [ ] do not claim “streaming XLSX” for the Rust path unless bytes are demonstrably emitted
incrementally before workbook finalization
  - [ ] write tests for this task:
  - larger-volume integration test that guards against regressions in output correctness
  - targeted test for writable backpressure handling in the Rust service
  - targeted test for cleanup after export failure
  - [ ] run unit and e2e suites before task 5
### Task 5: Document build, runtime, limitations, and risk tradeoffs
**Files:**
  - Modify: `nestjs-go-export-excel-wasm/README.md`
  - Modify: `nestjs-go-export-excel-wasm/AGENTS.md`
  - Modify: `nestjs-go-export-excel-wasm/docs/benchmarking.md`
  - Modify: `nestjs-go-export-excel-wasm/docs/benchmark-results-streaming.md`
  - Create: `nestjs-go-export-excel-wasm/docs/rust-wasm-notes.md`
  - [ ] document the new Rust build toolchain and commands, including required Rust target/tooling
and how artifacts are generated locally/CI
  - [ ] document the new HTTP routes and benchmark payload shape
  - [ ] document the fairness caveats plainly:
  - all variants share the same SQLite/Prisma dataset path
  - ExcelJS streams rows directly to the output writer
  - Go and Rust WASM may still accumulate workbook state internally before final ZIP output
  - benchmark memory numbers mainly represent Node heap unless additional WASM metrics are
explicitly included
  - [ ] document the chosen Rust XLSX generation approach and why alternatives were rejected
  - [ ] document known risks and limitations:
  - possible non-reentrant runtime requiring serialized execution
  - large-output peak memory inside WASM
  - JS/WASM transfer overhead from JSON batches
  - possible inability to support true XLSX streaming from Rust WASM without custom ZIP/XML
generation
  - [ ] write tests for this task:
  - update any doc-referenced commands/scripts that have automated checks
  - ensure route names and benchmark payload expectations in e2e tests match the docs
  - [ ] run all project verification before final acceptance:
  - build
  - Rust wasm build
  - test
  - test:e2e
  - test:comparison
### Task 6: Verify acceptance criteria
  - [ ] run full test suite using the project-specific commands
  - [ ] run linter with the project-specific command
  - [ ] verify coverage remains at or above 80% if the current project coverage gate or reporting
supports that check
  - [ ] verify the benchmark endpoint compares ExcelJS, Go WASM, and Rust WASM over the same
request parameters and row counts
  - [ ] verify missing-asset behavior is explicit for both Go and Rust WASM exporters
  - [ ] verify no separate native Rust backend or standalone Rust service has been introduced
### Task 7: Update documentation and close out
  - [ ] update README.md for user-facing changes
  - [ ] update AGENTS.md for new exporter-specific implementation guidance
  - [ ] update benchmark docs/results if command output or payload shape changed
  - [ ] move this plan to `docs/plans/completed/`
## Risks
  - rust_xlsxwriter may compile for wasm but still be impractical for this sample if its useful
low-memory modes depend on tempfile or if Node integration forces a full final buffer copy.
  - The Rust variant may not be meaningfully fair if its JS/WASM transfer format differs too much
from the Go path; keep the first version deliberately similar.
  - “Memory delta” can be misread if only Node heap is measured; this must be documented and,
if possible, supplemented with coarse WASM memory diagnostics.
  - A custom ZIP/XML fallback is feasible but materially larger in scope; that is why the first
milestone is strictly architecture validation and proof of concept.
  - Route and benchmark naming can become confusing if the current generic `wasm` label remains
overloaded; the response schema should be made explicit before adding the third variant.
