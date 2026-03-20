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
