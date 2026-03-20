import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import { ExportComparisonService } from './export-comparison.service';
import {
  ExportDatasetStreamPlan,
  ExportExecutionResult,
} from '../interfaces/export-data.interface';

describe('ExportComparisonService', () => {
  const plan: ExportDatasetStreamPlan = {
    columns: ['ID', 'Name'],
    total: 2,
    seed: 12345,
    batchSize: 1,
    effectiveLimit: 2,
    totalMatching: 2,
    startOffset: 0,
  };

  function createRows() {
    return (async function* () {
      await Promise.resolve();
      yield [{ ID: 1, Name: 'Alice' }];
      yield [{ ID: 2, Name: 'Bob' }];
    })();
  }

  function createService() {
    const dataGeneratorService = {
      createStreamPlan: vi.fn().mockResolvedValue(plan),
      streamExportData: vi.fn().mockImplementation(() => createRows()),
    };
    const exceljsExportService = {
      exportPlanToWritable: vi.fn(),
      exportPlanToBuffer: vi.fn(),
    };
    const wasmExcelService = {
      exportPlanToWritable: vi.fn(),
      exportPlanToBuffer: vi.fn(),
      getStatus: vi.fn(),
    };
    const rustWasmExcelService = {
      exportPlanToWritable: vi.fn(),
      exportPlanToBuffer: vi.fn(),
      getStatus: vi.fn(),
    };
    const streamResponseService = {
      prepareDownload: vi.fn(),
    };

    return {
      service: new ExportComparisonService(
        dataGeneratorService as never,
        exceljsExportService as never,
        wasmExcelService as never,
        rustWasmExcelService as never,
        streamResponseService as never,
      ),
      dataGeneratorService,
      exceljsExportService,
      wasmExcelService,
      rustWasmExcelService,
      streamResponseService,
    };
  }

  it('prepares downloads and delegates streaming for all variants', async () => {
    const {
      service,
      dataGeneratorService,
      exceljsExportService,
      wasmExcelService,
      rustWasmExcelService,
      streamResponseService,
    } = createService();
    const response = new PassThrough();

    await service.streamExcelJsToResponse(
      { limit: 2, sheetName: 'Sheet' },
      response as never,
    );
    await service.streamWasmToResponse({ limit: 2 }, response as never);
    await service.streamRustWasmToResponse(
      { limit: 2, sheetName: 'RustSheet' },
      response as never,
    );

    expect(dataGeneratorService.createStreamPlan).toHaveBeenCalledTimes(3);
    expect(streamResponseService.prepareDownload).toHaveBeenNthCalledWith(
      1,
      response,
      'exceljs-export.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(streamResponseService.prepareDownload).toHaveBeenNthCalledWith(
      2,
      response,
      'wasm-export.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(streamResponseService.prepareDownload).toHaveBeenNthCalledWith(
      3,
      response,
      'rust-wasm-export.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(exceljsExportService.exportPlanToWritable).toHaveBeenCalledWith(
      plan,
      expect.anything(),
      {
        writable: response,
        fileName: 'exceljs-export.xlsx',
        sheetName: 'Sheet',
      },
    );
    expect(wasmExcelService.exportPlanToWritable).toHaveBeenCalledWith(
      plan,
      expect.anything(),
      {
        writable: response,
        fileName: 'wasm-export.xlsx',
      },
    );
    expect(rustWasmExcelService.exportPlanToWritable).toHaveBeenCalledWith(
      plan,
      expect.anything(),
      {
        writable: response,
        fileName: 'rust-wasm-export.xlsx',
        sheetName: 'RustSheet',
      },
    );
  });

  it('returns in-memory buffers for all export variants', async () => {
    const {
      service,
      exceljsExportService,
      wasmExcelService,
      rustWasmExcelService,
    } = createService();

    vi.mocked(exceljsExportService.exportPlanToBuffer).mockResolvedValue({
      result: {
        variant: 'exceljs',
        fileName: 'exceljs.xlsx',
        contentType: 'application/test',
        durationMs: 10,
        sizeBytes: 2,
        rowCount: 2,
        columnCount: 2,
      },
      buffer: Buffer.from('e1'),
    });
    vi.mocked(wasmExcelService.exportPlanToBuffer).mockResolvedValue({
      result: {
        variant: 'wasm',
        fileName: 'wasm.xlsx',
        contentType: 'application/test',
        durationMs: 11,
        sizeBytes: 2,
        rowCount: 2,
        columnCount: 2,
      },
      buffer: Buffer.from('w1'),
    });
    vi.mocked(rustWasmExcelService.exportPlanToBuffer).mockResolvedValue({
      result: {
        variant: 'rust-wasm',
        fileName: 'rust.xlsx',
        contentType: 'application/test',
        durationMs: 12,
        sizeBytes: 2,
        rowCount: 2,
        columnCount: 2,
      },
      buffer: Buffer.from('r1'),
    });

    await expect(
      service.exportWithExcelJs({ limit: 2 }),
    ).resolves.toMatchObject({
      variant: 'exceljs',
      buffer: Buffer.from('e1'),
    });
    await expect(service.exportWithWasm({ limit: 2 })).resolves.toMatchObject({
      variant: 'wasm',
      buffer: Buffer.from('w1'),
    });
    await expect(
      service.exportWithRustWasm({ limit: 2, sheetName: 'RustSheet' }),
    ).resolves.toMatchObject({
      variant: 'rust-wasm',
      buffer: Buffer.from('r1'),
    });
  });

  it('benchmarks all three variants with aligned request metadata', async () => {
    const {
      service,
      dataGeneratorService,
      exceljsExportService,
      wasmExcelService,
      rustWasmExcelService,
    } = createService();

    const writeResult = (
      variant: ExportExecutionResult['variant'],
      durationMs: number,
      memoryDeltaBytes: number,
    ) => {
      return (
        _plan: ExportDatasetStreamPlan,
        _rows: AsyncGenerator<Record<string, unknown>[]>,
        options: { writable: NodeJS.WritableStream; fileName: string },
      ) => {
        options.writable.write(Buffer.from('PK'));
        options.writable.end(Buffer.from(variant));

        return Promise.resolve({
          variant,
          fileName: options.fileName,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          durationMs,
          sizeBytes: 0,
          rowCount: plan.effectiveLimit,
          columnCount: plan.columns.length,
          memoryDeltaBytes,
        } satisfies ExportExecutionResult);
      };
    };

    vi.mocked(exceljsExportService.exportPlanToWritable).mockImplementation(
      writeResult('exceljs', 100, 1000),
    );
    vi.mocked(wasmExcelService.exportPlanToWritable).mockImplementation(
      writeResult('wasm', 140, 300),
    );
    vi.mocked(rustWasmExcelService.exportPlanToWritable).mockImplementation(
      writeResult('rust-wasm', 120, 500),
    );

    const result = await service.benchmark({
      limit: 2,
      seed: 12345,
      includeMemory: true,
      sheetName: 'Bench',
    });

    expect(dataGeneratorService.createStreamPlan).toHaveBeenCalledWith({
      limit: 2,
      seed: 12345,
      includeMemory: true,
      sheetName: 'Bench',
    });
    expect(dataGeneratorService.streamExportData).toHaveBeenCalledTimes(3);
    expect(result.request).toEqual({
      limit: 2,
      seed: 12345,
      columns: ['ID', 'Name'],
    });
    expect(result.exceljs.rowCount).toBe(2);
    expect(result.goWasm.rowCount).toBe(2);
    expect(result.rustWasm.rowCount).toBe(2);
    expect(result.exceljs.memoryDeltaBytes).toBe(1000);
    expect(result.goWasm.memoryDeltaBytes).toBe(300);
    expect(result.rustWasm.memoryDeltaBytes).toBe(500);
    expect(result.deltas).toEqual({
      goWasmVsExceljs: {
        durationMs: 40,
        sizeBytes: -3,
        memoryDeltaBytes: -700,
      },
      rustWasmVsExceljs: {
        durationMs: 20,
        sizeBytes: 2,
        memoryDeltaBytes: -500,
      },
      rustWasmVsGoWasm: {
        durationMs: -20,
        sizeBytes: 5,
        memoryDeltaBytes: 200,
      },
    });
    expect(result.diagnostics.memory.nodeHeapDeltaMeasured).toBe(true);
    expect(result.diagnostics.executionModel.rustWasm).toContain('Rust/WASM');
  });

  it('omits memory deltas when includeMemory is false', async () => {
    const {
      service,
      exceljsExportService,
      wasmExcelService,
      rustWasmExcelService,
    } = createService();

    const writeResult = (variant: ExportExecutionResult['variant']) => {
      return (
        _plan: ExportDatasetStreamPlan,
        _rows: AsyncGenerator<Record<string, unknown>[]>,
        options: { writable: NodeJS.WritableStream; fileName: string },
      ) => {
        options.writable.end(Buffer.from('PK'));

        return Promise.resolve({
          variant,
          fileName: options.fileName,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          durationMs: 10,
          sizeBytes: 0,
          rowCount: plan.effectiveLimit,
          columnCount: plan.columns.length,
          memoryDeltaBytes: 50,
        } satisfies ExportExecutionResult);
      };
    };

    vi.mocked(exceljsExportService.exportPlanToWritable).mockImplementation(
      writeResult('exceljs'),
    );
    vi.mocked(wasmExcelService.exportPlanToWritable).mockImplementation(
      writeResult('wasm'),
    );
    vi.mocked(rustWasmExcelService.exportPlanToWritable).mockImplementation(
      writeResult('rust-wasm'),
    );

    const result = await service.benchmark({
      limit: 2,
      seed: 12345,
      includeMemory: false,
    });

    expect(result.exceljs.memoryDeltaBytes).toBeUndefined();
    expect(result.goWasm.memoryDeltaBytes).toBeUndefined();
    expect(result.rustWasm.memoryDeltaBytes).toBeUndefined();
    expect(result.deltas.goWasmVsExceljs.memoryDeltaBytes).toBeUndefined();
    expect(result.diagnostics.memory.note).toContain('includeMemory=false');
  });
});
