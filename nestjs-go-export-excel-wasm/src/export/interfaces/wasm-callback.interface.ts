export interface WasmChunkCallback {
  (chunk: Uint8Array | null, status: string): void;
}

export interface WasmExportResult {
  success: boolean;
  error?: string;
  size?: number;
  duration?: number;
}

export interface RustWasmModule {
  generate_workbook_from_json(payloadJson: string): Uint8Array;
}
