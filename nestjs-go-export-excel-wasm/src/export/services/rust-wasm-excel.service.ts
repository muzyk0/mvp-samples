/* eslint-disable @typescript-eslint/no-require-imports */
import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { DEFAULT_EXPORT_LIMIT } from '../dto/export-request.dto';
import { join } from 'path';
import { PassThrough, Readable, Writable } from 'stream';
import { finished, pipeline } from 'stream/promises';
import {
  ExportDatasetStreamPlan,
  ExportExecutionResult,
  StreamExportExecutionOptions,
} from '../interfaces/export-data.interface';
import { RustWasmModule } from '../interfaces/wasm-callback.interface';

type ExportJob = () => Promise<ExportExecutionResult>;
type RustCellValue = string | number | boolean | null;
type RustWorkbookPayload = {
  columns: string[];
  rows: RustCellValue[][];
  sheet_name?: string;
};

@Injectable()
export class RustWasmExcelService
  implements OnModuleDestroy, BeforeApplicationShutdown
{
  private readonly logger = new Logger(RustWasmExcelService.name);
  private readonly rustAssetsDir = this.getRustAssetsDir();
  private readonly rustModulePath = join(
    this.rustAssetsDir,
    'rust_excel_streamer.js',
  );
  private readonly rustBinaryPath = join(
    this.rustAssetsDir,
    'rust_excel_streamer_bg.wasm',
  );
  private rustModule?: RustWasmModule;
  private rustLoadPromise?: Promise<RustWasmModule>;
  private queue: Promise<void> = Promise.resolve();
  private queueDepth = 0;

  async exportPlanToWritable(
    plan: ExportDatasetStreamPlan,
    rows: AsyncGenerator<Record<string, any>[]>,
    options: StreamExportExecutionOptions,
  ): Promise<ExportExecutionResult> {
    if (!Array.isArray(plan.columns) || plan.columns.length === 0) {
      throw new ServiceUnavailableException(
        'Rust WASM export headers are required',
      );
    }

    await this.ensureRustLoaded();

    return this.enqueue(async () => {
      const startTime = process.hrtime.bigint();
      const memoryBefore = process.memoryUsage().heapUsed;
      let exportError: Error | null = null;

      try {
        const payload = await this.buildPayload(
          plan.columns,
          rows,
          options.sheetName,
        );
        const module = await this.ensureRustLoaded();
        const bytes = module.generate_workbook_from_json(
          JSON.stringify(payload),
        );

        if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
          throw new Error('Rust WASM export returned no workbook bytes');
        }

        await this.writeWorkbookBytes(bytes, options.writable);

        const memoryAfter = process.memoryUsage().heapUsed;
        const durationMs =
          Number(process.hrtime.bigint() - startTime) / 1_000_000;

        return {
          variant: 'rust-wasm',
          fileName: options.fileName,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          durationMs: Number(durationMs.toFixed(2)),
          sizeBytes: bytes.byteLength,
          rowCount: payload.rows.length,
          columnCount: plan.columns.length,
          memoryDeltaBytes: Math.max(0, memoryAfter - memoryBefore),
        };
      } catch (error) {
        exportError = error instanceof Error ? error : new Error(String(error));
        throw error;
      } finally {
        if (exportError && !options.writable.destroyed) {
          options.writable.destroy(exportError);
        }
      }
    });
  }

  async exportPlanToBuffer(
    plan: ExportDatasetStreamPlan,
    rows: AsyncGenerator<Record<string, any>[]>,
    fileName: string,
    sheetName?: string,
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
        sheetName,
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
      if (!stream.destroyed) {
        stream.destroy(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
      await streamDone.catch(() => undefined);
      throw error;
    }
  }

  getStatus(): { queued: boolean; hasPackage: boolean; hasBinary: boolean } {
    return {
      queued: this.queueDepth > 0,
      hasPackage: existsSync(this.rustModulePath),
      hasBinary: existsSync(this.rustBinaryPath),
    };
  }

  async beforeApplicationShutdown(): Promise<void> {
    await Promise.race([
      this.queue,
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
    this.rustModule = undefined;
  }

  onModuleDestroy(): void {
    this.rustModule = undefined;
  }

  private async buildPayload(
    columns: string[],
    rows: AsyncGenerator<Record<string, any>[]>,
    sheetName?: string,
  ): Promise<RustWorkbookPayload> {
    const payload: RustWorkbookPayload = {
      columns: [...columns],
      rows: [],
      ...(sheetName ? { sheet_name: sheetName } : {}),
    };

    if (columns.length > DEFAULT_EXPORT_LIMIT) {
      throw new ServiceUnavailableException(
        `Rust WASM export supports at most ${DEFAULT_EXPORT_LIMIT} columns per request`,
      );
    }

    for await (const batch of rows) {
      for (const row of batch) {
        if (payload.rows.length >= DEFAULT_EXPORT_LIMIT) {
          throw new ServiceUnavailableException(
            `Rust WASM export supports at most ${DEFAULT_EXPORT_LIMIT} rows per request`,
          );
        }

        payload.rows.push(
          columns.map((column) => this.normalizeCellValue(row[column])),
        );
      }
    }

    return payload;
  }

  private normalizeCellValue(value: unknown): RustCellValue {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    return JSON.stringify(value);
  }

  private async ensureRustLoaded(): Promise<RustWasmModule> {
    if (this.rustModule) {
      return this.rustModule;
    }

    if (!this.rustLoadPromise) {
      this.rustLoadPromise = this.loadRustModule().finally(() => {
        this.rustLoadPromise = undefined;
      });
    }

    return this.rustLoadPromise;
  }

  private loadRustModule(): Promise<RustWasmModule> {
    if (!existsSync(this.rustModulePath) || !existsSync(this.rustBinaryPath)) {
      throw new ServiceUnavailableException(
        `Rust WASM assets are not available yet. Expected files in ${this.rustAssetsDir}. Run "npm run build:rust-wasm" or "bun run build:rust-wasm".`,
      );
    }

    try {
      const loadedModule = require(this.rustModulePath) as RustWasmModule;

      if (
        !loadedModule ||
        typeof loadedModule.generate_workbook_from_json !== 'function'
      ) {
        throw new Error(
          'Rust WASM module did not expose generate_workbook_from_json',
        );
      }

      this.rustModule = loadedModule;
      return Promise.resolve(loadedModule);
    } catch (error) {
      this.logger.error(
        `Failed to load Rust WASM assets from ${this.rustAssetsDir}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      this.rustModule = undefined;
      throw new ServiceUnavailableException(
        'Rust WASM exporter is unavailable. Build rust-excel-streamer assets and try again.',
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

  private async writeWorkbookBytes(
    bytes: Uint8Array,
    writable: Writable,
  ): Promise<void> {
    await pipeline(Readable.from(this.chunkWorkbookBytes(bytes)), writable);
  }

  private *chunkWorkbookBytes(
    bytes: Uint8Array,
    chunkSize = 64 * 1024,
  ): Generator<Uint8Array> {
    for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
      yield bytes.subarray(
        offset,
        Math.min(offset + chunkSize, bytes.byteLength),
      );
    }
  }

  private resolveRustAssetsDir(): string {
    const candidates = [
      join(process.cwd(), 'rust-excel-streamer', 'pkg'),
      join(process.cwd(), 'dist', 'rust-excel-streamer', 'pkg'),
      join(
        process.cwd(),
        'nestjs-go-export-excel-wasm',
        'rust-excel-streamer',
        'pkg',
      ),
      join(
        process.cwd(),
        'nestjs-go-export-excel-wasm',
        'dist',
        'rust-excel-streamer',
        'pkg',
      ),
      join(__dirname, '../../../rust-excel-streamer/pkg'),
      join(__dirname, '../../../../rust-excel-streamer/pkg'),
    ];

    for (const candidate of candidates) {
      if (
        existsSync(join(candidate, 'rust_excel_streamer.js')) &&
        existsSync(join(candidate, 'rust_excel_streamer_bg.wasm'))
      ) {
        return candidate;
      }
    }

    return candidates[0];
  }

  protected getRustAssetsDir(): string {
    return this.resolveRustAssetsDir();
  }
}
