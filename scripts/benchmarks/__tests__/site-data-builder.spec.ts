import { cp, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBenchmarkSiteData } from '../lib/site-data-builder';

const fixtureDataDir = resolve('scripts/benchmarks/__fixtures__/site-data');
const createdDirectories: string[] = [];

async function createFixtureCopy(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'site-data-builder-'));
  createdDirectories.push(directory);
  await cp(fixtureDataDir, directory, { recursive: true });
  return directory;
}

afterEach(async () => {
  await Promise.all(
    createdDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('site-data-builder', () => {
  it('builds deterministic latest views and generic implementation catalog from indexes', async () => {
    const siteData = await buildBenchmarkSiteData(fixtureDataDir);

    expect(siteData.generatedAt).toBe('2026-03-20T10:30:00.000Z');
    expect(siteData.overview.total).toBe(2);
    expect(
      siteData.implementations.map((implementation) => implementation.id),
    ).toEqual(['exceljs', 'goWasm', 'rustWasm']);

    expect(siteData.latestViews).toHaveLength(2);
    expect(siteData.latestViews[0]).toMatchObject({
      lane: 'continuous',
      environment: 'github-hosted-linux-x64',
      scenarioId: 'default-benchmark',
      latestRunPath:
        'runs/continuous/github-hosted-linux-x64/2026/03/2026-03-20T09-00-00-000Z-aaaaaaa.json',
      diagnostics: {
        memory: {
          note: 'Node heap only',
        },
      },
    });
    expect(
      siteData.latestViews[0].implementations.map(
        (implementation) => implementation.id,
      ),
    ).toEqual(['rustWasm', 'goWasm', 'exceljs']);
    expect(siteData.latestViews[0].implementations[0]).toMatchObject({
      id: 'rustWasm',
      avgDurationMs: 74,
      durationDeltaMsFromFastest: 0,
    });
    expect(siteData.latestViews[0].implementations[2]).toMatchObject({
      id: 'exceljs',
      avgMemoryDeltaBytes: 512000,
      durationDeltaMsFromFastest: 26,
    });
  });

  it('aggregates trend views per implementation without hard-coded page sections', async () => {
    const siteData = await buildBenchmarkSiteData(fixtureDataDir);

    expect(siteData.trendViews).toHaveLength(2);
    expect(siteData.trendViews[1]).toMatchObject({
      lane: 'recorded',
      environment: 'dedicated-linux-workstation',
      scenarioId: 'default-benchmark',
    });
    expect(
      siteData.trendViews[1].implementations.map(
        (implementation) => implementation.id,
      ),
    ).toEqual(['exceljs', 'goWasm', 'rustWasm']);
    expect(siteData.trendViews[1].implementations[0].points[0]).toMatchObject({
      durationMs: 88,
      memoryDeltaBytes: 400000,
      shortSha: 'bbbbbbb',
    });
  });

  it('accepts a future implementation id without requiring structural site changes', async () => {
    const dataDir = await createFixtureCopy();
    const implementationsPath = resolve(dataDir, 'indexes/implementations.json');
    const runSummariesPath = resolve(dataDir, 'indexes/run-summaries.json');
    const scenarioTrendsPath = resolve(dataDir, 'indexes/scenario-trends.json');

    const implementations = JSON.parse(
      await readFile(implementationsPath, 'utf8'),
    ) as Record<string, Record<string, unknown>>;
    implementations.pythonWasm = {
      id: 'pythonWasm',
      label: 'Python WASM',
      sourceKeys: ['pythonWasm'],
      variants: ['python-wasm'],
      executionModels: ['final-buffer'],
      contentTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      firstSeenAt: '2026-03-20T10:00:00.000Z',
      latestSeenAt: '2026-03-20T10:00:00.000Z',
    };
    await writeFile(implementationsPath, `${JSON.stringify(implementations)}\n`);

    const runSummaries = JSON.parse(
      await readFile(runSummariesPath, 'utf8'),
    ) as Record<string, { implementations: Record<string, unknown> }>;
    const continuousRunPath =
      'runs/continuous/github-hosted-linux-x64/2026/03/2026-03-20T09-00-00-000Z-aaaaaaa.json';
    runSummaries[continuousRunPath].implementations.pythonWasm = {
      id: 'pythonWasm',
      label: 'Python WASM',
      sourceKey: 'pythonWasm',
      variant: 'python-wasm',
      executionModel: 'final-buffer',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: 'python-wasm.xlsx',
      sampleCount: 1,
      avgDurationMs: 82,
      avgSizeBytes: 187654,
      rowCount: 2000,
      columnCount: 7,
    };
    await writeFile(runSummariesPath, `${JSON.stringify(runSummaries)}\n`);

    const scenarioTrends = JSON.parse(
      await readFile(scenarioTrendsPath, 'utf8'),
    ) as Record<
      string,
      {
        points: Array<Record<string, unknown>>;
      }
    >;
    scenarioTrends[
      'continuous::github-hosted-linux-x64::default-benchmark'
    ].points.push({
      implementationId: 'pythonWasm',
      label: 'Python WASM',
      collectedAt: '2026-03-20T09:00:00.000Z',
      runPath: continuousRunPath,
      commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      shortSha: 'aaaaaaa',
      durationMs: 82,
      sizeBytes: 187654,
      memoryDeltaBytes: 245760,
    });
    await writeFile(scenarioTrendsPath, `${JSON.stringify(scenarioTrends)}\n`);

    const siteData = await buildBenchmarkSiteData(dataDir);

    expect(siteData.implementations.map((implementation) => implementation.id)).toContain(
      'pythonWasm',
    );
    const continuousLatestView = siteData.latestViews.find(
      (view) => view.lane === 'continuous',
    );
    expect(
      continuousLatestView?.implementations.map((implementation) => implementation.id),
    ).toContain('pythonWasm');
    const continuousTrendView = siteData.trendViews.find(
      (view) => view.lane === 'continuous',
    );
    expect(
      continuousTrendView?.implementations.map((implementation) => implementation.id),
    ).toContain('pythonWasm');
  });
});
