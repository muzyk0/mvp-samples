import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { buildBenchmarkSiteData } from '../lib/site-data-builder';

const fixtureDataDir = resolve('scripts/benchmarks/__fixtures__/site-data');

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
});
