import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  loadBenchmarkProfile,
  parseBenchmarkProfile,
} from '../lib/benchmark-config';

describe('benchmark-config', () => {
  it('loads the continuous benchmark profile with fixed reproducible settings', async () => {
    const profile = await loadBenchmarkProfile(
      resolve('benchmarks/profiles/continuous-default.json'),
    );

    expect(profile.lane).toBe('continuous');
    expect(profile.server.baseUrl).toBe('http://127.0.0.1:3100');
    expect(profile.server.healthChecks).toEqual([
      '/export/exceljs/health',
      '/export/wasm/status',
      '/export/rust-wasm/status',
    ]);
    expect(profile.scenario.sampleCount).toBe(3);
    expect(profile.scenario.warmupCount).toBe(1);
    expect(profile.scenario.request).toMatchObject({
      limit: 2000,
      seed: 12345,
      fileName: 'benchmark.xlsx',
      includeMemory: true,
    });
    expect(profile.scenario.request.columns).toEqual([
      'ID',
      'Имя',
      'Отдел',
      'Должность',
      'Зарплата (итоговая)',
      'Дата приема на работу',
      'Активен',
    ]);
  });

  it('rejects profiles that omit the shared benchmark request contract', async () => {
    const rawProfile = await readFile(
      resolve('benchmarks/profiles/continuous-default.json'),
      'utf8',
    );
    const brokenProfile = JSON.parse(rawProfile) as Record<string, unknown>;
    delete (brokenProfile.scenario as Record<string, unknown>).request;

    expect(() =>
      parseBenchmarkProfile(
        JSON.stringify(brokenProfile),
        'benchmarks/profiles/continuous-default.json',
      ),
    ).toThrow(/scenario.request/);
  });
});
