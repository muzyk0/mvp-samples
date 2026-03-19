import { Prisma } from '@prisma/client';
import type { Writable } from 'stream';

export interface ExportDataRow {
  [key: string]: string | number | boolean | Date | null;
}

export interface ExportDataset {
  columns: string[];
  rows: ExportDataRow[];
  total: number;
  seed: number;
}

export interface ExportDatasetStreamPlan {
  columns: string[];
  total: number;
  seed: number;
  batchSize: number;
  effectiveLimit: number;
  totalMatching: number;
  startOffset: number;
  where?: Prisma.EmployeeWhereInput;
}

export interface ExportData {
  columns: string[];
  rows: ExportDataRow[];
  total: number;
}

export interface ExportOptions {
  fileName?: string;
  sheetName?: string;
  includeHeaders?: boolean;
}

export interface WasmProgress {
  current: number;
  total: number;
  percentage: number;
}

export type ExportVariant = 'exceljs' | 'wasm' | 'rust-wasm';

export interface ExportExecutionResult {
  variant: ExportVariant;
  fileName: string;
  contentType: string;
  durationMs: number;
  sizeBytes: number;
  rowCount: number;
  columnCount: number;
  memoryDeltaBytes?: number;
}

export interface StreamExportExecutionOptions {
  writable: Writable;
  fileName: string;
  sheetName?: string;
  onProgress?: (progress: WasmProgress) => void;
}

export type ExportExecutionSummary = ExportExecutionResult;

export interface ExportBenchmarkDelta {
  durationMs: number;
  sizeBytes: number;
  memoryDeltaBytes?: number;
}

export interface ExportBenchmarkDiagnostics {
  memory: {
    nodeHeapDeltaMeasured: boolean;
    wasmLinearMemoryIncluded: boolean;
    note: string;
  };
  executionModel: {
    exceljs: string;
    goWasm: string;
    rustWasm: string;
  };
}

export interface ExportBenchmarkResult {
  request: {
    limit: number;
    seed: number;
    columns: string[];
  };
  exceljs: ExportExecutionSummary;
  goWasm: ExportExecutionSummary;
  rustWasm: ExportExecutionSummary;
  deltas: {
    goWasmVsExceljs: ExportBenchmarkDelta;
    rustWasmVsExceljs: ExportBenchmarkDelta;
    rustWasmVsGoWasm: ExportBenchmarkDelta;
  };
  diagnostics: ExportBenchmarkDiagnostics;
}
