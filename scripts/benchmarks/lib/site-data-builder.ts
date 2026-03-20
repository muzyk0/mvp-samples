import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type {
  BenchmarkHistoryIndexes,
  BenchmarkImplementationIndexEntry,
  BenchmarkRunSummary,
  ScenarioTrendPoint,
} from './history-index';

export interface SiteImplementationCatalogEntry {
  id: string;
  label: string;
  sourceKeys: string[];
  variants: string[];
  executionModels: string[];
  contentTypes: string[];
}

export interface SiteCurrentImplementationSummary {
  id: string;
  label: string;
  sourceKey: string;
  variant: string;
  executionModel: string;
  contentType: string;
  fileName: string;
  sampleCount: number;
  avgDurationMs: number;
  avgSizeBytes: number;
  avgMemoryDeltaBytes?: number;
  rowCount: number;
  columnCount: number;
  durationDeltaMsFromFastest: number;
}

export interface SiteCurrentView {
  id: string;
  lane: string;
  environment: string;
  scenarioId: string;
  scenarioLabel: string;
  latestRunPath: string;
  collectedAt: string;
  git: BenchmarkRunSummary['git'];
  profile: BenchmarkRunSummary['profile'];
  scenario: BenchmarkRunSummary['scenario'];
  runner: BenchmarkRunSummary['runner'];
  toolchain: BenchmarkRunSummary['toolchain'];
  diagnostics: BenchmarkRunSummary['diagnostics'];
  implementations: SiteCurrentImplementationSummary[];
}

export interface SiteTrendPoint {
  collectedAt: string;
  runPath: string;
  commitSha: string;
  shortSha: string;
  durationMs: number;
  sizeBytes: number;
  memoryDeltaBytes?: number;
}

export interface SiteTrendImplementation {
  id: string;
  label: string;
  points: SiteTrendPoint[];
}

export interface SiteTrendView {
  id: string;
  lane: string;
  environment: string;
  scenarioId: string;
  scenarioLabel: string;
  latestRunPath: string;
  implementations: SiteTrendImplementation[];
}

export interface BenchmarkSiteData {
  generatedAt: string;
  overview: BenchmarkHistoryIndexes['runs'];
  latestViews: SiteCurrentView[];
  trendViews: SiteTrendView[];
  implementations: SiteImplementationCatalogEntry[];
}

interface SiteIndexes {
  historyIndex: BenchmarkHistoryIndexes;
  latestRuns: BenchmarkHistoryIndexes['latestRuns'];
  runSummaries: BenchmarkHistoryIndexes['runSummaries'];
  scenarios: BenchmarkHistoryIndexes['scenarios'];
  implementations: Record<string, BenchmarkImplementationIndexEntry>;
}

interface AggregatedTrendRunPoint {
  collectedAt: string;
  runPath: string;
  commitSha: string;
  shortSha: string;
  durationMsTotal: number;
  sizeBytesTotal: number;
  memoryDeltaBytesTotal: number;
  memoryPointCount: number;
  sampleCount: number;
}

