export interface WasmChunkCallback {
  (chunk: Uint8Array | null, status: string): void;
}

export interface WasmExportResult {
  success: boolean;
  error?: string;
  size?: number;
  duration?: number;
}
