/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { join } from 'path';
import { PassThrough } from 'stream';
import { finished } from 'stream/promises';
import {
  ExportDatasetStreamPlan,
  ExportExecutionResult,
  StreamExportExecutionOptions,
  WasmProgress,
} from '../interfaces/export-data.interface';
import { WasmChunkCallback } from '../interfaces/wasm-callback.interface';

declare const Go: new () => {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
};

type ExportJob = () => Promise<ExportExecutionResult>;
type RuntimeHandle = {
  waitUntilReady: () => Promise<void>;
  dispose: () => void;
};

@Injectable()
export class WasmExcelService
  implements OnModuleDestroy, BeforeApplicationShutdown
{
  private readonly logger = new Logger(WasmExcelService.name);
  private readonly wasmAssetsDir = this.resolveWasmAssetsDir();
  private readonly wasmModulePath = join(
    this.wasmAssetsDir,
    'excel_bridge.wasm',
  );
  private readonly wasmExecPath = join(this.wasmAssetsDir, 'wasm_exec.js');
  private wasmBuffer?: Buffer;
  private wasmExecLoaded = false;
  private wasmLoadPromise?: Promise<void>;
  private queue: Promise<void> = Promise.resolve();
  private queueDepth = 0;

  async exportPlanToWritable(
    plan: ExportDatasetStreamPlan,
    rows: AsyncGenerator<Record<string, any>[]>,
    options: StreamExportExecutionOptions,
  ): Promise<ExportExecutionResult> {
    const initialized = await this.initializeExport(plan.columns, plan.total);

    return this.enqueue(async () => {
      const startTime = process.hrtime.bigint();
      const memoryBefore = process.memoryUsage().heapUsed;
      const runtime = await this.createRuntime();
      let rowCount = 0;
      let sizeBytes = 0;
      let writableEnded = false;
      let exportError: Error | null = null;
      let writeChain = Promise.resolve();

      try {
        await runtime.waitUntilReady();

        const callback: WasmChunkCallback = (chunk, status) => {
          if (status === 'INIT_OK' || status === 'COMPLETE') {
            return;
          }

          if (status.startsWith('ROW_PROGRESS:')) {
            const progress = this.parseProgressStatus(status, 'ROW_PROGRESS');
            if (progress && options.onProgress) {
              options.onProgress(progress);
            }
            return;
          }

          if (status.startsWith('BYTES:')) {
            if (chunk && chunk.length > 0) {
              const buffer = Buffer.from(chunk);
              sizeBytes += buffer.length;
              writeChain = writeChain.then(async () => {
                const accepted = options.writable.write(buffer);
                if (!accepted) {
                  await new Promise<void>((resolve, reject) => {
                    const cleanup = () => {
                      options.writable.off('drain', onDrain);
                      options.writable.off('error', onError);
                      options.writable.off('close', onClose);
                    };
                    const onDrain = () => {
                      cleanup();
                      resolve();
                    };
                    const onError = (error: Error) => {
                      cleanup();
                      reject(error);
                    };
                    const onClose = () => {
                      cleanup();
                      reject(
                        new Error(
                          'WASM export aborted: writable closed before drain',
                        ),
                      );
                    };

                    options.writable.once('drain', onDrain);
                    options.writable.once('error', onError);
                    options.writable.once('close', onClose);
                  });
                }
              });
            }
            return;
          }

          throw new Error(status);
        };

        const initResult = (global as Record<string, any>).goInitExport(
          initialized.headers,
          callback,
          initialized.expectedTotalRows,
        );
        this.assertGoResult(initResult, 'Ошибка инициализации WASM');

        for await (const batch of rows) {
          rowCount += batch.length;
          const writeResult = (global as Record<string, any>).goWriteRows(
            JSON.stringify(batch),
          );
          this.assertGoResult(writeResult, 'Ошибка записи в WASM');
        }

        const finalizeResult = (
          global as Record<string, any>
        ).goFinalizeExport();
        this.assertGoResult(finalizeResult, 'Ошибка завершения WASM экспорта');
        await writeChain;
        options.writable.end();
        writableEnded = true;

        const memoryAfter = process.memoryUsage().heapUsed;
        const durationMs =
          Number(process.hrtime.bigint() - startTime) / 1_000_000;

        return {
          variant: 'wasm',
          fileName: options.fileName,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          durationMs: Number(durationMs.toFixed(2)),
          sizeBytes,
          rowCount,
          columnCount: plan.columns.length,
          memoryDeltaBytes: Math.max(0, memoryAfter - memoryBefore),
        };
      } catch (error) {
        exportError = error instanceof Error ? error : new Error(String(error));
        throw error;
      } finally {
        await writeChain.catch(() => undefined);
        if (!writableEnded && !options.writable.destroyed) {
          if (exportError) {
            options.writable.destroy(exportError);
          } else {
            options.writable.end();
          }
        }
        runtime.dispose();
      }
    });
  }

  async exportPlanToBuffer(
    plan: ExportDatasetStreamPlan,
    rows: AsyncGenerator<Record<string, any>[]>,
    fileName: string,
  ): Promise<{ result: ExportExecutionResult; buffer: Buffer }> {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    const streamDone = finished(stream);
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    try {
      const result = await this.exportPlanToWritable(plan, rows, {
        writable: stream,
        fileName,
      });
      await streamDone;
      const buffer = Buffer.concat(chunks);

      return {
        result: {
          ...result,
          sizeBytes: buffer.length,
        },
        buffer,
      };
    } catch (error) {
      await streamDone.catch(() => undefined);
      throw error;
    }
  }

  async testExport(
    headers: string[],
    sampleData: Record<string, any>[],
  ): Promise<boolean> {
    const plan: ExportDatasetStreamPlan = {
      columns: headers,
      total: sampleData.length,
      seed: 0,
      batchSize: sampleData.length || 1,
      effectiveLimit: sampleData.length,
      totalMatching: sampleData.length,
      startOffset: 0,
    };

    const result = await this.exportPlanToBuffer(
      plan,
      (async function* () {
        await Promise.resolve();
        yield sampleData;
      })(),
      'wasm-test.xlsx',
    );
    return result.result.sizeBytes > 0;
  }

  async initializeExport(
    headers: string[],
    expectedTotalRows?: number,
  ): Promise<{ headers: string[]; expectedTotalRows: number }> {
    if (!Array.isArray(headers) || headers.length === 0) {
      throw new ServiceUnavailableException('WASM export headers are required');
    }

    await this.ensureWasmLoaded();
    return {
      headers: [...headers],
      expectedTotalRows: Math.max(0, expectedTotalRows ?? 0),
    };
  }

  getStatus(): { queued: boolean; hasBinary: boolean } {
    return {
      queued: this.queueDepth > 0,
      hasBinary:
        Boolean(this.wasmBuffer?.length) || existsSync(this.wasmModulePath),
    };
  }

  async beforeApplicationShutdown(): Promise<void> {
    try {
      await Promise.race([
        this.queue,
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    } finally {
      this.cleanupGlobals();
    }
  }

  onModuleDestroy(): void {
    this.cleanupGlobals();
  }

  private async ensureWasmLoaded(): Promise<void> {
    if (this.wasmBuffer && this.wasmExecLoaded) {
      return;
    }

    if (!this.wasmLoadPromise) {
      this.wasmLoadPromise = this.loadWasmAssets().finally(() => {
        this.wasmLoadPromise = undefined;
      });
    }

    return this.wasmLoadPromise;
  }

  private async loadWasmAssets(): Promise<void> {
    if (!existsSync(this.wasmExecPath) || !existsSync(this.wasmModulePath)) {
      throw new ServiceUnavailableException(
        `WASM assets are not available yet. Expected files in ${this.wasmAssetsDir}`,
      );
    }

    try {
      if (!this.wasmExecLoaded) {
        require(this.wasmExecPath);
        this.wasmExecLoaded = true;
      }

      this.wasmBuffer = await fs.readFile(this.wasmModulePath);
    } catch (error) {
      this.logger.error(
        `Failed to load WASM assets from ${this.wasmAssetsDir}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      this.wasmBuffer = undefined;
      this.wasmExecLoaded = false;
      throw new ServiceUnavailableException(
        'WASM exporter is unavailable. Build/copy excel-streamer assets and try again.',
      );
    }
  }

  private async enqueue(job: ExportJob): Promise<ExportExecutionResult> {
    this.queueDepth += 1;
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await job();
    } finally {
      this.queueDepth = Math.max(0, this.queueDepth - 1);
      release();
    }
  }

  private assertGoResult(result: unknown, prefix: string): void {
    if (typeof result === 'string' && result.length > 0) {
      throw new Error(`${prefix}: ${result}`);
    }
  }

  private parseProgressStatus(
    status: string,
    prefix: 'ROW_PROGRESS',
  ): WasmProgress | null {
    const parts = status.split(':');
    if (parts.length < 3 || parts[0] !== prefix) {
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

  private async createRuntime(): Promise<RuntimeHandle> {
    if (!this.wasmBuffer) {
      throw new ServiceUnavailableException('WASM binary is not loaded');
    }

    const go = new Go();
    const instantiateResult = (await WebAssembly.instantiate(
      this.wasmBuffer as unknown as BufferSource,
      go.importObject,
    )) as unknown;
    const wasmInstance =
      (instantiateResult as { instance?: WebAssembly.Instance }).instance ??
      (instantiateResult as WebAssembly.Instance);

    let disposed = false;
    const readyPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
        callback();
      };
      const timeout = setTimeout(() => {
        finish(() => reject(new Error('WASM runtime init timeout')));
      }, 5000);
      const checkReady = () => {
        if (settled || disposed) {
          return;
        }

        if (
          typeof (global as Record<string, any>).goInitExport === 'function'
        ) {
          finish(resolve);
          return;
        }

        pollTimer = setTimeout(checkReady, 25);
      };
      checkReady();
    });

    void go.run(wasmInstance).catch((error: Error) => {
      this.logger.error(`Go runtime failed: ${error.message}`);
    });

    return {
      waitUntilReady: () => readyPromise,
      dispose: () => {
        disposed = true;
        this.cleanupGlobals();
      },
    };
  }

  private cleanupGlobals(): void {
    delete (global as Record<string, any>).goInitExport;
    delete (global as Record<string, any>).goWriteRows;
    delete (global as Record<string, any>).goFinalizeExport;
  }

  private resolveWasmAssetsDir(): string {
    const candidates = [
      join(process.cwd(), 'excel-streamer'),
      join(process.cwd(), 'dist', 'excel-streamer'),
      join(
        process.cwd(),
        'nestjs-go-export-excel-wasm',
        'dist',
        'excel-streamer',
      ),
      join(process.cwd(), 'nestjs-go-export-excel-wasm', 'excel-streamer'),
      join(__dirname, '../../../excel-streamer'),
      join(__dirname, '../../../../excel-streamer'),
    ];

    for (const candidate of candidates) {
      if (
        existsSync(join(candidate, 'excel_bridge.wasm')) &&
        existsSync(join(candidate, 'wasm_exec.js'))
      ) {
        return candidate;
      }
    }

    return candidates[0];
  }
}
