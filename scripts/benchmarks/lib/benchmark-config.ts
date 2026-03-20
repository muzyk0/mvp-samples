import { readFile } from 'fs/promises';
import { resolve } from 'path';

export type BenchmarkLane = 'continuous' | 'recorded';

export interface BenchmarkProfile {
  id: string;
  label: string;
  description?: string;
  lane: BenchmarkLane;
  environment: {
    label: string;
    expectations: string[];
  };
  server: {
    baseUrl: string;
    port: number;
    startCommand: string[];
    healthChecks: string[];
    startupTimeoutMs: number;
    healthPollIntervalMs: number;
  };
  scenario: {
    id: string;
    label: string;
    sampleCount: number;
    warmupCount: number;
    request: {
      limit: number;
      seed: number;
      columns: string[];
      fileName: string;
      sheetName?: string;
      includeHeaders?: boolean;
      includeMemory: boolean;
    };
    output: {
      format: 'json';
      artifactKind: string;
    };
  };
}

function assertCondition(
  value: unknown,
  message: string,
): asserts value is NonNullable<unknown> {
  if (!value) {
    throw new Error(message);
  }
}

function assertString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }

  return value;
}

function assertStringArray(value: unknown, message: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    throw new Error(message);
  }

  return value as string[];
}

function assertInteger(value: unknown, message: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(message);
  }

  return value as number;
}

export function parseBenchmarkProfile(
  rawProfile: string,
  profilePath = '<inline>',
): BenchmarkProfile {
  const parsed: unknown = JSON.parse(rawProfile);
  assertCondition(
    parsed && typeof parsed === 'object' && !Array.isArray(parsed),
    `Benchmark profile ${profilePath} must be a JSON object`,
  );

  const profile = parsed as Record<string, unknown>;
  const lane = assertString(
    profile.lane,
    `Benchmark profile ${profilePath} must define lane`,
  );

  if (lane !== 'continuous' && lane !== 'recorded') {
    throw new Error(
      `Benchmark profile ${profilePath} lane must be "continuous" or "recorded"`,
    );
  }

  const environment =
    profile.environment &&
    typeof profile.environment === 'object' &&
    !Array.isArray(profile.environment)
      ? (profile.environment as Record<string, unknown>)
      : null;
  assertCondition(
    environment,
    `Benchmark profile ${profilePath} must define environment`,
  );

  const server =
    profile.server &&
    typeof profile.server === 'object' &&
    !Array.isArray(profile.server)
      ? (profile.server as Record<string, unknown>)
      : null;
  assertCondition(
    server,
    `Benchmark profile ${profilePath} must define server`,
  );

  const scenario =
    profile.scenario &&
    typeof profile.scenario === 'object' &&
    !Array.isArray(profile.scenario)
      ? (profile.scenario as Record<string, unknown>)
      : null;
  assertCondition(
    scenario,
    `Benchmark profile ${profilePath} must define scenario`,
  );

  const request =
    scenario.request &&
    typeof scenario.request === 'object' &&
    !Array.isArray(scenario.request)
      ? (scenario.request as Record<string, unknown>)
      : null;
  assertCondition(
    request,
    `Benchmark profile ${profilePath} must define scenario.request`,
  );

  const output =
    scenario.output &&
    typeof scenario.output === 'object' &&
    !Array.isArray(scenario.output)
      ? (scenario.output as Record<string, unknown>)
      : null;
  assertCondition(
    output,
    `Benchmark profile ${profilePath} must define scenario.output`,
  );

  return {
    id: assertString(
      profile.id,
      `Benchmark profile ${profilePath} must define id`,
    ),
    label: assertString(
      profile.label,
      `Benchmark profile ${profilePath} must define label`,
    ),
    description:
      typeof profile.description === 'string' ? profile.description : undefined,
    lane,
    environment: {
      label: assertString(
        environment.label,
        `Benchmark profile ${profilePath} must define environment.label`,
      ),
      expectations: assertStringArray(
        environment.expectations,
        `Benchmark profile ${profilePath} must define environment.expectations`,
      ),
    },
    server: {
      baseUrl: assertString(
        server.baseUrl,
        `Benchmark profile ${profilePath} must define server.baseUrl`,
      ),
      port: assertInteger(
        server.port,
        `Benchmark profile ${profilePath} must define server.port`,
        1,
      ),
      startCommand: assertStringArray(
        server.startCommand,
        `Benchmark profile ${profilePath} must define server.startCommand`,
      ),
      healthChecks: assertStringArray(
        server.healthChecks,
        `Benchmark profile ${profilePath} must define server.healthChecks`,
      ),
      startupTimeoutMs: assertInteger(
        server.startupTimeoutMs,
        `Benchmark profile ${profilePath} must define server.startupTimeoutMs`,
        1,
      ),
      healthPollIntervalMs: assertInteger(
        server.healthPollIntervalMs,
        `Benchmark profile ${profilePath} must define server.healthPollIntervalMs`,
        1,
      ),
    },
    scenario: {
      id: assertString(
        scenario.id,
        `Benchmark profile ${profilePath} must define scenario.id`,
      ),
      label: assertString(
        scenario.label,
        `Benchmark profile ${profilePath} must define scenario.label`,
      ),
      sampleCount: assertInteger(
        scenario.sampleCount,
        `Benchmark profile ${profilePath} must define scenario.sampleCount`,
        1,
      ),
      warmupCount: assertInteger(
        scenario.warmupCount,
        `Benchmark profile ${profilePath} must define scenario.warmupCount`,
        0,
      ),
      request: {
        limit: assertInteger(
          request.limit,
          `Benchmark profile ${profilePath} must define scenario.request.limit`,
          1,
        ),
        seed: assertInteger(
          request.seed,
          `Benchmark profile ${profilePath} must define scenario.request.seed`,
          0,
        ),
        columns: assertStringArray(
          request.columns,
          `Benchmark profile ${profilePath} must define scenario.request.columns`,
        ),
        fileName: assertString(
          request.fileName,
          `Benchmark profile ${profilePath} must define scenario.request.fileName`,
        ),
        sheetName:
          typeof request.sheetName === 'string' ? request.sheetName : undefined,
        includeHeaders:
          typeof request.includeHeaders === 'boolean'
            ? request.includeHeaders
            : undefined,
        includeMemory:
          typeof request.includeMemory === 'boolean'
            ? request.includeMemory
            : (() => {
                throw new Error(
                  `Benchmark profile ${profilePath} must define scenario.request.includeMemory`,
                );
              })(),
      },
      output: {
        format:
          output.format === 'json'
            ? output.format
            : (() => {
                throw new Error(
                  `Benchmark profile ${profilePath} must define scenario.output.format as "json"`,
                );
              })(),
        artifactKind: assertString(
          output.artifactKind,
          `Benchmark profile ${profilePath} must define scenario.output.artifactKind`,
        ),
      },
    },
  };
}

export async function loadBenchmarkProfile(
  profilePath: string,
): Promise<BenchmarkProfile> {
  const resolvedPath = resolve(profilePath);
  const rawProfile = await readFile(resolvedPath, 'utf8');
  return parseBenchmarkProfile(rawProfile, resolvedPath);
}
