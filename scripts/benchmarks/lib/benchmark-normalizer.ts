import { readFile } from 'fs/promises';
import { resolve } from 'path';
import Ajv2020 from 'ajv/dist/2020';
import type { BenchmarkLane, BenchmarkProfile } from './benchmark-config';
import type {
  ExportBenchmarkDiagnostics,
  ExportBenchmarkResult,
  ExportBenchmarkDelta,
} from '../../../src/export/interfaces/export-data.interface';
import type {
  GitMetadata,
  RunnerMetadata,
  ToolchainMetadata,
} from './environment-metadata';

const IMPLEMENTATION_MAP = [
  { id: 'exceljs', label: 'ExcelJS', sourceKey: 'exceljs' as const },
  { id: 'goWasm', label: 'Go/WASM', sourceKey: 'goWasm' as const },
  { id: 'rustWasm', label: 'Rust/WASM', sourceKey: 'rustWasm' as const },
] as const;

export interface NormalizedComparison {
  id: string;
  baselineImplementationId: string;
  contenderImplementationId: string;
  metrics: {
    durationMsDelta: number;
    sizeBytesDelta: number;
    memoryDeltaBytesDelta?: number;
  };
}

export interface NormalizedImplementation {
  id: string;
  label: string;
  sourceKey: string;
  variant: string;
  executionModel: string;
  metrics: {
    durationMs: number;
    sizeBytes: number;
    rowCount: number;
    columnCount: number;
    memoryDeltaBytes?: number;
  };
  fileName: string;
  contentType: string;
}

export interface NormalizedBenchmarkSample {
  sampleIndex: number;
  collectedAt: string;
  request: ExportBenchmarkResult['request'];
  implementations: NormalizedImplementation[];
  comparisons: NormalizedComparison[];
  diagnostics: ExportBenchmarkDiagnostics;
}

export interface NormalizedBenchmarkRun {
  schemaVersion: string;
  lane: BenchmarkLane;
  collectedAt: string;
  profile: {
    id: string;
    label: string;
    path: string;
    environmentLabel: string;
    description?: string;
    expectations: string[];
  };
  source: {
    endpoint: '/export/benchmark';
    method: 'POST';
    baseUrl: string;
  };
  git: GitMetadata;
  runner: RunnerMetadata;
  toolchain: ToolchainMetadata;
  scenario: {
    id: string;
    label: string;
    sampleCount: number;
    warmupCount: number;
    request: BenchmarkProfile['scenario']['request'];
  };
  samples: NormalizedBenchmarkSample[];
}

export interface NormalizationContext {
  lane: BenchmarkLane;
  collectedAt: string;
  profilePath: string;
  profile: BenchmarkProfile;
  git: GitMetadata;
  runner: RunnerMetadata;
  toolchain: ToolchainMetadata;
}

function mapComparison(
  id: string,
  baselineImplementationId: string,
  contenderImplementationId: string,
  delta: ExportBenchmarkDelta,
): NormalizedComparison {
  return {
    id,
    baselineImplementationId,
    contenderImplementationId,
    metrics: {
      durationMsDelta: delta.durationMs,
      sizeBytesDelta: delta.sizeBytes,
      ...(delta.memoryDeltaBytes === undefined
        ? {}
        : { memoryDeltaBytesDelta: delta.memoryDeltaBytes }),
    },
  };
}

export function normalizeBenchmarkSample(
  payload: ExportBenchmarkResult,
  sampleIndex: number,
  collectedAt: string,
): NormalizedBenchmarkSample {
  const implementations = IMPLEMENTATION_MAP.map((entry) => {
    const result = payload[entry.sourceKey];

    return {
      id: entry.id,
      label: entry.label,
      sourceKey: entry.sourceKey,
      variant: result.variant,
      executionModel: payload.diagnostics.executionModel[entry.sourceKey],
      metrics: {
        durationMs: result.durationMs,
        sizeBytes: result.sizeBytes,
        rowCount: result.rowCount,
        columnCount: result.columnCount,
        ...(result.memoryDeltaBytes === undefined
          ? {}
          : { memoryDeltaBytes: result.memoryDeltaBytes }),
      },
      fileName: result.fileName,
      contentType: result.contentType,
    };
  });

  return {
    sampleIndex,
    collectedAt,
    request: payload.request,
    implementations,
    comparisons: [
      mapComparison(
        'goWasm-vs-exceljs',
        'exceljs',
        'goWasm',
        payload.deltas.goWasmVsExceljs,
      ),
      mapComparison(
        'rustWasm-vs-exceljs',
        'exceljs',
        'rustWasm',
        payload.deltas.rustWasmVsExceljs,
      ),
      mapComparison(
        'rustWasm-vs-goWasm',
        'goWasm',
        'rustWasm',
        payload.deltas.rustWasmVsGoWasm,
      ),
    ],
    diagnostics: payload.diagnostics,
  };
}

export function normalizeBenchmarkRun(
  payloads: ExportBenchmarkResult[],
  context: NormalizationContext,
): NormalizedBenchmarkRun {
  return {
    schemaVersion: '1.0.0',
    lane: context.lane,
    collectedAt: context.collectedAt,
    profile: {
      id: context.profile.id,
      label: context.profile.label,
      path: context.profilePath,
      environmentLabel: context.profile.environment.label,
      description: context.profile.description,
      expectations: context.profile.environment.expectations,
    },
    source: {
      endpoint: '/export/benchmark',
      method: 'POST',
      baseUrl: context.profile.server.baseUrl,
    },
    git: context.git,
    runner: context.runner,
    toolchain: context.toolchain,
    scenario: {
      id: context.profile.scenario.id,
      label: context.profile.scenario.label,
      sampleCount: context.profile.scenario.sampleCount,
      warmupCount: context.profile.scenario.warmupCount,
      request: context.profile.scenario.request,
    },
    samples: payloads.map((payload, index) =>
      normalizeBenchmarkSample(payload, index + 1, context.collectedAt),
    ),
  };
}

export async function loadBenchmarkRunSchema(): Promise<object> {
  const schemaPath = resolve('benchmarks/schema/benchmark-run.schema.json');
  const rawSchema = await readFile(schemaPath, 'utf8');
  return JSON.parse(rawSchema) as object;
}

export async function validateNormalizedBenchmarkRun(
  runDocument: NormalizedBenchmarkRun,
): Promise<void> {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
  const schema = await loadBenchmarkRunSchema();
  const validate = ajv.compile(schema);
  const isValid = validate(runDocument);

  if (!isValid) {
    const details = (validate.errors ?? [])
      .map(
        (error) => `${error.instancePath || '/'} ${error.message ?? 'invalid'}`,
      )
      .join('; ');
    throw new Error(
      `Normalized benchmark run failed schema validation: ${details}`,
    );
  }
}
