import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { loadBenchmarkProfile } from './lib/benchmark-config';
import {
  normalizeBenchmarkRun,
  validateNormalizedBenchmarkRun,
} from './lib/benchmark-normalizer';
import { collectBenchmarkPayloads } from './lib/benchmark-runner';
import {
  collectGitMetadata,
  collectRunnerMetadata,
  collectToolchainMetadata,
} from './lib/environment-metadata';

interface CollectorCliOptions {
  profilePath: string;
  outputPath: string;
  reuseServer: boolean;
}

function parseCliArgs(argv: string[]): CollectorCliOptions {
  let profilePath = 'benchmarks/profiles/continuous-default.json';
  let outputPath = '.tmp/benchmark-run.json';
  let reuseServer = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--profile') {
      profilePath = argv[index + 1] ?? profilePath;
      index += 1;
      continue;
    }

    if (argument === '--output') {
      outputPath = argv[index + 1] ?? outputPath;
      index += 1;
      continue;
    }

    if (argument === '--reuse-server') {
      reuseServer = true;
    }
  }

  return { profilePath, outputPath, reuseServer };
}

export async function collectBenchmarkResults(
  options: CollectorCliOptions,
): Promise<ReturnType<typeof normalizeBenchmarkRun>> {
  const resolvedProfilePath = resolve(options.profilePath);
  const resolvedOutputPath = resolve(options.outputPath);
  const collectedAt = new Date().toISOString();
  const profile = await loadBenchmarkProfile(resolvedProfilePath);
  const payloads = await collectBenchmarkPayloads(profile, {
    cwd: process.cwd(),
    reuseServer: options.reuseServer,
  });

  const runDocument = normalizeBenchmarkRun(payloads, {
    lane: profile.lane,
    collectedAt,
    profilePath: resolvedProfilePath,
    profile,
    git: await collectGitMetadata(),
    runner: collectRunnerMetadata(profile.environment.label),
    toolchain: await collectToolchainMetadata(),
  });

  await validateNormalizedBenchmarkRun(runDocument);
  await mkdir(dirname(resolvedOutputPath), { recursive: true });
  await writeFile(
    resolvedOutputPath,
    `${JSON.stringify(runDocument, null, 2)}\n`,
    'utf8',
  );

  process.stdout.write(
    `Stored normalized benchmark run at ${resolvedOutputPath} from POST /export/benchmark\n`,
  );
  return runDocument;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  await collectBenchmarkResults(options);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
