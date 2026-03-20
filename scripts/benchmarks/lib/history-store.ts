import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import type { NormalizedBenchmarkRun } from './benchmark-normalizer';

export interface StoredBenchmarkRun {
  run: NormalizedBenchmarkRun;
  relativePath: string;
  absolutePath: string;
}

function slugifyPathSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'unknown';
}

function getRunFileName(run: NormalizedBenchmarkRun): string {
  const timestamp = run.collectedAt.replace(/[:.]/g, '-');
  return `${timestamp}-${run.git.shortSha}.json`;
}

export function getRunRelativePath(run: NormalizedBenchmarkRun): string {
  const collectedAt = new Date(run.collectedAt);
  const year = String(collectedAt.getUTCFullYear());
  const month = String(collectedAt.getUTCMonth() + 1).padStart(2, '0');
  const environment = slugifyPathSegment(run.runner.environmentLabel);

  return ['runs', run.lane, environment, year, month, getRunFileName(run)].join(
    '/',
  );
}

export async function storeBenchmarkRun(
  dataDir: string,
  run: NormalizedBenchmarkRun,
): Promise<{ status: 'stored' | 'duplicate'; relativePath: string }> {
  const relativePath = getRunRelativePath(run);
  const absolutePath = resolve(dataDir, relativePath);
  const serialized = `${JSON.stringify(run, null, 2)}\n`;

  await mkdir(dirname(absolutePath), { recursive: true });

  try {
    const existing = await readFile(absolutePath, 'utf8');
    if (existing === serialized) {
      return { status: 'duplicate', relativePath };
    }

    throw new Error(
      `Refusing to overwrite existing benchmark run: ${absolutePath}`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  await writeFile(absolutePath, serialized, 'utf8');
  return { status: 'stored', relativePath };
}

async function walkRunsDirectory(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const filePaths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return walkRunsDirectory(entryPath);
      }

      if (entry.isFile() && entry.name.endsWith('.json')) {
        return [entryPath];
      }

      return [];
    }),
  );

  return filePaths.flat();
}

export async function loadStoredBenchmarkRuns(
  dataDir: string,
): Promise<StoredBenchmarkRun[]> {
  const runsDir = resolve(dataDir, 'runs');

  try {
    const filePaths = await walkRunsDirectory(runsDir);
    const runs = await Promise.all(
      filePaths.map(async (filePath) => ({
        run: JSON.parse(
          await readFile(filePath, 'utf8'),
        ) as NormalizedBenchmarkRun,
        absolutePath: filePath,
        relativePath: filePath.slice(resolve(dataDir).length + 1),
      })),
    );

    return runs.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}
