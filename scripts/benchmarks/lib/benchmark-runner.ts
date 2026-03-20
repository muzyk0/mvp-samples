import { setTimeout as delay } from 'timers/promises';
import type { BenchmarkProfile } from './benchmark-config';
import { startManagedProcess } from './process-control';
import type { ExportBenchmarkResult } from '../../../src/export/interfaces/export-data.interface';

export interface BenchmarkCollectorOptions {
  cwd: string;
  reuseServer?: boolean;
}

async function waitForHealthCheck(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (response.ok) {
        return;
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(intervalMs);
  }

  throw new Error(
    `Health check ${path} did not pass before timeout: ${lastError}`,
  );
}

async function callBenchmarkEndpoint(
  baseUrl: string,
  request: BenchmarkProfile['scenario']['request'],
): Promise<ExportBenchmarkResult> {
  const response = await fetch(`${baseUrl}/export/benchmark`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      `Benchmark request failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }

  return (await response.json()) as ExportBenchmarkResult;
}

export async function collectBenchmarkPayloads(
  profile: BenchmarkProfile,
  options: BenchmarkCollectorOptions,
): Promise<ExportBenchmarkResult[]> {
  const managedProcess =
    options.reuseServer === true
      ? null
      : startManagedProcess(profile.server.startCommand, {
          cwd: options.cwd,
          env: {
            ...process.env,
            PORT: String(profile.server.port),
          },
        });

  try {
    for (const healthCheck of profile.server.healthChecks) {
      await waitForHealthCheck(
        profile.server.baseUrl,
        healthCheck,
        profile.server.startupTimeoutMs,
        profile.server.healthPollIntervalMs,
      );
    }

    for (
      let warmupIndex = 0;
      warmupIndex < profile.scenario.warmupCount;
      warmupIndex += 1
    ) {
      await callBenchmarkEndpoint(
        profile.server.baseUrl,
        profile.scenario.request,
      );
    }

    const payloads: ExportBenchmarkResult[] = [];
    for (
      let sampleIndex = 0;
      sampleIndex < profile.scenario.sampleCount;
      sampleIndex += 1
    ) {
      payloads.push(
        await callBenchmarkEndpoint(
          profile.server.baseUrl,
          profile.scenario.request,
        ),
      );
    }

    return payloads;
  } finally {
    await managedProcess?.stop();
  }
}
