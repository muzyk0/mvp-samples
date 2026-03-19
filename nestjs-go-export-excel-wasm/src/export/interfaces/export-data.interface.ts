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

export interface ExportExecutionResult {
  variant: 'exceljs' | 'wasm';
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

export interface ExportBenchmarkResult {
  request: {
    limit: number;
    seed: number;
    columns: string[];
  };
  exceljs: ExportExecutionSummary;
  wasm: ExportExecutionSummary;
  delta: {
    durationMs: number;
    sizeBytes: number;
    memoryDeltaBytes?: number;
  };
}
