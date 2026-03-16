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
  ExportBenchmarkResult,
  ExportExecutionResult,
  ExportExecutionSummary,
} from '../interfaces/export-data.interface';
import { DataGeneratorService } from './data-generator.service';
import { ExceljsExportService } from './exceljs-export.service';
import { StreamResponseService } from './stream-response.service';
import { WasmExcelService } from './wasm-excel.service';

@Injectable()
export class ExportComparisonService {
  constructor(
    private readonly dataGeneratorService: DataGeneratorService,
    private readonly exceljsExportService: ExceljsExportService,
    private readonly wasmExcelService: WasmExcelService,
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

  async benchmark(
    options: BenchmarkRequestDto,
  ): Promise<ExportBenchmarkResult> {
    const plan = await this.dataGeneratorService.createStreamPlan(options);
    const exceljs = await this.exportVariantToTempFile(
      'exceljs',
      plan,
      options,
    );
    const wasm = await this.exportVariantToTempFile('wasm', plan, options);
    const includeMemory = options.includeMemory ?? true;
    const exceljsSummary = this.toBenchmarkSummary(exceljs, includeMemory);
    const wasmSummary = this.toBenchmarkSummary(wasm, includeMemory);

    return {
      request: {
        limit: plan.effectiveLimit,
        seed: plan.seed,
        columns: plan.columns,
      },
      exceljs: exceljsSummary,
      wasm: wasmSummary,
      delta: {
        durationMs: Number((wasm.durationMs - exceljs.durationMs).toFixed(2)),
        sizeBytes: wasm.sizeBytes - exceljs.sizeBytes,
        memoryDeltaBytes: includeMemory
          ? typeof wasm.memoryDeltaBytes === 'number' &&
            typeof exceljs.memoryDeltaBytes === 'number'
            ? wasm.memoryDeltaBytes - exceljs.memoryDeltaBytes
            : undefined
          : undefined,
      },
    };
  }

  private async exportVariantToTempFile(
    variant: 'exceljs' | 'wasm',
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
          : await this.wasmExcelService.exportPlanToWritable(
              plan,
              this.dataGeneratorService.streamExportData(plan),
              {
                writable,
                fileName: `benchmark-wasm-${plan.seed}.xlsx`,
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

  private async waitForWritableClose(
    writable: ReturnType<typeof createWriteStream>,
  ): Promise<void> {
    if (writable.closed) {
      return;
    }

    await once(writable, 'close');
  }
}
