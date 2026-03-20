import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import type {
  NormalizedBenchmarkRun,
  NormalizedImplementation,
} from './benchmark-normalizer';
import type { StoredBenchmarkRun } from './history-store';

export interface BenchmarkImplementationIndexEntry {
  id: string;
  label: string;
  sourceKeys: string[];
  variants: string[];
  executionModels: string[];
  contentTypes: string[];
}

export interface BenchmarkRunImplementationSummary {
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
}

export interface BenchmarkRunSummary {
  runPath: string;
  lane: string;
  environment: string;
  collectedAt: string;
  git: {
    commitSha: string;
    shortSha: string;
    branch: string;
    isDirty: boolean;
  };
  profile: {
    id: string;
    label: string;
    environmentLabel: string;
    description?: string;
    expectations: string[];
  };
  scenario: {
    id: string;
    label: string;
    sampleCount: number;
    warmupCount: number;
    request: NormalizedBenchmarkRun['scenario']['request'];
  };
  runner: NormalizedBenchmarkRun['runner'];
  toolchain: NormalizedBenchmarkRun['toolchain'];
  diagnostics: {
    memory: NormalizedBenchmarkRun['samples'][number]['diagnostics']['memory'];
  };
  implementations: Record<string, BenchmarkRunImplementationSummary>;
}

export interface ScenarioTrendPoint {
  collectedAt: string;
  runPath: string;
  commitSha: string;
  shortSha: string;
  profileId: string;
  implementationId: string;
  label: string;
  durationMs: number;
  sizeBytes: number;
  rowCount: number;
  columnCount: number;
  memoryDeltaBytes?: number;
}

export interface BenchmarkHistoryIndexes {
  generatedAt: string;
  runs: {
    total: number;
    byLane: Record<string, number>;
    byLaneEnvironment: Record<string, number>;
  };
  latestRuns: Record<string, Record<string, string>>;
  runSummaries: Record<string, BenchmarkRunSummary>;
  scenarios: Record<
    string,
    {
      lane: string;
      environment: string;
      scenarioId: string;
      scenarioLabel: string;
      latestRunPath: string;
      points: ScenarioTrendPoint[];
    }
  >;
  implementations: Record<string, BenchmarkImplementationIndexEntry>;
}

