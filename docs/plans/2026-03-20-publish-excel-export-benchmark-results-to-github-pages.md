# Publish Excel Export Benchmark Results to GitHub Pages

## Overview
Add a benchmark publishing pipeline that runs the existing three-exporter comparison in a reproducible way, stores immutable raw JSON results over time, and generates a static GitHub Pages site with current results, historical trends, and implementation comparisons. The design should keep benchmark collection separate from site generation, reuse the current `POST /export/benchmark` API as the measurement source, and normalize results into an extensible schema so future runtimes can be added without restructuring the storage model or the site.

## Context
- Files involved:
  - `package.json`
  - `README.md`
  - `docs/benchmarking.md`
  - `docs/benchmark-results-streaming.md`
  - `.github/workflows/nestjs-go-export-excel-wasm-ci.yml`
  - `test/export-comparison.js`
  - `src/export/controllers/export-benchmark.controller.ts`
  - `src/export/services/export-comparison.service.ts`
  - `src/export/services/exceljs-export.service.ts`
  - `src/export/services/wasm-excel.service.ts`
  - `src/export/services/rust-wasm-excel.service.ts`
  - `src/export/repositories/export-dataset.repository.ts`
  - `prisma/seed.ts`
- Related patterns:
  - Benchmarking already exists as a live HTTP surface: `POST /export/benchmark` and `GET /export/benchmark/default`.
  - The current benchmark path is fair by construction because all exporters use the same SQLite/Prisma-backed stream plan from `DataGeneratorService` and `ExportDatasetRepository`.
  - CI already builds Go WASM and Rust WASM assets and performs a benchmark smoke call through `test/export-comparison.js`.
  - Current benchmark payload keys are hard-coded to `exceljs`, `goWasm`, and `rustWasm`; the publishing layer should normalize this into a generic implementation list instead of hard-coding site generation to today’s names.
- Dependencies:
  - Prefer no site framework.
  - Prefer plain static HTML/CSS/JS plus generated JSON.
  - If charts are needed, prefer generated SVG or a very small client-side dependency over introducing a full app/bundler stack.

## Development Approach
- Testing approach: Regular
- Complete each task fully before moving to the next.
- Keep benchmark collection and site generation as separate scripts with a file-based handoff.
- Treat the existing benchmark route as the measurement source of truth; do not add a second benchmark code path.
- Preserve immutable per-run raw JSON snapshots and derive summary indexes from them.
- Support two benchmark lanes in the data model:
  - continuous: automatic runs on GitHub-hosted runners for always-current repo status
  - recorded: manually collected runs from stronger hardware that can be imported later without rerunning the benchmark in GitHub Actions
- **CRITICAL: every task MUST include new/updated tests**
- **CRITICAL: all tests must pass before starting next task**

## Implementation Steps

