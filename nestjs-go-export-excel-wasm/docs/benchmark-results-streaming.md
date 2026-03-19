# Streaming Benchmark Results

## Environment

These benchmark results were collected on a constrained VPS environment, so they should be interpreted as **environment-specific**, not universal.

### Hardware / VM context
- **Host CPU:** `2x Intel Xeon Gold 6354` **or** `2x Intel Xeon Gold 6226R`
- **Virtualization:** `KVM`
- **Allocated CPU:** `1 vCPU`
- **RAM:** `2 GB DDR4`

### Important note
The application was **not running on dedicated hardware**. The benchmark should be read as:

- results on **1 vCPU / 2 GB RAM**,
- with all usual runtime overheads of Node.js, Prisma, SQLite, and Go/WASM,
- in a small VM environment.

Because of that:
- absolute timings will likely improve on stronger hardware,
- relative behavior may still remain similar,
- especially for large exports, low RAM and a single vCPU can noticeably affect GC pressure and total runtime.

---

## Project state used for benchmark

The benchmark was run after the following work:
- export paths moved to **streaming** mode,
- seed rewritten to **batched inserts** for large datasets,
- explicit export `limit` cap removed so large requests are honored,
- dataset seeded up to **200,000 rows**.

---

## Method

Dataset:
- SQLite + Prisma
- seeded with **200,000 employees**

Compared variants:
- `exceljs` streaming export
- `wasm` streaming export

Measured via benchmark endpoint:
- duration
- output size
- row count
- memory delta (with caveats)

### Caveat on memory metrics
`memoryDeltaBytes` is only a rough application-level signal.
For `wasm`, it may under-report real memory behavior because some memory can live outside the usual Node.js heap accounting.

---

## Verified large-limit behavior

After removing the artificial export cap, a direct benchmark request with:

```json
{
  "limit": 200000,
  "seed": 12345,
  "includeMemory": false
}
```

returned:
- `request.limit = 200000`
- `exceljs.rowCount = 200000`
- `wasm.rowCount = 200000`

So the benchmark now honors the requested large limit instead of silently clamping it down.

---

## Benchmark results

### Sweep on 200k dataset

| Requested rows | ExcelJS duration | WASM duration | Winner by speed |
|---|---:|---:|---|
| 10,000 | 1,836.73 ms | 4,798.89 ms | ExcelJS |
| 50,000 | 4,075.45 ms | 21,193.58 ms | ExcelJS |
| 100,000 | 7,646.25 ms | 48,448.81 ms | ExcelJS |
| 200,000 | 15,435.62 ms | 128,101.47 ms | ExcelJS |

### Direct 200k benchmark result

#### ExcelJS
- `rowCount = 200000`
- `sizeBytes = 31,584,649`
- `durationMs = 39,813.48`

#### WASM
- `rowCount = 200000`
- `sizeBytes = 18,911,232`
- `durationMs = 126,261.4`

---

## Interpretation

### What these results suggest on this hardware
On the tested `1 vCPU / 2 GB RAM` VM:
- **ExcelJS streaming is consistently faster**
- **WASM streaming is consistently slower**
- **WASM produces a smaller XLSX file** for the tested large export

### Likely reasons
#### ExcelJS
Benefits from:
- simpler execution model in Node.js,
- no JS ↔ WASM bridge overhead,
- lower coordination complexity.

#### WASM
Likely pays extra cost for:
- JS ↔ WASM boundary crossings,
- Go runtime overhead inside WASM,
- more expensive orchestration around the bridge.

### Important caution
These timings should **not** be treated as final universal truth for all hardware.

On a machine with more CPU and RAM, both variants should improve.
However, based on the current architecture, it is still reasonable to expect:
- ExcelJS to remain the faster option,
- WASM to remain the more experimental path,
- unless future optimization changes the bridge/runtime cost significantly.

---

## Known limitations of this benchmark

1. **Small VM environment**
   - only `1 vCPU`
   - only `2 GB RAM`
   - timings are therefore conservative and potentially noisy

2. **Memory metric is approximate**
   - especially for the WASM path

3. **Streaming does not mean zero memory**
   - libraries still keep internal workbook state
   - stream buffers still exist
   - WASM runtime still has overhead

4. **WASM path remains serialized**
   - due to global Go/WASM runtime characteristics

---

## Practical conclusion

If the goal is:
- **best speed on this environment** → prefer **ExcelJS streaming**
- **smaller XLSX output** and experimentation with Go/WASM → **WASM** can still be interesting

For production-like large exports on small servers, the current data suggests:
- streaming is the right direction,
- but `exceljs` is currently the stronger practical default.
