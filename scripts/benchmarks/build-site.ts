import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname, parse, resolve } from 'path';
import { buildBenchmarkSiteData } from './lib/site-data-builder';
import { renderBenchmarkSite } from './lib/site-renderer';

interface BuildSiteCliOptions {
  dataDir: string;
  outDir: string;
}

function parseCliArgs(argv: string[]): BuildSiteCliOptions {
  let dataDir = 'benchmarks/data';
  let outDir = 'dist/benchmark-site';

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--data-dir') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --data-dir');
      }
      dataDir = value;
      index += 1;
      continue;
    }

    if (argument === '--out-dir') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --out-dir');
      }
      outDir = value;
      index += 1;
    }
  }

  return {
    dataDir: resolve(dataDir),
    outDir: resolve(outDir),
  };
}

export async function buildBenchmarkSite(
  dataDir: string,
  outDir: string,
): Promise<string[]> {
  const resolvedOutDir = resolve(outDir);
  if (resolvedOutDir === parse(resolvedOutDir).root) {
    throw new Error(`Refusing to remove root directory: ${resolvedOutDir}`);
  }

  const siteData = await buildBenchmarkSiteData(dataDir);
  const renderedFiles = await renderBenchmarkSite(siteData);

  await rm(resolvedOutDir, { recursive: true, force: true });
  await mkdir(resolvedOutDir, { recursive: true });

  await Promise.all(
    renderedFiles.map(async (file) => {
      const filePath = resolve(resolvedOutDir, file.path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, 'utf8');
    }),
  );

  return renderedFiles.map((file) => file.path).sort();
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const createdFiles = await buildBenchmarkSite(
    options.dataDir,
    options.outDir,
  );
  process.stdout.write(
    `Built benchmark site at ${options.outDir} with ${createdFiles.length} files\n`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
