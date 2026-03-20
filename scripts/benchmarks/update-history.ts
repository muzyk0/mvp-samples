import { resolve } from 'path';
import { validateNormalizedBenchmarkRun } from './lib/benchmark-normalizer';
import { buildHistoryIndexes, writeHistoryIndexes } from './lib/history-index';
import { loadStoredBenchmarkRuns } from './lib/history-store';

function parseCliArgs(argv: string[]): { dataDir: string } {
  let dataDir = 'benchmarks/data';

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--data-dir') {
      dataDir = argv[index + 1] ?? dataDir;
      index += 1;
    }
  }

  return { dataDir: resolve(dataDir) };
}

export async function rebuildBenchmarkHistory(
  dataDir: string,
): Promise<number> {
  const storedRuns = await loadStoredBenchmarkRuns(dataDir);

  for (const storedRun of storedRuns) {
    await validateNormalizedBenchmarkRun(storedRun.run);
  }

  const indexes = buildHistoryIndexes(storedRuns);
  await writeHistoryIndexes(dataDir, indexes);
  return storedRuns.length;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const runCount = await rebuildBenchmarkHistory(options.dataDir);
  process.stdout.write(
    `Indexed ${runCount} benchmark run(s) under ${options.dataDir}\n`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
