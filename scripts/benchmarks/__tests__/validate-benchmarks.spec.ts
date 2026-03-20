import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBenchmarkSite } from '../build-site';
import { rebuildBenchmarkHistory } from '../update-history';
import type { NormalizedBenchmarkRun } from '../lib/benchmark-normalizer';
import { storeBenchmarkRun } from '../lib/history-store';
import { validateBenchmarkArtifacts } from '../validate-benchmarks';

const createdDirectories: string[] = [];

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'benchmark-validate-'));
  createdDirectories.push(directory);
  return directory;
}

function createBenchmarkRun(
  lane: 'continuous' | 'recorded',
  collectedAt: string,
  shortSha: string,
  environmentLabel: string,
): NormalizedBenchmarkRun {
  const durationBase = lane === 'continuous' ? 100 : 88;

  return {
    schemaVersion: '1.0.0',
    lane,
    collectedAt,
    profile: {
      id: lane === 'continuous' ? 'continuous-default' : 'recorded-workstation',
      label:
        lane === 'continuous'
          ? 'Continuous default benchmark'
          : 'Recorded workstation benchmark',
      path: `/tmp/${lane}.json`,
      environmentLabel,
      description:
        lane === 'continuous'
          ? 'Pinned GitHub runner profile'
          : 'Dedicated hardware import',
      expectations: [
        lane === 'continuous'
          ? 'Use the shared benchmark route'
          : 'Imported from stronger hardware',
      ],
    },
    source: {
      endpoint: '/export/benchmark',
      method: 'POST',
      baseUrl: 'http://127.0.0.1:3100',
    },
    git: {
      commitSha: shortSha.repeat(6).slice(0, 40),
      shortSha,
      branch: 'main',
      isDirty: false,
    },
    runner: {
      environmentLabel,
      hostname: lane === 'continuous' ? 'gh-runner-01' : 'workstation-01',
      platform: 'linux',
      arch: 'x64',
      cpuCount: lane === 'continuous' ? 4 : 16,
      cpuModel: lane === 'continuous' ? 'Example CPU' : 'Workstation CPU',
      totalMemoryBytes: lane === 'continuous' ? 16_384 : 65_536,
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
      sampleCount: lane === 'continuous' ? 3 : 5,
      warmupCount: 1,
      request: {
        limit: 2000,
        seed: 12345,
        columns: ['id', 'fullName', 'department'],
        fileName: 'benchmark.xlsx',
        includeMemory: true,
      },
    },
    samples: Array.from(
      { length: lane === 'continuous' ? 3 : 5 },
      (_, index) => ({
        sampleIndex: index + 1,
        collectedAt,
        request: {
          limit: 2000,
          seed: 12345,
          columns: ['id', 'fullName', 'department'],
        },
        implementations: [
          {
            id: 'exceljs',
            label: 'ExcelJS',
            sourceKey: 'exceljs',
            variant: 'exceljs',
            executionModel: 'streams',
            metrics: {
              durationMs: durationBase + index,
              sizeBytes: 10_000 - index,
              rowCount: 2000,
              columnCount: 3,
              memoryDeltaBytes: lane === 'continuous' ? 512_000 : 400_000,
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
              durationMs: durationBase - 20 + index,
              sizeBytes: 9_800 - index,
              rowCount: 2000,
              columnCount: 3,
            },
            fileName: 'go-wasm.xlsx',
            contentType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          {
            id: 'rustWasm',
            label: 'Rust/WASM',
            sourceKey: 'rustWasm',
            variant: 'rust-wasm',
            executionModel: 'final buffer',
            metrics: {
              durationMs: durationBase - 26 + index,
              sizeBytes: 9_600 - index,
              rowCount: 2000,
              columnCount: 3,
            },
            fileName: 'rust-wasm.xlsx',
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
      }),
    ),
  };
}

afterEach(async () => {
  await Promise.all(
    createdDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('validate-benchmarks', () => {
  it('validates schema, indexes, implementation references, and generated site output', async () => {
    const dataDir = await createTempDir();
    const siteDir = await createTempDir();

    await storeBenchmarkRun(
      dataDir,
      createBenchmarkRun(
        'continuous',
        '2026-03-20T09:00:00.000Z',
        'aaaaaaa',
        'github-hosted-linux-x64',
      ),
    );
    await storeBenchmarkRun(
      dataDir,
      createBenchmarkRun(
        'recorded',
        '2026-03-20T10:00:00.000Z',
        'bbbbbbb',
        'dedicated-linux-workstation',
      ),
    );
    await rebuildBenchmarkHistory(dataDir);
    await buildBenchmarkSite(dataDir, siteDir);

    await expect(validateBenchmarkArtifacts(dataDir, siteDir)).resolves.toEqual(
      {
        runCount: 2,
        implementationCount: 3,
        siteFiles: ['index.html', 'styles.css', 'app.js', 'site-data.json'],
      },
    );
  });

  it('fails when latest pointers drift from the stored benchmark history', async () => {
    const dataDir = await createTempDir();
    const siteDir = await createTempDir();

    await storeBenchmarkRun(
      dataDir,
      createBenchmarkRun(
        'continuous',
        '2026-03-20T09:00:00.000Z',
        'aaaaaaa',
        'github-hosted-linux-x64',
      ),
    );
    await rebuildBenchmarkHistory(dataDir);
    await buildBenchmarkSite(dataDir, siteDir);

    const latestRunsPath = resolve(dataDir, 'indexes/latest-runs.json');
    const latestRuns = JSON.parse(
      await readFile(latestRunsPath, 'utf8'),
    ) as Record<string, Record<string, string>>;
    latestRuns.continuous['github-hosted-linux-x64'] =
      'runs/continuous/github-hosted-linux-x64/2026/03/does-not-exist.json';
    await writeFile(
      latestRunsPath,
      `${JSON.stringify(latestRuns, null, 2)}\n`,
      'utf8',
    );

    await expect(validateBenchmarkArtifacts(dataDir, siteDir)).rejects.toThrow(
      /latest-runs\.json/,
    );
  });

  it('documents the benchmark command flow and lane separation in the published docs', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve('package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };
    const readme = await readFile(resolve('README.md'), 'utf8');
    const benchmarkingDoc = await readFile(
      resolve('docs/benchmarking.md'),
      'utf8',
    );
    const benchmarkPagesDoc = await readFile(
      resolve('docs/benchmark-pages.md'),
      'utf8',
    );

    expect(packageJson.scripts).toMatchObject({
      'benchmark:collect':
        'ts-node --project tsconfig.json scripts/benchmarks/collect-benchmark-results.ts',
      'benchmark:history':
        'ts-node --project tsconfig.json scripts/benchmarks/update-history.ts',
      'benchmark:site':
        'ts-node --project tsconfig.json scripts/benchmarks/build-site.ts',
      'benchmark:validate':
        'ts-node --project tsconfig.json scripts/benchmarks/validate-benchmarks.ts',
      'benchmark:pages':
        'ts-node --project tsconfig.json scripts/benchmarks/publish-pages.ts',
      'benchmark:import-recorded':
        'ts-node --project tsconfig.json scripts/benchmarks/import-recorded-run.ts',
    });
    expect(readme).toContain('continuous GitHub-hosted runner history');
    expect(readme).toContain('recorded dedicated-hardware history');
    expect(benchmarkingDoc).toContain(
      'collection, history/index generation, site generation',
    );
    expect(benchmarkingDoc).toContain('continuous lane');
    expect(benchmarkingDoc).toContain('recorded lane');
    expect(benchmarkPagesDoc).toContain('npm run benchmark:collect --');
    expect(benchmarkPagesDoc).toContain('npm run benchmark:import-recorded --');
    expect(benchmarkPagesDoc).toContain('npm run benchmark:history --');
    expect(benchmarkPagesDoc).toContain('npm run benchmark:site --');
    expect(benchmarkPagesDoc).toContain('npm run benchmark:validate --');
    expect(benchmarkPagesDoc).toContain('future exporter');
  });
});
