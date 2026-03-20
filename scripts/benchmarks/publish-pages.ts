import { access, cp, mkdir, rm, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { collectBenchmarkResults } from './collect-benchmark-results';
import { buildBenchmarkSite } from './build-site';
import { importRecordedRun } from './import-recorded-run';
import { storeBenchmarkRun } from './lib/history-store';
import { rebuildBenchmarkHistory } from './update-history';

export interface BenchmarkPagesCliOptions {
  dataDir: string;
  siteDir: string;
  publishedSiteDir?: string;
  profilePath: string;
  benchmarkOutputPath: string;
  recordedRunPaths: string[];
  collectContinuousRun: boolean;
}

interface PublishPagesDependencies {
  collectRun: typeof collectBenchmarkResults;
  importRun: typeof importRecordedRun;
  rebuildHistory: typeof rebuildBenchmarkHistory;
  buildSite: typeof buildBenchmarkSite;
}

const defaultDependencies: PublishPagesDependencies = {
  collectRun: collectBenchmarkResults,
  importRun: importRecordedRun,
  rebuildHistory: rebuildBenchmarkHistory,
  buildSite: buildBenchmarkSite,
};

function parseCliArgs(argv: string[]): BenchmarkPagesCliOptions {
  let dataDir = '.tmp/benchmark-pages/data';
  let siteDir = '.tmp/benchmark-pages/site';
  let publishedSiteDir: string | undefined;
  let profilePath = 'benchmarks/profiles/continuous-default.json';
  let benchmarkOutputPath = '.tmp/benchmark-pages/continuous-run.json';
  const recordedRunPaths: string[] = [];
  let collectContinuousRun = false;

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
      continue;
    }

    if (argument === '--published-site-dir') {
      publishedSiteDir = argv[index + 1] ?? publishedSiteDir;
      index += 1;
      continue;
    }

    if (argument === '--profile') {
      profilePath = argv[index + 1] ?? profilePath;
      index += 1;
      continue;
    }

    if (argument === '--benchmark-output') {
      benchmarkOutputPath = argv[index + 1] ?? benchmarkOutputPath;
      index += 1;
      continue;
    }

    if (argument === '--recorded-run') {
      const recordedRunPath = argv[index + 1];
      if (recordedRunPath) {
        recordedRunPaths.push(recordedRunPath);
      }
      index += 1;
      continue;
    }

    if (argument === '--collect') {
      collectContinuousRun = true;
      continue;
    }
  }

  return {
    dataDir: resolve(dataDir),
    siteDir: resolve(siteDir),
    publishedSiteDir: publishedSiteDir ? resolve(publishedSiteDir) : undefined,
    profilePath: resolve(profilePath),
    benchmarkOutputPath: resolve(benchmarkOutputPath),
    recordedRunPaths: recordedRunPaths.map((recordedRunPath) =>
      resolve(recordedRunPath),
    ),
    collectContinuousRun,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function seedPublishedBenchmarkData(
  publishedSiteDir: string | undefined,
  dataDir: string,
): Promise<boolean> {
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });

  if (!publishedSiteDir) {
    return false;
  }

  const publishedDataDir = resolve(publishedSiteDir, 'data');
  if (!(await pathExists(publishedDataDir))) {
    return false;
  }

  await cp(publishedDataDir, dataDir, { recursive: true });
  return true;
}

async function copyBenchmarkDataForPublishing(
  dataDir: string,
  siteDir: string,
): Promise<void> {
  const targetDataDir = resolve(siteDir, 'data');
  await rm(targetDataDir, { recursive: true, force: true });
  await cp(dataDir, targetDataDir, { recursive: true });
}

export async function publishBenchmarkPages(
  options: BenchmarkPagesCliOptions,
  dependencies: Partial<PublishPagesDependencies> = {},
): Promise<{
  seededFromPublishedSite: boolean;
  collectedContinuousRun: boolean;
  importedRecordedRuns: string[];
  indexedRunCount: number;
  createdSiteFiles: string[];
}> {
  const resolvedDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  const seededFromPublishedSite = await seedPublishedBenchmarkData(
    options.publishedSiteDir,
    options.dataDir,
  );

  if (options.collectContinuousRun) {
    const runDocument = await resolvedDependencies.collectRun({
      profilePath: options.profilePath,
      outputPath: options.benchmarkOutputPath,
      reuseServer: false,
    });

    await storeBenchmarkRun(options.dataDir, runDocument);
    await writeFile(
      options.benchmarkOutputPath,
      `${JSON.stringify(runDocument, null, 2)}\n`,
      'utf8',
    );
  }

  for (const recordedRunPath of options.recordedRunPaths) {
    await resolvedDependencies.importRun({
      inputPath: recordedRunPath,
      dataDir: options.dataDir,
    });
  }

  const indexedRunCount = await resolvedDependencies.rebuildHistory(
    options.dataDir,
  );
  const createdSiteFiles = await resolvedDependencies.buildSite(
    options.dataDir,
    options.siteDir,
  );
  await copyBenchmarkDataForPublishing(options.dataDir, options.siteDir);

  return {
    seededFromPublishedSite,
    collectedContinuousRun: options.collectContinuousRun,
    importedRecordedRuns: [...options.recordedRunPaths].sort(),
    indexedRunCount,
    createdSiteFiles,
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const summary = await publishBenchmarkPages(options);

  process.stdout.write(
    `Published benchmark site at ${options.siteDir} using ${summary.indexedRunCount} indexed run(s)\n`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
