import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  publishBenchmarkPages,
  seedPublishedBenchmarkData,
} from '../publish-pages';
import type { NormalizedBenchmarkRun } from '../lib/benchmark-normalizer';
import { storeBenchmarkRun } from '../lib/history-store';

const createdDirectories: string[] = [];

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'benchmark-pages-'));
  createdDirectories.push(directory);
  return directory;
}

function createBenchmarkRun(
  lane: 'continuous' | 'recorded',
  collectedAt: string,
  shortSha: string,
  environmentLabel: string,
): NormalizedBenchmarkRun {
  return {
    schemaVersion: '1.0.0',
    lane,
    collectedAt,
    profile: {
      id: `${lane}-profile`,
      label: `${lane} profile`,
      path: `/tmp/${lane}-profile.json`,
      environmentLabel,
      expectations: ['Pinned test environment'],
    },
    source: {
      endpoint: '/export/benchmark',
      method: 'POST',
      baseUrl: 'http://127.0.0.1:3100',
    },
    git: {
      commitSha: `${shortSha}${shortSha}${shortSha}${shortSha}${shortSha}${shortSha}`,
      shortSha,
      branch: 'master',
      isDirty: false,
    },
    runner: {
      environmentLabel,
      hostname: 'benchmark-runner',
      platform: 'linux',
      arch: 'x64',
      cpuCount: 4,
      cpuModel: 'Pinned CPU',
      totalMemoryBytes: 32_000,
    },
    toolchain: {
      nodeVersion: 'v22.14.0',
      npmVersion: '10.9.0',
      bunVersion: '1.3.10',
      goVersion: 'go version go1.25.5 linux/amd64',
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
        collectedAt,
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
              durationMs: lane === 'continuous' ? 110 : 95,
              sizeBytes: 512,
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
            goWasm: 'callbacks',
            rustWasm: 'final buffer',
          },
        },
      },
    ],
  };
}

afterEach(async () => {
  const { rm } = await import('fs/promises');
  vi.restoreAllMocks();
  await Promise.all(
    createdDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('publish-pages', () => {
  it('seeds a fresh data directory from an existing published site snapshot', async () => {
    const publishedSiteDir = await createTempDir();
    const seededDataDir = resolve(publishedSiteDir, 'data');
    const existingRun = createBenchmarkRun(
      'continuous',
      '2026-03-20T13:00:00.000Z',
      'abc1234',
      'github-hosted-ubuntu-24-04',
    );

    await storeBenchmarkRun(seededDataDir, existingRun);
    const copied = await seedPublishedBenchmarkData(
      publishedSiteDir,
      await createTempDir(),
    );

    expect(copied).toBe(true);
  });

  it('orchestrates carry-forward data, optional collection, import, indexing, and site output', async () => {
    const dataDir = await createTempDir();
    const siteDir = await createTempDir();
    const publishedSiteDir = await createTempDir();
    const inputDir = await createTempDir();
    const benchmarkOutputPath = resolve(dataDir, 'continuous-run.json');
    const recordedRunPath = resolve(inputDir, 'recorded-run.json');

    await storeBenchmarkRun(
      resolve(publishedSiteDir, 'data'),
      createBenchmarkRun(
        'continuous',
        '2026-03-20T12:00:00.000Z',
        'cont001',
        'github-hosted-ubuntu-24-04',
      ),
    );
    await writeFile(
      recordedRunPath,
      `${JSON.stringify(
        createBenchmarkRun(
          'recorded',
          '2026-03-20T14:00:00.000Z',
          'rec0001',
          'dedicated-linux-workstation',
        ),
        null,
        2,
      )}\n`,
      'utf8',
    );

    const collectRun = vi
      .fn()
      .mockResolvedValue(
        createBenchmarkRun(
          'continuous',
          '2026-03-20T15:00:00.000Z',
          'cont002',
          'github-hosted-ubuntu-24-04',
        ),
      );

    const summary = await publishBenchmarkPages(
      {
        dataDir,
        siteDir,
        publishedSiteDir,
        profilePath: resolve('benchmarks/profiles/continuous-default.json'),
        benchmarkOutputPath,
        recordedRunPaths: [recordedRunPath],
        collectContinuousRun: true,
      },
      { collectRun },
    );

    expect(collectRun).toHaveBeenCalledTimes(1);
    expect(summary.seededFromPublishedSite).toBe(true);
    expect(summary.collectedContinuousRun).toBe(true);
    expect(summary.importedRecordedRuns).toEqual([recordedRunPath]);
    expect(summary.indexedRunCount).toBe(3);
    await expect(
      readFile(resolve(siteDir, 'index.html'), 'utf8'),
    ).resolves.toContain('Latest results by lane and environment');
    await expect(
      readFile(resolve(siteDir, 'data/indexes/latest-runs.json'), 'utf8'),
    ).resolves.toContain('dedicated-linux-workstation');
  });

  it('captures the benchmark workflow contract for triggers, versions, concurrency, and publication steps', async () => {
    const workflow = await readFile(
      resolve('.github/workflows/benchmark-pages.yml'),
      'utf8',
    );

    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('branches:\n      - master');
    expect(workflow).toContain('concurrency:');
    expect(workflow).toContain('group: benchmark-pages-master');
    expect(workflow).toContain('runs-on: ubuntu-24.04');
    expect(workflow).toContain("node-version: '22.14.0'");
    expect(workflow).toContain("bun-version: '1.3.10'");
    expect(workflow).toContain("go-version: '1.25.5'");
    expect(workflow).toContain("toolchain: '1.90.0'");
    expect(workflow).toContain('bun run prisma:migrate');
    expect(workflow).toContain('bun run prisma:seed');
    expect(workflow).toContain('bun run build:wasm');
    expect(workflow).toContain('bun run build:rust-wasm');
    expect(workflow).toContain('bun run build');
    expect(workflow).toContain('bun run benchmark:pages --');
    expect(workflow).toContain('publish_branch: gh-pages');
  });
});