### Task 1: Define the reproducible benchmark execution contract

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/benchmarking.md`
- Create: `benchmarks/profiles/continuous-default.json`
- Create: `benchmarks/schema/benchmark-run.schema.json`
- Create: `scripts/benchmarks/collect-benchmark-results.ts`
- Create: `scripts/benchmarks/lib/benchmark-config.ts`
- Create: `scripts/benchmarks/lib/benchmark-normalizer.ts`
- Create: `scripts/benchmarks/lib/benchmark-runner.ts`
- Create: `scripts/benchmarks/lib/process-control.ts`
- Create: `scripts/benchmarks/lib/environment-metadata.ts`
- Create: `scripts/benchmarks/__tests__/benchmark-config.spec.ts`
- Create: `scripts/benchmarks/__tests__/benchmark-normalizer.spec.ts`

- [x] define one benchmark profile file that locks request shape and environment expectations for reproducible continuous runs: fixed seed, limit, column set, output metadata, warmup policy, and sample count
- [x] keep collection on the existing `POST /export/benchmark` endpoint so all implementations continue to measure the same SQLite-backed dataset path
- [x] normalize the controller response into a machine-readable run document with generic implementation entries, scenario metadata, run timestamps, git commit info, runner/toolchain metadata, and collection lane (`continuous` or `recorded`)
- [x] validate normalized run documents against a JSON schema so site generation and history indexing only depend on the schema, not the raw HTTP shape
- [x] document how the benchmark collector starts the app, waits for health, runs the benchmark, captures the JSON output, and stores the run artifact without mixing in site generation
- [x] write tests for benchmark profile loading and payload normalization
- [x] run task-level validation before task 2

### Task 2: Add immutable benchmark history storage and import flow

**Files:**
- Modify: `package.json`
- Create: `benchmarks/data/.gitkeep`
- Create: `benchmarks/data/README.md`
- Create: `scripts/benchmarks/update-history.ts`
- Create: `scripts/benchmarks/import-recorded-run.ts`
- Create: `scripts/benchmarks/lib/history-store.ts`
- Create: `scripts/benchmarks/lib/history-index.ts`
- Create: `scripts/benchmarks/__tests__/history-store.spec.ts`
- Create: `scripts/benchmarks/__tests__/import-recorded-run.spec.ts`

- [x] store each benchmark run as an immutable JSON file under a date-based directory structure, for example `benchmarks/data/runs/<lane>/<environment>/<yyyy>/<mm>/<timestamp>-<sha>.json`
- [x] derive machine-readable indexes from raw snapshots, including latest-per-lane pointers, per-scenario trend series, and implementation metadata indexes
- [x] keep raw run documents append-only so historical results remain preserved across runs
- [x] support manual import of pre-collected recorded-run JSON from stronger hardware so the project can publish more stable benchmarks without coupling publication to GitHub-hosted runner performance
- [x] ensure history indexes remain environment-aware so continuous GitHub-hosted results and recorded dedicated-hardware results are not mixed into the same trend line unless explicitly modeled as the same environment
- [x] write tests for append-only storage, index rebuilds, duplicate handling, and recorded-run import validation
- [x] run task-level validation before task 3

### Task 3: Generate a static GitHub Pages site from stored benchmark data

**Files:**
- Modify: `package.json`
- Create: `benchmarks/site/index.html`
- Create: `benchmarks/site/styles.css`
- Create: `benchmarks/site/app.js`
- Create: `scripts/benchmarks/build-site.ts`
- Create: `scripts/benchmarks/lib/site-data-builder.ts`
- Create: `scripts/benchmarks/lib/site-renderer.ts`
- Create: `scripts/benchmarks/__tests__/site-data-builder.spec.ts`
- Create: `scripts/benchmarks/__tests__/site-renderer.spec.ts`

- [ ] build the Pages site from stored JSON indexes only; the deployed site must not call the Nest app at runtime
- [ ] keep the site implementation simple: static HTML/CSS/vanilla JS with generated JSON payloads and optional generated SVG charts
- [ ] include current benchmark summaries, historical trend views, and side-by-side comparisons across implementations
- [ ] render from the generic implementation list so adding a fourth runtime later only requires new normalized data, not hard-coded new page sections
- [ ] show benchmark metadata prominently: lane, environment label, runner/tool versions, commit SHA, benchmark profile, row count, and current memory caveats from diagnostics
- [ ] keep site output deterministic so repeated builds over the same benchmark data produce the same files
- [ ] write tests against fixture benchmark data to validate site data shaping and generated static output
- [ ] run task-level validation before task 4

### Task 4: Add GitHub Actions workflows for benchmark collection and Pages publishing

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/nestjs-go-export-excel-wasm-ci.yml`
- Create: `.github/workflows/benchmark-pages.yml`
- Create: `scripts/benchmarks/publish-pages.ts`
- Create: `scripts/benchmarks/__tests__/publish-pages.spec.ts`

