import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExceljsExportController } from './exceljs-export.controller';
import { WasmExportController } from './wasm-export.controller';
import { RustWasmExportController } from './rust-wasm-export.controller';
import { ExportBenchmarkController } from './export-benchmark.controller';
import { ExportDatasetController } from './export-dataset.controller';
import { parseQuickExportQuery } from './export-query-validation';
import { DEFAULT_BENCHMARK_OPTIONS } from '../dto/export-request.dto';

describe('export controllers', () => {
  it('delegates exceljs download and quick requests with expected filenames', async () => {
    const exportComparisonService = {
      streamExcelJsToResponse: vi.fn(),
    };
    const controller = new ExceljsExportController(
      exportComparisonService as never,
    );
    const response = {} as never;

    await controller.download({ limit: 2 }, response);
    await controller.quick('25', '77', response);

    expect(
      exportComparisonService.streamExcelJsToResponse,
    ).toHaveBeenNthCalledWith(
      1,
      { limit: 2, fileName: 'exceljs-export.xlsx' },
      response,
    );
    expect(
      exportComparisonService.streamExcelJsToResponse,
    ).toHaveBeenNthCalledWith(
      2,
      { limit: 25, seed: 77, fileName: 'exceljs-quick-25.xlsx' },
      response,
    );
    expect(controller.health()).toEqual({
      status: 200,
      variant: 'exceljs',
    });
  });

  it('delegates go wasm routes and exposes runtime status', async () => {
    const exportComparisonService = {
      streamWasmToResponse: vi.fn(),
    };
    const wasmExcelService = {
      getStatus: vi.fn().mockReturnValue({ queued: true, hasBinary: false }),
    };
    const controller = new WasmExportController(
      exportComparisonService as never,
      wasmExcelService as never,
    );
    const response = {} as never;

    await controller.download({ limit: 3 }, response);
    await controller.quick('30', '99', response);

    expect(
      exportComparisonService.streamWasmToResponse,
    ).toHaveBeenNthCalledWith(
      1,
      { limit: 3, fileName: 'wasm-export.xlsx' },
      response,
    );
    expect(
      exportComparisonService.streamWasmToResponse,
    ).toHaveBeenNthCalledWith(
      2,
      { limit: 30, seed: 99, fileName: 'wasm-quick-30.xlsx' },
      response,
    );
    expect(controller.status()).toEqual({
      status: 200,
      variant: 'wasm',
      wasm: { queued: true, hasBinary: false },
    });
  });

  it('delegates rust wasm routes and exposes runtime status', async () => {
    const exportComparisonService = {
      streamRustWasmToResponse: vi.fn(),
    };
    const rustWasmExcelService = {
      getStatus: vi
        .fn()
        .mockReturnValue({ queued: false, hasPackage: true, hasBinary: true }),
    };
    const controller = new RustWasmExportController(
      exportComparisonService as never,
      rustWasmExcelService as never,
    );
    const response = {} as never;

    await controller.download({ limit: 4 }, response);
    await controller.quick('40', '101', response);

    expect(
      exportComparisonService.streamRustWasmToResponse,
    ).toHaveBeenNthCalledWith(
      1,
      { limit: 4, fileName: 'rust-wasm-export.xlsx' },
      response,
    );
    expect(
      exportComparisonService.streamRustWasmToResponse,
    ).toHaveBeenNthCalledWith(
      2,
      { limit: 40, seed: 101, fileName: 'rust-wasm-quick-40.xlsx' },
      response,
    );
    expect(controller.status()).toEqual({
      status: 200,
      variant: 'rust-wasm',
      rustWasm: { queued: false, hasPackage: true, hasBinary: true },
    });
  });

  it('runs benchmark routes with explicit default options', async () => {
    const exportComparisonService = {
      benchmark: vi.fn().mockResolvedValue({ ok: true }),
    };
    const controller = new ExportBenchmarkController(
      exportComparisonService as never,
    );
    const request = { limit: 10, includeMemory: false };

    await expect(controller.run(request as never)).resolves.toEqual({
      ok: true,
    });
    await expect(controller.runDefault()).resolves.toEqual({ ok: true });

    expect(exportComparisonService.benchmark).toHaveBeenNthCalledWith(
      1,
      request,
    );
    expect(exportComparisonService.benchmark).toHaveBeenNthCalledWith(
      2,
      DEFAULT_BENCHMARK_OPTIONS,
    );
  });

  it('returns a preview sample limited to five rows', async () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({ ID: index + 1 }));
    const dataGeneratorService = {
      getDataset: vi.fn().mockResolvedValue({
        total: rows.length,
        seed: 5,
        columns: ['ID'],
        rows,
      }),
    };
    const controller = new ExportDatasetController(
      dataGeneratorService as never,
    );

    await expect(controller.preview({ limit: 7 })).resolves.toEqual({
      total: 7,
      seed: 5,
      columns: ['ID'],
      sample: rows.slice(0, 5),
    });
  });

  it('parses quick export query values and rejects invalid inputs', () => {
    expect(parseQuickExportQuery('15', '9')).toEqual({ limit: 15, seed: 9 });
    expect(() => parseQuickExportQuery('0', '9')).toThrowError(
      new BadRequestException('limit must be at least 1'),
    );
    expect(() => parseQuickExportQuery('15', '-1')).toThrowError(
      new BadRequestException('seed must be greater than or equal to 0'),
    );
    expect(() => parseQuickExportQuery('1.5', '9')).toThrowError(
      new BadRequestException('limit must be a finite integer string'),
    );
  });
});
