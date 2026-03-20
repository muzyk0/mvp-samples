# Benchmark Pages Pipeline

This project publishes benchmark results as static files generated from immutable JSON artifacts.
Collection, storage, site generation, and publication are separate steps on purpose.

## Pipeline stages

1. Raw collection

- command: `npm run benchmark:collect -- --profile benchmarks/profiles/continuous-default.json --output .tmp/benchmark-run.json`
- source of truth: `POST /export/benchmark`
- output: one normalized schema-validated run document

2. Recorded-run import

- command: `npm run benchmark:import-recorded -- --input .tmp/recorded-run.json --data-dir .tmp/benchmarks/data`
- use this for stronger hardware runs collected elsewhere
- imported runs must already match `benchmarks/schema/benchmark-run.schema.json`

3. History/index generation

- command: `npm run benchmark:history -- --data-dir .tmp/benchmarks/data`
- reads append-only files under `benchmarks/data/runs/`
- rewrites derived indexes under `benchmarks/data/indexes/`

4. Static site generation

- command: `npm run benchmark:site -- --data-dir .tmp/benchmarks/data --out-dir .tmp/benchmarks/site`
- reads only stored indexes
- writes static `index.html`, `styles.css`, `app.js`, and `site-data.json`

5. Validation

- command: `npm run benchmark:validate -- --data-dir .tmp/benchmarks/data --site-dir .tmp/benchmarks/site`
- checks run schema validity, index consistency, latest pointers, implementation metadata references, and required site output files

6. Pages publication orchestration

- command: `npm run benchmark:pages -- --collect --published-site-dir .tmp/published-site --site-dir .tmp/benchmarks/site --data-dir .tmp/benchmarks/data`
- optionally seeds previous published data, collects the continuous run, imports recorded runs, rebuilds history, generates the site, and stages data for publishing
- the GitHub Actions workflow runs this on push to `master`, on a weekly schedule, or by manual dispatch, then deploys the generated static files to `gh-pages`

## When to use which command

- smoke test only: `bun run test:comparison` against a running app to confirm the live benchmark route still responds
- continuous Pages refresh: `npm run benchmark:pages -- --collect ...` to collect the pinned profile and publish the continuous lane
- recorded import: `npm run benchmark:import-recorded -- ...` followed by history/site/validate when results came from another machine

## Benchmark lanes

Two lanes intentionally coexist:

- continuous lane: automatic GitHub-hosted runner results for current repository state
- recorded lane: manually imported results from stronger or more stable hardware

Do not compare them as one trend line unless they intentionally share the same environment label and
collection policy. Environment separation is part of the storage key and part of the site layout.

## Storage contract

Raw run documents are append-only and live under:

`benchmarks/data/runs/<lane>/<environment>/<yyyy>/<mm>/<timestamp>-<sha>.json`

Derived files live under:

- `benchmarks/data/indexes/history-index.json`
- `benchmarks/data/indexes/latest-runs.json`
- `benchmarks/data/indexes/run-summaries.json`
- `benchmarks/data/indexes/scenario-trends.json`
- `benchmarks/data/indexes/implementations.json`

The site and validation steps depend on the normalized schema and these derived indexes, not on the
raw HTTP response shape.

## Adding a future exporter

A future exporter should be added by extending normalized run documents with a new implementation id,
label, source key, variant, metrics, and execution metadata. The site reads generic implementation
lists from normalized data and indexes, so a future exporter should not require structural HTML
changes as long as the schema and indexes remain consistent.

## Limitations

- continuous lane results inherit GitHub-hosted runner variance and should be interpreted as trend signals, not hardware-absolute performance claims
- `memoryDeltaBytes` reports Node heap deltas only and excludes Go/Rust WASM linear memory, allocator internals, and full-process RSS
- recorded runs are only comparable to each other when the environment label and collection policy intentionally match

## Local workflow

Use `benchmark:collect` when you need a standalone normalized artifact. To stage a continuous run
directly into a benchmark data directory, use `benchmark:pages -- --collect`.

Example end-to-end local preview flow:

```bash
npm run benchmark:pages -- \
  --collect \
  --profile benchmarks/profiles/continuous-default.json \
  --benchmark-output .tmp/benchmark-run.json \
  --data-dir .tmp/benchmarks/data \
  --site-dir .tmp/benchmarks/site
```

If raw runs are already stored or imported under `.tmp/benchmarks/data`, rebuild and preview with:

```bash
npm run benchmark:history -- --data-dir .tmp/benchmarks/data

npm run benchmark:site -- \
  --data-dir .tmp/benchmarks/data \
  --out-dir .tmp/benchmarks/site

npm run benchmark:validate -- \
  --data-dir .tmp/benchmarks/data \
  --site-dir .tmp/benchmarks/site

python3 -m http.server 4173 --directory .tmp/benchmarks/site
```

If you are importing a recorded run, place it before the history rebuild:

```bash
npm run benchmark:import-recorded -- \
  --input .tmp/recorded-run.json \
  --data-dir .tmp/benchmarks/data
```
