import { Injectable } from '@nestjs/common';
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
import { WasmExcelService } from './wasm-excel.service';

@Injectable()
export class ExportComparisonService {
  constructor(
    private readonly dataGeneratorService: DataGeneratorService,
    private readonly exceljsExportService: ExceljsExportService,
    private readonly wasmExcelService: WasmExcelService,
  ) {}

  async exportWithExcelJs(
    options: ExportRequestDto,
  ): Promise<ExportExecutionResult> {
    const dataset = await this.dataGeneratorService.getDataset(options);
    return this.exceljsExportService.exportDataset(
      dataset,
      options.fileName ?? 'exceljs-export.xlsx',
      options.sheetName,
    );
  }

  async exportWithWasm(
    options: ExportRequestDto,
  ): Promise<ExportExecutionResult> {
    const dataset = await this.dataGeneratorService.getDataset(options);
    return this.wasmExcelService.exportDataset(
      dataset,
      options.fileName ?? 'wasm-export.xlsx',
    );
  }

  async benchmark(
    options: BenchmarkRequestDto,
  ): Promise<ExportBenchmarkResult> {
    const dataset = await this.dataGeneratorService.getDataset(options);
    const exceljs = await this.exceljsExportService.exportDataset(
      dataset,
      `benchmark-exceljs-${dataset.seed}.xlsx`,
      options.sheetName,
    );
    const wasm = await this.wasmExcelService.exportDataset(
      dataset,
      `benchmark-wasm-${dataset.seed}.xlsx`,
    );

    const includeMemory = options.includeMemory ?? true;
    const exceljsSummary = this.toBenchmarkSummary(exceljs, includeMemory);
    const wasmSummary = this.toBenchmarkSummary(wasm, includeMemory);

    return {
      request: {
        limit: dataset.total,
        seed: dataset.seed,
        columns: dataset.columns,
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

  private toBenchmarkSummary(
    result: ExportExecutionResult,
    includeMemory: boolean,
  ): ExportExecutionSummary {
    const { buffer, memoryDeltaBytes, ...summary } = result;
    void buffer;

    return {
      ...summary,
      ...(includeMemory && typeof memoryDeltaBytes === 'number'
        ? { memoryDeltaBytes }
        : {}),
    };
  }
}