function ensureImplementationEntry(
  implementations: Record<string, BenchmarkImplementationIndexEntry>,
  implementation: NormalizedImplementation,
): BenchmarkImplementationIndexEntry {
  const existing = implementations[implementation.id];
  if (existing) {
    return existing;
  }

  const created: BenchmarkImplementationIndexEntry = {
    id: implementation.id,
    label: implementation.label,
    sourceKeys: [],
    variants: [],
    executionModels: [],
    contentTypes: [],
  };
  implementations[implementation.id] = created;
  return created;
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function getScenarioIndexKey(run: NormalizedBenchmarkRun): string {
  return `${run.lane}::${run.runner.environmentLabel}::${run.scenario.id}`;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

function summarizeRun(
  run: NormalizedBenchmarkRun,
  relativePath: string,
): BenchmarkRunSummary {
  const implementations = new Map<
    string,
    {
      id: string;
      label: string;
      sourceKey: string;
      variant: string;
      executionModel: string;
      contentType: string;
      fileName: string;
      durationMsTotal: number;
      sizeBytesTotal: number;
      memoryDeltaBytesTotal: number;
      memorySampleCount: number;
      sampleCount: number;
      rowCount: number;
      columnCount: number;
    }
  >();

  for (const sample of run.samples) {
    for (const implementation of sample.implementations) {
      const existing = implementations.get(implementation.id) ?? {
        id: implementation.id,
        label: implementation.label,
        sourceKey: implementation.sourceKey,
        variant: implementation.variant,
        executionModel: implementation.executionModel,
        contentType: implementation.contentType,
        fileName: implementation.fileName,
        durationMsTotal: 0,
        sizeBytesTotal: 0,
        memoryDeltaBytesTotal: 0,
        memorySampleCount: 0,
        sampleCount: 0,
        rowCount: implementation.metrics.rowCount,
        columnCount: implementation.metrics.columnCount,
      };

      existing.durationMsTotal += implementation.metrics.durationMs;
      existing.sizeBytesTotal += implementation.metrics.sizeBytes;
      existing.sampleCount += 1;
      existing.rowCount = implementation.metrics.rowCount;
      existing.columnCount = implementation.metrics.columnCount;
      existing.fileName = implementation.fileName;
      if (implementation.metrics.memoryDeltaBytes !== undefined) {
        existing.memoryDeltaBytesTotal +=
          implementation.metrics.memoryDeltaBytes;
        existing.memorySampleCount += 1;
      }
      implementations.set(implementation.id, existing);
    }
  }

  return {
    runPath: relativePath,
    lane: run.lane,
    environment: run.runner.environmentLabel,
    collectedAt: run.collectedAt,
    git: run.git,
    profile: run.profile,
    scenario: run.scenario,
    runner: run.runner,
    toolchain: run.toolchain,
    diagnostics: {
      memory: run.samples[0]?.diagnostics.memory ?? {
        nodeHeapDeltaMeasured: false,
        wasmLinearMemoryIncluded: false,
        note: '',
      },
    },
    implementations: Object.fromEntries(
      [...implementations.entries()]
        .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
        .map(([implementationId, implementation]) => [
          implementationId,
          {
            id: implementation.id,
            label: implementation.label,
            sourceKey: implementation.sourceKey,
            variant: implementation.variant,
            executionModel: implementation.executionModel,
            contentType: implementation.contentType,
            fileName: implementation.fileName,
            sampleCount: implementation.sampleCount,
            avgDurationMs: roundMetric(
              implementation.durationMsTotal / implementation.sampleCount,
            ),
            avgSizeBytes: roundMetric(
              implementation.sizeBytesTotal / implementation.sampleCount,
            ),
            ...(implementation.memorySampleCount === 0
              ? {}
              : {
                  avgMemoryDeltaBytes: roundMetric(
                    implementation.memoryDeltaBytesTotal /
                      implementation.memorySampleCount,
                  ),
                }),
            rowCount: implementation.rowCount,
            columnCount: implementation.columnCount,
          } satisfies BenchmarkRunImplementationSummary,
        ]),
    ),
  };
}

export function buildHistoryIndexes(
  storedRuns: StoredBenchmarkRun[],
  generatedAt = new Date().toISOString(),
): BenchmarkHistoryIndexes {
  const runsSorted = [...storedRuns].sort((left, right) => {
    if (left.run.collectedAt !== right.run.collectedAt) {
      return left.run.collectedAt.localeCompare(right.run.collectedAt);
    }

    return left.relativePath.localeCompare(right.relativePath);
  });

  const indexes: BenchmarkHistoryIndexes = {
    generatedAt,
    runs: {
      total: runsSorted.length,
      byLane: {},
      byLaneEnvironment: {},
    },
    latestRuns: {},
    runSummaries: {},
    scenarios: {},
    implementations: {},
  };

  for (const storedRun of runsSorted) {
    const { run, relativePath } = storedRun;
    const laneEnvironmentKey = `${run.lane}::${run.runner.environmentLabel}`;
    indexes.runs.byLane[run.lane] = (indexes.runs.byLane[run.lane] ?? 0) + 1;
    indexes.runs.byLaneEnvironment[laneEnvironmentKey] =
      (indexes.runs.byLaneEnvironment[laneEnvironmentKey] ?? 0) + 1;
    indexes.latestRuns[run.lane] ??= {};
    indexes.latestRuns[run.lane][run.runner.environmentLabel] = relativePath;
    indexes.runSummaries[relativePath] = summarizeRun(run, relativePath);

    const scenarioKey = getScenarioIndexKey(run);
    const scenarioEntry =
      indexes.scenarios[scenarioKey] ??
      ({
        lane: run.lane,
        environment: run.runner.environmentLabel,
        scenarioId: run.scenario.id,
        scenarioLabel: run.scenario.label,
        latestRunPath: relativePath,
        points: [],
      } as BenchmarkHistoryIndexes['scenarios'][string]);
    scenarioEntry.latestRunPath = relativePath;
    indexes.scenarios[scenarioKey] = scenarioEntry;

    for (const sample of run.samples) {
      for (const implementation of sample.implementations) {
        const implementationEntry = ensureImplementationEntry(
          indexes.implementations,
          implementation,
        );
        pushUnique(implementationEntry.sourceKeys, implementation.sourceKey);
        pushUnique(implementationEntry.variants, implementation.variant);
        pushUnique(
          implementationEntry.executionModels,
          implementation.executionModel,
        );
        pushUnique(
          implementationEntry.contentTypes,
          implementation.contentType,
        );

        scenarioEntry.points.push({
          collectedAt: sample.collectedAt,
          runPath: relativePath,
          commitSha: run.git.commitSha,
          shortSha: run.git.shortSha,
          profileId: run.profile.id,
          implementationId: implementation.id,
          label: implementation.label,
          durationMs: implementation.metrics.durationMs,
          sizeBytes: implementation.metrics.sizeBytes,
          rowCount: implementation.metrics.rowCount,
          columnCount: implementation.metrics.columnCount,
          ...(implementation.metrics.memoryDeltaBytes === undefined
            ? {}
            : { memoryDeltaBytes: implementation.metrics.memoryDeltaBytes }),
        });
      }
    }
  }

  for (const scenario of Object.values(indexes.scenarios)) {
    scenario.points.sort((left, right) => {
      if (left.collectedAt !== right.collectedAt) {
        return left.collectedAt.localeCompare(right.collectedAt);
      }

      if (left.runPath !== right.runPath) {
        return left.runPath.localeCompare(right.runPath);
      }

      return left.implementationId.localeCompare(right.implementationId);
    });
  }

  for (const implementation of Object.values(indexes.implementations)) {
    implementation.sourceKeys.sort();
    implementation.variants.sort();
    implementation.executionModels.sort();
    implementation.contentTypes.sort();
  }

  return indexes;
}

export async function writeHistoryIndexes(
  dataDir: string,
  indexes: BenchmarkHistoryIndexes,
): Promise<void> {
  const indexDir = resolve(dataDir, 'indexes');
  await mkdir(indexDir, { recursive: true });

  const files = [
    ['history-index.json', indexes],
    ['latest-runs.json', indexes.latestRuns],
    ['run-summaries.json', indexes.runSummaries],
    ['scenario-trends.json', indexes.scenarios],
    ['implementations.json', indexes.implementations],
  ] as const;

  await Promise.all(
    files.map(([fileName, payload]) =>
      writeFile(
        resolve(indexDir, fileName),
        `${JSON.stringify(payload, null, 2)}\n`,
        'utf8',
      ),
    ),
  );
}
