import { readFile } from 'fs/promises';
import { resolve } from 'path';
import {
  validateNormalizedBenchmarkRun,
  type NormalizedBenchmarkRun,
} from './lib/benchmark-normalizer';
import { buildHistoryIndexes, writeHistoryIndexes } from './lib/history-index';
import {
  loadStoredBenchmarkRuns,
  storeBenchmarkRun,
} from './lib/history-store';

interface ImportCliOptions {
  inputPath: string;
  dataDir: string;
}

function parseCliArgs(argv: string[]): ImportCliOptions {
  let inputPath = '';
  let dataDir = 'benchmarks/data';

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--input') {
      inputPath = argv[index + 1] ?? inputPath;
      index += 1;
      continue;
    }

    if (argument === '--data-dir') {
      dataDir = argv[index + 1] ?? dataDir;
      index += 1;
    }
  }

  if (inputPath.trim().length === 0) {
    throw new Error(
      'Missing required --input path for recorded benchmark JSON',
    );
  }

  return {
    inputPath: resolve(inputPath),
    dataDir: resolve(dataDir),
  };
}

export async function importRecordedRun(
  options: ImportCliOptions,
): Promise<{ status: 'stored' | 'duplicate'; relativePath: string }> {
  const run = JSON.parse(
    await readFile(options.inputPath, 'utf8'),
  ) as NormalizedBenchmarkRun;

  await validateNormalizedBenchmarkRun(run);
  if (run.lane !== 'recorded') {
    throw new Error(
      `Recorded benchmark imports require lane "recorded", received "${run.lane}"`,
    );
  }

  const storeResult = await storeBenchmarkRun(options.dataDir, run);
  const storedRuns = await loadStoredBenchmarkRuns(options.dataDir);
  const indexes = buildHistoryIndexes(storedRuns);
  await writeHistoryIndexes(options.dataDir, indexes);

  return storeResult;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const storeResult = await importRecordedRun(options);

  process.stdout.write(
    `${storeResult.status === 'duplicate' ? 'Skipped duplicate' : 'Imported'} recorded benchmark run at ${storeResult.relativePath}\n`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
