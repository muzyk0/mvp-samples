import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { NormalizedBenchmarkRun } from '../lib/benchmark-normalizer';
import { importRecordedRun } from '../import-recorded-run';
const createdDirectories: string[] = [];

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'benchmark-import-'));
  createdDirectories.push(directory);
  return directory;
}

function createRecordedRun(): NormalizedBenchmarkRun {
  return {
    schemaVersion: '1.0.0',
    lane: 'recorded',
    collectedAt: '2026-03-20T12:00:00.000Z',
    profile: {
      id: 'recorded-workstation',
      label: 'Recorded workstation benchmark',
      path: '/tmp/recorded-profile.json',
      environmentLabel: 'dedicated-linux-workstation',
      expectations: ['Collected on dedicated hardware'],
    },
    source: {
      endpoint: '/export/benchmark',
      method: 'POST',
      baseUrl: 'http://127.0.0.1:3100',
    },
    git: {
      commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      shortSha: 'aaaaaaa',
      branch: 'main',
      isDirty: false,
    },
    runner: {
      environmentLabel: 'dedicated-linux-workstation',
      hostname: 'workstation-a',
      platform: 'linux',
      arch: 'x64',
      cpuCount: 16,
      cpuModel: 'Workstation CPU',
      totalMemoryBytes: 64_000,
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
        collectedAt: '2026-03-20T12:00:00.000Z',
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
              durationMs: 99,
              sizeBytes: 10,
              rowCount: 2000,
              columnCount: 2,
            },
            fileName: 'exceljs.xlsx',
            contentType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ],
        comparisons: [],
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

describe('import-recorded-run', () => {
  it('imports a recorded run and rebuilds environment-aware indexes', async () => {
    const dataDir = await createTempDir();
    const inputPath = resolve(dataDir, 'recorded-run.json');
    await writeFile(
      inputPath,
      `${JSON.stringify(createRecordedRun(), null, 2)}\n`,
      'utf8',
    );

    await expect(
      importRecordedRun({
        inputPath,
        dataDir,
      }),
    ).resolves.toMatchObject({
      status: 'stored',
      relativePath:
        'runs/recorded/dedicated-linux-workstation/2026/03/2026-03-20T12-00-00-000Z-aaaaaaa.json',
    });
    const latestRuns = JSON.parse(
      await readFile(resolve(dataDir, 'indexes/latest-runs.json'), 'utf8'),
    ) as Record<string, Record<string, string>>;
    expect(latestRuns.recorded['dedicated-linux-workstation']).toContain(
      'runs/recorded/dedicated-linux-workstation/2026/03/2026-03-20T12-00-00-000Z-aaaaaaa.json',
    );
    const scenarioTrends = JSON.parse(
      await readFile(resolve(dataDir, 'indexes/scenario-trends.json'), 'utf8'),
    ) as Record<
      string,
      {
        lane: string;
        environment: string;
        scenarioId: string;
        latestRunPath: string;
      }
    >;
    expect(
      scenarioTrends['recorded::dedicated-linux-workstation::default-benchmark'],
    ).toMatchObject({
      lane: 'recorded',
      environment: 'dedicated-linux-workstation',
      scenarioId: 'default-benchmark',
      latestRunPath:
        'runs/recorded/dedicated-linux-workstation/2026/03/2026-03-20T12-00-00-000Z-aaaaaaa.json',
    });
  });

  it('rejects imports that are not recorded-lane run documents', async () => {
    const dataDir = await createTempDir();
    const inputPath = resolve(dataDir, 'not-recorded.json');
    const invalidRun = {
      ...createRecordedRun(),
      lane: 'continuous',
    };

    await writeFile(
      inputPath,
      `${JSON.stringify(invalidRun, null, 2)}\n`,
      'utf8',
    );

    await expect(
      importRecordedRun({
        inputPath,
        dataDir,
      }),
    ).rejects.toThrow(/require lane "recorded"/);
  });
});
