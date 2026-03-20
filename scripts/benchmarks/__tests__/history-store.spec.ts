import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { NormalizedBenchmarkRun } from '../lib/benchmark-normalizer';
import {
  getRunRelativePath,
  loadStoredBenchmarkRuns,
  storeBenchmarkRun,
} from '../lib/history-store';
import { buildHistoryIndexes } from '../lib/history-index';

const createdDirectories: string[] = [];

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'benchmark-history-'));
  createdDirectories.push(directory);
  return directory;
}

function createRun(
  overrides: Partial<NormalizedBenchmarkRun> = {},
): NormalizedBenchmarkRun {
  return {
    schemaVersion: '1.0.0',
    lane: 'continuous',
    collectedAt: '2026-03-20T09:00:00.000Z',
    profile: {
      id: 'continuous-default',
      label: 'Continuous default benchmark',
      path: '/tmp/profile.json',
      environmentLabel: 'github-hosted-linux-x64',
      expectations: ['Use shared benchmark route'],
    },
    source: {
      endpoint: '/export/benchmark',
      method: 'POST',
      baseUrl: 'http://127.0.0.1:3100',
    },
    git: {
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      shortSha: '0123456',
      branch: 'main',
      isDirty: false,
    },
    runner: {
      environmentLabel: 'github-hosted-linux-x64',
      hostname: 'runner-a',
      platform: 'linux',
      arch: 'x64',
      cpuCount: 4,
      cpuModel: 'Example CPU',
      totalMemoryBytes: 1_024,
    },
    toolchain: {
      nodeVersion: 'v22.0.0',
      npmVersion: '10.0.0',
      bunVersion: '1.3.10',
      goVersion: 'go version go1.25.0 linux/amd64',
      rustVersion: 'rustc 1.90.0',
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
    },
    samples: [
      {
        sampleIndex: 1,
        collectedAt: '2026-03-20T09:00:00.000Z',
        request: {
          limit: 2000,
          seed: 12345,
          columns: ['id', 'fullName'],
        },
        implementations: [
          {
            id: 'exceljs',
            label: 'ExcelJS',
            sourceKey: 'exceljs',
            variant: 'exceljs',
            executionModel: 'streams',
            metrics: {
              durationMs: 100,
              sizeBytes: 10,
              rowCount: 2000,
              columnCount: 2,
              memoryDeltaBytes: 400,
            },
            fileName: 'exceljs.xlsx',
            contentType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          {
            id: 'goWasm',
            label: 'Go/WASM',
            sourceKey: 'goWasm',
            variant: 'wasm',
            executionModel: 'finalizes via callbacks',
            metrics: {
              durationMs: 120,
              sizeBytes: 9,
              rowCount: 2000,
              columnCount: 2,
            },
            fileName: 'go-wasm.xlsx',
            contentType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ],
        comparisons: [
          {
            id: 'goWasm-vs-exceljs',
            baselineImplementationId: 'exceljs',
            contenderImplementationId: 'goWasm',
            metrics: {
              durationMsDelta: 20,
              sizeBytesDelta: -1,
            },
          },
        ],
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
      },
    ],
    ...overrides,
  };
}

afterEach(async () => {
  const { rm } = await import('fs/promises');
  await Promise.all(
    createdDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('history-store', () => {
  it('stores runs under lane/environment/date paths and leaves duplicates append-only', async () => {
    const dataDir = await createTempDir();
    const run = createRun();

    expect(getRunRelativePath(run)).toBe(
      'runs/continuous/github-hosted-linux-x64/2026/03/2026-03-20T09-00-00-000Z-0123456.json',
    );

    await expect(storeBenchmarkRun(dataDir, run)).resolves.toEqual({
      status: 'stored',
      relativePath:
        'runs/continuous/github-hosted-linux-x64/2026/03/2026-03-20T09-00-00-000Z-0123456.json',
    });

    await expect(storeBenchmarkRun(dataDir, run)).resolves.toEqual({
      status: 'duplicate',
      relativePath:
        'runs/continuous/github-hosted-linux-x64/2026/03/2026-03-20T09-00-00-000Z-0123456.json',
    });

    const storedFile = resolve(
      dataDir,
      'runs/continuous/github-hosted-linux-x64/2026/03/2026-03-20T09-00-00-000Z-0123456.json',
    );
    const storedContent = await readFile(storedFile, 'utf8');
    expect(JSON.parse(storedContent)).toMatchObject({
      lane: 'continuous',
      runner: {
        environmentLabel: 'github-hosted-linux-x64',
      },
    });
  });

  it('rebuilds indexes without mixing environments that share a scenario id', async () => {
    const dataDir = await createTempDir();
    await storeBenchmarkRun(dataDir, createRun());
    await storeBenchmarkRun(
      dataDir,
      createRun({
        lane: 'recorded',
        collectedAt: '2026-03-21T09:00:00.000Z',
        git: {
          commitSha: 'fedcba9876543210fedcba9876543210fedcba98',
          shortSha: 'fedcba9',
          branch: 'main',
          isDirty: false,
        },
        profile: {
          id: 'recorded-workstation',
          label: 'Recorded workstation benchmark',
          path: '/tmp/recorded-profile.json',
          environmentLabel: 'dedicated-linux-workstation',
          expectations: ['Imported from stronger hardware'],
        },
        runner: {
          environmentLabel: 'dedicated-linux-workstation',
          hostname: 'workstation-a',
          platform: 'linux',
          arch: 'x64',
          cpuCount: 16,
          cpuModel: 'Workstation CPU',
          totalMemoryBytes: 32_768,
        },
      }),
    );

    const indexes = buildHistoryIndexes(await loadStoredBenchmarkRuns(dataDir));

    expect(indexes.runs.total).toBe(2);
    expect(indexes.latestRuns).toEqual({
      continuous: {
        'github-hosted-linux-x64':
          'runs/continuous/github-hosted-linux-x64/2026/03/2026-03-20T09-00-00-000Z-0123456.json',
      },
      recorded: {
        'dedicated-linux-workstation':
          'runs/recorded/dedicated-linux-workstation/2026/03/2026-03-21T09-00-00-000Z-fedcba9.json',
      },
    });
    expect(
      indexes.runSummaries[
        'runs/continuous/github-hosted-linux-x64/2026/03/2026-03-20T09-00-00-000Z-0123456.json'
      ],
    ).toMatchObject({
      diagnostics: {
        memory: {
          note: 'Node heap only',
        },
      },
      implementations: {
        exceljs: {
          avgDurationMs: 100,
          avgMemoryDeltaBytes: 400,
        },
      },
    });
    expect(Object.keys(indexes.scenarios)).toEqual([
      'continuous::github-hosted-linux-x64::default-benchmark',
      'recorded::dedicated-linux-workstation::default-benchmark',
    ]);
    expect(indexes.implementations.exceljs.variants).toEqual(['exceljs']);
    expect(indexes.implementations.goWasm.executionModels).toEqual([
      'finalizes via callbacks',
    ]);
  });

  it('refuses to overwrite a conflicting run file', async () => {
    const dataDir = await createTempDir();
    const run = createRun();
    const relativePath = getRunRelativePath(run);
    const absolutePath = resolve(dataDir, relativePath);

    await storeBenchmarkRun(dataDir, run);
    await writeFile(absolutePath, '{"tampered":true}\n', 'utf8');

    await expect(storeBenchmarkRun(dataDir, run)).rejects.toThrow(
      /Refusing to overwrite existing benchmark run/,
    );
  });
});
