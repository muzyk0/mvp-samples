import ExcelJS from 'exceljs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExportDatasetStreamPlan } from '../interfaces/export-data.interface';
import { RustWasmExcelService } from './rust-wasm-excel.service';

class MissingAssetRustWasmExcelService extends RustWasmExcelService {
  protected getRustAssetsDir(): string {
    return '/tmp/rust-wasm-missing-assets';
  }
}

describe('RustWasmExcelService', () => {
  let service: RustWasmExcelService;

  beforeEach(() => {
    service = new RustWasmExcelService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('exports a valid xlsx workbook with dataset metadata', async () => {
    const plan: ExportDatasetStreamPlan = {
      columns: ['ID', 'Name', 'JoinedAt'],
      total: 2,
      seed: 42,
      batchSize: 1,
      effectiveLimit: 2,
      totalMatching: 2,
      startOffset: 0,
    };

    const rows = (async function* () {
      await Promise.resolve();
      yield [
        {
          ID: 1,
          Name: 'Alice',
          JoinedAt: new Date('2026-03-15T00:00:00.000Z'),
        },
      ];
      yield [{ ID: 2, Name: 'Bob', JoinedAt: null }];
    })();

    const { result, buffer } = await service.exportPlanToBuffer(
      plan,
      rows,
      'rust-wasm-test.xlsx',
      'Employees',
    );

    expect(result.variant).toBe('rust-wasm');
    expect(result.fileName).toBe('rust-wasm-test.xlsx');
    expect(result.rowCount).toBe(2);
    expect(result.columnCount).toBe(3);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer));
    const worksheet = workbook.getWorksheet('Employees');

    expect(worksheet).toBeDefined();
    expect(worksheet?.getCell('A1').value).toBe('ID');
    expect(worksheet?.getCell('B1').value).toBe('Name');
    expect(worksheet?.getCell('C1').value).toBe('JoinedAt');
    expect(worksheet?.getCell('A2').value).toBe(1);
    expect(worksheet?.getCell('B2').value).toBe('Alice');
    expect(worksheet?.getCell('C2').value).toBe('2026-03-15T00:00:00.000Z');
    expect(worksheet?.getCell('A3').value).toBe(2);
    expect(worksheet?.getCell('B3').value).toBe('Bob');
    expect(worksheet?.getCell('C3').value).toBeNull();
  });

  it('reports generated asset availability in status', () => {
    expect(service.getStatus()).toEqual({
      queued: false,
      hasPackage: true,
      hasBinary: true,
    });
  });

  it('fails explicitly when runtime artifacts are missing', async () => {
    const missingAssetService = new MissingAssetRustWasmExcelService();

    const plan: ExportDatasetStreamPlan = {
      columns: ['ID'],
      total: 1,
      seed: 7,
      batchSize: 1,
      effectiveLimit: 1,
      totalMatching: 1,
      startOffset: 0,
    };

    await expect(
      missingAssetService.exportPlanToBuffer(
        plan,
        (async function* () {
          await Promise.resolve();
          yield [{ ID: 1 }];
        })(),
        'missing.xlsx',
      ),
    ).rejects.toThrow(/Rust WASM assets are not available yet/);
  });
});
