import { access, readFile } from 'fs/promises';
import { isDeepStrictEqual } from 'util';
import { resolve } from 'path';
import { validateNormalizedBenchmarkRun } from './lib/benchmark-normalizer';
import {
  buildHistoryIndexes,
  type BenchmarkHistoryIndexes,
} from './lib/history-index';
import { loadStoredBenchmarkRuns } from './lib/history-store';
import { buildBenchmarkSiteData } from './lib/site-data-builder';

interface ValidateBenchmarksCliOptions {
  dataDir: string;
  siteDir: string;
}

interface ValidationSummary {
  runCount: number;
  implementationCount: number;
  siteFiles: string[];
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function parseCliArgs(argv: string[]): ValidateBenchmarksCliOptions {
  let dataDir = 'benchmarks/data';
  let siteDir = 'dist/benchmark-site';

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--data-dir') {
      dataDir = argv[index + 1] ?? dataDir;
      index += 1;
      continue;
    }

    if (argument === '--site-dir') {
      siteDir = argv[index + 1] ?? siteDir;
      index += 1;
    }
  }

  return {
    dataDir: resolve(dataDir),
    siteDir: resolve(siteDir),
  };
}

async function requireFile(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Missing required file: ${filePath}`);
  }
}

async function loadHistoryIndexes(dataDir: string): Promise<{
  historyIndex: BenchmarkHistoryIndexes;
  latestRuns: BenchmarkHistoryIndexes['latestRuns'];
  runSummaries: BenchmarkHistoryIndexes['runSummaries'];
  scenarios: BenchmarkHistoryIndexes['scenarios'];
  implementations: BenchmarkHistoryIndexes['implementations'];
}> {
  const indexDir = resolve(dataDir, 'indexes');
  const fileNames = [
    'history-index.json',
    'latest-runs.json',
    'run-summaries.json',
    'scenario-trends.json',
    'implementations.json',
  ] as const;

  await Promise.all(
    fileNames.map((fileName) => requireFile(resolve(indexDir, fileName))),
  );

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
      readJsonFile<BenchmarkHistoryIndexes['implementations']>(
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

function assertEqualJson(
  actual: unknown,
  expected: unknown,
  description: string,
): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`Validation failed for ${description}`);
  }
}

function validateLatestPointers(
  historyIndex: BenchmarkHistoryIndexes,
  storedRunPaths: Set<string>,
): void {
  for (const [lane, environments] of Object.entries(historyIndex.latestRuns)) {
    for (const [environment, runPath] of Object.entries(environments)) {
      if (!storedRunPaths.has(runPath)) {
        throw new Error(
          `Latest pointer for ${lane}/${environment} references missing run "${runPath}"`,
        );
      }
    }
  }
}

function validateImplementationReferences(
  historyIndex: BenchmarkHistoryIndexes,
): number {
  const implementationIds = new Set(Object.keys(historyIndex.implementations));

  for (const [runPath, runSummary] of Object.entries(
    historyIndex.runSummaries,
  )) {
    for (const implementation of Object.values(runSummary.implementations)) {
      const indexed = historyIndex.implementations[implementation.id];
      if (!implementationIds.has(implementation.id) || !indexed) {
        throw new Error(
          `Run summary "${runPath}" references unknown implementation "${implementation.id}"`,
        );
      }

      if (indexed.label !== implementation.label) {
        throw new Error(
          `Implementation label mismatch for "${implementation.id}" in "${runPath}"`,
        );
      }

      if (!indexed.sourceKeys.includes(implementation.sourceKey)) {
        throw new Error(
          `Implementation "${implementation.id}" is missing source key "${implementation.sourceKey}" in implementations index`,
        );
      }

      if (!indexed.variants.includes(implementation.variant)) {
        throw new Error(
          `Implementation "${implementation.id}" is missing variant "${implementation.variant}" in implementations index`,
        );
      }

      if (!indexed.executionModels.includes(implementation.executionModel)) {
        throw new Error(
          `Implementation "${implementation.id}" is missing execution model "${implementation.executionModel}" in implementations index`,
        );
      }

      if (!indexed.contentTypes.includes(implementation.contentType)) {
        throw new Error(
          `Implementation "${implementation.id}" is missing content type "${implementation.contentType}" in implementations index`,
        );
      }
    }
  }

  for (const [scenarioKey, scenario] of Object.entries(
    historyIndex.scenarios,
  )) {
    if (!historyIndex.runSummaries[scenario.latestRunPath]) {
      throw new Error(
        `Scenario "${scenarioKey}" points to missing latest run "${scenario.latestRunPath}"`,
      );
    }

    for (const point of scenario.points) {
      const implementation =
        historyIndex.implementations[point.implementationId];
      if (!implementation) {
        throw new Error(
          `Scenario "${scenarioKey}" references unknown implementation "${point.implementationId}"`,
        );
      }
    }
  }

  return implementationIds.size;
}

async function validateSiteOutput(
  dataDir: string,
  siteDir: string,
): Promise<string[]> {
  const requiredSiteFiles = [
    'index.html',
    'styles.css',
    'app.js',
    'site-data.json',
  ];
  await Promise.all(
    requiredSiteFiles.map((fileName) =>
      requireFile(resolve(siteDir, fileName)),
    ),
  );

  const appJs = await readFile(resolve(siteDir, 'app.js'), 'utf8');
  if (!appJs.includes('./site-data.json')) {
    throw new Error('Site app.js does not reference ./site-data.json');
  }

  const expectedSiteData = await buildBenchmarkSiteData(dataDir);
  const actualSiteData = await readJsonFile(resolve(siteDir, 'site-data.json'));
  assertEqualJson(actualSiteData, expectedSiteData, 'site-data.json');

  return requiredSiteFiles;
}

export async function validateBenchmarkArtifacts(
  dataDir: string,
  siteDir: string,
): Promise<ValidationSummary> {
  const storedRuns = await loadStoredBenchmarkRuns(dataDir);

  for (const storedRun of storedRuns) {
    await validateNormalizedBenchmarkRun(storedRun.run);
  }

  const indexes = await loadHistoryIndexes(dataDir);
  const rebuiltIndexes = buildHistoryIndexes(
    storedRuns,
    indexes.historyIndex.generatedAt,
  );

  assertEqualJson(indexes.historyIndex, rebuiltIndexes, 'history-index.json');
  assertEqualJson(
    indexes.latestRuns,
    rebuiltIndexes.latestRuns,
    'latest-runs.json',
  );
  assertEqualJson(
    indexes.runSummaries,
    rebuiltIndexes.runSummaries,
    'run-summaries.json',
  );
  assertEqualJson(
    indexes.scenarios,
    rebuiltIndexes.scenarios,
    'scenario-trends.json',
  );
  assertEqualJson(
    indexes.implementations,
    rebuiltIndexes.implementations,
    'implementations.json',
  );

  validateLatestPointers(
    indexes.historyIndex,
    new Set(storedRuns.map((storedRun) => storedRun.relativePath)),
  );
  const implementationCount = validateImplementationReferences(
    indexes.historyIndex,
  );
  const siteFiles = await validateSiteOutput(dataDir, siteDir);

  return {
    runCount: storedRuns.length,
    implementationCount,
    siteFiles,
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const summary = await validateBenchmarkArtifacts(
    options.dataDir,
    options.siteDir,
  );
  process.stdout.write(
    `Validated ${summary.runCount} benchmark run(s), ${summary.implementationCount} implementation metadata entries, and ${summary.siteFiles.length} site files\n`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
