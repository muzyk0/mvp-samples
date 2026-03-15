export interface ExportDataRow {
    [key: string]: string | number | boolean | Date | null;
}

export interface ExportData {
    rows: ExportDataRow[];
    total: number;
    columns: string[];
}

export interface ExportOptions {
    fileName?: string;
    sheetName?: string;
    chunkSize?: number;
    includeHeaders?: boolean;
}

export interface WasmProgress {
    current: number;
    total: number;
    percentage: number;
}
