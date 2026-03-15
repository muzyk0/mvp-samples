export interface WasmChunkCallback {
    (chunk: Uint8Array, status: string): void;
}

export interface WasmExportResult {
    success: boolean;
    error?: string;
    size?: number;
    duration?: number;
}
