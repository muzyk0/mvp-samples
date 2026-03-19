import ExcelJS from 'exceljs';
import { WasmExcelService } from './wasm-excel.service';
import { ExportDatasetStreamPlan } from '../interfaces/export-data.interface';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const maybeIntegrationTest =
  process.env.RUN_WASM_INTEGRATION_TESTS === '1' ? it : it.skip;

describe('WasmExcelService', () => {
  let service: WasmExcelService;

  beforeEach(() => {
    service = new WasmExcelService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  maybeIntegrationTest('exports a valid xlsx workbook with dataset metadata when wasm integration is enabled', async () => {
    const status = service.getStatus();
    const plan: ExportDatasetStreamPlan = {
      columns: ['ID', 'Name'],
      total: 2,
      seed: 42,
      batchSize: 1,
      effectiveLimit: 2,
      totalMatching: 2,
      startOffset: 0,
    };

    const rows = (async function* () {
      await Promise.resolve();
      yield [{ ID: 1, Name: 'Alice' }];
      yield [{ ID: 2, Name: 'Bob' }];
    })();

    if (!status.hasBinary) {
      await expect(
        service.exportPlanToBuffer(plan, rows, 'wasm-test.xlsx'),
      ).rejects.toThrow(/WASM assets are not available yet/);
      return;
    }

    const { result, buffer } = await service.exportPlanToBuffer(
      plan,
      rows,
      'wasm-test.xlsx',
    );

    expect(result.variant).toBe('wasm');
    expect(result.fileName).toBe('wasm-test.xlsx');
    expect(result.rowCount).toBe(2);
    expect(result.columnCount).toBe(2);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer));
    const worksheet = workbook.worksheets[0];

    expect(worksheet).toBeDefined();
    expect(worksheet.getCell('A1').value).toBe('ID');
    expect(worksheet.getCell('B1').value).toBe('Name');
    expect(worksheet.getCell('A2').value).toBe(1);
    expect(worksheet.getCell('B2').value).toBe('Alice');
    expect(worksheet.getCell('A3').value).toBe(2);
    expect(worksheet.getCell('B3').value).toBe('Bob');
  }, 60_000);

  it('reports binary availability in status', () => {
    expect(service.getStatus()).toEqual({
      queued: false,
      hasBinary: expect.any(Boolean),
    });
  });

  it('fails explicitly when runtime artifacts are missing', async () => {
    const missingAssetsDir = '/tmp/go-wasm-missing-assets';
    const missingAssetService = new WasmExcelService();

    try {
      const missingAssetInternals = missingAssetService as WasmExcelService & {
        wasmAssetsDir: string;
        wasmModulePath: string;
        wasmExecPath: string;
        wasmBuffer?: Buffer;
        wasmExecLoaded: boolean;
        wasmLoadPromise?: Promise<void>;
      };
      missingAssetInternals.wasmAssetsDir = missingAssetsDir;
      missingAssetInternals.wasmModulePath = `${missingAssetsDir}/excel_bridge.wasm`;
      missingAssetInternals.wasmExecPath = `${missingAssetsDir}/wasm_exec.js`;
      missingAssetInternals.wasmBuffer = undefined;
      missingAssetInternals.wasmExecLoaded = false;
      missingAssetInternals.wasmLoadPromise = undefined;
      await expect(
        missingAssetService.initializeExport(['ID'], 1),
      ).rejects.toThrow(/WASM assets are not available yet/);
    } finally {
      missingAssetService.onModuleDestroy();
    }
  });
});
