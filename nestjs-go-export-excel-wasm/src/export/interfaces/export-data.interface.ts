export interface ExportDataRow {
  [key: string]: string | number | boolean | Date | null;
}

export interface ExportDataset {
  columns: string[];
  rows: ExportDataRow[];
  total: number;
  seed: number;
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
  buffer: Buffer;
  fileName: string;
  contentType: string;
  durationMs: number;
  sizeBytes: number;
  rowCount: number;
  columnCount: number;
  memoryDeltaBytes?: number;
}

export type ExportExecutionSummary = Omit<ExportExecutionResult, 'buffer'>;

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
