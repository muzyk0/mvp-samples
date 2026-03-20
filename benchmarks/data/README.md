# Benchmark data storage

Raw benchmark runs live under `runs/<lane>/<environment>/<yyyy>/<mm>/`.

- Each JSON file is an immutable normalized benchmark run validated against `benchmarks/schema/benchmark-run.schema.json`.
- Continuous GitHub-runner results and recorded stronger-hardware results stay separated by both `lane` and `environment`.
- Derived indexes are rebuilt into `indexes/` from the raw snapshots and can be regenerated at any time.
- Duplicate imports with the same normalized payload are skipped instead of overwriting history.
