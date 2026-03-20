import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { BenchmarkSiteData } from './site-data-builder';

export interface RenderedSiteFile {
  path: string;
  content: string;
}

async function loadTemplate(relativePath: string): Promise<string> {
  return readFile(resolve('benchmarks/site', relativePath), 'utf8');
}

export async function renderBenchmarkSite(
  siteData: BenchmarkSiteData,
): Promise<RenderedSiteFile[]> {
  const [indexHtml, stylesCss, appJs] = await Promise.all([
    loadTemplate('index.html'),
    loadTemplate('styles.css'),
    loadTemplate('app.js'),
  ]);

  return [
    {
      path: 'index.html',
      content: indexHtml,
    },
    {
      path: 'styles.css',
      content: stylesCss,
    },
    {
      path: 'app.js',
      content: appJs.replace('__SITE_DATA_PATH__', './site-data.json'),
    },
    {
      path: 'site-data.json',
      content: `${JSON.stringify(siteData, null, 2)}\n`,
    },
  ];
}
