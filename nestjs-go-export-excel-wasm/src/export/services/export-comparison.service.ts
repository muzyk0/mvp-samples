import { Injectable } from '@nestjs/common';
import { createWriteStream, promises as fs } from 'fs';
import { once } from 'events';
import { finished } from 'stream/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Response } from 'express';
import {
  BenchmarkRequestDto,
  ExportRequestDto,
} from '../dto/export-request.dto';
import {
  ExportBenchmarkDelta,
  ExportBenchmarkResult,
  ExportExecutionResult,
  ExportExecutionSummary,
  ExportVariant,
} from '../interfaces/export-data.interface';
import { DataGeneratorService } from './data-generator.service';
import { ExceljsExportService } from './exceljs-export.service';
import { RustWasmExcelService } from './rust-wasm-excel.service';
import { StreamResponseService } from './stream-response.service';
import { WasmExcelService } from './wasm-excel.service';

@Injectable()
export class ExportComparisonService {
  constructor(
    private readonly dataGeneratorService: DataGeneratorService,
    private readonly exceljsExportService: ExceljsExportService,
    private readonly wasmExcelService: WasmExcelService,
    private readonly rustWasmExcelService: RustWasmExcelService,
    private readonly streamResponseService: StreamResponseService,
  ) {}

  async streamExcelJsToResponse(
    options: ExportRequestDto,
    response: Response,
  ): Promise<void> {
    const fileName = options.fileName ?? 'exceljs-export.xlsx';
    const plan = await this.dataGeneratorService.createStreamPlan(options);
    this.streamResponseService.prepareDownload(
      response,
      fileName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    await this.exceljsExportService.exportPlanToWritable(
      plan,
      this.dataGeneratorService.streamExportData(plan),
      {
        writable: response,
        fileName,
        sheetName: options.sheetName,
      },
    );
  }

  async streamWasmToResponse(
    options: ExportRequestDto,
    response: Response,
  ): Promise<void> {
    const fileName = options.fileName ?? 'wasm-export.xlsx';
    const plan = await this.dataGeneratorService.createStreamPlan(options);
    this.streamResponseService.prepareDownload(
      response,
      fileName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    await this.wasmExcelService.exportPlanToWritable(
      plan,
      this.dataGeneratorService.streamExportData(plan),
      {
        writable: response,
        fileName,
      },
    );
  }

  async streamRustWasmToResponse(
    options: ExportRequestDto,
    response: Response,
  ): Promise<void> {
    const fileName = options.fileName ?? 'rust-wasm-export.xlsx';
    const plan = await this.dataGeneratorService.createStreamPlan(options);
    this.streamResponseService.prepareDownload(
      response,
      fileName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    await this.rustWasmExcelService.exportPlanToWritable(
      plan,
      this.dataGeneratorService.streamExportData(plan),
      {
        writable: response,
        fileName,
        sheetName: options.sheetName,
      },
    );
  }

  async exportWithExcelJs(
    options: ExportRequestDto,
  ): Promise<ExportExecutionResult & { buffer: Buffer }> {
    const plan = await this.dataGeneratorService.createStreamPlan(options);
    const { result, buffer } =
      await this.exceljsExportService.exportPlanToBuffer(
        plan,
        this.dataGeneratorService.streamExportData(plan),
        options.fileName ?? 'exceljs-export.xlsx',
        options.sheetName,
      );

    return { ...result, buffer };
  }

  async exportWithWasm(
    options: ExportRequestDto,
  ): Promise<ExportExecutionResult & { buffer: Buffer }> {
    const plan = await this.dataGeneratorService.createStreamPlan(options);
    const { result, buffer } = await this.wasmExcelService.exportPlanToBuffer(
      plan,
      this.dataGeneratorService.streamExportData(plan),
      options.fileName ?? 'wasm-export.xlsx',
    );

    return { ...result, buffer };
  }

  async exportWithRustWasm(
    options: ExportRequestDto,
  ): Promise<ExportExecutionResult & { buffer: Buffer }> {
    const plan = await this.dataGeneratorService.createStreamPlan(options);
    const { result, buffer } =
      await this.rustWasmExcelService.exportPlanToBuffer(
        plan,
        this.dataGeneratorService.streamExportData(plan),
        options.fileName ?? 'rust-wasm-export.xlsx',
        options.sheetName,
      );

    return { ...result, buffer };
  }

  async benchmark(
    options: BenchmarkRequestDto,
  ): Promise<ExportBenchmarkResult> {
    const plan = await this.dataGeneratorService.createStreamPlan(options);
    const exceljs = await this.exportVariantToTempFile(
      'exceljs',
      plan,
      options,
    );
    const goWasm = await this.exportVariantToTempFile('wasm', plan, options);
    const rustWasm = await this.exportVariantToTempFile(
      'rust-wasm',
      plan,
      options,
    );
    const includeMemory = options.includeMemory ?? true;
    const exceljsSummary = this.toBenchmarkSummary(exceljs, includeMemory);
    const goWasmSummary = this.toBenchmarkSummary(goWasm, includeMemory);
    const rustWasmSummary = this.toBenchmarkSummary(rustWasm, includeMemory);

    return {
      request: {
        limit: options.limit ?? 1000,
        seed: plan.seed,
        columns: plan.columns,
      },
      exceljs: exceljsSummary,
      goWasm: goWasmSummary,
      rustWasm: rustWasmSummary,
      deltas: {
        goWasmVsExceljs: this.toBenchmarkDelta(goWasm, exceljs, includeMemory),
        rustWasmVsExceljs: this.toBenchmarkDelta(
          rustWasm,
          exceljs,
          includeMemory,
        ),
        rustWasmVsGoWasm: this.toBenchmarkDelta(
          rustWasm,
          goWasm,
          includeMemory,
        ),
      },
      diagnostics: {
        memory: {
          nodeHeapDeltaMeasured: includeMemory,
          wasmLinearMemoryIncluded: false,
          note: includeMemory
            ? 'memoryDeltaBytes reports Node heap deltas only; Go/Rust WASM linear memory is not instrumented in this benchmark.'
            : 'memoryDeltaBytes fields are omitted because includeMemory=false; WASM linear memory is not instrumented in this benchmark.',
        },
        executionModel: {
          exceljs:
            'Streams rows directly to the Node writable via ExcelJS WorkbookWriter.',
          goWasm:
            'Accumulates workbook state inside Go/WASM and emits ZIP bytes during finalization callbacks.',
          rustWasm:
            'Accumulates workbook state inside Rust/WASM and returns final workbook bytes to Node at finalize time.',
        },
      },
    };
  }

  private async exportVariantToTempFile(
    variant: ExportVariant,
    plan: Awaited<ReturnType<DataGeneratorService['createStreamPlan']>>,
    options: ExportRequestDto,
  ): Promise<ExportExecutionResult> {
    const tempPath = join(
      tmpdir(),
      `${variant}-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`,
    );
    const writable = createWriteStream(tempPath);

    try {
      const result =
        variant === 'exceljs'
          ? await this.exceljsExportService.exportPlanToWritable(
              plan,
              this.dataGeneratorService.streamExportData(plan),
              {
                writable,
                fileName: `benchmark-exceljs-${plan.seed}.xlsx`,
                sheetName: options.sheetName,
              },
            )
          : variant === 'wasm'
            ? await this.wasmExcelService.exportPlanToWritable(
                plan,
                this.dataGeneratorService.streamExportData(plan),
                {
                  writable,
                  fileName: `benchmark-wasm-${plan.seed}.xlsx`,
                },
              )
            : await this.rustWasmExcelService.exportPlanToWritable(
                plan,
                this.dataGeneratorService.streamExportData(plan),
                {
                  writable,
                  fileName: `benchmark-rust-wasm-${plan.seed}.xlsx`,
                  sheetName: options.sheetName,
                },
              );

      if (!writable.writableFinished) {
        await finished(writable);
      }

      await this.waitForWritableClose(writable);

      return {
        ...result,
        sizeBytes: (await fs.stat(tempPath)).size,
      };
    } finally {
      if (!writable.closed && !writable.destroyed) {
        writable.destroy();
      }

      await this.waitForWritableClose(writable);
      await fs.rm(tempPath, { force: true });
    }
  }

  private toBenchmarkSummary(
    result: ExportExecutionResult,
    includeMemory: boolean,
  ): ExportExecutionSummary {
    return {
      ...result,
      ...(includeMemory && typeof result.memoryDeltaBytes === 'number'
        ? { memoryDeltaBytes: result.memoryDeltaBytes }
        : { memoryDeltaBytes: undefined }),
    };
  }

  private toBenchmarkDelta(
    current: ExportExecutionResult,
    baseline: ExportExecutionResult,
    includeMemory: boolean,
  ): ExportBenchmarkDelta {
    return {
      durationMs: Number((current.durationMs - baseline.durationMs).toFixed(2)),
      sizeBytes: current.sizeBytes - baseline.sizeBytes,
      memoryDeltaBytes: includeMemory
        ? typeof current.memoryDeltaBytes === 'number' &&
          typeof baseline.memoryDeltaBytes === 'number'
          ? current.memoryDeltaBytes - baseline.memoryDeltaBytes
          : undefined
        : undefined,
    };
  }

  private async waitForWritableClose(
    writable: ReturnType<typeof createWriteStream>,
  ): Promise<void> {
    if (writable.closed) {
      return;
    }

    await once(writable, 'close');
  }
}