- [ ] add a dedicated benchmark workflow with `push` on `master`, `workflow_dispatch`, and a scheduled trigger; do not fold full benchmark publication into PR validation
- [ ] pin the runner image and tool versions used for continuous benchmark collection so the automatic lane stays as stable and reproducible as GitHub-hosted infrastructure allows
- [ ] serialize benchmark publication with a concurrency group so overlapping runs cannot corrupt history/index updates
- [ ] make workflow steps run the benchmark path end to end: install dependencies, generate Prisma client, migrate and seed SQLite, build Go WASM, build Rust WASM, build Nest, collect benchmark JSON, update history, build the static site, and deploy the Pages artifact
- [ ] publish only continuous benchmark results automatically from `master`; allow manual workflow dispatch to rebuild the site and optionally import recorded data without forcing a fresh benchmark run
- [ ] keep benchmark publication independent from normal CI pass/fail so performance-runner variance does not block standard code validation
- [ ] write tests or validations for required workflow assumptions, directory contracts, and publish-script orchestration
- [ ] run task-level validation before task 5

### Task 5: Add developer scripts, validation commands, and documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/benchmarking.md`
- Modify: `docs/benchmark-results-streaming.md`
- Create: `docs/benchmark-pages.md`
- Create: `scripts/benchmarks/validate-benchmarks.ts`
- Create: `scripts/benchmarks/__tests__/validate-benchmarks.spec.ts`

- [ ] add explicit scripts for `benchmark:collect`, `benchmark:history`, `benchmark:site`, `benchmark:validate`, `benchmark:pages`, and `benchmark:import-recorded`
- [ ] document the separation between raw benchmark data collection, history/index generation, and static site generation
- [ ] document the two benchmark lanes clearly so trend interpretation stays correct: continuous GitHub-runner data versus recorded stronger-hardware data
- [ ] document the storage contract for raw JSON snapshots and derived indexes, including how a future exporter should be added to the normalized schema without changing site structure
- [ ] document the local workflow for collecting a run, importing a recorded run, rebuilding history, and previewing the generated site
- [ ] implement a validation script that checks schema validity, index consistency, latest-pointer correctness, required site outputs, and stable implementation metadata references
- [ ] write tests for the validation script and documentation-backed command flows where applicable
- [ ] run task-level validation before task 6

### Task 6: Verify acceptance criteria

**Files:**
- Modify as needed based on verification fixes from earlier tasks

- [ ] run the repository checks required by the project:
  - `npm run prisma:generate`
  - `npm run prisma:migrate`
  - `npm run prisma:seed`
  - `npm run build:wasm`
  - `npm run build:rust-wasm`
  - `npm run build`
  - `npm test`
  - `npm run test:e2e`
- [ ] run the new benchmark-specific checks:
  - `npm run benchmark:collect -- --profile benchmarks/profiles/continuous-default.json --output .tmp/benchmark-run.json`
  - `npm run benchmark:history -- --data-dir .tmp/benchmarks/data`
  - `npm run benchmark:site -- --data-dir .tmp/benchmarks/data --out-dir .tmp/benchmarks/site`
  - `npm run benchmark:validate -- --data-dir .tmp/benchmarks/data --site-dir .tmp/benchmarks/site`
- [ ] verify that automatic `master` publication updates only the continuous latest/trend views
- [ ] verify that importing a recorded run from another machine preserves separate latest/trend blocks for that environment
- [ ] verify that the generated site shows current results, historical trends, and implementation comparisons from static assets only
- [ ] verify that adding a future implementation id to normalized JSON does not require structural site changes
- [ ] verify test coverage meets 80%+

### Task 7: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/benchmarking.md`
- Modify: `docs/benchmark-pages.md`
- Modify: `AGENTS.md` if benchmark workflow conventions become repository policy

- [ ] update README with the benchmark publishing architecture, automatic `master` refresh behavior, and recorded-run import flow
- [ ] update benchmark docs to distinguish smoke testing, continuous CI benchmarks, and recorded dedicated-hardware benchmarks
- [ ] document benchmark limitations clearly, especially runner variance and the scope of `memoryDeltaBytes`
- [ ] move this plan to `docs/plans/completed/`
