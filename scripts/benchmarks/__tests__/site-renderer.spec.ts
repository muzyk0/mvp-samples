import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBenchmarkSite } from '../build-site';
import { buildBenchmarkSiteData } from '../lib/site-data-builder';
import { renderBenchmarkSite } from '../lib/site-renderer';

const createdDirectories: string[] = [];
const fixtureDataDir = resolve('scripts/benchmarks/__fixtures__/site-data');

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'benchmark-site-'));
  createdDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import('fs/promises');
  await Promise.all(
    createdDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('site-renderer', () => {
  it('renders deterministic static site files and generated JSON payload', async () => {
    const siteData = await buildBenchmarkSiteData(fixtureDataDir);
    const renderedFiles = await renderBenchmarkSite(siteData);

    expect(renderedFiles.map((file) => file.path)).toEqual([
      'index.html',
      'styles.css',
      'app.js',
      'site-data.json',
    ]);
    expect(renderedFiles[2].content).toContain(
      "const SITE_DATA_PATH = './site-data.json';",
    );
    expect(renderedFiles[3].content).toContain('"latestViews"');
    expect(renderedFiles[0].content).toContain(
      'This site is generated from stored benchmark indexes only.',
    );
  });

  it('writes the site output from indexes only and removes stale files', async () => {
    const outDir = await createTempDir();
    const staleFilePath = resolve(outDir, 'stale.txt');
    await import('fs/promises').then(({ writeFile }) =>
      writeFile(staleFilePath, 'stale\n', 'utf8'),
    );

    const createdFiles = await buildBenchmarkSite(fixtureDataDir, outDir);

    expect(createdFiles).toEqual([
      'app.js',
      'index.html',
      'site-data.json',
      'styles.css',
    ]);
    await expect(readFile(staleFilePath, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      readFile(resolve(outDir, 'site-data.json'), 'utf8'),
    ).resolves.toContain('"trendViews"');
  });
});