interface AggregatedTrendImplementation {
  id: string;
  label: string;
  points: Map<string, AggregatedTrendRunPoint>;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

export async function loadSiteIndexes(dataDir: string): Promise<SiteIndexes> {
  const indexDir = resolve(dataDir, 'indexes');

  const [historyIndex, latestRuns, runSummaries, scenarios, implementations] =
    await Promise.all([
      readJsonFile<BenchmarkHistoryIndexes>(
        resolve(indexDir, 'history-index.json'),
      ),
      readJsonFile<BenchmarkHistoryIndexes['latestRuns']>(
        resolve(indexDir, 'latest-runs.json'),
      ),
      readJsonFile<BenchmarkHistoryIndexes['runSummaries']>(
        resolve(indexDir, 'run-summaries.json'),
      ),
      readJsonFile<BenchmarkHistoryIndexes['scenarios']>(
        resolve(indexDir, 'scenario-trends.json'),
      ),
      readJsonFile<Record<string, BenchmarkImplementationIndexEntry>>(
        resolve(indexDir, 'implementations.json'),
      ),
    ]);

  return {
    historyIndex,
    latestRuns,
    runSummaries,
    scenarios,
    implementations,
  };
}

function mapImplementationCatalog(
  implementations: Record<string, BenchmarkImplementationIndexEntry>,
): SiteImplementationCatalogEntry[] {
  return Object.values(implementations)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((implementation) => ({
      id: implementation.id,
      label: implementation.label,
      sourceKeys: [...implementation.sourceKeys].sort(),
      variants: [...implementation.variants].sort(),
      executionModels: [...implementation.executionModels].sort(),
      contentTypes: [...implementation.contentTypes].sort(),
    }));
}

function buildLatestViews(indexes: SiteIndexes): SiteCurrentView[] {
  const latestViews: SiteCurrentView[] = [];

  for (const [lane, environments] of Object.entries(
    indexes.latestRuns,
  ).sort()) {
    for (const [environment, latestRunPath] of Object.entries(
      environments,
    ).sort()) {
      const runSummary = indexes.runSummaries[latestRunPath];
      if (!runSummary) {
        throw new Error(
          `Missing run summary for latest run "${latestRunPath}"`,
        );
      }

      const implementations = Object.values(runSummary.implementations).sort(
        (left, right) =>
          left.avgDurationMs - right.avgDurationMs ||
          left.id.localeCompare(right.id),
      );
      const fastestDurationMs = implementations[0]?.avgDurationMs ?? 0;

      latestViews.push({
        id: `${lane}::${environment}::${runSummary.scenario.id}`,
        lane,
        environment,
        scenarioId: runSummary.scenario.id,
        scenarioLabel: runSummary.scenario.label,
        latestRunPath,
        collectedAt: runSummary.collectedAt,
        git: runSummary.git,
        profile: runSummary.profile,
        scenario: runSummary.scenario,
        runner: runSummary.runner,
        toolchain: runSummary.toolchain,
        diagnostics: runSummary.diagnostics,
        implementations: implementations.map((implementation) => ({
          ...implementation,
          durationDeltaMsFromFastest: Number(
            (implementation.avgDurationMs - fastestDurationMs).toFixed(3),
          ),
        })),
      });
    }
  }

  return latestViews.sort(
    (left, right) =>
      left.lane.localeCompare(right.lane) ||
      left.environment.localeCompare(right.environment) ||
      left.scenarioId.localeCompare(right.scenarioId),
  );
}

function aggregateScenarioImplementationPoints(
  points: ScenarioTrendPoint[],
): SiteTrendImplementation[] {
  const grouped = new Map<string, AggregatedTrendImplementation>();

  for (const point of points) {
    const implementationEntry: AggregatedTrendImplementation = grouped.get(
      point.implementationId,
    ) ?? {
      id: point.implementationId,
      label: point.label,
      points: new Map(),
    };
    const runPointKey = `${point.runPath}::${point.implementationId}`;
    const runPoint: AggregatedTrendRunPoint = implementationEntry.points.get(
      runPointKey,
    ) ?? {
      collectedAt: point.collectedAt,
      runPath: point.runPath,
      commitSha: point.commitSha,
      shortSha: point.shortSha,
      durationMsTotal: 0,
      sizeBytesTotal: 0,
      memoryDeltaBytesTotal: 0,
      memoryPointCount: 0,
      sampleCount: 0,
    };

    runPoint.durationMsTotal += point.durationMs;
    runPoint.sizeBytesTotal += point.sizeBytes;
    runPoint.sampleCount += 1;
    if (point.memoryDeltaBytes !== undefined) {
      runPoint.memoryDeltaBytesTotal += point.memoryDeltaBytes;
      runPoint.memoryPointCount += 1;
    }

    implementationEntry.points.set(runPointKey, runPoint);
    grouped.set(point.implementationId, implementationEntry);
  }

  return [...grouped.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((implementation) => ({
      id: implementation.id,
      label: implementation.label,
      points: [...implementation.points.values()]
        .sort(
          (left, right) =>
            left.collectedAt.localeCompare(right.collectedAt) ||
            left.runPath.localeCompare(right.runPath),
        )
        .map((point) => ({
          collectedAt: point.collectedAt,
          runPath: point.runPath,
          commitSha: point.commitSha,
          shortSha: point.shortSha,
          durationMs: Number(
            (point.durationMsTotal / point.sampleCount).toFixed(3),
          ),
          sizeBytes: Number(
            (point.sizeBytesTotal / point.sampleCount).toFixed(3),
          ),
          ...(point.memoryPointCount === 0
            ? {}
            : {
                memoryDeltaBytes: Number(
                  (
                    point.memoryDeltaBytesTotal / point.memoryPointCount
                  ).toFixed(3),
                ),
              }),
        })),
    }));
}

function buildTrendViews(indexes: SiteIndexes): SiteTrendView[] {
  return Object.entries(indexes.scenarios)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([scenarioKey, scenario]) => ({
      id: scenarioKey,
      lane: scenario.lane,
      environment: scenario.environment,
      scenarioId: scenario.scenarioId,
      scenarioLabel: scenario.scenarioLabel,
      latestRunPath: scenario.latestRunPath,
      implementations: aggregateScenarioImplementationPoints(scenario.points),
    }));
}

export async function buildBenchmarkSiteData(
  dataDir: string,
): Promise<BenchmarkSiteData> {
  const indexes = await loadSiteIndexes(dataDir);

  return {
    generatedAt: indexes.historyIndex.generatedAt,
    overview: indexes.historyIndex.runs,
    latestViews: buildLatestViews(indexes),
    trendViews: buildTrendViews(indexes),
    implementations: mapImplementationCatalog(indexes.implementations),
  };
}
