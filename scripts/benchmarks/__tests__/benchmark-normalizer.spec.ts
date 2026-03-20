import { describe, expect, it } from 'vitest';
import type { ExportBenchmarkResult } from '../../../src/export/interfaces/export-data.interface';
import {
  normalizeBenchmarkRun,
  normalizeBenchmarkSample,
  validateNormalizedBenchmarkRun,
} from '../lib/benchmark-normalizer';

describe('benchmark-normalizer', () => {
  const payload: ExportBenchmarkResult = {
    request: {
      limit: 2000,
      seed: 12345,
      columns: ['id', 'fullName'],
    },
    exceljs: {
      variant: 'exceljs',
      fileName: 'exceljs.xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      durationMs: 100,
      sizeBytes: 10,
      rowCount: 2000,
      columnCount: 2,
      memoryDeltaBytes: 500,
    },
    goWasm: {
      variant: 'wasm',
      fileName: 'go-wasm.xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      durationMs: 140,
      sizeBytes: 8,
      rowCount: 2000,
      columnCount: 2,
      memoryDeltaBytes: 300,
    },
    rustWasm: {
      variant: 'rust-wasm',
      fileName: 'rust-wasm.xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      durationMs: 120,
      sizeBytes: 9,
      rowCount: 2000,
      columnCount: 2,
      memoryDeltaBytes: 250,
    },
    deltas: {
      goWasmVsExceljs: {
        durationMs: 40,
        sizeBytes: -2,
        memoryDeltaBytes: -200,
      },
      rustWasmVsExceljs: {
        durationMs: 20,
        sizeBytes: -1,
        memoryDeltaBytes: -250,
      },
      rustWasmVsGoWasm: {
        durationMs: -20,
        sizeBytes: 1,
        memoryDeltaBytes: -50,
      },
    },
    diagnostics: {
      memory: {
        nodeHeapDeltaMeasured: true,
        wasmLinearMemoryIncluded: false,
        note: 'Node heap only',
      },
      executionModel: {
        exceljs: 'streams',
        goWasm: 'finalizes via callbacks',
        rustWasm: 'final buffer',
      },
    },
  } as const;

  it('normalizes the benchmark payload into generic implementation entries', () => {
    const sample = normalizeBenchmarkSample(
      payload,
      2,
      '2026-03-20T09:00:00.000Z',
    );

    expect(sample.sampleIndex).toBe(2);
    expect(sample.implementations).toHaveLength(3);
    expect(sample.implementations[0]).toMatchObject({
      id: 'exceljs',
      label: 'ExcelJS',
      sourceKey: 'exceljs',
      executionModel: 'streams',
      metrics: {
        durationMs: 100,
        sizeBytes: 10,
        rowCount: 2000,
      },
    });
    expect(sample.implementations[1]).toMatchObject({
      id: 'goWasm',
      label: 'Go/WASM',
      sourceKey: 'goWasm',
    });
    expect(sample.implementations[2]).toMatchObject({
      id: 'rustWasm',
      label: 'Rust/WASM',
      sourceKey: 'rustWasm',
    });
    expect(sample.comparisons).toEqual([
      expect.objectContaining({
        id: 'goWasm-vs-exceljs',
        baselineImplementationId: 'exceljs',
        contenderImplementationId: 'goWasm',
      }),
      expect.objectContaining({
        id: 'rustWasm-vs-exceljs',
      }),
      expect.objectContaining({
        id: 'rustWasm-vs-goWasm',
      }),
    ]);
  });

  it('validates the normalized benchmark run against the JSON schema', async () => {
    const runDocument = normalizeBenchmarkRun([payload], {
      lane: 'continuous',
      collectedAt: '2026-03-20T09:00:00.000Z',
      profilePath: '/tmp/continuous-default.json',
      profile: {
        id: 'continuous-default',
        label: 'Continuous default benchmark',
        description: 'Pinned benchmark profile',
        lane: 'continuous',
        environment: {
          label: 'github-hosted-linux-x64',
          expectations: ['Use POST /export/benchmark'],
        },
        server: {
          baseUrl: 'http://127.0.0.1:3100',
          port: 3100,
          startCommand: ['npm', 'run', 'start:prod'],
          healthChecks: ['/export/exceljs/health'],
          startupTimeoutMs: 120000,
          healthPollIntervalMs: 1000,
        },
        scenario: {
          id: 'default-benchmark',
          label: 'Default benchmark',
          sampleCount: 1,
          warmupCount: 1,
          request: {
            limit: 2000,
            seed: 12345,
            columns: ['id', 'fullName'],
            fileName: 'benchmark.xlsx',
            includeMemory: true,
          },
          output: {
            format: 'json',
            artifactKind: 'normalized-benchmark-run',
          },
        },
      },
      git: {
        commitSha: '0123456789abcdef0123456789abcdef01234567',
        shortSha: '0123456',
        branch: 'main',
        isDirty: false,
      },
      runner: {
        environmentLabel: 'github-hosted-linux-x64',
        hostname: 'runner',
        platform: 'linux',
        arch: 'x64',
        cpuCount: 4,
        cpuModel: 'Example CPU',
        totalMemoryBytes: 1024,
      },
      toolchain: {
        nodeVersion: 'v22.0.0',
        npmVersion: '10.0.0',
        bunVersion: '1.0.0',
        goVersion: 'go1.25.0 linux/amd64',
        rustVersion: 'rustc 1.90.0',
      },
    });

    await expect(
      validateNormalizedBenchmarkRun(runDocument),
    ).resolves.toBeUndefined();
  });

  it('rejects invalid date-time values declared in the benchmark schema', async () => {
    const runDocument = normalizeBenchmarkRun([payload], {
      lane: 'continuous',
      collectedAt: '2026-03-20T09:00:00.000Z',
      profilePath: '/tmp/continuous-default.json',
      profile: {
        id: 'continuous-default',
        label: 'Continuous default benchmark',
        lane: 'continuous',
        environment: {
          label: 'github-hosted-linux-x64',
          expectations: ['Use POST /export/benchmark'],
        },
        server: {
          baseUrl: 'http://127.0.0.1:3100',
          port: 3100,
          startCommand: ['npm', 'run', 'start:prod'],
          healthChecks: ['/export/exceljs/health'],
          startupTimeoutMs: 120000,
          healthPollIntervalMs: 1000,
        },
        scenario: {
          id: 'default-benchmark',
          label: 'Default benchmark',
          sampleCount: 1,
          warmupCount: 1,
          request: {
            limit: 2000,
            seed: 12345,
            columns: ['id', 'fullName'],
            fileName: 'benchmark.xlsx',
            includeMemory: true,
          },
          output: {
            format: 'json',
            artifactKind: 'normalized-benchmark-run',
          },
        },
      },
      git: {
        commitSha: '0123456789abcdef0123456789abcdef01234567',
        shortSha: '0123456',
        branch: 'main',
        isDirty: false,
      },
      runner: {
        environmentLabel: 'github-hosted-linux-x64',
        hostname: 'runner',
        platform: 'linux',
        arch: 'x64',
        cpuCount: 4,
        cpuModel: 'Example CPU',
        totalMemoryBytes: 1024,
      },
      toolchain: {
        nodeVersion: 'v22.0.0',
        npmVersion: '10.0.0',
        bunVersion: '1.0.0',
        goVersion: 'go1.25.0 linux/amd64',
        rustVersion: 'rustc 1.90.0',
      },
    });

    runDocument.collectedAt = 'not-a-date';
    runDocument.samples[0].collectedAt = 'also-not-a-date';

    await expect(validateNormalizedBenchmarkRun(runDocument)).rejects.toThrow(
      /date-time/,
    );
  });
});
