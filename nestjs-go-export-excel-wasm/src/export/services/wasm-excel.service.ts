/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import {
  ExportDataset,
  ExportExecutionResult,
  WasmProgress,
} from '../interfaces/export-data.interface';
import { WasmChunkCallback } from '../interfaces/wasm-callback.interface';

declare const Go: new () => {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
};

type ExportJob = () => Promise<ExportExecutionResult>;

@Injectable()
export class WasmExcelService implements OnModuleDestroy {
  private readonly logger = new Logger(WasmExcelService.name);
  private readonly wasmModulePath = join(
    __dirname,
    '../../../excel-streamer/excel_bridge.wasm',
  );
  private readonly wasmExecPath = join(
    __dirname,
    '../../../excel-streamer/wasm_exec.js',
  );
  private readonly wasmBuffer: Buffer;
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    require(this.wasmExecPath);
    this.wasmBuffer = readFileSync(this.wasmModulePath);
  }

  initializeExport(headers: string[]): Promise<boolean> {
    void headers;
    return Promise.resolve(true);
  }

  async exportToStream(
    dataGenerator: AsyncGenerator<Record<string, any>[]>,
    headers: string[],
    onProgress?: (progress: WasmProgress) => void,
  ): Promise<Readable> {
    const rows: Record<string, any>[] = [];
    for await (const batch of dataGenerator) {
      rows.push(...batch);
    }

    const result = await this.exportDataset(
      {
        columns: headers,
        rows,
        total: rows.length,
        seed: 0,
      },
      'wasm-export.xlsx',
      onProgress,
    );

    return Readable.from(result.buffer);
  }

  async exportDataset(
    dataset: ExportDataset,
    fileName: string,
    onProgress?: (progress: WasmProgress) => void,
  ): Promise<ExportExecutionResult> {
    return this.enqueue(async () => {
      const startTime = process.hrtime.bigint();
      const memoryBefore = process.memoryUsage().heapUsed;
      const chunks: Buffer[] = [];

      const runtime = await this.createRuntime();

      try {
        await runtime.waitUntilReady();

        const callback: WasmChunkCallback = (chunk, status) => {
          if (status === 'INIT_OK' || status === 'COMPLETE') {
            return;
          }

          if (status.startsWith('CHUNK:')) {
            if (chunk && chunk.length > 0) {
              chunks.push(Buffer.from(chunk));
            }

            const progress = this.parseProgressStatus(status);
            if (progress && onProgress) {
              onProgress(progress);
            }

            return;
          }

          throw new Error(status);
        };

        const initResult = (global as Record<string, any>).goInitExport(
          dataset.columns,
          callback,
        );
        this.assertGoResult(initResult, 'Ошибка инициализации WASM');

        const batchSize = 500;
        for (let index = 0; index < dataset.rows.length; index += batchSize) {
          const batch = dataset.rows.slice(index, index + batchSize);
          const writeResult = (global as Record<string, any>).goWriteRows(
            JSON.stringify(batch),
          );
          this.assertGoResult(writeResult, 'Ошибка записи в WASM');
        }

        const finalizeResult = (
          global as Record<string, any>
        ).goFinalizeExport();
        this.assertGoResult(finalizeResult, 'Ошибка завершения WASM экспорта');

        const buffer = Buffer.concat(chunks);
        const memoryAfter = process.memoryUsage().heapUsed;
        const durationMs =
          Number(process.hrtime.bigint() - startTime) / 1_000_000;

        return {
          variant: 'wasm',
          buffer,
          fileName,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          durationMs: Number(durationMs.toFixed(2)),
          sizeBytes: buffer.length,
          rowCount: dataset.total,
          columnCount: dataset.columns.length,
          memoryDeltaBytes: Math.max(0, memoryAfter - memoryBefore),
        };
      } finally {
        runtime.dispose();
      }
    });
  }

  async testExport(
    headers: string[],
    sampleData: Record<string, any>[],
  ): Promise<boolean> {
    const dataset = {
      columns: headers,
      rows: sampleData,
      total: sampleData.length,
      seed: 0,
    };

    const result = await this.exportDataset(dataset, 'wasm-test.xlsx');
    return result.sizeBytes > 0;
  }

  getStatus(): { queued: boolean; hasBinary: boolean } {
    return {
      queued: true,
      hasBinary: Boolean(this.wasmBuffer?.length),
    };
  }

  onModuleDestroy(): void {
    delete (global as Record<string, any>).goInitExport;
    delete (global as Record<string, any>).goWriteRows;
    delete (global as Record<string, any>).goFinalizeExport;
    delete (global as Record<string, any>).goSetChunkSize;
    delete (global as Record<string, any>).goGetProgress;
  }

  private async enqueue(job: ExportJob): Promise<ExportExecutionResult> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await job();
    } finally {
      release();
    }
  }

  private assertGoResult(result: unknown, prefix: string): void {
    if (typeof result === 'string' && result.length > 0) {
      throw new Error(`${prefix}: ${result}`);
    }
  }

  private parseProgressStatus(status: string): WasmProgress | null {
    const parts = status.split(':');
    if (parts.length < 3) {
      this.logger.warn(`Ignoring malformed WASM progress status: ${status}`);
      return null;
    }

    const current = Number(parts[1]);
    const total = Number(parts[2]);

    if (
      !Number.isFinite(current) ||
      !Number.isFinite(total) ||
      current < 0 ||
      total <= 0 ||
      current > total
    ) {
      this.logger.warn(`Ignoring invalid WASM progress numbers: ${status}`);
      return null;
    }

    return {
      current,
      total,
      percentage: Math.round((current / total) * 100),
    };
  }

  private async createRuntime(): Promise<{
    waitUntilReady: () => Promise<void>;
    dispose: () => void;
  }> {
    const go = new Go();
    const instantiateResult = (await WebAssembly.instantiate(
      this.wasmBuffer as unknown as BufferSource,
      go.importObject,
    )) as unknown;
    const wasmInstance =
      (instantiateResult as { instance?: WebAssembly.Instance }).instance ??
      (instantiateResult as WebAssembly.Instance);
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('WASM runtime init timeout')),
        5000,
      );
      const checkReady = () => {
        if (
          typeof (global as Record<string, any>).goInitExport === 'function'
        ) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        setTimeout(checkReady, 25);
      };
      checkReady();
    });

    void go.run(wasmInstance).catch((error: Error) => {
      this.logger.error(`Go runtime failed: ${error.message}`);
    });

    return {
      waitUntilReady: () => readyPromise,
      dispose: () => {
        delete (global as Record<string, any>).goInitExport;
        delete (global as Record<string, any>).goWriteRows;
        delete (global as Record<string, any>).goFinalizeExport;
        delete (global as Record<string, any>).goSetChunkSize;
        delete (global as Record<string, any>).goGetProgress;
      },
    };
  }
}
